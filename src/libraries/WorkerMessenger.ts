import { InvalidArgumentError, InvalidArgumentReason } from '../errors/InvalidArgumentError';
import { InvalidStateError, InvalidStateReason } from '../errors/InvalidStateError';
import SdkEnvironment from '../managers/SdkEnvironment';
import { ServiceWorkerActiveState } from '../managers/ServiceWorkerManager';
import Context from '../models/Context';
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';
import * as log from 'loglevel';
import { Serializable } from '../models/Serializable';


export enum WorkerMessengerCommand {
  WorkerVersion = "GetWorkerVersion",
  Subscribe = "Subscribe",
  AmpIsSubscribed = "amp-web-push-is-subscribed",
  AmpSubscribe = "amp-web-push-subscribe",

  AmpUnsubscribe = "amp-web-push-unsubscribe"
}

export interface WorkerMessengerMessage {
  command: WorkerMessengerCommand,
  payload: WorkerMessengerPayload
}

export interface WorkerMessengerReplyBufferRecord {
  callback: Function,
  onceListenerOnly: boolean
}

export class WorkerMessengerReplyBuffer {

  private replies: object;

  constructor() {
    this.replies = {};
  }

  public addListener(command: WorkerMessengerCommand, callback: Function, onceListenerOnly: boolean) {
    const record = {
      callback: callback,
      onceListenerOnly: onceListenerOnly
    };

    if (this.findListenersForMessage(command).length > 0) {
      this.replies[command.toString()].push(record);
    } else {
      this.replies[command.toString()] = [record];
    }
  }

  public findListenersForMessage(command: WorkerMessengerCommand): any {
    return this.replies[command.toString()] || [];
  }

  public deleteListenerRecords(command: WorkerMessengerCommand) {
    this.replies[command.toString()] = null;
  }

  public deleteListenerRecord(command: WorkerMessengerCommand, targetRecord: any) {
    const listenersForCommand = this.replies[command.toString()];
    for (let listenerRecordIndex = listenersForCommand.length - 1; listenerRecordIndex >= 0; listenerRecordIndex--) {
      const listenerRecord = listenersForCommand[listenerRecordIndex];
      if (listenerRecord === targetRecord) {
        listenersForCommand.splice(listenerRecordIndex, 1);
      }
    }
  }
}

export type WorkerMessengerPayload = Serializable | number | string | object | boolean;

export class WorkerMessenger {

  private context: Context;
  private replies: WorkerMessengerReplyBuffer;
  private debug: boolean;

  constructor(context: Context) {
    this.context = context;
    this.replies = new WorkerMessengerReplyBuffer();
    this.debug = true;
  }

  public log(..._) {
    if (this.debug) {
      log.debug.apply(this, arguments);
    }
  }

  /**
   * Broadcasts a message from a service worker to all controlled clients.
   */
  async broadcast(command: WorkerMessengerCommand, payload: WorkerMessengerPayload) {
    const env = SdkEnvironment.getWindowEnv();

    if (env !== WindowEnvironmentKind.ServiceWorker) {
      return;
    } else {
      const clients = await self.clients.matchAll({});
      for (let client of clients) {
        this.log(`[Worker Messenger] [SW -> Page] Broadcasting '${command.toString()}' to window client ${client.url}.`)
        client.postMessage({
          command: command,
          payload: payload
        } as any);
      }
    }
  }

  async unicast(command: WorkerMessengerCommand, payload?: WorkerMessengerPayload, windowClient?: WindowClient) {
    const env = SdkEnvironment.getWindowEnv();

    if (env === WindowEnvironmentKind.ServiceWorker) {
      if (!windowClient) {
        throw new InvalidArgumentError('windowClient', InvalidArgumentReason.Empty);
      } else {
        this.log(`[Worker Messenger] [SW -> Page] Unicasting '${command.toString()}' to window client ${windowClient.url}.`)
        windowClient.postMessage({
          command: command,
          payload: payload
        } as any);
      }
    } else {
      if (!(await this.isWorkerControllingPage())) {
        this.log("[Worker Messenger] The page is not controlled by the service worker yet. Waiting...", self.registration);
      }
      await this.waitUntilWorkerControlsPage();
      this.log(`[Worker Messenger] [Page -> SW] Unicasting '${command.toString()}' to service worker.`)
      navigator.serviceWorker.controller.postMessage({
        command: command,
        payload: payload
      })
    }
  }

