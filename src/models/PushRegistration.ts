import { Uuid } from './Uuid';
import Environment from '../Environment';
import NotImplementedError from '../errors/NotImplementedError';
import { DeliveryPlatformKind } from './DeliveryPlatformKind';
import { DevicePlatformKind } from './DevicePlatformKind';
import { RawPushSubscription } from './RawPushSubscription';
import { Serializable } from './Serializable';
import { SubscriptionStateKind } from './SubscriptionStateKind';
import { Uuid } from './Uuid';
import Environment from '../Environment';
import NotImplementedError from '../errors/NotImplementedError';
import * as Browser from 'bowser';


/**
 * Describes the payload to be sent to OneSignal for user registration.
 */
export class PushRegistration implements Serializable {
  public appId: Uuid;
  public deliveryPlatform: DeliveryPlatformKind;
  public language: string;
  public timezone: number;
  public browserName: string;
  public browserVersion: number;
  public operatingSystem: string;
  public operatingSystemVersion: number;
  public devicePlatform: DevicePlatformKind;
  public deviceModel: string;
  public sdkVersion: string;
  public subscriptionState: SubscriptionStateKind;
  public subscription: RawPushSubscription;

  constructor() {
    this.language = Environment.getLanguage();
    this.timezone = new Date().getTimezoneOffset() * -60;
    this.browserName = Browser.name;
    this.browserVersion = parseInt(Browser.version) !== NaN ? parseInt(Browser.version) : -1;
    this.operatingSystem = this.getBrowserOperatingSystem();
    this.operatingSystemVersion = parseInt(Browser.osversion) !== NaN ? parseInt(Browser.osversion) : -1;
    this.devicePlatform = this.getDevicePlatformKind();
    this.deviceModel = navigator.platform;
    this.sdkVersion = Environment.version().toString();
    // Unimplemented properties are appId, deliveryPlatform, subscriptionState, and subscription
  }

  getDevicePlatformKind(): DevicePlatformKind {
    const isMobile = Browser.mobile;
    const isTablet = Browser.tablet;

    if (isMobile) {
      return DevicePlatformKind.Mobile;
    } else if (isTablet) {
      return DevicePlatformKind.Tablet;
    } else {
      return DevicePlatformKind.Desktop;
    }
  }

  getBrowserOperatingSystem(): string {
    /*
      mac
      windows - other than Windows Phone
      windowsphone
      linux - other than android, chromeos, webos, tizen, and sailfish
      chromeos
      android
      ios - also sets one of iphone/ipad/ipod
      blackberry
      firefoxos
      webos - may also set touchpad
      bada
      tizen
      sailfish
    */
    if (Browser.mac) {
      return "Mac OS X";
    }
    if (Browser.windows) {
      return "Microsoft Windows";
    }
    if (Browser.windowsphone) {
      return "Microsoft Windows Phone";
    }
    if (Browser.linux) {
      return "Linux";
    }
    if (Browser.chromeos) {
      return "Google Chrome OS";
    }
    if (Browser.android) {
      return "Google Android";
    }
    if (Browser.ios) {
      return "Apple iOS";
    }
    if (Browser.blackberry) {
      return "Blackberry";
    }
    if (Browser.firefoxos) {
      return "Mozilla Firefox OS";
    }
    if (Browser.webos) {
      return "WebOS";
    }
    if (Browser.tizen) {
      return "Tizen";
    }
    if (Browser.sailfish) {
      return "Sailfish OS";
    }
    return "Unknown";
  }

  serialize() {
    return {
      /* Old Parameters */
      app_id: this.appId.value,
      device_type: this.deliveryPlatform,
      language: this.language,
      timezone: this.timezone,
      device_os: this.browserVersion,
      sdk: this.sdkVersion,
      notification_types: this.subscriptionState,
      /* New Paramters */
      delivery_platform: this.deliveryPlatform,
      browser_name: this.browserName,
      browser_version: this.browserVersion,
      operating_system: this.operatingSystem,
      operating_system_version: this.operatingSystemVersion,
      device_platform: this.devicePlatform,
      device_model: this.deviceModel,
      identifier: Browser.safari ? this.subscription.safariDeviceToken : this.subscription.fcmEndpoint,
      web_auth: this.subscription.fcmAuth,
      web_p256: this.subscription.fcmP256dh
    };
  }

  deserialize(_: object): PushRegistration { throw new NotImplementedError(); }
}
