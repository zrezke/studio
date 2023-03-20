// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import EventEmitter from "eventemitter3";

import Log from "@foxglove/log";

import { parseServerMessage } from "./parse";
import {
  BinaryOpcode,
  Channel,
  ClientBinaryOpcode,
  ClientChannel,
  ClientChannelId,
  ClientMessage,
  ConnectionGraphUpdate,
  IWebSocket,
  Parameter,
  ParameterValues,
  ServerMessage,
  Service,
  ServiceCallPayload,
  ServiceCallResponse,
  ServiceId,
  SubscriptionId,
  Time,
  ChannelId,
  MessageData,
  ServerInfo,
  StatusMessage,
} from "./types";

const CONFIG_API_URL = "http://localhost:8000";

const log = Log.getLogger(__filename);

type EventTypes = {
  open: () => void;
  error: (error: Error) => void;
  close: (event: CloseEvent) => void;

  serverInfo: (event: ServerInfo) => void;
  status: (event: StatusMessage) => void;
  message: (event: MessageData) => void;
  time: (event: Time) => void;
  advertise: (newChannels: Channel[]) => void;
  unadvertise: (removedChannels: ChannelId[]) => void;
  advertiseServices: (newServices: Service[]) => void;
  unadvertiseServices: (removedServices: ServiceId[]) => void;
  parameterValues: (event: ParameterValues) => void;
  serviceCallResponse: (event: ServiceCallResponse) => void;
  connectionGraphUpdate: (event: ConnectionGraphUpdate) => void;
};

const textEncoder = new TextEncoder();

export default class DepthaiClient {
  public static SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";

  private emitter = new EventEmitter<EventTypes>();
  private nextSubscriptionId = 0;
  private nextAdvertisementId = 0;

  public constructor() {
    this.reconnect();
  }

  public on<E extends EventEmitter.EventNames<EventTypes>>(
    name: E,
    listener: EventEmitter.EventListener<EventTypes, E>,
  ): void {
    this.emitter.on(name, listener);
  }
  public off<E extends EventEmitter.EventNames<EventTypes>>(
    name: E,
    listener: EventEmitter.EventListener<EventTypes, E>,
  ): void {
    this.emitter.off(name, listener);
  }

  private _onOpen = () => {
    this.emitter.emit("open");
  };

  private _onError = (event) => {
    this.emitter.emit("error", event.error);
  };

  private _onData(data: Buffer) {
    try {
      const message = parseServerMessage(data.buffer);
      switch (message.op) {
        case "serverInfo":
          this.emitter.emit("serverInfo", message);
          return;

        case "status":
          this.emitter.emit("status", message);
          return;

        case "advertise":
          this.emitter.emit("advertise", message.channels);
          return;

        case "unadvertise":
          this.emitter.emit("unadvertise", message.channelIds);
          return;

        case "parameterValues":
          this.emitter.emit("parameterValues", message);
          return;

        case "advertiseServices":
          this.emitter.emit("advertiseServices", message.services);
          return;

        case "unadvertiseServices":
          this.emitter.emit("unadvertiseServices", message.serviceIds);
          return;

        case "connectionGraphUpdate":
          this.emitter.emit("connectionGraphUpdate", message);
          return;

        case BinaryOpcode.MESSAGE_DATA:
          this.emitter.emit("message", message);
          return;

        case BinaryOpcode.TIME:
          this.emitter.emit("time", message);
          return;

        case BinaryOpcode.SERVICE_CALL_RESPONSE:
          this.emitter.emit("serviceCallResponse", message);
          return;
        default:
          this.emitter.emit(
            "error",
            new Error(`Unrecognized server opcode: ${(message as { op: number }).op}`),
          );
      }
    } catch (error) {
      this.emitter.emit("error", error as Error);
      return;
    }
  }

  private _onClose = () => {
    this.emitter.emit("close", new CloseEvent("close"));
  };

