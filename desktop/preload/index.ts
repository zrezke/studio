// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import "@sentry/electron/preload";
import * as Sentry from "@sentry/electron/renderer";
import * as child_process from "child_process";
import { contextBridge, ipcRenderer, utilityProcess } from "electron";
import os from "os";
import { join as pathJoin } from "path";
import * as Stream from "stream";

import { PreloaderSockets } from "@foxglove/electron-socket/preloader";
import Logger from "@foxglove/log";
import { NetworkInterface, OsContext } from "@foxglove/studio-base/src/OsContext";

import LocalFileStorage from "./LocalFileStorage";
import { getExtensions, loadExtension, installExtension, uninstallExtension } from "./extensions";
import pkgInfo from "../../package.json";
import { decodeRendererArg } from "../common/rendererArgs";
import {
  Desktop,
  ForwardedMenuEvent,
  ForwardedWindowEvent,
  NativeMenuBridge,
  Storage,
} from "../common/types";

const log = Logger.getLogger(__filename);

log.debug(`Start Preload`);
log.info(`${pkgInfo.productName} ${pkgInfo.version}`);
log.info(`initializing preloader, argv="${window.process.argv.join(" ")}"`);

window.onerror = (ev) => {
  console.error(ev);
};

// window.require = require;

// Load opt-out settings for crash reporting and telemetry
const [allowCrashReporting] = getTelemetrySettings();
if (allowCrashReporting && typeof process.env.SENTRY_DSN === "string") {
  log.debug("initializing Sentry in preload");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    autoSessionTracking: true,
    release: `${process.env.SENTRY_PROJECT}@${pkgInfo.version}`,
    // Remove the default breadbrumbs integration - it does not accurately track breadcrumbs and
    // creates more noise than benefit.
    integrations: (integrations) => {
      return integrations.filter((integration) => integration.name !== "Breadcrumbs");
    },
  });
}

type IpcListener = (ev: unknown, ...args: unknown[]) => void;
const menuClickListeners = new Map<string, IpcListener>();

// Initialize the RPC channel for electron-socket asynchronously
PreloaderSockets.Create().catch((err) => {
  log.error("Failed to initialize preloader sockets", err);
});

window.addEventListener(
  "DOMContentLoaded",
  () => {
    // This input element receives generated dom events from main thread to inject File objects
    // See the comments in desktop/index.ts regarding this feature
    const input = document.createElement("input");
    input.setAttribute("hidden", "true");
    input.setAttribute("type", "file");
    input.setAttribute("id", "electron-open-file-input");
    document.body.appendChild(input);

    // let main know we are ready to accept open-file requests
    void ipcRenderer.invoke("load-pending-files");
  },
  { once: true },
);

const localFileStorage = new LocalFileStorage();

const ctx: OsContext = {
  platform: process.platform,
  pid: process.pid,

  // Environment queries
  getEnvVar: (envVar: string) => process.env[envVar],
  getHostname: os.hostname,
  getNetworkInterfaces: (): NetworkInterface[] => {
    const output: NetworkInterface[] = [];
    const ifaces = os.networkInterfaces();
    for (const name in ifaces) {
      const iface = ifaces[name];
      if (iface == undefined) {
        continue;
      }
      for (const info of iface) {
        output.push({ name, ...info, cidr: info.cidr ?? undefined });
      }
    }
    return output;
  },
  getAppVersion: (): string => {
    return pkgInfo.version;
  },
};

// Keep track of maximized state in the preload script because the initial ipc event sent from main
// may occur before the app is fully rendered.
let isMaximized = false;
ipcRenderer.on("maximize", () => (isMaximized = true));
ipcRenderer.on("unmaximize", () => (isMaximized = false));

