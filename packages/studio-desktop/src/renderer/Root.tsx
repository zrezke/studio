// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useMemo, useEffect, useState, useCallback } from "react";

import {
  App,
  AppSetting,
  FoxgloveWebSocketDataSourceFactory,
  DepthaiDataSourceFactory,
  IAppConfiguration,
  IDataSourceFactory,
  IdbExtensionLoader,
  McapLocalDataSourceFactory,
  Ros1LocalBagDataSourceFactory,
  Ros2LocalBagDataSourceFactory,
  RosbridgeDataSourceFactory,
  RemoteDataSourceFactory,
  Ros1SocketDataSourceFactory,
  Ros2SocketDataSourceFactory,
  Ros2UnavailableDataSourceFactory,
  SampleNuscenesDataSourceFactory,
  UlogLocalDataSourceFactory,
  VelodyneDataSourceFactory,
  OsContext,
  AppConfigurationValue,
} from "@foxglove/studio-base";

import { DesktopExtensionLoader } from "./services/DesktopExtensionLoader";
import { NativeAppMenu } from "./services/NativeAppMenu";
import NativeStorageLayoutStorage from "./services/NativeStorageLayoutStorage";
import { NativeWindow } from "./services/NativeWindow";
import { Desktop, NativeMenuBridge, Storage } from "../common/types";

const desktopBridge = (global as unknown as { desktopBridge: Desktop }).desktopBridge;
const storageBridge = (global as unknown as { storageBridge?: Storage }).storageBridge;
const menuBridge = (global as { menuBridge?: NativeMenuBridge }).menuBridge;
const ctxbridge = (global as { ctxbridge?: OsContext }).ctxbridge;

export default function Root(props: {
  appConfiguration: IAppConfiguration;
  extraProviders: JSX.Element[] | undefined;
  dataSources: IDataSourceFactory[] | undefined;
}): JSX.Element {
  if (!storageBridge) {
    throw new Error("storageBridge is missing");
  }
  const { appConfiguration } = props;

  const [ros2NativeDsEnabled, setros2NativeDsEnabled] = useState<AppConfigurationValue>(
    appConfiguration.get(AppSetting.ENABLE_ROS2_NATIVE_DATA_SOURCE),
  );

  useEffect(() => {
    const handler = () => {
      void desktopBridge.updateNativeColorScheme();
    };

    appConfiguration.addChangeListener(AppSetting.COLOR_SCHEME, handler);
    appConfiguration.addChangeListener(
      AppSetting.ENABLE_ROS2_NATIVE_DATA_SOURCE,
      setros2NativeDsEnabled,
    );
    return () => {
      appConfiguration.removeChangeListener(AppSetting.COLOR_SCHEME, handler);
      appConfiguration.removeChangeListener(
        AppSetting.ENABLE_ROS2_NATIVE_DATA_SOURCE,
        setros2NativeDsEnabled,
      );
    };
  }, [appConfiguration]);

  const layoutStorage = useMemo(() => new NativeStorageLayoutStorage(storageBridge), []);
  const [extensionLoaders] = useState(() => [
    new IdbExtensionLoader("org"),
    new DesktopExtensionLoader(desktopBridge),
  ]);
  const nativeAppMenu = useMemo(() => new NativeAppMenu(menuBridge), []);
  const nativeWindow = useMemo(() => new NativeWindow(desktopBridge), []);

  const dataSources: IDataSourceFactory[] = useMemo(() => {
    if (props.dataSources) {
      return props.dataSources;
    }

    const ros2Enabled = (ros2NativeDsEnabled as boolean | undefined) ?? false;
    const sources = [
      new DepthaiDataSourceFactory(),
      new FoxgloveWebSocketDataSourceFactory(),
      new RosbridgeDataSourceFactory(),
      new Ros1SocketDataSourceFactory(),
      ros2Enabled ? new Ros2SocketDataSourceFactory() : new Ros2UnavailableDataSourceFactory(),
      new Ros1LocalBagDataSourceFactory(),
      new Ros2LocalBagDataSourceFactory(),
      new UlogLocalDataSourceFactory(),
      new VelodyneDataSourceFactory(),
      new SampleNuscenesDataSourceFactory(),
      new McapLocalDataSourceFactory(),
      new RemoteDataSourceFactory(),
    ];

    return sources;
  }, [props.dataSources, ros2NativeDsEnabled]);

  // App url state in window.location will represent the user's current session state
  // better than the initial deep link so we prioritize the current window.location
  // url for startup state. This persists state across user-initiated refreshes.
  const [deepLinks] = useState(() => {
    // We treat presence of the `ds` or `layoutId` params as indicative of active state.
    const windowUrl = new URL(window.location.href);
    const hasActiveURLState =
      windowUrl.searchParams.has("ds") || windowUrl.searchParams.has("layoutId");
    return hasActiveURLState ? [window.location.href] : desktopBridge.getDeepLinks();
  });

  const [isFullScreen, setFullScreen] = useState(false);
  const [isMaximized, setMaximized] = useState(nativeWindow.isMaximized());

  const onMinimizeWindow = useCallback(() => nativeWindow.minimize(), [nativeWindow]);
  const onMaximizeWindow = useCallback(() => nativeWindow.maximize(), [nativeWindow]);
  const onUnmaximizeWindow = useCallback(() => nativeWindow.unmaximize(), [nativeWindow]);
  const onCloseWindow = useCallback(() => nativeWindow.close(), [nativeWindow]);

  useEffect(() => {
    const onEnterFullScreen = () => setFullScreen(true);
    const onLeaveFullScreen = () => setFullScreen(false);
    const onMaximize = () => setMaximized(true);
    const onUnmaximize = () => setMaximized(false);
    desktopBridge.addIpcEventListener("enter-full-screen", onEnterFullScreen);
    desktopBridge.addIpcEventListener("leave-full-screen", onLeaveFullScreen);
    desktopBridge.addIpcEventListener("maximize", onMaximize);
    desktopBridge.addIpcEventListener("unmaximize", onUnmaximize);
    return () => {
      desktopBridge.removeIpcEventListener("enter-full-screen", onEnterFullScreen);
      desktopBridge.removeIpcEventListener("leave-full-screen", onLeaveFullScreen);
      desktopBridge.removeIpcEventListener("maximize", onMaximize);
      desktopBridge.removeIpcEventListener("unmaximize", onUnmaximize);
    };
  }, []);

  return (
    <>
      <App
        deepLinks={deepLinks}
        dataSources={dataSources}
        appConfiguration={appConfiguration}
        layoutStorage={layoutStorage}
        extensionLoaders={extensionLoaders}
        nativeAppMenu={nativeAppMenu}
        nativeWindow={nativeWindow}
        enableGlobalCss
        appBarLeftInset={ctxbridge?.platform === "darwin" && !isFullScreen ? 72 : undefined}
        onAppBarDoubleClick={() => nativeWindow.handleTitleBarDoubleClick()}
        showCustomWindowControls={ctxbridge?.platform === "linux"}
        isMaximized={isMaximized}
        onMinimizeWindow={onMinimizeWindow}
        onMaximizeWindow={onMaximizeWindow}
        onUnmaximizeWindow={onUnmaximizeWindow}
        onCloseWindow={onCloseWindow}
        extraProviders={props.extraProviders}
      />
    </>
  );
}