  private reconnect() {
    fetch(`${CONFIG_API_URL}/topics`)
      .then((res) => {
        res
          .json()
          .then((data) => {
            this.emitter.emit("advertise", data.topics as Channel[]);
          })
          .catch((err) => {
            log.error("Error: ", err);
          });
      })
      .catch((err) => {
        log.error("Error: ", err);
      });

    log.info(
      "Window as unknown: ",
      (window as unknown as { createZmqSocket: unknown }).createZmqSocket,
    );
    void (
      window as unknown as {
        createZmqSocket: (
          host: string,
          port: number,
          onData: (data: Buffer) => void,
          onError: (error: unknown) => void,
          onOpen: () => void,
          onClose: () => void,
        ) => Promise<void>;
      }
    ).createZmqSocket(
      "127.0.0.1",
      5555,
      this._onData.bind(this),
      this._onError.bind(this),
      this._onOpen.bind(this),
      this._onClose.bind(this),
    );
  }

  public close(): void {
    // this.ws.close();
  }

  public subscribe(channelId: ChannelId): SubscriptionId {
    const id = this.nextSubscriptionId++;
    const subscriptions = [{ id, channelId }];
    log.info("Subscriptions: ", subscriptions);
    // this.send({ op: "subscribe", subscriptions });
    fetch(`${CONFIG_API_URL}/subscribe`, {
      method: "POST",
      body: JSON.stringify(subscriptions),
    })
      .then((res) => {
        res
          .json()
          .then((data) => {
            log.info("Subscribed: ", data);
          })
          .catch((err) => {
            log.error("Error: ", err);
          });
      })
      .catch((err) => {
        log.error("Error: ", err);
      });
    return id;
  }

  public unsubscribe(subscriptionId: SubscriptionId): void {
    this.send({ op: "unsubscribe", subscriptionIds: [subscriptionId] });
  }

  public advertise(topic: string, encoding: string, schemaName: string): ClientChannelId {
    const id = ++this.nextAdvertisementId;
    const channels: ClientChannel[] = [{ id, topic, encoding, schemaName }];
    this.send({ op: "advertise", channels });
    return id;
  }

  public unadvertise(channelId: ClientChannelId): void {
    this.send({ op: "unadvertise", channelIds: [channelId] });
  }

  public getParameters(parameterNames: string[], id?: string): void {
    this.send({ op: "getParameters", parameterNames, id });
  }

  public setParameters(parameters: Parameter[], id?: string): void {
    this.send({ op: "setParameters", parameters, id });
  }

  public subscribeParameterUpdates(parameterNames: string[]): void {
    this.send({ op: "subscribeParameterUpdates", parameterNames });
  }

  public unsubscribeParameterUpdates(parameterNames: string[]): void {
    this.send({ op: "unsubscribeParameterUpdates", parameterNames });
  }

  public sendMessage(channelId: ChannelId, data: Uint8Array): void {
    const payload = new Uint8Array(5 + data.byteLength);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint8(0, ClientBinaryOpcode.MESSAGE_DATA);
    view.setUint32(1, channelId, true);
    payload.set(data, 5);
    // this.ws.send(payload);
  }

  public sendServiceCallRequest(request: ServiceCallPayload): void {
    const encoding = textEncoder.encode(request.encoding);
    const payload = new Uint8Array(1 + 4 + 4 + 4 + encoding.length + request.data.byteLength);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let offset = 0;
    view.setUint8(offset, ClientBinaryOpcode.SERVICE_CALL_REQUEST);
    offset += 1;
    view.setUint32(offset, request.serviceId, true);
    offset += 4;
    view.setUint32(offset, request.callId, true);
    offset += 4;
    view.setUint32(offset, request.encoding.length, true);
    offset += 4;
    payload.set(encoding, offset);
    offset += encoding.length;
    const data = new Uint8Array(
      request.data.buffer,
      request.data.byteOffset,
      request.data.byteLength,
    );
    payload.set(data, offset);
    // this.ws.send(payload);
  }

  public subscribeConnectionGraph(): void {
    this.send({ op: "subscribeConnectionGraph" });
  }

  public unsubscribeConnectionGraph(): void {
    this.send({ op: "unsubscribeConnectionGraph" });
  }

  /**
   * @deprecated Use `sendServiceCallRequest` instead
   */
  public sendCallServiceRequest(request: ServiceCallPayload): void {
    this.sendServiceCallRequest(request);
  }

  private send(message: ClientMessage) {
    log.info("Sending message: ", message);
    // this.ws.send(JSON.stringify(message));
  }
}
