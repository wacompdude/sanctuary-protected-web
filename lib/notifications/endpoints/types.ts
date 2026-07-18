import type { NotificationChannel } from "@/lib/notifications/types";

export type EndpointStatus =
  | "active"
  | "unverified"
  | "disabled"
  | "bounced"
  | "complained"
  | "revoked"
  | "invalid";

export type ConsentStatus =
  | "unknown"
  | "not_required"
  | "pending"
  | "granted"
  | "revoked"
  | "denied";

export type NotificationEndpoint = {
  id: string;
  church_id: string;
  user_id: string;
  membership_id: string | null;
  channel: NotificationChannel;
  destination: string;
  normalized_destination: string;
  label: string | null;
  is_primary: boolean;
  is_verified: boolean;
  verified_at: string | null;
  status: EndpointStatus;
  consent_status: ConsentStatus;
  consent_recorded_at: string | null;
  consent_source: string | null;
  consent_disclosure_version: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

export const SMS_CONSENT_DISCLOSURE_VERSION = "sms-consent-v1";
