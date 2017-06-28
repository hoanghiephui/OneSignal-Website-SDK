export class RawPushSubscription {
    /**
     * The GCM/FCM registration token, along with the full URL. Not used for Safari.
     */
    fcmEndpoint: URL;
    fcmP256dh: string;
    fcmAuth: string
    /**
     * A Safari-only push subscription device token. Not used for Chrome/Firefox.
     */
    safariDeviceToken: string;

}
