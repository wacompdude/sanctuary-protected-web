/** Keys / substrings that must never appear in audit metadata. */
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|api[_-]?key|service[_-]?role|refresh[_-]?token|access[_-]?token|private[_-]?key|credential|camera.?pass|supabase.?key)/i;

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 40;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Strip secrets and oversized payloads from audit metadata.
 * Never store passwords, tokens, keys, or raw invitation tokens.
 */
export function sanitizeAuditMetadata(
  input: unknown,
  depth = 0,
): Record<string, unknown> {
  if (input == null) return {};
  if (!isPlainObject(input)) {
    return { value: sanitizeValue(input, depth) };
  }
  return sanitizeObject(input, depth);
}

function sanitizeObject(
  input: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  if (depth >= MAX_DEPTH) {
    return { _truncated: true };
  }

  const result: Record<string, unknown> = {};
  const keys = Object.keys(input).slice(0, MAX_OBJECT_KEYS);

  for (const key of keys) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = sanitizeValue(input[key], depth + 1);
  }

  return result;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}…`;
    }
    // Heuristic: long opaque strings that look like tokens
    if (
      value.length >= 40 &&
      /^[A-Za-z0-9_\-+/=.]+$/.test(value) &&
      !value.includes(" ")
    ) {
      return "[redacted]";
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, depth + 1));
  }
  if (isPlainObject(value)) {
    return sanitizeObject(value, depth);
  }
  return String(value);
}
