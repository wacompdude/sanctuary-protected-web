import type { MembershipRole } from "@/lib/church/types";
import type { NotificationSeverity } from "@/lib/notifications/types";

export type NotificationGroupType =
  | "security"
  | "medical"
  | "leadership"
  | "ministry"
  | "facilities"
  | "campus"
  | "emergency"
  | "custom";

export type NotificationGroupStatus = "active" | "inactive" | "archived";

export type NotificationGroupMemberStatus = "active" | "inactive" | "removed";

export type DynamicRuleType =
  | "role"
  | "campus"
  | "membership_status"
  | "team_assignment";

export type NotificationGroup = {
  id: string;
  church_id: string;
  campus_id: string | null;
  name: string;
  description: string | null;
  group_type: NotificationGroupType;
  status: NotificationGroupStatus;
  is_system_group: boolean;
  dynamic_rule_type: DynamicRuleType | null;
  dynamic_rule_value: string | null;
  allow_member_self_join: boolean;
  allow_member_self_leave: boolean;
  default_notification_severity: NotificationSeverity;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type NotificationGroupListItem = NotificationGroup & {
  member_count: number;
  campus_name: string | null;
};

export type NotificationGroupMember = {
  id: string;
  church_id: string;
  group_id: string;
  membership_id: string;
  user_id: string;
  status: NotificationGroupMemberStatus;
  added_by: string | null;
  added_at: string;
  removed_at: string | null;
  display_name: string;
  role: MembershipRole | null;
};

export type NotificationGroupDefault = {
  id: string;
  church_id: string;
  group_id: string;
  notification_type: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  minimum_severity: NotificationSeverity;
  require_acknowledgment: boolean;
  created_at: string;
  updated_at: string;
};
