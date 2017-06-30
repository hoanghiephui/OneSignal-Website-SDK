import {Uuid} from "./Uuid";
import { Serializable } from './Serializable';


export class Subscription implements Serializable {
  /**
   * The OneSignal player ID.
   */
  deviceId: Uuid;
  /**
   * The GCM/FCM registration token, as a stringified URL, or the Safari device token.
   */
  subscriptionToken: string;
  /**
   * Whether the user is opted out of notifications, set by setSubscription().
   */
  optedOut: boolean;

  serialize() {
    return {
      safariDeviceId: this.deviceId.serialize(),
      subscriptionToken: this.subscriptionToken,
      optedOut: this.optedOut
    }
  }

  static deserialize(bundle: any): Subscription {
    const subscription = new Subscription();
    subscription.deviceId = Uuid.deserialize(bundle.safariDeviceId);
    subscription.subscriptionToken = bundle.pushEndpoint;
    subscription.optedOut = bundle.optedOut;
    return subscription;
  }
}
