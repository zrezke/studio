// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  IDataSourceFactory,
  DataSourceFactoryInitializeArgs,
} from "@foxglove/studio-base/context/PlayerSelectionContext";
import DepthaiPlayer from "@foxglove/studio-base/players/DepthaiPlayer";
import { Player } from "@foxglove/studio-base/players/types";

export default class DepthaiDataSourceFactory implements IDataSourceFactory {
  public id = "depthai-connection";
  public type: IDataSourceFactory["type"] = "connection";
  public displayName = "Depthai Connection";
  public iconName: IDataSourceFactory["iconName"] = "Flow";
  public description =
    "Connect to a ROS 1, ROS 2, or custom system using the Foxglove WebSocket protocol. For ROS systems, be sure to first install the foxglove_bridge ROS package.";
  public docsLinks = [
    {
      label: "ROS 1",
      url: "https://foxglove.dev/docs/studio/connection/ros1#foxglove-websocket",
    },
    {
      label: "ROS 2",
      url: "https://foxglove.dev/docs/studio/connection/ros2#foxglove-websocket",
    },
    {
      label: "custom data",
      url: "https://foxglove.dev/docs/studio/connection/custom#foxglove-websocket",
    },
  ];

  public formConfig = {
    fields: [
      {
        id: "url",
        label: "WebSocket URL",
        defaultValue: "ws://localhost:8765",
        validate: (newValue: string): Error | undefined => {
          try {
            const url = new URL(newValue);
            if (url.protocol !== "ws:" && url.protocol !== "wss:") {
              return new Error(`Invalid protocol: ${url.protocol}`);
            }
            return undefined;
          } catch (err) {
            return new Error("Enter a valid url");
          }
        },
      },
    ],
  };

  public initialize(args: DataSourceFactoryInitializeArgs): Player | undefined {
    const url = args.params?.url;
    if (!url) {
      return;
    }

    return new DepthaiPlayer({
      url,
      metricsCollector: args.metricsCollector,
      sourceId: this.id,
    });
  }
}
