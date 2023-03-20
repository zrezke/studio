// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import {
  PinholeCameraModel,
  decodeYUV,
  decodeNV12,
  decodeRGB8,
  decodeRGBA8,
  decodeBGRA8,
  decodeBGR8,
  decodeFloat1c,
  decodeBayerRGGB8,
  decodeBayerBGGR8,
  decodeBayerGBRG8,
  decodeBayerGRBG8,
  decodeMono8,
  decodeMono16,
} from "@foxglove/den/image";
import { Color, Point2D } from "@foxglove/studio-base/types/Messages";
import sendNotification from "@foxglove/studio-base/util/sendNotification";

import { HitmapRenderContext } from "./HitmapRenderContext";
import { buildMarkerData, calculateZoomScale } from "./util";
import type {
  MarkerData,
  PanZoom,
  RenderableCanvas,
  RenderArgs,
  RenderDimensions,
  RenderGeometry,
  RenderOptions,
  Annotation,
  CircleAnnotation,
  PointsAnnotation,
  TextAnnotation,
  NormalizedImageMessage,
} from "../types";

// Just globally keep track of if we've shown an error in rendering, since typically when you get
// one error, you'd then get a whole bunch more, which is spammy.
let hasLoggedCameraModelError: boolean = false;

// Size threshold below which we do fast point rendering as rects.
// Empirically 3 seems like a good threshold here.
const FAST_POINT_SIZE_THRESHOlD = 3;

// 4k
const MAX_RESOLUTION = { width: 3840, height: 2160 };
const RGBABuffer = new Uint8ClampedArray(MAX_RESOLUTION.width * MAX_RESOLUTION.height * 4);

// Given a canvas, an image message, and marker info, render the image to the canvas.
export async function renderImage({
  canvas,
  hitmapCanvas,
  geometry,
  imageMessage,
  rawMarkerData,
  options,
}: RenderArgs & { canvas: RenderableCanvas; hitmapCanvas: RenderableCanvas | undefined }): Promise<
  RenderDimensions | undefined
> {
  if (!imageMessage) {
    clearCanvas(canvas);
    return undefined;
  }

  const { imageSmoothing = false } = options ?? {};

  let markerData = undefined;
  try {
    markerData = buildMarkerData(rawMarkerData);
  } catch (error) {
    if (!hasLoggedCameraModelError) {
      sendNotification(`Failed to initialize camera model from CameraInfo`, error, "user", "warn");
      hasLoggedCameraModelError = true;
    }
  }

  try {
    let frameImage: VideoFrame;
    if (imageMessage.type === "raw") {
      if (imageMessage.encoding === "rgb8") {
        decodeRGB8(imageMessage.data, imageMessage.width, imageMessage.height, RGBABuffer);
        frameImage = new VideoFrame(RGBABuffer, {
          format: "RGBA",
          codedWidth: imageMessage.width,
          codedHeight: imageMessage.height,
          timestamp: imageMessage.stamp.sec,
        });
      } else {
        frameImage = new VideoFrame(imageMessage.data, {
          format: codecMap.get(imageMessage.encoding)!,
          codedWidth: imageMessage.width,
          codedHeight: imageMessage.height,
          timestamp: imageMessage.stamp.sec,
        });
      }
    } else {
      const imageDecoder = new ImageDecoder({
        type: `image/${imageMessage.format}`,
        data: imageMessage.data,
      });
      frameImage = (await imageDecoder.decode({ frameIndex: 0 })).image;
      imageDecoder.close();
    }

    if (options?.resizeCanvas === true) {
      canvas.width = frameImage.displayWidth;
      canvas.height = frameImage.displayHeight;
    }

    const dimensions = render({
      canvas,
      geometry,
      hitmapCanvas,
      frameImage,
      imageSmoothing,
      markerData,
    });
    frameImage.close();
    return dimensions;
  } catch (error) {
    // If there is an error, clear the image and re-throw it.
    clearCanvas(canvas);
    throw error;
  }
}

function toRGBA(color: Color) {
  return `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, ${color.a})`;
}

