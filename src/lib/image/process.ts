"use client";

import { computeTargetDimensions } from "./dimensions";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function processImageFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = computeTargetDimensions(bitmap.width, bitmap.height, MAX_DIMENSION);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not supported in this browser.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image compression failed."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}
