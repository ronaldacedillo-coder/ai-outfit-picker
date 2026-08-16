import { timingSafeEqual } from "crypto";

// Constant-time compare so a mismatched signup code can't be distinguished
// from a matching one by response timing. Length is checked first because
// crypto.timingSafeEqual throws (rather than returning false) on buffers
// of different lengths -- that early return happens before either buffer
// reaches the constant-time comparison, which is fine: a length mismatch
// alone doesn't leak which character differs.
export function codeMatches(submitted: string, expected: string): boolean {
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