function maybeUnrectifyPixel(cameraModel: PinholeCameraModel | undefined, point: Point2D): Point2D {
  return cameraModel?.unrectifyPixel({ x: 0, y: 0 }, point) ?? point;
}

/** Maps studio image encodings to VideoFrame encodings */
const codecMap: Map<string, VideoPixelFormat> = new Map(
  Object.entries({
    yuv422: "I422",
    nv12: "NV12",
    yuv420: "I420",
    j420: "I420A", // I don't know if this is correct and if my naming makes sense "j420"
    yuv444: "I444",
    rgb8: "RGBX",
    rgba8: "RGBA",
    bgra8: "BGRA",
    bgr8: "BGRX",
  }),
);

function clearCanvas(canvas?: RenderableCanvas) {
  if (canvas) {
    // https://github.com/microsoft/TypeScript-DOM-lib-generator/issues/1480
    (
      canvas.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | undefined
    )?.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function render({
  frameImage,
  canvas,
  geometry,
  hitmapCanvas,
  imageSmoothing,
  markerData,
}: {
  frameImage: VideoFrame;
  canvas: RenderableCanvas;
  geometry: RenderGeometry;
  hitmapCanvas: RenderableCanvas | undefined;
  imageSmoothing: boolean;
  markerData: MarkerData | undefined;
}): RenderDimensions | undefined {
  const bitmapDimensions =
    geometry.rotation % 180 === 0
      ? { width: frameImage.displayWidth, height: frameImage.displayHeight }
      : { width: frameImage.displayHeight, height: frameImage.displayWidth };

  const canvasCtx = canvas.getContext("2d") as  // https://github.com/microsoft/TypeScript-DOM-lib-generator/issues/1480
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | undefined;
  if (!canvasCtx) {
    return;
  }

  canvasCtx.imageSmoothingEnabled = imageSmoothing;

  const { markers = [], cameraModel } = markerData ?? {};

  const viewportW = canvas.width;
  const viewportH = canvas.height;

  const imageViewportScale = calculateZoomScale(bitmapDimensions, canvas, geometry.zoomMode);

  const ctx = new HitmapRenderContext(canvasCtx, hitmapCanvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  // translate x/y from the center of the canvas
  ctx.translate(viewportW / 2, viewportH / 2);
  ctx.translate(geometry.panZoom.x, geometry.panZoom.y);

  ctx.scale(geometry.panZoom.scale, geometry.panZoom.scale);
  ctx.scale(imageViewportScale, imageViewportScale);

  if (geometry.flipHorizontal) {
    ctx.scale(-1, 1);
  }

  if (geometry.flipVertical) {
    ctx.scale(1, -1);
  }

  ctx.rotate(geometry.rotation);

  // center the image in the viewport
  // also sets 0,0 as the upper left corner of the image since markers are drawn from 0,0 on the image
  ctx.translate(-frameImage.displayWidth / 2, -frameImage.displayHeight / 2);

  ctx.drawImage(frameImage, 0, 0);

  // The bitmap images from the image message may be resized to conserve space
  // while the markers are positioned relative to the original image size.
  // Original width/height are the image dimensions for the marker positions
  // These dimensions are used to scale the markers positions separately from the bitmap size
  const { originalWidth = frameImage.displayWidth, originalHeight = frameImage.displayHeight } =
    markerData ?? {};
  ctx.scale(frameImage.displayWidth / originalWidth, frameImage.displayHeight / originalHeight);
  const transform = ctx.getTransform();

  try {
    paintMarkers(ctx, markers, cameraModel, geometry.panZoom);
  } catch (err) {
    console.warn("error painting markers:", err);
  } finally {
    ctx.restore();
  }

  return { ...bitmapDimensions, transform };
}

function paintMarkers(
  ctx: HitmapRenderContext,
  annotations: readonly Annotation[],
  cameraModel: PinholeCameraModel | undefined,
  panZoom: PanZoom,
) {
  for (const annotation of annotations) {
    ctx.save();
    try {
      ctx.startMarker();

      switch (annotation.type) {
        case "circle":
          paintCircleAnnotation(ctx, annotation, cameraModel);
          break;
        case "points":
          paintPointsAnnotation(ctx, annotation, cameraModel, panZoom);
          break;
        case "text":
          paintTextAnnotation(ctx, annotation, cameraModel);
          break;
      }
    } catch (err) {
      console.error("Unable to paint annotation to ImageView", err, annotation);
    } finally {
      ctx.restore();
    }
  }
}

function paintLine(
  ctx: HitmapRenderContext,
  pointA: Point2D,
  pointB: Point2D,
  thickness: number,
  outlineColor: Color,
  cameraModel: PinholeCameraModel | undefined,
) {
  if (thickness <= 0 || outlineColor.a <= 0) {
    return;
  }

  const { x: x1, y: y1 } = maybeUnrectifyPixel(cameraModel, pointA);
  const { x: x2, y: y2 } = maybeUnrectifyPixel(cameraModel, pointB);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);

  ctx.lineWidth = thickness;
  ctx.strokeStyle = toRGBA(outlineColor);
  ctx.stroke();
}

function paintTextAnnotation(
  ctx: HitmapRenderContext,
  annotation: TextAnnotation,
  cameraModel: PinholeCameraModel | undefined,
) {
  const { x, y } = maybeUnrectifyPixel(cameraModel, annotation.position);
  const text = annotation.text;
  if (!text) {
    return;
  }

  const fontSize = annotation.fontSize;
  const padding = annotation.padding;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "bottom";
  if (annotation.backgroundColor) {
    const metrics = ctx.measureText(text);
    const height =
      "fontBoundingBoxAscent" in metrics
        ? metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent
        : fontSize * 1.2;
    ctx.fillStyle = toRGBA(annotation.backgroundColor);
    ctx.fillRect(x, y - height, Math.ceil(metrics.width + 2 * padding), Math.ceil(height));
  }
  ctx.fillStyle = toRGBA(annotation.textColor);
  ctx.fillText(text, x + padding, y);
}

function paintCircleAnnotation(
  ctx: HitmapRenderContext,
  annotation: CircleAnnotation,
  cameraModel: PinholeCameraModel | undefined,
) {
  const { fillColor, outlineColor, radius, thickness, position } = annotation;

  // perf-sensitive: function params instead of options object to avoid allocations
  const hasFill = fillColor != undefined && fillColor.a > 0;
  const hasStroke = outlineColor != undefined && outlineColor.a > 0 && thickness > 0;

  if (radius <= 0 || (!hasFill && !hasStroke)) {
    return;
  }

  const { x, y } = maybeUnrectifyPixel(cameraModel, position);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);

  if (hasFill) {
    ctx.fillStyle = toRGBA(fillColor);
    ctx.fill();
  }

  if (hasStroke) {
    ctx.lineWidth = thickness;
    ctx.strokeStyle = toRGBA(outlineColor);
    ctx.stroke();
  }
}

function paintPointsAnnotation(
  ctx: HitmapRenderContext,
  annotation: PointsAnnotation,
  cameraModel: PinholeCameraModel | undefined,
  panZoom: PanZoom,
) {
  switch (annotation.style) {
    case "points": {
      for (let i = 0; i < annotation.points.length; i++) {
        const point = annotation.points[i]!;
        // This is not a typo. ImageMarker has an array for outline_colors but
        // not fill_colors, even though points are filled and not outlined. We
        // only fall back to fill_color if both outline_colors[i] and
        // outline_color are fully transparent
        const pointOutlineColor = annotation.outlineColors[i];
        const fillColor = pointOutlineColor
          ? pointOutlineColor
          : annotation.outlineColor && annotation.outlineColor.a > 0
          ? annotation.outlineColor
          : annotation.fillColor;

        // For points small enough to be visually indistinct at our current zoom level
        // we do a fast render.
        const size = annotation.thickness * panZoom.scale;
        if (size <= FAST_POINT_SIZE_THRESHOlD) {
          paintFastPoint(
            ctx,
            point,
            annotation.thickness,
            annotation.thickness,
            undefined,
            fillColor,
            cameraModel,
          );
        } else {
          paintCircle(
            ctx,
            point,
            annotation.thickness,
            annotation.thickness,
            undefined,
            fillColor,
            cameraModel,
          );
        }
      }
      break;
    }
    case "polygon":
    case "line_strip": {
      if (annotation.points.length === 0) {
        break;
      }
      ctx.beginPath();
      const { x, y } = maybeUnrectifyPixel(cameraModel, annotation.points[0]!);
      ctx.moveTo(x, y);
      for (let i = 1; i < annotation.points.length; i++) {
        const maybeUnrectifiedPoint = maybeUnrectifyPixel(cameraModel, annotation.points[i]!);
        ctx.lineTo(maybeUnrectifiedPoint.x, maybeUnrectifiedPoint.y);
      }
      if (annotation.style === "polygon") {
        ctx.closePath();
        if (annotation.fillColor && annotation.fillColor.a > 0) {
          ctx.fillStyle = toRGBA(annotation.fillColor);
          ctx.fill();
        }
      }
      if (annotation.outlineColor && annotation.outlineColor.a > 0 && annotation.thickness > 0) {
        ctx.strokeStyle = toRGBA(annotation.outlineColor);
        ctx.lineWidth = annotation.thickness;
        ctx.stroke();
      }
      break;
    }
    case "line_list": {
      const hasExactColors = annotation.outlineColors.length === annotation.points.length / 2;

      for (let i = 0; i < annotation.points.length; i += 2) {
        // Support the case where outline_colors is half the length of points,
        // one color per line, and where outline_colors matches the length of
        // points (although we only use the first color in this case). Fall back
        // to marker.outline_color as needed
        const outlineColor = hasExactColors
          ? annotation.outlineColors[i / 2]!
          : annotation.outlineColors.length > i
          ? annotation.outlineColors[i]!
          : annotation.outlineColor;
        paintLine(
          ctx,
          annotation.points[i]!,
          annotation.points[i + 1]!,
          annotation.thickness,
          outlineColor ?? { r: 0, g: 0, b: 0, a: 1 },
          cameraModel,
        );
      }

      break;
    }
  }
}

function paintCircle(
  ctx: HitmapRenderContext,
  point: Point2D,
  radius: number,
  thickness: number,
  outlineColor: Color | undefined,
  fillColor: Color | undefined,
  cameraModel: PinholeCameraModel | undefined,
) {
  // perf-sensitive: function params instead of options object to avoid allocations
  const hasFill = fillColor != undefined && fillColor.a > 0;
  const hasStroke = outlineColor != undefined && outlineColor.a > 0 && thickness > 0;

  if (radius <= 0 || (!hasFill && !hasStroke)) {
    return;
  }

  const { x, y } = maybeUnrectifyPixel(cameraModel, point);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);

  if (hasFill) {
    ctx.fillStyle = toRGBA(fillColor);
    ctx.fill();
  }

  if (hasStroke) {
    ctx.lineWidth = thickness;
    ctx.strokeStyle = toRGBA(outlineColor);
    ctx.stroke();
  }
}

/**
 * Renders small points as rectangles instead of circles for better performance.
 */
function paintFastPoint(
  ctx: HitmapRenderContext,
  point: Point2D,
  radius: number,
  thickness: number,
  outlineColor: Color | undefined,
  fillColor: Color | undefined,
  cameraModel: PinholeCameraModel | undefined,
) {
  // perf-sensitive: function params instead of options object to avoid allocations
  const hasFill = fillColor != undefined && fillColor.a > 0;
  const hasStroke = outlineColor != undefined && outlineColor.a > 0 && thickness > 0;

  if (radius <= 0 || (!hasFill && !hasStroke)) {
    return;
  }

  const { x, y } = maybeUnrectifyPixel(cameraModel, point);
  const size = Math.round(radius * 2);
  const rx = Math.round(x - size / 2);
  const ry = Math.round(y - size / 2);

  if (hasFill) {
    ctx.fillStyle = toRGBA(fillColor);
    ctx.fillRect(rx, ry, size, size);
  }

  if (hasStroke) {
    ctx.lineWidth = thickness;
    ctx.strokeStyle = toRGBA(outlineColor);
    ctx.strokeRect(rx, ry, size, size);
  }
}
