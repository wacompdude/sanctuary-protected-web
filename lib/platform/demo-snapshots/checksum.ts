import { createHash } from "crypto";

export function sha256Hex(input: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Prefixed(input: string | Buffer | Uint8Array): string {
  return `sha256:${sha256Hex(input)}`;
}

/** Stable JSON for checksums (sorted object keys recursively). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}
