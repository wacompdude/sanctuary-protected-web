import { createHmac, timingSafeEqual } from "node:crypto";

const WEBHOOK_MAX_AGE_SECONDS = 300;

export function verifyBirdWebhookSignature(params: {
  payload: string;
  signature: string | null;
  secret: string;
  timestamp?: string | null;
  webhookId?: string | null;
  nowMs?: number;
}): boolean {
  return verifyBirdWebhookRequest({
    payload: params.payload,
    secret: params.secret,
    signature: params.signature,
    timestamp: params.timestamp,
    webhookId: params.webhookId,
    nowMs: params.nowMs,
  });
}

export function verifyBirdWebhookRequest(params: {
  payload: string;
  secret: string;
  headers?: Headers | Record<string, string | null | undefined>;
  signature?: string | null;
  timestamp?: string | null;
  webhookId?: string | null;
  nowMs?: number;
}): boolean {
  const secret = params.secret.trim();
  if (!secret) return false;

  const header = (name: string): string | null => {
    if (params.headers instanceof Headers) {
      return params.headers.get(name);
    }
    if (params.headers) {
      const record = params.headers;
      const direct = record[name] ?? record[name.toLowerCase()];
      return typeof direct === "string" && direct.trim() ? direct.trim() : null;
    }
    return null;
  };

  const webhookId =
    params.webhookId?.trim() ||
    header("webhook-id") ||
    header("svix-id");
  const timestamp =
    params.timestamp?.trim() ||
    header("webhook-timestamp") ||
    header("svix-timestamp") ||
    header("messagebird-request-timestamp");
  const signature =
    params.signature?.trim() ||
    header("webhook-signature") ||
    header("svix-signature") ||
    header("messagebird-signature") ||
    header("x-messagebird-signature");

  if (!signature) return false;

  if (timestamp) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const nowSeconds = Math.floor((params.nowMs ?? Date.now()) / 1000);
    const timestampSeconds = ts > 1_000_000_000_000 ? Math.floor(ts / 1000) : ts;
    if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_MAX_AGE_SECONDS) {
      return false;
    }
  }

  if (webhookId && timestamp) {
    if (verifyStandardWebhooks(params.payload, secret, webhookId, timestamp, signature)) {
      return true;
    }
  }

  if (timestamp) {
    const signedContent = `${timestamp}.${params.payload}`;
    if (hmacMatches(secret, signedContent, signature)) return true;
  }

  return hmacMatches(secret, params.payload, signature);
}

function verifyStandardWebhooks(
  payload: string,
  secret: string,
  webhookId: string,
  timestamp: string,
  signatureHeader: string,
): boolean {
  const signedContent = `${webhookId}.${timestamp}.${payload}`;
  const keys = standardWebhookKeys(secret);
  return keys.some((key) => hmacMatches(key, signedContent, signatureHeader));
}

function standardWebhookKeys(secret: string): Array<string | Buffer> {
  const keys: Array<string | Buffer> = [secret];
  if (secret.startsWith("whsec_")) {
    keys.push(Buffer.from(secret.slice("whsec_".length), "base64"));
  } else {
    try {
      keys.push(Buffer.from(secret, "base64"));
    } catch {
      // ignore invalid base64
    }
  }
  return keys;
}

function hmacMatches(
  key: string | Buffer,
  signedContent: string,
  signatureHeader: string,
): boolean {
  const expectedB64 = createHmac("sha256", key).update(signedContent).digest("base64");
  const expectedHex = createHmac("sha256", key).update(signedContent).digest("hex");
  const expectedBuf = createHmac("sha256", key).update(signedContent).digest();

  return signatureCandidates(signatureHeader).some((candidate) => {
    if (safeEqualUtf8(candidate, expectedB64) || safeEqualUtf8(candidate, expectedHex)) {
      return true;
    }
    try {
      const received = Buffer.from(candidate, "base64");
      return (
        received.length === expectedBuf.length && timingSafeEqual(received, expectedBuf)
      );
    } catch {
      return false;
    }
  });
}

function signatureCandidates(header: string): string[] {
  return header
    .split(/[\s]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const stripped = part.replace(/^v1,/i, "").replace(/^v1=/i, "");
      const [, value] = part.split("=", 2);
      return [part, stripped, value].filter(
        (item): item is string => Boolean(item && item.trim()),
      );
    });
}

function safeEqualUtf8(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type InboundSmsKeyword = "STOP" | "START" | "HELP" | null;

const STOP_WORDS = new Set([
  "STOP",
  "STOPALL",
  "END",
  "QUIT",
  "CANCEL",
  "UNSUBSCRIBE",
]);
const START_WORDS = new Set(["START", "YES", "UNSTOP"]);

export function classifyInboundSmsKeyword(body: string): InboundSmsKeyword {
  const token = body.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (STOP_WORDS.has(token)) return "STOP";
  if (START_WORDS.has(token)) return "START";
  if (token === "HELP" || token === "INFO") return "HELP";
  return null;
}

export function extractInboundSms(payload: unknown): {
  from: string | null;
  body: string;
} {
  const event = extractBirdWebhookEvent(payload);
  return { from: event.from, body: event.body };
}

export type BirdWebhookEvent = {
  type: string | null;
  channel: string | null;
  from: string | null;
  body: string;
  preference?: "granted" | "revoked" | "deleted" | null;
};

export function extractBirdWebhookEvent(payload: unknown): BirdWebhookEvent {
  if (!payload || typeof payload !== "object") {
    return { type: null, channel: null, from: null, body: "", preference: null };
  }
  const record = payload as Record<string, unknown>;
  const data =
    (record.data as Record<string, unknown> | undefined) ??
    (record.payload as Record<string, unknown> | undefined) ??
    (record.message as Record<string, unknown> | undefined) ??
    record;
  const type = stringish(record.type) ?? stringish(record.event);
  const channel = (
    stringish(data.channel) ??
    stringish(record.channel) ??
    ""
  ).toLowerCase();
  const from =
    stringish(data.handle) ||
    stringish(data.originator) ||
    stringish(data.from) ||
    stringish(data.sender) ||
    stringish(data.msisdn) ||
    stringish(record.originator) ||
    stringish(record.from);
  const body =
    stringish(data.body) ||
    stringish(data.text) ||
    stringish(data.message) ||
    stringish(record.body) ||
    stringish(record.text) ||
    "";

  let preference: BirdWebhookEvent["preference"] = null;
  if (type === "preference.granted") preference = "granted";
  if (type === "preference.revoked") preference = "revoked";
  if (type === "preference.deleted") preference = "deleted";

  return {
    type,
    channel: channel || null,
    from,
    body,
    preference,
  };
}

function stringish(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
