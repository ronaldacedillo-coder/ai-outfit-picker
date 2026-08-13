import { describe, it, expect } from "vitest";
import { computeTargetDimensions } from "@/lib/image/dimensions";

describe("computeTargetDimensions", () => {
  it("leaves an image under the max unchanged", () => {
    expect(computeTargetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("scales down a wide image, preserving aspect ratio", () => {
    expect(computeTargetDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it("scales down a tall image, preserving aspect ratio", () => {
    expect(computeTargetDimensions(1200, 4000, 1600)).toEqual({ width: 480, height: 1600 });
  });

  it("handles a square image exactly at the max", () => {
    expect(computeTargetDimensions(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
});
