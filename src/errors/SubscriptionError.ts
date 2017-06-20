import OneSignalError from "./OneSignalError";


export enum SubscriptionErrorReason {
  InvalidSafariSetup,
  Dismissed
}

export default class SubscriptionError extends OneSignalError {
  reason: string;

  constructor(reason: SubscriptionErrorReason) {
    switch (reason) {
      case SubscriptionErrorReason.InvalidSafariSetup:
        super('The Safari site URL, icon size, or push certificate is invalid, or Safari is in a private session.');
        break;
      case SubscriptionErrorReason.Blocked:
        super('Notification permissions are blocked.');
        break;
    }
  }
}
