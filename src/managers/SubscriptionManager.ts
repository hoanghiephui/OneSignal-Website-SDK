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


export interface SubscriptionManagerConfig {
  safariWebId: string;
  appId: Uuid;
  vapidPublicKey: String;
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

  async subscribe() {
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
      const pushToken = await this.subscribeSafari();
      EventHelper.triggerNotificationPermissionChanged();
    } else {
      await this.subscribeFcm();
    }
    // Move Safari subscription to be in here
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

  async subscribeSafari(): Promise<string> {
    if (!this.config.safariWebId) {
      throw new SdkInitError(SdkInitErrorKind.MissingSafariWebId);
    }
    const deviceToken = await this.subscribeSafariPromptPermission();
    if (deviceToken) {
      return deviceToken;
    } else {
      throw new SubscriptionError(SubscriptionErrorReason.InvalidSafariSetup);
    }
  }

  async subscribeFcm(): Promise<string> {
    await this.context.serviceWorkerManager.installWorker();

    log.debug('Waiting for the service worker to activate...');
    const workerRegistration = await navigator.serviceWorker.ready;
    log.debug('The newly installed service worker is not active.')

    // Installs message channel to receive service worker messages
    MainHelper.establishServiceWorkerChannel(workerRegistration);

    /*
      Trigger the permissionPromptDisplay event to the best of our knowledge.
    */
    Event.trigger(OneSignal.EVENTS.PERMISSION_PROMPT_DISPLAYED);

    await this.subscribeFcmVapidOrLegacyKey(workerRegistration);
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
  async subscribeFcmVapidOrLegacyKey(workerRegistration: ServiceWorkerRegistration): Promise<PushSubscription> {
    let options = {
        userVisibleOnly: true,
        applicationServerKey: undefined
    };

    let newPushSubscription: PushSubscription;

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

    return newPushSubscription;
  }
}
