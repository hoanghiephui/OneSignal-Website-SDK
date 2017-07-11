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

    const serviceWorkerManagerConfig = {
      workerAPath: new Path('/' + SdkEnvironment.getBuildEnvPrefix() + 'OneSignalSDKWorker.js'),
      workerBPath: new Path('/'+ SdkEnvironment.getBuildEnvPrefix() + 'OneSignalSDKUpdaterWorker.js'),
      registrationOptions: { scope: '/' }
    };
    if (appConfig.userConfig) {
      if (appConfig.userConfig.path) {
        serviceWorkerManagerConfig.workerAPath = new Path((appConfig.userConfig.path) + SdkEnvironment.getBuildEnvPrefix() + appConfig.userConfig.serviceWorkerPath);
        serviceWorkerManagerConfig.workerBPath = new Path((appConfig.userConfig.path) + SdkEnvironment.getBuildEnvPrefix() + appConfig.userConfig.serviceWorkerUpdaterPath);
      }
      if (appConfig.userConfig.serviceWorkerParam) {
        serviceWorkerManagerConfig.registrationOptions = appConfig.userConfig.serviceWorkerParam;
      }
    }
    this.serviceWorkerManager = new ServiceWorkerManager(this, serviceWorkerManagerConfig);

    this.workerMessenger = new WorkerMessenger(this);
    this.dynamicResourceLoader = new DynamicResourceLoader();
  }
}
