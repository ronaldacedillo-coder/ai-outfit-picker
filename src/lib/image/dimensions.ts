export function computeTargetDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = width >= height ? maxDimension / width : maxDimension / height;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
