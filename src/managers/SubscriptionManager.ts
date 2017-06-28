import Context from '../models/Context';
import {NotificationPermission} from "../models/NotificationPermission";
import PushPermissionNotGrantedError from '../errors/PushPermissionNotGrantedError';
import { PushPermissionNotGrantedErrorReason } from '../errors/PushPermissionNotGrantedError';
import * as Browser from 'bowser';
import { SdkInitError, SdkInitErrorKind } from '../errors/SdkInitError';
import { Uuid } from '../models/Uuid';
import SdkEnvironment from './SdkEnvironment';
import SubscriptionError from '../errors/SubscriptionError';
import { SubscriptionErrorReason } from '../errors/SubscriptionError';
import EventHelper from '../helpers/EventHelper';
import MainHelper from '../helpers/MainHelper';
import { SubscriptionStrategyKind } from "../models/SubscriptionStrategyKind";
import { SubscribeResubscribe } from "../models/SubscribeResubscribe";
import NotImplementedError from '../errors/NotImplementedError';
import Environment from '../Environment';
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';
import { InvalidStateError, InvalidStateReason } from '../errors/InvalidStateError';
import { RawPushSubscription } from '../models/RawPushSubscription';
import OneSignalApi from '../OneSignalApi';
import Database from '../services/Database';
import OneSignal from '../OneSignal';
import { PushRegistration } from '../models/PushRegistration';
import { DeliveryPlatformKind } from '../models/DeliveryPlatformKind';
import { DevicePlatformKind } from '../models/DevicePlatformKind';
import { SubscriptionStateKind } from '../models/SubscriptionStateKind';
import Event from '../Event';


export interface SubscriptionManagerConfig {
  safariWebId: string;
  appId: Uuid;
  vapidPublicKey: string;
}

export class SubscriptionManager {

  private context: Context;
  private config: SubscriptionManagerConfig;

  constructor(context: Context, config: SubscriptionManagerConfig) {
    this.context = context;
    this.config = config;
  }

  isSafari(): boolean {
    return Browser.safari &&
      window.safari !== undefined &&
      window.safari.pushNotification !== undefined;
  }

  async subscribe(): Promise<Uuid> {
      /*
         Check our notification permission before subscribing.

         - If notifications are blocked, we can't subscribe.
         - If notifications are granted, the user should be completely resubscribed.
         - If notifications permissions are untouched, the user will be prompted and then subscribed.
       */
      const notificationPermissionBeforeSubscribing: NotificationPermission = await OneSignal.getNotificationPermission();
      if (notificationPermissionBeforeSubscribing === NotificationPermission.Denied) {
          throw new PushPermissionNotGrantedError(PushPermissionNotGrantedErrorReason.Blocked);
      }

      let pushSubscription: RawPushSubscription;
      let pushRegistration = new PushRegistration();
      pushRegistration.appId = this.config.appId;

      if (SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.ServiceWorker) {
          pushSubscription = await this.subscribeFcmFromWorker();
      } else {
          if (this.isSafari()) {
              pushSubscription = await this.subscribeSafari();
              EventHelper.triggerNotificationPermissionChanged();
          } else {
              pushSubscription = await this.subscribeFcm();
          }
      }

      if (this.isSafari()) {
          pushRegistration.deliveryPlatform = DeliveryPlatformKind.Safari;
      } else if (Browser.firefox) {
          pushRegistration.deliveryPlatform = DeliveryPlatformKind.Firefox;
      } else {
          pushRegistration.deliveryPlatform = DeliveryPlatformKind.ChromeLike;
      }

      pushRegistration.subscriptionState = SubscriptionStateKind.Subscribed;

      if (this.isAlreadyRegisteredWithOneSignal()) {
          const { deviceId } = await Database.getSubscription();
          const { id: newUserId } = await OneSignalApi.updateUserSession(deviceId, pushRegistration)
          return new Uuid(newUserId);
      } else {
          const { id: newUserId } = await OneSignalApi.createUser(pushRegistration)
          return new Uuid(newUserId);
      }
  }

  async isAlreadyRegisteredWithOneSignal() {
      const { deviceId } = await Database.getSubscription();
      return !!deviceId;
  }

  subscribeSafariPromptPermission(): Promise<string | null> {
    return new Promise<string>((resolve, reject) => {
      window.safari.pushNotification.requestPermission(
        `${SdkEnvironment.getOneSignalApiUrl().toString()}/safari`,
        this.config.safariWebId,
        {
          app_id: this.config.appId
        },
        response => {
          if ((response as any).deviceToken) {
            resolve((response as any).deviceToken.toLowerCase());
          } else {
            resolve(null);
          }
        }
      )
    });
  }

  async subscribeSafari(): Promise<RawPushSubscription> {
    const pushSubscriptionDetails = new RawPushSubscription();
    if (!this.config.safariWebId) {
      throw new SdkInitError(SdkInitErrorKind.MissingSafariWebId);
    }
    const deviceToken = await this.subscribeSafariPromptPermission();
    if (deviceToken) {
      pushSubscriptionDetails.safariDeviceToken = deviceToken;
    } else {
      throw new SubscriptionError(SubscriptionErrorReason.InvalidSafariSetup);
    }
    return pushSubscriptionDetails;
  }

  async subscribeFcm(): Promise<RawPushSubscription> {
    await this.context.serviceWorkerManager.installWorker();

    log.debug('Waiting for the service worker to activate...');
    const workerRegistration = await navigator.serviceWorker.ready;
    log.debug('The newly installed service worker is now active.')

    // Installs message channel to receive service worker messages
    MainHelper.establishServiceWorkerChannel(workerRegistration);

    /*
      Trigger the permissionPromptDisplay event to the best of our knowledge.
    */
    Event.trigger(OneSignal.EVENTS.PERMISSION_PROMPT_DISPLAYED);

    return await this.subscribeFcmVapidOrLegacyKey(workerRegistration);
  }

