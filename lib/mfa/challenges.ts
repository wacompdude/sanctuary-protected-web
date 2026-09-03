import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateMfaCode,
  hashMfaCode,
  mfaCodeHashesMatch,
  normalizeMfaCodeInput,
} from "@/lib/mfa/codes";
import {
  MFA_CODE_TTL_MS,
  MFA_MAX_ATTEMPTS,
  MFA_RESEND_COOLDOWN_MS,
  type MfaChannel,
  type MfaPurpose,
} from "@/lib/mfa/policy";
import type { MfaChallengeRow } from "@/lib/mfa/types";

type ChallengeDbRow = {
  id: string;
  user_id: string;
  purpose: MfaPurpose;
  channel: MfaChannel;
  destination: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

function mapChallenge(row: ChallengeDbRow): MfaChallengeRow {
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    channel: row.channel,
    destination: row.destination,
    codeHash: row.code_hash,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

export function retryAfterSeconds(createdAtIso: string): number {
  const elapsed = Date.now() - new Date(createdAtIso).getTime();
  const remaining = MFA_RESEND_COOLDOWN_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export async function getLatestActiveChallenge(input: {
  userId: string;
  purpose: MfaPurpose;
  channel: MfaChannel;
}): Promise<MfaChallengeRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_mfa_challenges")
    .select(
      "id, user_id, purpose, channel, destination, code_hash, attempts, max_attempts, expires_at, consumed_at, created_at",
    )
    .eq("user_id", input.userId)
    .eq("purpose", input.purpose)
    .eq("channel", input.channel)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapChallenge(data as ChallengeDbRow) : null;
}

export async function createMfaChallenge(input: {
  userId: string;
  purpose: MfaPurpose;
  channel: MfaChannel;
  destination: string;
}): Promise<{ challenge: MfaChallengeRow; code: string; reused: boolean }> {
  const existing = await getLatestActiveChallenge(input);
  if (existing) {
    const wait = retryAfterSeconds(existing.createdAt);
    if (wait > 0) {
      return { challenge: existing, code: "", reused: true };
    }
  }

  if (existing) {
    await consumeChallenge(existing.id);
  }

  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const code = generateMfaCode();
  const now = new Date();
  const row = {
    id,
    user_id: input.userId,
    purpose: input.purpose,
    channel: input.channel,
    destination: input.destination,
    code_hash: hashMfaCode(code, id),
    attempts: 0,
    max_attempts: MFA_MAX_ATTEMPTS,
    expires_at: new Date(now.getTime() + MFA_CODE_TTL_MS).toISOString(),
    created_at: now.toISOString(),
  };

  const { data, error } = await admin
    .from("user_mfa_challenges")
    .insert(row)
    .select(
      "id, user_id, purpose, channel, destination, code_hash, attempts, max_attempts, expires_at, consumed_at, created_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create verification challenge.");
  }

  return { challenge: mapChallenge(data as ChallengeDbRow), code, reused: false };
}

export async function consumeChallenge(challengeId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_mfa_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeId)
    .is("consumed_at", null);
  if (error) throw new Error(error.message);
}

export type VerifyMfaCodeResult =
  | { ok: true; challenge: MfaChallengeRow }
  | { ok: false; error: string; locked?: boolean };

export async function verifyMfaCode(input: {
  userId: string;
  purpose: MfaPurpose;
  channel: MfaChannel;
  code: string;
}): Promise<VerifyMfaCodeResult> {
  const normalized = normalizeMfaCodeInput(input.code);
  if (!normalized) {
    return { ok: false, error: "Enter the 6-digit verification code." };
  }

  const challenge = await getLatestActiveChallenge({
    userId: input.userId,
    purpose: input.purpose,
    channel: input.channel,
  });

  if (!challenge) {
    return {
      ok: false,
      error: "That code has expired. Request a new verification code.",
    };
  }

  const admin = createAdminClient();
  const nextAttempts = challenge.attempts + 1;
  const matches = mfaCodeHashesMatch(
    challenge.codeHash,
    hashMfaCode(normalized, challenge.id),
  );

  if (!matches) {
    const locked = nextAttempts >= challenge.maxAttempts;
    await admin
      .from("user_mfa_challenges")
      .update({
        attempts: nextAttempts,
        consumed_at: locked ? new Date().toISOString() : challenge.consumedAt,
      })
      .eq("id", challenge.id);

    if (locked) {
      return {
        ok: false,
        locked: true,
        error: "Too many incorrect codes. Request a new verification code.",
      };
    }
    return { ok: false, error: "That verification code is incorrect." };
  }

  await consumeChallenge(challenge.id);
  return { ok: true, challenge };
}
