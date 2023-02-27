// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import EventEmitter from "eventemitter3";
import { join as pathJoin } from "path";

import Log from "@foxglove/log";
//import WorkerSocketAdapter from "@foxglove/studio-base/players/FoxgloveWebSocketPlayer/WorkerSocketAdapter";
import {
  BinaryOpcode,
  Channel,
  ClientBinaryOpcode,
  ClientChannel,
  ClientChannelId,
  ClientMessage,
  Parameter,
  ParameterValues,
  ServerMessage,
  SubscriptionId,
  Time,
  ChannelId,
  MessageData,
  ServerInfo,
  StatusMessage,
} from "@foxglove/ws-protocol";

import { parseServerMessage } from "./parse";

const log = Log.getLogger(__dirname);

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
  parameterValues: (event: ParameterValues) => void;
  lmao: () => void;
  forked: (child: any) => void;
};

export default class FoxgloveClient {
  public static SUPPORTED_SUBPROTOCOL = "foxglove.websocket.v1";

  private emitter = new EventEmitter<EventTypes>();
  private nextSubscriptionId = 0;
  private nextAdvertisementId = 0;
  private isOpen: boolean = false;
  private gotFirstMessage: boolean = false;
  private sendTcp;

  public constructor() {
    this.emitter.addListener("lmao", () => {
      log.info("LMAO EVENT RECEIVED");
    });
    this.emitter.addListener("forked", (child: any) => {
      log.info("Forked child: ", child);
    });
    window.addEventListener("forked", (event: any) => {
      log.info("Forked with window, event: ", event);
    });
    log.info("FORKING");
    log.info("Dirname; ", __dirname);
    log.info("Corrected path: ", pathJoin(__dirname, "../../main/", "child.js"));
    log.info("CreateServer: ", (window as any).api.createServer);
    (window as any).api.createServer((data: Buffer) => {
      this.handleMessage(data);
    });
    // server.listen(PORT, "localhost", (s) => {});

    this.reconnect();
  }

  public sendTcpMessage(msg): void {
    log.info("Window socket: ", (window as any).socket);
    const encodedMessage = new TextEncoder().encode(JSON.stringify(msg.data));
    const bytesInMessage = new Uint8Array(4);
    const byteLength = encodedMessage.byteLength;
    bytesInMessage[0] = (byteLength >> 24) & 0xff;
    bytesInMessage[1] = (byteLength >> 16) & 0xff;
    bytesInMessage[2] = (byteLength >> 8) & 0xff;
    bytesInMessage[3] = byteLength & 0xff;
    log.info("Got here", (window as any).sendTcp);
    // (window as any).sendTcp(Buffer.concat([bytesInMessage, encodedMessage]));
    // (window as any).socket.write(Buffer.concat([bytesInMessage, encodedMessage]));
  }

  public handleMessage(data: Uint8Array): void {
    if (!this.isOpen) {
      this.emitter.emit("open");
      this.isOpen = true;
    }
    let message: ServerMessage;
    const buffer = data.buffer;
    // log.info("WTF: BUFLEN: ", buffer.byteLength);
    if (!this.gotFirstMessage) {
      message = JSON.parse(Buffer.from(data).toString("utf8"));
      this.gotFirstMessage = true;
    } else {
      message = parseServerMessage(buffer);
    }

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
      case BinaryOpcode.MESSAGE_DATA:
        // log.info("Message data: ", message);
        this.emitter.emit("message", message);
        return;
      case BinaryOpcode.TIME:
        this.emitter.emit("time", message);
        return;
    }
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

  private reconnect() {
    log.info("Ipc bridge: ", (window as any).ipcRendererBridge);
    // (window as any).ipcRendererBridge.send("fork");
    log.info("Window Server: ", (window as any).server);
    log.info("Reconnecting...");
    this.emitter.emit("lmao");
    this.emitter.emit("open");
    log.info("Ipc renderer bridge ", (window as any).ipcRendererBridge);
    log.info("Window:", window);
    // log.info("IpcRenderer: ", (window as any).ipcRenderer);
    // (window as any).ipcRendererBridge.send("RECONECT_SOCKET");
    log.info((window as any).netbridge);
  }

  public close(): void {
    // this.ws.close();
  }

  public subscribe(channelId: ChannelId): SubscriptionId {
    const id = this.nextSubscriptionId++;
    const subscriptions = [{ id, channelId }];
    log.info(
      "Subscribe function: Channel: ",
      channelId,
      " nextSubscriptionId: ",
      id,
      " subscriptions: ",
      subscriptions,
    );
    this.send({ op: "subscribe", subscriptions });
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

  private send(message: ClientMessage) {
    log.info("Sending back message: ", message);
    // (window as any).api.send("toMain", message);
    log.info("My message: ", message);
    this.sendTcpMessage(message);
    // this.ws.send(JSON.stringify(message)!);
  }
}
