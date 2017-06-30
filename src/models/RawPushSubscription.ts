export class RawPushSubscription {
    /**
     * The GCM/FCM registration token, along with the full URL. Not used for Safari.
     */
    w3cEndpoint: URL;
    w3cP256dh: string;
    w3cAuth: string
    /**
     * A Safari-only push subscription device token. Not used for Chrome/Firefox.
     */
    safariDeviceToken: string;

}
