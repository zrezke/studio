// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  app,
  dialog,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Menu,
  MenuItemConstructorOptions,
  shell,
  MenuItem,
  systemPreferences,
  ipcMain,
  utilityProcess,
  MessageChannelMain,
} from "electron";
import * as net from "net";
import path from "path";
import { join as pathJoin } from "path";

import Logger from "@foxglove/log";
import { AppSetting } from "@foxglove/studio-base/src/AppSetting";
import {
  APP_BAR_BACKGROUND_COLOR,
  APP_BAR_HEIGHT,
  APP_BAR_FOREGROUND_COLOR,
} from "@foxglove/studio-base/src/components/AppBar/constants";

import StudioAppUpdater from "./StudioAppUpdater";
import getDevModeIcon from "./getDevModeIcon";
import { getAppSetting } from "./settings";
import { simulateUserClick } from "./simulateUserClick";
import { getTelemetrySettings } from "./telemetry";
import pkgInfo from "../../package.json";
import { encodeRendererArg } from "../common/rendererArgs";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWindows = process.platform === "win32";
const isProduction = process.env.NODE_ENV === "production";
const rendererPath = MAIN_WINDOW_WEBPACK_ENTRY;

const closeMenuItem: MenuItemConstructorOptions = isMac ? { role: "close" } : { role: "quit" };
const log = Logger.getLogger(__filename);

type SectionKey = "app" | "panels" | "resources" | "products" | "contact" | "legal";
type HelpInfo = {
  title: string;
  content?: React.ReactNode;
  url?: string;
};
const helpMenuItems: Map<SectionKey, { subheader: string; links: HelpInfo[] }> = new Map([
  [
    "resources",
    {
      subheader: "External resources",
      links: [
        { title: "Browse docs", url: "https://foxglove.dev/docs" },
        { title: "Join our community", url: "https://foxglove.dev/community" },
      ],
    },
  ],
  [
    "products",
    {
      subheader: "Products",
      links: [
        { title: "Foxglove Studio", url: "https://foxglove.dev/studio" },
        { title: "Foxglove Data Platform", url: "https://foxglove.dev/data-platform" },
      ],
    },
  ],
  [
    "contact",
    {
      subheader: "Contact",
      links: [
        { title: "Give feedback", url: "https://foxglove.dev/contact" },
        { title: "Schedule a demo", url: "https://foxglove.dev/demo" },
      ],
    },
  ],
  [
    "legal",
    {
      subheader: "Legal",
      links: [
        { title: "License terms", url: "https://foxglove.dev/legal/studio-license" },
        { title: "Privacy policy", url: "https://foxglove.dev/legal/privacy" },
      ],
    },
  ],
]);

const getTitleCase = (baseString: string): string =>
  baseString
    .split(" ")
    .map((word) => `${word[0]?.toUpperCase()}${word.substring(1)}`)
    .join(" ");

type ClearableMenu = Menu & { clear: () => void };

