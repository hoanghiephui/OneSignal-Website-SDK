import * as Browser from 'bowser';
import * as log from 'loglevel';

import Environment from '../Environment';
import { InvalidStateError, InvalidStateReason } from '../errors/InvalidStateError';
import PushPermissionNotGrantedError from '../errors/PushPermissionNotGrantedError';
import { PushPermissionNotGrantedErrorReason } from '../errors/PushPermissionNotGrantedError';
import { SdkInitError, SdkInitErrorKind } from '../errors/SdkInitError';
import SubscriptionError from '../errors/SubscriptionError';
import { SubscriptionErrorReason } from '../errors/SubscriptionError';
import Event from '../Event';
import EventHelper from '../helpers/EventHelper';
import MainHelper from '../helpers/MainHelper';
import Context from '../models/Context';
import { DeliveryPlatformKind } from '../models/DeliveryPlatformKind';
import { NotificationPermission } from '../models/NotificationPermission';
import { PushRegistration } from '../models/PushRegistration';
import { RawPushSubscription } from '../models/RawPushSubscription';
import { SubscriptionStateKind } from '../models/SubscriptionStateKind';
import { Uuid } from '../models/Uuid';
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';
import OneSignalApi from '../OneSignalApi';
import Database from '../services/Database';
import SdkEnvironment from './SdkEnvironment';
import { Subscription } from '../models/Subscription';
import { UnsubscriptionStrategy } from "../models/UnsubscriptionStrategy";
import NotImplementedError from '../errors/NotImplementedError';



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

  public async subscribe(): Promise<Subscription> {
    let rawPushSubscription: RawPushSubscription;
    let pushRegistration = new PushRegistration();

    const env = SdkEnvironment.getWindowEnv();

    if (env === WindowEnvironmentKind.ServiceWorker ||
      env === WindowEnvironmentKind.Host ||
      env === WindowEnvironmentKind.OneSignalProxyFrame) {
      if (SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.ServiceWorker) {
        rawPushSubscription = await this.subscribeFcmFromWorker();
      } else if (SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.Host ||
        SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.OneSignalProxyFrame) {
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

        if (this.isSafari()) {
          rawPushSubscription = await this.subscribeSafari();
          EventHelper.triggerNotificationPermissionChanged();
        } else {
          rawPushSubscription = await this.subscribeFcmFromPage();
        }
      }
      const finalSubscription = await this.registerSubscriptionWithOneSignal(rawPushSubscription);
      return finalSubscription;
    } else if (SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.OneSignalSubscriptionModal ||
      SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.OneSignalSubscriptionPopup) {
      // No subscription is done here, its down in the proxy frame
      throw new InvalidStateError(InvalidStateReason.UnsupportedEnvironment);
    } else {
      throw new InvalidStateError(InvalidStateReason.UnsupportedEnvironment);
    }
  }

  public async unsubscribe(strategy: UnsubscriptionStrategy) {
    if (strategy === UnsubscriptionStrategy.DestroySubscription) {
      throw new NotImplementedError();
    } else if (strategy === UnsubscriptionStrategy.MarkUnsubscribed) {
      if (SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.ServiceWorker) {

        const { deviceId } = await Database.getSubscription();

      await OneSignalApi.updatePlayer(this.context.appConfig.appId, deviceId, {
        notification_types: SubscriptionStateKind.MutedByApi
      });

      await Database.put('Options', {key: 'optedOut', value: true});
      } else {
        throw new NotImplementedError();
      }
    } else {
      throw new NotImplementedError();
    }
  }

  private async registerSubscriptionWithOneSignal(pushSubscription: RawPushSubscription) {
    let pushRegistration = new PushRegistration();

    pushRegistration.appId = this.config.appId;

    if (this.isSafari()) {
      pushRegistration.deliveryPlatform = DeliveryPlatformKind.Safari;
    } else if (Browser.firefox) {
      pushRegistration.deliveryPlatform = DeliveryPlatformKind.Firefox;
    } else {
      pushRegistration.deliveryPlatform = DeliveryPlatformKind.ChromeLike;
    }

    pushRegistration.subscriptionState = SubscriptionStateKind.Subscribed;
    pushRegistration.subscription = pushSubscription;

    let newDeviceId: Uuid;
    if (await this.isAlreadyRegisteredWithOneSignal()) {
      const { deviceId } = await Database.getSubscription();
      newDeviceId = await OneSignalApi.updateUserSession(deviceId, pushRegistration);
      if (SdkEnvironment.getWindowEnv() !== WindowEnvironmentKind.ServiceWorker) {
        Event.trigger(OneSignal.EVENTS.REGISTERED);
      }
    } else {
      const id = await OneSignalApi.createUser(pushRegistration);
      if (SdkEnvironment.getWindowEnv() !== WindowEnvironmentKind.ServiceWorker) {
        Event.trigger(OneSignal.EVENTS.REGISTERED);
      }
      newDeviceId = id;
    }

    await Database.put('Options', {key: 'optedOut', value: false});
    await Database.put('Ids', { type: 'userId', id: newDeviceId.value });

    const subscription = new Subscription();
    subscription.deviceId = newDeviceId;
    subscription.optedOut = false;
    subscription.subscriptionToken = pushSubscription.w3cEndpoint.toString();
    return subscription;
  }

  private async isAlreadyRegisteredWithOneSignal() {
      const { deviceId } = await Database.getSubscription();
      return !!deviceId.value;
  }

  private subscribeSafariPromptPermission(): Promise<string | null> {
    return new Promise<string>(resolve => {
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

  private async subscribeSafari(): Promise<RawPushSubscription> {
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

  private async subscribeFcmFromPage(): Promise<RawPushSubscription> {
    if (await this.context.serviceWorkerManager.shouldInstallWorker()) {
      await this.context.serviceWorkerManager.installWorker();
    }

    log.debug('Waiting for the service worker to activate...');
    const workerRegistration = await navigator.serviceWorker.ready;
    log.debug('Service worker is ready to continue subscribing.');

    /*
      Trigger the permissionPromptDisplay event to the best of our knowledge.
    */
    if (SdkEnvironment.getWindowEnv() !== WindowEnvironmentKind.ServiceWorker) {
      Event.trigger(OneSignal.EVENTS.PERMISSION_PROMPT_DISPLAYED);
    }

    return await this.subscribeFcmVapidOrLegacyKey(workerRegistration);
  }

  private async subscribeFcmFromWorker(): Promise<RawPushSubscription> {
    /*
      We're running inside of the service worker.

      Check to make sure our registration is activated, otherwise we can't
      subscribe for push.
     */
    if (!self.registration.active) {
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
  private async subscribeFcmVapidOrLegacyKey(workerRegistration: ServiceWorkerRegistration): Promise<RawPushSubscription> {
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
            options.applicationServerKey = this.urlBase64ToUint8Array(this.config.vapidPublicKey);
            newPushSubscription = await workerRegistration.pushManager.subscribe(options);
        } else {
            // VAPID isn't supported; so subscribe via legacy manifest.json GCM Sender ID
            newPushSubscription = await workerRegistration.pushManager.subscribe(options);
        }
    }

    pushSubscriptionDetails.w3cEndpoint = new URL(newPushSubscription.endpoint);

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
        pushSubscriptionDetails.w3cP256dh = p256dh_base64encoded;
      }
      if (auth) {
        // Base64 encode the ArrayBuffer (not URL-Safe, using standard Base64)
        let auth_base64encoded = btoa(
          String.fromCharCode.apply(null, new Uint8Array(auth)));
        pushSubscriptionDetails.w3cAuth = auth_base64encoded;
      }
    }

    return pushSubscriptionDetails;
  }

  private urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}
