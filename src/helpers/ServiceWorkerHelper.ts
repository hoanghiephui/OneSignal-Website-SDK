import Environment from "../Environment";
import * as log from "loglevel";
import Database from "../services/Database";
import {getConsoleStyle, contains} from "../utils";
import SubscriptionHelper from "./SubscriptionHelper";
import SdkEnvironment from "../managers/SdkEnvironment";
import { WindowEnvironmentKind } from "../models/WindowEnvironmentKind";


export default class ServiceWorkerHelper {

  static registerServiceWorker(full_sw_and_path) {
    // Refactored
    // Calls SubscriptionHelper.enableNotifications() when done
  }
}