function newStudioWindow(deepLinks: string[] = []): BrowserWindow {
  const { crashReportingEnabled, telemetryEnabled } = getTelemetrySettings();
  const enableNewTopNav = getAppSetting<boolean>(AppSetting.ENABLE_NEW_TOPNAV) ?? false;

  const preloadPath = path.join(app.getAppPath(), "main", "preload.js");

  const macTrafficLightInset =
    Math.floor((APP_BAR_HEIGHT - /*button size*/ 12) / 2) - /*for good measure*/ 1;

  const windowOptions: BrowserWindowConstructorOptions = {
    height: 800,
    width: 1200,
    minWidth: 350,
    minHeight: 250,
    autoHideMenuBar: true,
    title: pkgInfo.productName,
    frame: enableNewTopNav && isLinux ? false : true,
    titleBarStyle: enableNewTopNav ? "hidden" : "default",
    trafficLightPosition:
      isMac && enableNewTopNav ? { x: macTrafficLightInset, y: macTrafficLightInset } : undefined,
    titleBarOverlay: isWindows
      ? {
          height: APP_BAR_HEIGHT,
          color: APP_BAR_BACKGROUND_COLOR,
          symbolColor: APP_BAR_FOREGROUND_COLOR,
        }
      : undefined,
    webPreferences: {
      contextIsolation: true,
      sandbox: false, // Allow preload script to access Node builtins
      preload: preloadPath,
      nodeIntegration: true,
      additionalArguments: [
        `--allowCrashReporting=${crashReportingEnabled ? "1" : "0"}`,
        `--allowTelemetry=${telemetryEnabled ? "1" : "0"}`,
        encodeRendererArg("deepLinks", deepLinks),
      ],
      // Disable webSecurity in development so we can make XML-RPC calls, load
      // remote data, etc. In production, the app is served from file:// URLs so
      // the Origin header is not sent, disabling the CORS
      // Access-Control-Allow-Origin check
      webSecurity: isProduction,
    },
  };
  if (!isProduction) {
    const devIcon = getDevModeIcon();
    if (devIcon) {
      windowOptions.icon = devIcon;
    }
  }

  const browserWindow = new BrowserWindow(windowOptions);
  ipcMain.on("fork", (e, msg) => {
    log.info("FORKING");
    // const server = net.createServer((socket) => {
    //   socket.setNoDelay(true);
    //   let nBytes = 0;
    //   let nReceived = 0;
    //   // let received = [];
    //   const buffer = new Uint8Array(10000000);
    //   socket.on("data", (data) => {
    //     try {
    //       if (nBytes === 0) {
    //         nBytes = data.readUInt32BE();
    //         nReceived += data.byteLength - 4;
    //         buffer.set(data.slice(4), 0);
    //         if (nReceived >= nBytes) {
    //           browserWindow.webContents.send(
    //             "receive_tcp_data",
    //             Buffer.from(buffer.slice(0, nReceived), 0, nReceived),
    //           );
    //           nReceived = 0;
    //           nBytes = 0;
    //         }
    //         return;
    //       }
    //       buffer.set(data, nReceived);
    //       nReceived += data.byteLength;
    //       if (nReceived >= nBytes) {
    //         log.info("BrowserWindow: ", browserWindow, "LMAO");
    //         // browserWindow.webContents.send(
    //         ipcMain.emit("receive_tcp_data", Buffer.from(buffer.slice(0, nReceived), 0, nReceived));

    //         nReceived = 0;
    //         nBytes = 0;
    //       }
    //     } catch (e) {}
    //   });

    //   ipcMain.on("send_tcp_data", (e, msg) => {
    //     const encodedMessage = new TextEncoder().encode(JSON.stringify(msg));
    //     const bytesInMessage = new Uint8Array(4);
    //     const byteLength = encodedMessage.byteLength;
    //     bytesInMessage[0] = (byteLength >> 24) & 0xff;
    //     bytesInMessage[1] = (byteLength >> 16) & 0xff;
    //     bytesInMessage[2] = (byteLength >> 8) & 0xff;
    //     bytesInMessage[3] = byteLength & 0xff;
    //     socket.write(Buffer.concat([bytesInMessage, encodedMessage]));
    //   });
    // });
    // server.listen(9999, "localhost", (s) => {});

    log.info("Dirname; ", __dirname);
    log.info("Corrected path: ", pathJoin(__dirname, "../../main/", "child.js"));
    const child = utilityProcess.fork(pathJoin(__dirname, "../../main/", "child.js"), ["hello"], {
      stdio: "pipe",
    });

    child.stdout?.on("data", (data: Uint8Array) => {
      // browserWindow.webContents.send("fromMain", data);
      log.info("Message from child: ", data.byteLength);
    });
    child.on("message", (message) => {
      browserWindow.webContents.send("fromMain", message);
      // log.info("Message from child: but directly", message);
    });
    ipcMain.on("toMain", (e, msg: object) => {
      log.info("Sending toMain event to child!");
      child.postMessage(msg);
    });
  });

  // Forward full screen events to the renderer
  browserWindow.addListener("enter-full-screen", () =>
    browserWindow.webContents.send("enter-full-screen"),
  );
  browserWindow.addListener("leave-full-screen", () =>
    browserWindow.webContents.send("leave-full-screen"),
  );
  browserWindow.addListener("maximize", () => browserWindow.webContents.send("maximize"));

  browserWindow.addListener("unmaximize", () => browserWindow.webContents.send("unmaximize"));

  browserWindow.webContents.once("dom-ready", () => {
    if (!isProduction) {
      browserWindow.webContents.openDevTools();
    }
    browserWindow.webContents.send(browserWindow.isMaximized() ? "maximize" : "unmaximize");
  });

  // Open all new windows in an external browser
  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  browserWindow.webContents.on("will-navigate", (event, reqUrl) => {
    // if the target url is not the same as our host then force open in a browser
    // URL.host includes the port - so this works for localhost servers vs webpack dev server
    const targetHost = new URL(reqUrl).host;
    const currentHost = new URL(browserWindow.webContents.getURL()).host;
    const isExternal = targetHost !== currentHost;
    if (isExternal) {
      event.preventDefault();
      void shell.openExternal(reqUrl);
    }
  });

  browserWindow.webContents.on("ipc-message", (_event, channel) => {
    switch (channel) {
      case "titleBarDoubleClicked": {
        const action: string =
          systemPreferences.getUserDefault("AppleActionOnDoubleClick", "string") || "Maximize";
        if (action === "Minimize") {
          browserWindow.minimize();
        } else if (action === "Maximize") {
          if (browserWindow.isMaximized()) {
            browserWindow.unmaximize();
          } else {
            browserWindow.maximize();
          }
        } else {
          // "None"
        }
        break;
      }
      case "minimizeWindow":
        browserWindow.minimize();
        break;
      case "maximizeWindow":
        browserWindow.maximize();
        break;
      case "unmaximizeWindow":
        browserWindow.unmaximize();
        break;
      case "closeWindow":
        browserWindow.close();
        break;
      default:
        break;
    }
  });

  return browserWindow;
}