  async subscribeFcmFromWorker(): Promise<RawPushSubscription> {
    /*
      We're running inside of the service worker.

      Check to make sure our registration is activated, otherwise we can't
      subscribe for push.
     */
    if (!self.registration.active ||
      self.registration.active.state !== "activated") {
      throw new InvalidStateError(InvalidStateReason.ServiceWorkerNotActivated);
      /*
        Or should we wait for the service worker to be ready?

        await new Promise(resolve => self.onactivate = resolve);
       */
    }

    /*
      Check to make sure push permissions have been granted.
     */
    const pushPermission = await self.registration.pushManager.permissionState({ userVisibleOnly: true });
    if (pushPermission === "denied") {
      throw new PushPermissionNotGrantedError(PushPermissionNotGrantedErrorReason.Blocked);
    } else if (pushPermission === "prompt") {
      throw new PushPermissionNotGrantedError(PushPermissionNotGrantedErrorReason.Default);
    }

    return await this.subscribeFcmVapidOrLegacyKey(self.registration);
  }

  /**
   * Creates a new or resubscribes an existing push subscription.
   *
   * In cases where details of the existing push subscription can't be found,
   * the user is first unsubscribed.
   *
   * Given an existing legacy GCM subscription, this function does not try to
   * migrate the subscription to VAPID; this isn't possible unless the user is
   * first unsubscribed, and unsubscribing frequently can be a little risky.
   */
  async subscribeFcmVapidOrLegacyKey(workerRegistration: ServiceWorkerRegistration): Promise<RawPushSubscription> {
    let options = {
        userVisibleOnly: true,
        applicationServerKey: undefined
    };

    let newPushSubscription: PushSubscription;
    let pushSubscriptionDetails = new RawPushSubscription();

    /*
      Is there an existing push subscription?

      If so, and if we're on Chrome 54+, we can use its details to resubscribe
      without any extra info needed.
     */
    const existingPushSubscription = await workerRegistration.pushManager.getSubscription();

    if (existingPushSubscription) {
        if (existingPushSubscription.options) {
            /*
              Hopefully we're on Chrome 54+, so we can use PushSubscriptionOptions to
              get the exact applicationServerKey to use, without needing to assume a
              manifest.json exists or passing in our VAPID key and dealing with
              potential mismatched sender ID issues.
              */
            options = existingPushSubscription.options;
            newPushSubscription = await workerRegistration.pushManager.subscribe(options);
        } else {
            /*
              There isn't a great solution if PushSubscriptionOptions (Chrome 54+)
              aren't supported.

              We want to subscribe the user, but we don't know whether the user was
              subscribed via GCM's manifest.json or FCM's VAPID.

              This bug
              (https://bugs.chromium.org/p/chromium/issues/detail?id=692577) shows
              that a mismatched sender ID error is possible if you subscribe via
              FCM's VAPID while the user was originally subscribed via GCM's
              manifest.json (fails silently).

              Because of this, we should unsubscribe the user from push first and
              then resubscribe them.
             */
            await existingPushSubscription.unsubscribe();
            // Now that the user is unsubscribed, we're free to subscribe via
            // VAPID (as long as its supported)
            if (Environment.supportsVapid() && this.config.vapidPublicKey) {
                options.applicationServerKey = this.config.vapidPublicKey;
                newPushSubscription = await workerRegistration.pushManager.subscribe(options);
            } else {
                // VAPID isn't supported; so subscribe via legacy manifest.json GCM Sender ID
                newPushSubscription = await workerRegistration.pushManager.subscribe(options);
            }
        }
    } else {
        // No existing push subscription; just subscribe the user
        if (Environment.supportsVapid() && this.config.vapidPublicKey) {
            options.applicationServerKey = this.config.vapidPublicKey;
            newPushSubscription = await workerRegistration.pushManager.subscribe(options);
        } else {
            // VAPID isn't supported; so subscribe via legacy manifest.json GCM Sender ID
            newPushSubscription = await workerRegistration.pushManager.subscribe(options);
        }
    }

    pushSubscriptionDetails.fcmEndpoint = new URL(newPushSubscription.endpoint);

    // Retrieve p256dh and auth for encrypted web push protocol
    if (newPushSubscription.getKey) {
      // p256dh and auth are both ArrayBuffer
      let p256dh = null;
      try {
        p256dh = newPushSubscription.getKey('p256dh');
      } catch (e) {
        // User is most likely running < Chrome < 50
      }
      let auth = null;
      try {
        auth = newPushSubscription.getKey('auth');
      } catch (e) {
        // User is most likely running < Firefox 45
      }

      if (p256dh) {
        // Base64 encode the ArrayBuffer (not URL-Safe, using standard Base64)
        let p256dh_base64encoded = btoa(
          String.fromCharCode.apply(null, new Uint8Array(p256dh)));
        pushSubscriptionDetails.fcmP256dh = p256dh_base64encoded;
      }
      if (auth) {
        // Base64 encode the ArrayBuffer (not URL-Safe, using standard Base64)
        let auth_base64encoded = btoa(
          String.fromCharCode.apply(null, new Uint8Array(auth)));
        pushSubscriptionDetails.fcmAuth = auth_base64encoded;
      }
    }

    return pushSubscriptionDetails;
  }
}