  async listen() {
    if (!(await this.isWorkerControllingPage())) {
      this.log("[Worker Messenger] The page is not controlled by the service worker yet. Waiting...", self.registration);
    }
    await this.waitUntilWorkerControlsPage();
    this.log("[Worker Messenger] The page is now controlled by the service worker.");
    const env = SdkEnvironment.getWindowEnv();

    if (env === WindowEnvironmentKind.ServiceWorker) {
      self.addEventListener('message', this.onWorkerMessageReceivedFromPage.bind(this));
      this.log('[Worker Messenger] Service worker is now listening for messages.');
    } else {
      navigator.serviceWorker.addEventListener('message', this.onPageMessageReceivedFromServiceWorker.bind(this));
      this.log('[Worker Messenger] Page is now listening for messages.');
    }
  }

  async onWorkerMessageReceivedFromPage(event: ServiceWorkerMessageEvent) {
    const data: WorkerMessengerMessage = event.data;
    const listenerRecords = this.replies.findListenersForMessage(data.command);
    const listenersToRemove = [];
    const listenersToCall = [];

    this.log(`[Worker Messenger] Service worker received message:`, event.data);

    for (let listenerRecord of listenerRecords) {
      if (listenerRecord.onceListenerOnly) {
        listenersToRemove.push(listenerRecord);
      }
      listenersToCall.push(listenerRecord);
    }
    for (let i = listenersToRemove.length - 1; i >= 0; i--) {
      const listenerRecord = listenersToRemove[i];
      this.replies.deleteListenerRecord(data.command, listenerRecord);
      this.log(`[Worker Messenger] SW: Deleted listener record:`, data.command.toString(), listenerRecord);
    }
    for (let listenerRecord of listenersToCall) {
      this.log(`[Worker Messenger] SW: Calling callback for listener record:`, listenerRecord);
      listenerRecord.callback.apply(null, [data.payload]);
    }
  }

  async onPageMessageReceivedFromServiceWorker(event: ServiceWorkerMessageEvent) {
    const data: WorkerMessengerMessage = event.data;
    const listenerRecords = this.replies.findListenersForMessage(data.command);
    const listenersToRemove = [];
    const listenersToCall = [];

    this.log(`[Worker Messenger] Page received message:`, event.data);

    for (let listenerRecord of listenerRecords) {
      if (listenerRecord.onceListenerOnly) {
        listenersToRemove.push(listenerRecord);
      }
      listenersToCall.push(listenerRecord);
    }
    for (let i = listenersToRemove.length - 1; i >= 0; i--) {
      const listenerRecord = listenersToRemove[i];
      this.replies.deleteListenerRecord(data.command, listenerRecord);
      this.log(`[Worker Messenger] Page: Deleted listener record:`, data.command.toString(), listenerRecord);
    }
    for (let listenerRecord of listenersToCall) {
      this.log(`[Worker Messenger] Page: Calling callback for listener record:`, listenerRecord);
      listenerRecord.callback.apply(null, [data.payload]);
    }
  }

  on(command: WorkerMessengerCommand, callback: Function): void {
    this.replies.addListener(command, callback, false);
  }

  once(command: WorkerMessengerCommand, callback: Function): void {
    this.replies.addListener(command, callback, true);
  }

  off(command: WorkerMessengerCommand): void {
    this.replies.deleteListenerRecords(command);
  }

  async isWorkerControllingPage(): Promise<boolean> {
    const env = SdkEnvironment.getWindowEnv();

    if (env === WindowEnvironmentKind.ServiceWorker) {
      return !!self.registration.active;
    } else {
      const workerState = await this.context.serviceWorkerManager.getActiveState();
      return workerState === ServiceWorkerActiveState.WorkerA ||
        workerState === ServiceWorkerActiveState.WorkerB;
    }
  }

  /**
   * For pages, waits until one of our workers is activated.
   *
   * For service workers, waits until the registration is active.
   */
  async waitUntilWorkerControlsPage() {
    return new Promise<void>(async resolve => {
      if (await this.isWorkerControllingPage()) {
        resolve();
      } else {
        const env = SdkEnvironment.getWindowEnv();

        if (env === WindowEnvironmentKind.ServiceWorker) {
          self.addEventListener('activate', async e => {
            if (await this.isWorkerControllingPage()) {
              resolve();
            }
          });
        } else {
          navigator.serviceWorker.addEventListener('controllerchange', async e => {
            if (await this.isWorkerControllingPage()) {
              resolve();
            }
          });
        }
      }
    });
  }
}