function buildMenu(browserWindow: BrowserWindow): Menu {
  const menuTemplate: MenuItemConstructorOptions[] = [];

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "Check for Updates…",
    click: () => void StudioAppUpdater.Instance().checkNow(),
    enabled: StudioAppUpdater.Instance().canCheckForUpdates(),
  };

  if (isMac) {
    menuTemplate.push({
      role: "appMenu",
      label: app.name,
      submenu: [
        { role: "about" },
        checkForUpdatesItem,
        { type: "separator" },

        {
          label: "Preferences…",
          accelerator: "CommandOrControl+,",
          click: () => browserWindow.webContents.send("open-preferences"),
        },
        { role: "services" },
        { type: "separator" },

        { type: "separator" },

        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { role: "quit" },
      ],
    });
  }

  menuTemplate.push({
    role: "fileMenu",
    label: "File",
    id: "fileMenu",
    submenu: [
      {
        label: "New Window",
        click: () => {
          new StudioWindow().load();
        },
      },
      ...(isMac
        ? []
        : [
            { type: "separator" } as const,
            {
              label: "Preferences…",
              accelerator: "CommandOrControl+,",
              click: () => browserWindow.webContents.send("open-preferences"),
            } as const,
          ]),
      { type: "separator" },
      closeMenuItem,
    ],
  });

  menuTemplate.push({
    role: "editMenu",
    label: "Edit",
    submenu: [
      {
        label: "Add Panel to Layout",
        click: () => browserWindow.webContents.send("open-add-panel"),
      },
      {
        label: "Edit Panel Settings",
        click: () => browserWindow.webContents.send("open-panel-settings"),
      },
      { type: "separator" },

      { role: "undo" },
      { role: "redo" },
      { type: "separator" },

      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" } as const,
            { role: "delete" } as const,
            { role: "selectAll" } as const,
          ]
        : [
            { role: "delete" } as const,
            { type: "separator" } as const,
            { role: "selectAll" } as const,
          ]),
    ],
  });

  const showSharedWorkersMenu = () => {
    // Electron doesn't let us update dynamic menus when they are being opened, so just open a popup
    // context menu. This is ugly, but only for development anyway.
    // https://github.com/electron/electron/issues/528
    const workers = browserWindow.webContents.getAllSharedWorkers();
    Menu.buildFromTemplate(
      workers.length === 0
        ? [{ label: "No Shared Workers", enabled: false }]
        : workers.map(
            (worker) =>
              new MenuItem({
                label: worker.url,
                click() {
                  browserWindow.webContents.closeDevTools();
                  browserWindow.webContents.inspectSharedWorkerById(worker.id);
                },
              }),
          ),
    ).popup();
  };

  menuTemplate.push({
    role: "viewMenu",
    label: "View",
    submenu: [
      { label: "Layouts", click: () => browserWindow.webContents.send("open-layouts") },
      { label: "Variables", click: () => browserWindow.webContents.send("open-variables") },
      { label: "Extensions", click: () => browserWindow.webContents.send("open-extensions") },
      { label: "Account", click: () => browserWindow.webContents.send("open-account") },
      { type: "separator" },

      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      { type: "separator" },
      {
        label: "Advanced",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          {
            label: "Inspect Shared Worker…",
            click() {
              showSharedWorkersMenu();
            },
          },
        ],
      },
    ],
  });

  const showAboutDialog = () => {
    void dialog.showMessageBox(browserWindow, {
      type: "info",
      title: `About ${pkgInfo.productName}`,
      message: pkgInfo.productName,
      detail: `Version: ${pkgInfo.version}`,
    });
  };

  const helpSidebarItems = Array.from(helpMenuItems.values(), ({ subheader, links }) => ({
    label: getTitleCase(subheader),
    submenu: links.map(({ title, url }) => ({
      label: getTitleCase(title),
      click: url
        ? async () => await shell.openExternal(url)
        : () => browserWindow.webContents.send("open-help"),
    })),
  }));

  menuTemplate.push({
    role: "help",
    submenu: [
      {
        label: "Explore Sample Data",
        click: () => browserWindow.webContents.send("open-sample-data"),
      },
      { type: "separator" },
      ...helpSidebarItems,
      {
        label: "Learn More",
        click: async () => await shell.openExternal("https://foxglove.dev"),
      },
      ...(isMac
        ? []
        : [
            { type: "separator" } as const,
            {
              label: "About",
              click() {
                showAboutDialog();
              },
            },
            checkForUpdatesItem,
          ]),
    ],
  });

  return Menu.buildFromTemplate(menuTemplate);
}

