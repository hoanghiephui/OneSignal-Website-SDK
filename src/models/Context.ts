import { DynamicResourceLoader } from "../services/DynamicResourceLoader";
import { SubscriptionManager } from '../managers/SubscriptionManager';
import { ServiceWorkerManager } from '../managers/ServiceWorkerManager';


export default class Context {

  public dynamicResourceLoader: DynamicResourceLoader;
  public subscriptionManager: SubscriptionManager;
  public serviceWorkerManager: ServiceWorkerManager;

  constructor() {
  }
}
