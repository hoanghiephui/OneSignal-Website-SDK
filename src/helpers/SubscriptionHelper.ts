import * as Browser from 'bowser';
import * as log from 'loglevel';

import PushPermissionNotGrantedError from '../errors/PushPermissionNotGrantedError';
import { PushPermissionNotGrantedErrorReason } from '../errors/PushPermissionNotGrantedError';
import TimeoutError from '../errors/TimeoutError';
import Event from '../Event';
import SdkEnvironment from '../managers/SdkEnvironment';
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';
import { getConsoleStyle, timeoutPromise } from '../utils';
import EventHelper from './EventHelper';
import MainHelper from './MainHelper';
import TestHelper from './TestHelper';
import { InvalidStateError, InvalidStateReason } from '../errors/InvalidStateError';
import Context from '../models/Context';
import { ServiceWorkerActiveState } from '../managers/ServiceWorkerManager';
import { Subscription } from '../models/Subscription';
import Database from "../services/Database";


export default class SubscriptionHelper {


  static async registerForPush(): Promise<Subscription> {
    const env = SdkEnvironment.getWindowEnv();
    let subscription: Subscription;

    if (env === WindowEnvironmentKind.Host) {
      const context: Context = OneSignal.context;

      subscription = await context.subscriptionManager.subscribe();

      log.debug('Subscription Result:', subscription);
      await Database.put("Ids", { type: "userId", id: subscription.deviceId.value });
      await Database.put("Options", { key: "registrationId", value: subscription.subscriptionToken });

      MainHelper.beginTemporaryBrowserSession();
      EventHelper.triggerNotificationPermissionChanged();
      EventHelper.checkAndTriggerSubscriptionChanged();
      return subscription;
    } else {
      throw new InvalidStateError(InvalidStateReason.UnsupportedEnvironment);
    }
  }

  /**
   * Returns true if web push subscription occurs on a subdomain of OneSignal.
   * If true, our main IndexedDB is stored on the subdomain of onesignal.com, and not the user's site.
   * @remarks
   *   This method returns true if:
   *     - The browser is not Safari
   *         - Safari uses a different method of subscription and does not require our workaround
   *     - The init parameters contain a subdomain (even if the protocol is HTTPS)
   *         - HTTPS users using our subdomain workaround still have the main IndexedDB stored on our subdomain
   *        - The protocol of the current webpage is http:
   *   Exceptions are:
   *     - Safe hostnames like localhost and 127.0.0.1
   *          - Because we don't want users to get the wrong idea when testing on localhost that direct permission is supported on HTTP, we'll ignore these exceptions. HTTPS will always be required for direct permission
   *        - We are already in popup or iFrame mode, or this is called from the service worker
   */
  static isUsingSubscriptionWorkaround() {
    if (!OneSignal.config) {
      throw new Error(`(${SdkEnvironment.getWindowEnv().toString()}) isUsingSubscriptionWorkaround() cannot be called until OneSignal.config exists.`);
    }
    if (Browser.safari) {
      return false;
    }

    if (SubscriptionHelper.isLocalhostAllowedAsSecureOrigin() &&
      location.hostname === 'localhost' ||
      (location.hostname as any) === '127.0.0.1') {
      return false;
    }

    return ((SdkEnvironment.getWindowEnv() === WindowEnvironmentKind.Host) &&
    (!!OneSignal.config.subdomain || location.protocol === 'http:'));
  }

  /**
   * Returns true if the current frame context is a child iFrame, and the parent is not HTTPS.
   *
   * This is used to check if isPushNotificationsEnabled() should grab the service worker registration. In an HTTPS iframe of an HTTP page,
   * getting the service worker registration would throw an error.
   */
  static async hasInsecureParentOrigin() {
    // If we are the top frame, or service workers aren't available, don't run this check
    if (window === window.top ||
      !('serviceWorker' in navigator) ||
      typeof navigator.serviceWorker.getRegistration === "undefined") {
      return false;
    }
    try {
      await navigator.serviceWorker.getRegistration();
      return false;
    } catch (e) {
      return true;
    }
  }

  static isLocalhostAllowedAsSecureOrigin() {
    return OneSignal.config && OneSignal.config.userConfig.allowLocalhostAsSecureOrigin === true;
  }
}
