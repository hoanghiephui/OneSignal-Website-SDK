import { Uuid } from './Uuid';
import { PlatformKind } from './PlatformKind';
import { Serializable } from './Serializable';
import { DeliveryPlatformKind } from './DeliveryPlatformKind';
import { SubscriptionStateKind } from './SubscriptionStateKind';
import { DevicePlatformKind } from './DevicePlatformKind';
import Environment from '../Environment';
import NotImplementedError from '../errors/NotImplementedError';


/**
 * Describes the payload to be sent to OneSignal for user registration.
 */
export class PushRegistration implements Serializable<PushRegistration> {

  constructor(
    public appId: Uuid,
    public deliveryPlatform: DeliveryPlatformKind,
    public language: string,
    public timezone: number,
    public browserName: string,
    public browserVersion: number,
    public operatingSystem: string,
    public operatingSystemVersion: number,
    public devicePlatform: DevicePlatformKind,
    public deviceName: string,
    public sdkVersion: string,
    public subscriptionState: SubscriptionStateKind
  ) { }

  serialize() {
    return {
      /* Old Parameters */
      app_id: this.appId.value,
      device_type: this.deliveryPlatform,
      language: this.language,
      timezone: this.timezone,
      device_model: this.devicePlatform + ' ' + this.browserName,
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
      device_name: this.deviceName
    };
  }

  deserialize(bundle: object) { throw new NotImplementedError(); }
}
