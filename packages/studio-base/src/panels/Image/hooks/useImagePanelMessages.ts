// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useState } from "react";
import { useUpdateEffect } from "react-use";
import { createStore, useStore } from "zustand";

import { AVLTree } from "@foxglove/avl";
import { useShallowMemo } from "@foxglove/hooks";
import { Time, compare as compareTime } from "@foxglove/rostime";
import { MessageEvent, RenderState } from "@foxglove/studio";
import { CameraInfo } from "@foxglove/studio-base/types/Messages";

import { normalizeCameraInfo } from "./normalizeCameraInfo";
import { synchronizedAddMessages } from "./synchronizedAddMessages";
import { normalizeAnnotations } from "../lib/normalizeAnnotations";
import { normalizeImageMessage } from "../lib/normalizeMessage";
import { Annotation, NormalizedImageMessage } from "../types";

type UseImagePanelMessagesParams = {
  imageTopic: string;
  cameraInfoTopic: string | undefined;
  annotationTopics: string[];
  synchronize: boolean;
};

export type ImagePanelState = UseImagePanelMessagesParams & {
  image?: NormalizedImageMessage;
  cameraInfo?: CameraInfo;
  annotationsByTopic: Map<string, Annotation[]>;
  tree: AVLTree<Time, SynchronizationItem>;

  actions: {
    setCurrentFrame(currentFrame: NonNullable<RenderState["currentFrame"]>): void;
    clear(): void;
    setParams(newParams: UseImagePanelMessagesParams): void;
  };
};

type PublicState = {
  image: NormalizedImageMessage | undefined;
  cameraInfo: CameraInfo | undefined;
  annotations: readonly Annotation[];
  actions: ImagePanelState["actions"];
};

const selectPublicState = (state: ImagePanelState): PublicState => ({
  actions: state.actions,
  image: state.image,
  cameraInfo: state.cameraInfo,
  annotations: ([] as Annotation[]).concat(...state.annotationsByTopic.values()),
});

export type SynchronizationItem = {
  image?: NormalizedImageMessage;
  annotationsByTopic: Map<string, Annotation[]>;
};

export const ANNOTATION_DATATYPES = [
  // Single marker
  "visualization_msgs/ImageMarker",
  "visualization_msgs/msg/ImageMarker",
  "ros.visualization_msgs.ImageMarker",
  // Marker arrays
  "foxglove_msgs/ImageMarkerArray",
  "foxglove_msgs/msg/ImageMarkerArray",
  "studio_msgs/ImageMarkerArray",
  "studio_msgs/msg/ImageMarkerArray",
  "visualization_msgs/ImageMarkerArray",
  "visualization_msgs/msg/ImageMarkerArray",
  "ros.visualization_msgs.ImageMarkerArray",
  // backwards compat with webviz
  "webviz_msgs/ImageMarkerArray",
  // foxglove
  "foxglove_msgs/ImageAnnotations",
  "foxglove_msgs/msg/ImageAnnotations",
  "foxglove.ImageAnnotations",
] as const;

function addMessages(
  state: ImagePanelState,
  messageEvents: readonly MessageEvent<unknown>[],
): Partial<ImagePanelState> {
  if (state.synchronize && state.annotationTopics.length > 0) {
    return synchronizedAddMessages(state, messageEvents);
  }

  let newState: Pick<ImagePanelState, "image" | "annotationsByTopic" | "cameraInfo"> | undefined;
  for (const event of messageEvents) {
    const normalizedCameraInfo =
      event.topic === state.cameraInfoTopic
        ? normalizeCameraInfo(event.message, event.schemaName)
        : undefined;
    const normalizedImage =
      event.topic === state.imageTopic
        ? normalizeImageMessage(event.message, event.schemaName)
        : undefined;
    const normalizedAnnotations = normalizeAnnotations(event.message, event.schemaName);
    if (!normalizedCameraInfo && !normalizedImage && !normalizedAnnotations) {
      continue;
    }

    if (!newState) {
      newState = {
        image: state.image,
        cameraInfo: state.cameraInfo,
        annotationsByTopic: new Map(state.annotationsByTopic),
      };
    }

    if (normalizedCameraInfo) {
      newState.cameraInfo = normalizedCameraInfo;
    }
    if (normalizedImage) {
      newState.image = normalizedImage;
    }
    if (normalizedAnnotations) {
      newState.annotationsByTopic.set(event.topic, normalizedAnnotations);
    }
  }

  return newState ?? state;
}

// This store causes problems i think
export function useImagePanelMessages(params: UseImagePanelMessagesParams): PublicState {
  const [store] = useState(() =>
    createStore<ImagePanelState>((set) => ({
      imageTopic: params.imageTopic,
      cameraInfoTopic: params.cameraInfoTopic,
      annotationTopics: params.annotationTopics,
      synchronize: params.synchronize,

      image: undefined,
      cameraInfo: undefined,
      annotationsByTopic: new Map(),
      tree: new AVLTree(compareTime),

      actions: {
        setParams(newParams: UseImagePanelMessagesParams) {
          // When changing params, clear the image and any annotations
          set({
            image: undefined,
            cameraInfo: undefined,
            annotationsByTopic: new Map(),
            tree: new AVLTree(compareTime),

            ...newParams,
          });
        },
        clear() {
          set({
            image: undefined,
            cameraInfo: undefined,
            annotationsByTopic: new Map(),
            tree: new AVLTree(compareTime),
          });
        },
        setCurrentFrame(currentFrame) {
          set((old) => addMessages(old, currentFrame));
        },
      },
    })),
  );

  const memoizedParams = useShallowMemo(params);
  useUpdateEffect(() => {
    store.getState().actions.setParams(memoizedParams);
  }, [memoizedParams]);

  return useStore(store, selectPublicState);
}
