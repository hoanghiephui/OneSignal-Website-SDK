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

    await this.subscribeFcmVapidOrLegacyKey();
  }

  async getSubscriptionStrategy(workerRegistration: ServiceWorkerRegistration, intent: SubscribeResubscribe): SubscriptionStrategyKind {
    const existingSubscription = await workerRegistration.pushManager.getSubscription();

    if (intent === SubscribeResubscribe.Resubscribe) {
      if (!existingSubscription) {
        /*
          If the user was never subscribed, simply subscribe them.
         */
        return SubscriptionStrategyKind.SubscribeNew;
      } else {
        /*
          If the user was already subscribed, we have to consider:

          - The user may have been authenticated via the propietary GCM manifest.json
          - The user may have been authenticated via the new VAPID standard
         */
        if (existingSubscription.options) {
          /*
            We can use the stored PushSubscriptionOptions to resubscribe ourselves
            using the exact same options from the existing subscriptions without
            needing to pass in any GCM Sender ID or VAPID key.
           */
          return SubscriptionStrategyKind.ResubscribeExisting;
        } else {

        }
      }
    } else if (intent === SubscribeResubscribe.Subscribe) {
      if (!existingSubscription) {
        /*
          If the user was never subscribed, simply subscribe them.
         */
        return SubscriptionStrategyKind.SubscribeNew;
      } else {
        /*
          If the user was already subscribed, we have to consider:

          - The user may have been authenticated via the propietary GCM manifest.json
          - The user may have been authenticated via the new VAPID standard
         */
        if (existingSubscription.options) {
          /*
            We can use the stored PushSubscriptionOptions to resubscribe ourselves
            using the exact same options from the existing subscriptions without
            needing to pass in any GCM Sender ID or VAPID key.
           */
          return SubscriptionStrategyKind.ResubscribeExisting;
        } else {

        }
      }

    } else {
      throw new Error();
    }
  }

  async subscribeFcmVapidOrLegacyKey(workerRegistration: ServiceWorkerRegistration) {
    const options = {
      userVisibleOnly: true
    };

    // If the user
    if (this.config.vapidPublicKey) {

    }
    const pushSubscription = await workerRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: '',
    });
  }
}
