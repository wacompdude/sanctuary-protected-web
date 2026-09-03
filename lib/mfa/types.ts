import type { MfaChannel, MfaPurpose } from "@/lib/mfa/policy";

export type UserSecuritySettings = {
  userId: string;
  emailMfaEnabled: boolean;
  smsBackupEnabled: boolean;
  verifiedPhone: string | null;
  phoneVerifiedAt: string | null;
  trustedDeviceEnabled: boolean;
  mfaRequired: boolean;
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
  view?: LoginMfaView;
  fieldErrors?: {
    code?: string;
    phone?: string;
  };
};
