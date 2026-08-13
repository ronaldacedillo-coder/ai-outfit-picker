const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_RAW_BYTES = 10 * 1024 * 1024;

export function validateImageFile(file: File): { valid: true } | { valid: false; error: string } {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { valid: false, error: "Please upload a JPEG, PNG, or WebP photo." };
  }
  if (file.size === 0) {
    return { valid: false, error: "That file appears to be empty." };
  }
  if (file.size > MAX_RAW_BYTES) {
    return { valid: false, error: "Photo is too large — please use an image under 10MB." };
  }
  return { valid: true };
}
