import { InvalidArgumentError, InvalidArgumentReason } from '../errors/InvalidArgumentError';
import { InvalidStateError, InvalidStateReason } from '../errors/InvalidStateError';
import SdkEnvironment from '../managers/SdkEnvironment';
import { ServiceWorkerActiveState } from '../managers/ServiceWorkerManager';
import Context from '../models/Context';
import { WindowEnvironmentKind } from '../models/WindowEnvironmentKind';

export enum WorkerMessengerCommand {
  WorkerVersion = "GetWorkerVersion",
  Subscribe = "Subscribe"
}

export interface WorkerMessengerMessage {
  command: WorkerMessengerCommand,
  payload: any
}

export interface WorkerMessengerReplyBufferRecord {
  callback: Function,
  onceListenerOnly: boolean
}

export class WorkerMessengerReplyBuffer {

  private replies: object;

  constructor() {
    this.replies = { };
  }

  public addListener(command: WorkerMessengerCommand, callback: Function, onceListenerOnly: boolean) {
    const record = {
      callback: callback,
      onceListenerOnly: onceListenerOnly
    };

    if (this.findListenersForMessage(command)) {
      this.replies[command.toString()].push(record);
    } else {
      this.replies[command.toString()] = [record];
    }
  }

  public findListenersForMessage(command: WorkerMessengerCommand): any {
    return this.replies[command.toString()];
  }

  public deleteListenerRecords(command: WorkerMessengerCommand) {
    this.replies[command.toString()] = null;
  }

  public deleteListenerRecord(command: WorkerMessengerCommand, targetRecord: any) {
    const listenersForCommand = this.replies[command.toString()];
    for (let listenerRecordIndex = listenersForCommand.length - 1; listenerRecordIndex > 0; listenerRecordIndex--) {
      const listenerRecord = listenersForCommand[listenerRecordIndex];
      if (listenerRecord === targetRecord) {
        listenersForCommand.splice(listenerRecordIndex, 1);
      }
    }
  }
}

export class WorkerMessenger {

  private context: Context;
  private replies: WorkerMessengerReplyBuffer;

  constructor(context: Context) {
    this.context = context;
    this.replies = new WorkerMessengerReplyBuffer();
  }

  /**
   * Broadcasts a message from a service worker to all controlled clients.
   */
  async broadcast(command: WorkerMessengerCommand, payload: any) {
    const env = SdkEnvironment.getWindowEnv();

    if (env !== WindowEnvironmentKind.ServiceWorker) {
      return;
    } else {
      const clients = await self.clients.matchAll({});
      for (let client of clients) {
        client.postMessage({
          command: command,
          payload: payload
        } as any);
      }
    }
  }

  async unicast(command: WorkerMessengerCommand, payload?: any, windowClient?: WindowClient) {
    const env = SdkEnvironment.getWindowEnv();

    if (env === WindowEnvironmentKind.ServiceWorker) {
      if (!windowClient) {
        throw new InvalidArgumentError('windowClient', InvalidArgumentReason.Empty);
      } else {
        windowClient.postMessage({
          command: command,
          payload: payload
        } as any);
      }
    } else {
      if (!(await this.isWorkerControllingPage())) {
        throw new InvalidStateError(InvalidStateReason.ServiceWorkerNotActivated);
      }
      navigator.serviceWorker.controller.postMessage({
        command: command,
        payload: payload
      })
    }
  }

  async listen() {
    const env = SdkEnvironment.getWindowEnv();

    if (env === WindowEnvironmentKind.ServiceWorker) {

    } else {
      if (!(await this.isWorkerControllingPage())) {
        throw new InvalidStateError(InvalidStateReason.ServiceWorkerNotActivated);
      }
      navigator.serviceWorker.onmessage = this.onMessageReceivedFromServiceWorker;
    }
  }

  async onMessageReceivedFromServiceWorker(event: ServiceWorkerMessageEvent) {
    const data: WorkerMessengerMessage = event.data;
    const listenerRecords = this.replies.findListenersForMessage(data.command);
    const listenersToRemove = [];
    const listenersToCall = [];
    for (let listenerRecord of listenerRecords) {
      if (listenerRecord.onceListenerOnly) {
        listenersToRemove.push(listenerRecord);
      } else {
        listenersToCall.push(listenerRecord);
      }
    }
    for (let i = listenersToRemove.length - 1; i > 0; i--) {
      const listenerRecord = listenersToRemove[i];
      this.replies.deleteListenerRecord(data.command, listenerRecord);
    }
    for (let listenerRecord of listenersToCall) {
      listenerRecord.callback.apply(null, data.payload);
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

  private async isWorkerControllingPage(): Promise<boolean> {
    const env = SdkEnvironment.getWindowEnv();

    if (env !== WindowEnvironmentKind.ServiceWorker) {
      return self.registration.active !== undefined &&
        self.registration.active.state === "activated";
    } else {
      const workerState = await this.context.serviceWorkerManager.getActiveState();
      return workerState === ServiceWorkerActiveState.WorkerA ||
        workerState === ServiceWorkerActiveState.WorkerB;
    }
  }
}
