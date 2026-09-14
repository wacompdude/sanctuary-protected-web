import type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
import type {
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | {
      status: "error";
      message?: string;
      details?: { error?: string; expoPushToken?: string };
    };

function accessToken(): string | null {
  const token = process.env.EXPO_ACCESS_TOKEN?.trim();
  return token || null;
}

export class ExpoPushProvider implements NotificationProvider {
  channel = "push" as const;
  name = "expo";

  isConfigured(): boolean {
    return true;
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    const to = message.to.trim();
    if (!to) {
      return {
        ok: false,
        status: "rejected",
        errorCode: "missing_push_token",
        errorMessage: "Push delivery is missing a device token.",
      };
    }

    const payload: Record<string, unknown> = {
      to,
      title: message.subject,
      body: message.text,
      sound: message.sound ?? "default",
      priority: message.priority ?? "high",
      channelId: message.channelId ?? "alerts",
      data: message.data ?? message.tags ?? {},
    };

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    const token = accessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        errorCode: "expo_network_error",
        errorMessage:
          error instanceof Error ? error.message : "Expo Push request failed.",
      };
    }

    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        errorCode: `expo_http_${response.status}`,
        errorMessage: "Expo Push rejected the request.",
        providerResponse:
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : { status: response.status },
      };
    }

    const ticket = extractTicket(parsed);
    if (!ticket) {
      return {
        ok: false,
        status: "failed",
        errorCode: "expo_invalid_response",
        errorMessage: "Expo Push returned an unexpected response.",
        providerResponse:
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : null,
      };
    }

    if (ticket.status === "ok") {
      return {
        ok: true,
        status: "sent",
        providerMessageId: ticket.id,
        providerResponse: ticket as unknown as Record<string, unknown>,
      };
    }

    const errorCode = ticket.details?.error ?? "expo_push_error";
    const permanent = errorCode === "DeviceNotRegistered";
    return {
      ok: false,
      status: permanent ? "rejected" : "failed",
      errorCode,
      errorMessage: ticket.message ?? "Expo Push could not deliver this alert.",
      providerResponse: ticket as unknown as Record<string, unknown>,
    };
  }
}

function extractTicket(parsed: unknown): ExpoPushTicket | null {
  if (!parsed || typeof parsed !== "object") return null;
  const data = (parsed as { data?: unknown }).data;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const status = (row as { status?: unknown }).status;
  if (status === "ok") {
    const id = (row as { id?: unknown }).id;
    return { status: "ok", id: typeof id === "string" ? id : "" };
  }
  if (status === "error") {
    return row as ExpoPushTicket;
  }
  return null;
}

export function getPushProvider(): NotificationProvider {
  return new ExpoPushProvider();
}
