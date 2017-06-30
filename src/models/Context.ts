import { WorkerMessenger } from '../libraries/WorkerMessenger';
import { ServiceWorkerManager } from '../managers/ServiceWorkerManager';
import { SubscriptionManager } from '../managers/SubscriptionManager';
import { DynamicResourceLoader } from '../services/DynamicResourceLoader';
import CookieSyncer from '../modules/CookieSyncer';
import { AppConfig } from './AppConfig';
import Path from './Path';
import SdkEnvironment from '../managers/SdkEnvironment';


export default class Context {

  public appConfig: AppConfig;
  public dynamicResourceLoader: DynamicResourceLoader;
  public subscriptionManager: SubscriptionManager;
  public serviceWorkerManager: ServiceWorkerManager;
  public workerMessenger: WorkerMessenger;
  public cookieSyncer: CookieSyncer;

  constructor(appConfig: AppConfig) {
    this.appConfig = appConfig;

    this.cookieSyncer = new CookieSyncer(appConfig.cookieSyncEnabled);

    this.subscriptionManager = new SubscriptionManager(this, {
      safariWebId: appConfig.safariWebId,
      appId: appConfig.appId,
      vapidPublicKey: appConfig.vapidPublicKey
    });

    this.serviceWorkerManager = new ServiceWorkerManager(this, {
      workerAPath: new Path((appConfig.userConfig.path || '/') + SdkEnvironment.getBuildEnvPrefix() + appConfig.userConfig.serviceWorkerPath),
      workerBPath: new Path((appConfig.userConfig.path || '/') + SdkEnvironment.getBuildEnvPrefix() + appConfig.userConfig.serviceWorkerUpdaterPath),
      registrationOptions: appConfig.userConfig.serviceWorkerParam || { scope: '/' }
    });

    this.workerMessenger = new WorkerMessenger(this);

    this.dynamicResourceLoader = new DynamicResourceLoader();
  }
}