const desktopBridge: Desktop = {
  addIpcEventListener(eventName: ForwardedWindowEvent, handler: () => void) {
    ipcRenderer.on(eventName, () => handler());
  },
  removeIpcEventListener(eventName: ForwardedWindowEvent, handler: () => void) {
    ipcRenderer.off(eventName, () => handler());
  },
  async setRepresentedFilename(path: string | undefined) {
    await ipcRenderer.invoke("setRepresentedFilename", path);
  },
  async updateNativeColorScheme() {
    await ipcRenderer.invoke("updateNativeColorScheme");
  },
  getDeepLinks(): string[] {
    return decodeRendererArg("deepLinks", window.process.argv) ?? [];
  },
  async getExtensions() {
    const homePath = (await ipcRenderer.invoke("getHomePath")) as string;
    const userExtensionRoot = pathJoin(homePath, ".foxglove-studio", "extensions");
    const userExtensions = await getExtensions(userExtensionRoot);
    return userExtensions;
  },
  async loadExtension(id: string) {
    const homePath = (await ipcRenderer.invoke("getHomePath")) as string;
    const userExtensionRoot = pathJoin(homePath, ".foxglove-studio", "extensions");
    return await loadExtension(id, userExtensionRoot);
  },
  async installExtension(foxeFileData: Uint8Array) {
    const homePath = (await ipcRenderer.invoke("getHomePath")) as string;
    const userExtensionRoot = pathJoin(homePath, ".foxglove-studio", "extensions");
    return await installExtension(foxeFileData, userExtensionRoot);
  },
  async uninstallExtension(id: string): Promise<boolean> {
    const homePath = (await ipcRenderer.invoke("getHomePath")) as string;
    const userExtensionRoot = pathJoin(homePath, ".foxglove-studio", "extensions");
    return await uninstallExtension(id, userExtensionRoot);
  },
  handleTitleBarDoubleClick() {
    ipcRenderer.send("titleBarDoubleClicked");
  },
  isMaximized() {
    return isMaximized;
  },
  minimizeWindow() {
    ipcRenderer.send("minimizeWindow");
  },
  maximizeWindow() {
    ipcRenderer.send("maximizeWindow");
  },
  unmaximizeWindow() {
    ipcRenderer.send("unmaximizeWindow");
  },
  closeWindow() {
    ipcRenderer.send("closeWindow");
  },
};

const storageBridge: Storage = {
  // Context bridge cannot expose "classes" only exposes functions
  // We use .bind to attach the localFileStorage instance as _this_ to the function
  list: localFileStorage.list.bind(localFileStorage),
  all: localFileStorage.all.bind(localFileStorage),
  get: localFileStorage.get.bind(localFileStorage),
  put: localFileStorage.put.bind(localFileStorage),
  delete: localFileStorage.delete.bind(localFileStorage),
};

const menuBridge: NativeMenuBridge = {
  addIpcEventListener(eventName: ForwardedMenuEvent, handler: () => void) {
    ipcRenderer.on(eventName, () => handler());
  },
  removeIpcEventListener(eventName: ForwardedMenuEvent, handler: () => void) {
    ipcRenderer.off(eventName, () => handler());
  },
  async menuAddInputSource(name: string, handler: () => void) {
    if (menuClickListeners.has(name)) {
      throw new Error(`Menu input source ${name} already exists`);
    }

    const listener: IpcListener = (_ev, ...args) => {
      if (args[0] === name) {
        handler();
      }
    };

    menuClickListeners.set(name, listener);
    ipcRenderer.on("menu.click-input-source", listener);
    await ipcRenderer.invoke("menu.add-input-source", name);
  },
  async menuRemoveInputSource(name: string) {
    const listener = menuClickListeners.get(name);
    if (listener == undefined) {
      return;
    }
    menuClickListeners.delete(name);
    ipcRenderer.off("menu.click-input-source", listener);
    await ipcRenderer.invoke("menu.remove-input-source", name);
  },
};

// NOTE: Context Bridge imposes a number of limitations around how objects move between the context
// and the renderer. These restrictions impact what the api surface can expose and how.
//
// exposeInMainWorld is poorly named - it exposes the object to the renderer
//
// i.e.: returning a class instance doesn't work because prototypes do not survive the boundary
contextBridge.exposeInMainWorld("ctxbridge", ctx);
contextBridge.exposeInMainWorld("menuBridge", menuBridge);
contextBridge.exposeInMainWorld("storageBridge", storageBridge);
contextBridge.exposeInMainWorld("allowCrashReporting", allowCrashReporting);
contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
contextBridge.exposeInMainWorld("ipcRendererBridge", ipcRenderer);

