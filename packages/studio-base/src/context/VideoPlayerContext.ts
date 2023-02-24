// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { createContext, useContext, useState } from "react";

// message
// :
// {data: Uint8Array(135000), encoding: 'nv12', frame_id: '+x', height: 300, step: 900, …}
// receiveTime
// :
// {sec: 1677228584, nsec: 736000000}
// schemaName
// :
// "foxglove.RawImage"
// sizeInBytes
// :
// 135084
// topic
// :
// "colorImage"

export interface IVideoPlayerContext {
  videMessage:
    | {
        message: {
          data: Uint8Array;
          encoding: string;
          frame_id: string;
          height: number;
          step: number;
          width: number;
          timestamp: bigint | { sec: number; nsec: number };
        };
        receiveTime: { sec: number; nsec: number };
        schemaName: string;
        sizeInBytes: number;
        topic: string;
      }
    | undefined;
  setVideoMessage: React.Dispatch<
    React.SetStateAction<IVideoPlayerContext["videMessage"] | undefined>
  >;
}

export const VideoPlayerContext = createContext<IVideoPlayerContext>({
  setVideoMessage: () => {},
  videMessage: undefined,
});
VideoPlayerContext.displayName = "VideoPlayerContext";
