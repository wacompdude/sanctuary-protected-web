import type { MfaChannel, MfaPurpose } from "@/lib/mfa/policy";

export type UserSecuritySettings = {
  userId: string;
  emailMfaEnabled: boolean;
  smsBackupEnabled: boolean;
  verifiedPhone: string | null;
  phoneVerifiedAt: string | null;
  trustedDeviceEnabled: boolean;
  mfaRequired: boolean;
  lastLoginMfaAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MfaChallengeRow = {
  id: string;
  userId: string;
  purpose: MfaPurpose;
  channel: MfaChannel;
  destination: string;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type LoginMfaView = {
  channel: MfaChannel;
  maskedDestination: string;
  smsBackupAvailable: boolean;
  smsBackupMaskedPhone: string | null;
  retryAfterSeconds: number;
  devCode?: string;
};

export type MfaActionState = {
  error?: string;
  success?: boolean;
  verified?: boolean;
  trustedDeviceRegistered?: boolean;
  view?: LoginMfaView;
  fieldErrors?: {
    code?: string;
    phone?: string;
  };
};

export type TrustedDeviceRecord = {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string | null;
  deviceType: string | null;
  browser: string | null;
  operatingSystem: string | null;
  firstTrustedAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrustedDeviceListItem = TrustedDeviceRecord & {
  isCurrent: boolean;
  isExpired: boolean;
};

export type TrustedDeviceValidationReason =
  | "missing"
  | "malformed"
  | "not_found"
  | "wrong_user"
  | "hash_mismatch"
  | "revoked"
  | "expired"
  | "error";

export type TrustedDeviceValidationResult =
  | { ok: true; device: TrustedDeviceRecord }
  | { ok: false; reason: TrustedDeviceValidationReason };

export type CreateTrustedDeviceResult =
  | {
      ok: true;
      device: TrustedDeviceRecord;
      token: string;
    }
  | { ok: false; error: string };