// contextBridge.exposeInMainWorld("netbridge", net);

interface ISocketData {
  subscribers: Array<{ callback: (data: Buffer) => void }>;
}
const socketData: ISocketData = {
  subscribers: [],
};

contextBridge.exposeInMainWorld("socketData", socketData);

// const server = net.createServer((socket) => {
//   socket.setNoDelay(true);
//   socket.on("data", (data) => {
//     for (const subscriber of socketData.subscribers) {
//       subscriber.callback(data);
//     }
//     log.info("RCV");
//   });
// });
// server.listen(9999, () => {
//   log.info("SERVER LISTENING ON PORT 9999");
// });
// contextBridge.exposeInMainWorld("server", server);

// let callbackFunction: (data: Buffer) => void | undefined;
log.info("Random log");
contextBridge.exposeInMainWorld("api", {
  // registerCallback: (callback: (data: Buffer) => void) => {
  //   callbackFunction = callback;
  // },
  send: (channel: string, data: Buffer) => {
    // whitelist channels
    const validChannels = ["send_tcp_data"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel: string, func: (data: Buffer) => void) => {
    const validChannels = ["receive_tcp_data"];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      // ipcMain.on(channel, (event, data: Buffer) => func(data));
      // ipcRenderer.on(channel, (event, data: Buffer) => func(data));
      // callbackFunction(data);
    }
  },
});

type ItcpBridge = {
  receiveTcp: (f: (data: Uint8Array) => void) => void;
  sendTcp: ((data: any) => void) | undefined;
};

let receiveTcp: ((data: Uint8Array) => void) | undefined;

const tcpBridge: ItcpBridge = {
  receiveTcp: (f: (data: Uint8Array) => void) => (receiveTcp = f),
  sendTcp: undefined,
};

const port = 9999;

log.info("Dirname; ", __dirname);
log.info("Corrected path: ", pathJoin(__dirname, "../../main/", "child.js"));
const child = child_process.spawn("node", [pathJoin(__dirname, "../../main/", "node_child.js")], {
  stdio: ["pipe", "pipe", "pipe", "pipe"],
});

// child.on("message", (message) => {
//   if (receiveTcp) {
//     receiveTcp(message.data as Buffer);
//   }
//   // log.info("Received message from child: ", message);
// });
// tcpBridge.sendTcp = (data: any) => {
//   log.info("Send tcp called");
//   child.send(data);
// };

type IChildMessage = {
  data: [];
  type: string;
};
// const readableStream = new Stream.Duplex();

// child.stdio[3]?.pipe(readableStream);
let nReceived = 0;
const metaChannel = child.stdio[3];
const dataBuffer = Buffer.alloc(20000000);
log.info("Meta channel: ", metaChannel);
metaChannel?.on("data", (data: Uint8Array) => {
  // log.info("Done: ", data, " N Received: ", nReceived, " Data Buffer: ", dataBuffer.byteLength);
  if (receiveTcp) {
    receiveTcp(Buffer.from(dataBuffer.slice(0, nReceived), 0, nReceived));
  }
  nReceived = 0;
});
child.stdout.on("data", (data: Uint8Array) => {
  // log.info("Data: from stdou: ", data.byteLength);
  dataBuffer.set(data, nReceived);
  nReceived += data.byteLength;
});

child.on("message", (data: IChildMessage) => {
  // log.info("Data: ", data);
  // if (receiveTcp) {
  //   receiveTcp(Uint8Array.from(data.data));
  // }
  // log.info("Received message from child: ", message);
});
tcpBridge.sendTcp = (data: any) => {
  log.info("Send tcp called: ", data);
  if (child.stdin) {
    child.stdin.write(new TextEncoder().encode(JSON.stringify(data)));
  } else {
    log.info("Child: ", child);
  }
};
contextBridge.exposeInMainWorld("tcp", tcpBridge);