class StudioWindow {
  // track windows by the web-contents id
  // The web contents id is most broadly available across IPC events and app handlers
  // BrowserWindow.id is not as available
  private static windowsByContentId = new Map<number, StudioWindow>();

  private _window: BrowserWindow;
  private _menu: Menu;

  private _inputSources = new Set<string>();

  public constructor(deepLinks: string[] = []) {
    const browserWindow = newStudioWindow(deepLinks);
    this._window = browserWindow;
    this._menu = buildMenu(browserWindow);

    const id = browserWindow.webContents.id;

    log.info(`New Foxglove Studio window ${id}`);
    StudioWindow.windowsByContentId.set(id, this);

    // when a window closes and it is the current application menu, clear the input sources
    browserWindow.once("close", () => {
      if (Menu.getApplicationMenu() === this._menu) {
        const existingMenu = Menu.getApplicationMenu();
        const fileMenu = existingMenu?.getMenuItemById("fileMenu");
        // https://github.com/electron/electron/issues/8598
        (fileMenu?.submenu as undefined | ClearableMenu)?.clear();
        fileMenu?.submenu?.append(
          new MenuItem({
            label: "New Window",
            click: () => {
              new StudioWindow().load();
            },
          }),
        );

        fileMenu?.submenu?.append(
          new MenuItem({
            type: "separator",
          }),
        );

        fileMenu?.submenu?.append(new MenuItem(closeMenuItem));
        Menu.setApplicationMenu(existingMenu);
      }
    });
    browserWindow.once("closed", () => {
      StudioWindow.windowsByContentId.delete(id);
    });
  }

