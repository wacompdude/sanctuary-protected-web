import type { User } from "@supabase/supabase-js";
import type { PlatformPermissionKey } from "@/lib/platform/permission-keys";
import type { PlatformRoleKey } from "@/lib/platform/role-keys";

export type PlatformAccountStatus =
  | "invited"
  | "active"
  | "disabled"
  | "locked"
  | "archived";

export type PlatformAccountType =
  | "internal"
  | "developer"
  | "support"
  | "billing"
  | "audit";

export type PlatformAccountRecord = {
  id: string;
  user_id: string;
  email_snapshot: string;
  display_name: string | null;
  status: PlatformAccountStatus;
  account_type: PlatformAccountType;
  must_change_password: boolean;
  mfa_required: boolean;
  mfa_verified_at: string | null;
  last_platform_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
};

export type PlatformRoleRecord = {
  id: string;
  role_key: PlatformRoleKey | string;
  display_name: string;
  description: string | null;
  status: "active" | "inactive" | "archived";
  is_system_role: boolean;
};

export type PlatformAccountRoleAssignment = {
  id: string;
  platform_account_id: string;
  platform_role_id: string;
  role_key: PlatformRoleKey | string;
  assigned_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type PlatformContext = {
  supabase: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >;
  user: User;
  account: PlatformAccountRecord;
  roleKeys: string[];
  permissions: Set<PlatformPermissionKey | string>;
};

export type PlatformAccessSessionType =
  | "read_only"
  | "support"
  | "administrative"
  | "emergency";

export type PlatformAccessSessionStatus =
  | "active"
  | "ended"
  | "expired"
  | "revoked";