// ipcMain.on("toMain", (e, msg: object) => {
//   log.info("Sending toMain event to child!");
//   child.postMessage(msg);
// });

// const server = net.createServer((socket) => {});
// log.info("Created server: ");
// log.info("_sendTcp: ", _sendTcp);
// server.listen(port, () => {});
// let nBytes = 0;
// let nReceived = 0;
// server.on("connection", (socket) => {
//   if (_onConnection) {
//     _onConnection(socket);
//   }
//   // socket.setNoDelay(true);

//   // let received = [];
//   const buffer = new Uint8Array(50000000);
//   socket.on("data", (data) => {
//     if (nBytes === 0) {
//       nBytes = data.readUInt32BE();
//       log.info("N BYTES: ", nBytes);
//       nReceived += data.byteLength - 4;
//       buffer.set(data.slice(4), 0);
//       if (nReceived >= nBytes) {
//         if (_receiveTcp) {
//           _receiveTcp(Buffer.from(buffer.slice(0, nReceived), 0, nReceived));
//         }
//         nReceived = 0;
//         nBytes = 0;
//       }
//       return;
//     }
//     // try {
//     buffer.set(data, nReceived);
//     // } catch (e) {
//     //   log.info("N bytes: ", nBytes);
//     //   log.info("N received: ", nReceived);
//     // }
//     nReceived += data.byteLength;
//     if (nReceived >= nBytes) {
//       if (_receiveTcp) {
//         _receiveTcp(Buffer.from(buffer.slice(0, nReceived), 0, nReceived));
//       }
//       nReceived = 0;
//       nBytes = 0;
//     }
//   });
//   log.info("Just before");
//   _sendTcp = (msg: any) => {
//     const encodedMessage = new TextEncoder().encode(JSON.stringify(msg));
//     const bytesInMessage = new Uint8Array(4);
//     const byteLength = encodedMessage.byteLength;
//     bytesInMessage[0] = (byteLength >> 24) & 0xff;
//     bytesInMessage[1] = (byteLength >> 16) & 0xff;
//     bytesInMessage[2] = (byteLength >> 8) & 0xff;
//     bytesInMessage[3] = byteLength & 0xff;
//     socket.write(Buffer.concat([bytesInMessage, encodedMessage]));
//   };
//   contextBridge.exposeInMainWorld("sendTcp", _sendTcp);
//   log.info("Send TCP: ", _sendTcp);
// });

// contextBridge.exposeInMainWorld("tcp", {
//   sendTcp: _sendTcp,
//   receiveTcp: (f: (data: Uint8Array) => void) => (_receiveTcp = f),
//   onConnection: (handler: (msg: any) => void) => (_onConnection = handler),
// });

// log.info("Dirname; ", __dirname);
// log.info("Corrected path: ", pathJoin(__dirname, "../../main/", "child.js"));
// const child = utilityProcess.fork(pathJoin(__dirname, "../../main/", "child.js"), ["hello"], {
//   stdio: "pipe",
// });

// child.stdout?.on("data", (data: Uint8Array) => {
//   // browserWindow.webContents.send("fromMain", data);
//   log.info("Message from child: ", data.byteLength);
// });
// child.on("message", (message) => {
//   browserWindow.webContents.send("fromMain", message);
//   // log.info("Message from child: but directly", message);
// });
// ipcMain.on("toMain", (e, msg: object) => {
//   log.info("Sending toMain event to child!");
//   child.postMessage(msg);
// });

// Load telemetry opt-out settings from window.process.argv
function getTelemetrySettings(): [crashReportingEnabled: boolean] {
  const argv = window.process.argv;
  const crashReportingEnabled = Boolean(
    parseInt(argv.find((arg) => arg.indexOf("--allowCrashReporting=") === 0)?.split("=")[1] ?? "0"),
  );
  return [crashReportingEnabled];
}

log.debug(`End Preload`);
