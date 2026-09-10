import { maskMobileE164 } from "@/lib/sms/phone";

export type BirdSmsCategory = "authentication" | "service" | "transactional";

/** Operational SMS is service traffic. Do not mark notification SMS as marketing. */
export function birdCategoryForAppMessage(
  kind: "enrollment_otp" | "enrollment_confirm" | "help" | "operational",
): BirdSmsCategory {
  if (kind === "enrollment_otp") return "authentication";
  return "service";
}

export type BirdSmsSendResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

function birdFromNumber(): string | null {
  const value = process.env.BIRD_SMS_FROM?.trim() || process.env.BIRD_FROM_NUMBER?.trim();
  return value || null;
}

export function isBirdSmsConfigured(): boolean {
  return Boolean(process.env.BIRD_API_KEY?.trim() && birdFromNumber());
}

export async function sendBirdSms(input: {
  toE164: string;
  text: string;
  category: BirdSmsCategory;
}): Promise<BirdSmsSendResult> {
  const apiKey = process.env.BIRD_API_KEY?.trim();
  const from = birdFromNumber();
  if (!apiKey || !from) {
    return { ok: false, error: "Bird SMS is not configured." };
  }

  try {
    const { BirdClient } = await import("@messagebird/sdk");
    const bird = new BirdClient({ apiKey });
    const msg = await bird.sms.send({
      from,
      to: input.toE164,
      text: input.text,
      category: input.category,
    });
    return { ok: true, id: typeof msg?.id === "string" ? msg.id : undefined };
  } catch (error) {
    console.error("Bird SMS send failed:", maskMobileE164(input.toE164), error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to send the text message.",
    };
  }
}
