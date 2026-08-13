import { describe, it, expect } from "vitest";
import { validateImageFile } from "@/lib/image/validate";

function makeFile(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], "photo", { type });
}

describe("validateImageFile", () => {
  it("accepts a jpeg under the size limit", () => {
    expect(validateImageFile(makeFile("image/jpeg", 1024))).toEqual({ valid: true });
  });

  it("accepts png and webp", () => {
    expect(validateImageFile(makeFile("image/png", 1024)).valid).toBe(true);
    expect(validateImageFile(makeFile("image/webp", 1024)).valid).toBe(true);
  });

  it("rejects an unsupported type", () => {
    const result = validateImageFile(makeFile("image/gif", 1024));
    expect(result.valid).toBe(false);
  });

  it("rejects a file over 10MB", () => {
    const result = validateImageFile(makeFile("image/jpeg", 11 * 1024 * 1024));
    expect(result.valid).toBe(false);
  });

  it("rejects an empty file", () => {
    const result = validateImageFile(makeFile("image/jpeg", 0));
    expect(result.valid).toBe(false);
  });
});