  public load(): void {
    // load after setting windowsById so any ipc handlers with id lookup work
    log.info(`window.loadURL(${rendererPath})`);
    this._window
      .loadURL(rendererPath)
      .then(() => {
        log.info("window URL loaded");
      })
      .catch((err) => {
        log.error("loadURL error", err);
      });
  }

  public addInputSource(name: string): void {
    // A "Foxglove Data Platform" connection is triggered by opening a URL from console
    // Not currently a connection that can be started from inside Foxglove Studio
    const unsupportedInputSourceNames = ["Foxglove Data Platform"];
    if (unsupportedInputSourceNames.includes(name)) {
      return;
    }

    this._inputSources.add(name);

    const fileMenu = this._menu.getMenuItemById("fileMenu");
    if (!fileMenu) {
      return;
    }

    const existingItem = fileMenu.submenu?.getMenuItemById(name);
    // If the item already exists, we can silently return
    // The existing click handler will support the new item since they have the same name
    if (existingItem) {
      existingItem.visible = true;
      return;
    }

    // build new file menu
    this.rebuildFileMenu(fileMenu);

    this._window.setMenu(this._menu);
  }

  public removeInputSource(name: string): void {
    this._inputSources.delete(name);

    const fileMenu = this._menu.getMenuItemById("fileMenu");
    if (!fileMenu) {
      return;
    }

    this.rebuildFileMenu(fileMenu);
    this._window.setMenu(this._menu);
  }

  public getBrowserWindow(): BrowserWindow {
    return this._window;
  }

  public getMenu(): Menu {
    return this._menu;
  }

  public static fromWebContentsId(id: number): StudioWindow | undefined {
    return StudioWindow.windowsByContentId.get(id);
  }

  private rebuildFileMenu(fileMenu: MenuItem): void {
    const browserWindow = this._window;

    // https://github.com/electron/electron/issues/8598
    (fileMenu.submenu as ClearableMenu).clear();
    fileMenu.submenu?.items.splice(0, fileMenu.submenu.items.length);

    fileMenu.submenu?.append(
      new MenuItem({
        label: "New Window",
        click: () => {
          new StudioWindow().load();
        },
      }),
    );

    fileMenu.submenu?.append(
      new MenuItem({
        type: "separator",
      }),
    );

    fileMenu.submenu?.append(
      new MenuItem({
        label: "Open File…",
        click: async () => {
          await simulateUserClick(browserWindow);
          browserWindow.webContents.send("open-file");
        },
      }),
    );

    fileMenu.submenu?.append(
      new MenuItem({
        label: "Open Remote File…",
        click: async () => {
          await simulateUserClick(browserWindow);
          browserWindow.webContents.send("open-remote-file");
        },
      }),
    );

    fileMenu.submenu?.append(
      new MenuItem({
        label: "Open Connection",
        submenu: Array.from(this._inputSources).map((name) => ({
          // Electron menus require a preceding & to escape the & char
          label: name.replace(/&/g, "&&"),
          click: async () => {
            await simulateUserClick(browserWindow);
            browserWindow.webContents.send("menu.click-input-source", name);
          },
        })),
      }),
    );

    if (!isMac) {
      fileMenu.submenu?.append(
        new MenuItem({
          type: "separator",
        }),
      );

      fileMenu.submenu?.append(
        new MenuItem({
          label: "Preferences…",
          accelerator: "CommandOrControl+,",
          click: () => browserWindow.webContents.send("open-preferences"),
        }),
      );
    }

    fileMenu.submenu?.append(
      new MenuItem({
        type: "separator",
      }),
    );

    fileMenu.submenu?.append(new MenuItem(closeMenuItem));
  }
}

export default StudioWindow;
