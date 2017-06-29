import { Uuid } from "./Uuid";


export class AppConfig {
    appId: Uuid;
    subdomain: string;
    /**
     * Describes whether the subdomain HTTP users subscribe to should belong to
     * the legacy domain onesignal.com, or the newer domain os.tc.
     */
    httpUseOneSignalCom?: boolean;
    cookieSyncEnabled?: boolean;
    safariWebId?: string;
    vapidPublicKey?: string;
}

export class AppUserConfig {
    autoRegister?: boolean;
    path?: string;
    httpPermissionRequest: AppUserConfigHttpPermissionRequest;
    promptOptions: AppUserConfigPromptOptions;
    welcomeNotification: AppUserConfigWelcomeNotification;
    notifyButton: AppUserConfigNotifyButton;
    persistNotification: boolean;
    webhooks: AppUserConfigWebhooks;
}

export class AppUserConfigHttpPermissionRequest {
  enable: boolean;
  useCustomModal: boolean;
  modalTitle: string;
  modalMessage: string;
  modalButtonText: string;
}

export class AppUserConfigPromptOptions {
  subscribeText: string;
  showGraphic: boolean;
  timeout: number;
  autoAcceptTitle: string;
  actionMessage: string;
  exampleNotificationTitleDesktop: string;
  exampleNotificationMessageDesktop: string;
  exampleNotificationTitleMobile: string;
  exampleNotificationMessageMobile: string;
  exampleNotificationCaption: string;
  acceptButtonText: string;
  cancelButtonText: string;
  showCredit: string;
}

export class AppUserConfigWelcomeNotification {
  disable: boolean;
  title: string;
  message: string;
}

export class AppUserConfigNotifyButton {
  enable: boolean;
  displayPredicate: Function;
  size: "small" | "medium" | "large";
  position: "bottom-left" | "bottom-right";
  offset: { bottom: number; left: number; right: number; };
  modalPrompt: boolean;
  prenotify: boolean;
  showCredit: boolean;
  colors: {
      'circle.background': string;
      'circle.foreground': string;
      'badge.background': string;
      'badge.foreground': string;
      'badge.bordercolor': string;
      'pulse.color': string;
      'dialog.button.background.hovering': string;
      'dialog.button.background.active': string;
      'dialog.button.background': string;
      'dialog.button.foreground': string;
  };
  text: {
    'tip.state.unsubscribed': string;
    'tip.state.subscribed': string;
    'tip.state.blocked': string;
    'message.prenotify': string;
    'message.action.subscribed': string;
    'message.action.resubscribed': string;
    'message.action.unsubscribed': string;
    'dialog.main.title': string;
    'dialog.main.button.subscribe': string;
    'dialog.main.button.unsubscribe': string;
    'dialog.blocked.title': string;
    'dialog.blocked.message': string;
  };
}

export class AppUserConfigWebhooks {
  subscribeText: string;
  showGraphic: boolean;
  timeout: number;

}


export interface ServerAppConfig {
  success: boolean,
  app_id: string,
  features: {
    cookie_sync: {
      enable: boolean
    }
  },
  config: {
    vapid_public_key: string,
    http_use_onesignal_com: boolean,
    safari_web_id: string,
    subdomain: string
  },
  generated_at: number
}
