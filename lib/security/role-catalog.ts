/**
 * lib/security/role-catalog.ts
 * System role metadata for Settings → Security → Roles.
 */

import {
  CAMPUS_ROLE_PERMISSION_MAPPING,
  ROLE_PERMISSION_MAPPING,
  type PermissionKey,
} from "./permission-keys";
import type { RoleTemplateKind } from "./types";
import { labelForMembershipRole } from "@/lib/organization/invitations";
import { labelForCampusRole } from "@/lib/campuses/constants";
import type { MembershipRole } from "@/lib/organization/types";

export const CHURCH_SYSTEM_ROLE_KEYS: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
  "security_leader",
  "security_member",
  "training_coordinator",
  "medical_coordinator",
  "hardware_manager",
  "event_coordinator",
  "pastor",
  "viewer",
];

export const CAMPUS_SYSTEM_ROLE_KEYS = [
  "campus_administrator",
  "campus_security_leader",
  "campus_leader",
  "campus_security_member",
  "campus_staff",
  "campus_viewer",
] as const;

const CHURCH_ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Full church ownership, billing, and security administration.",
  co_owner: "Owner-equivalent administrative privileges without primary ownership transfer control.",
  administrator: "Church-wide administration across members, settings, and operations.",
  security_leader: "Leads day-to-day security operations church-wide.",
  security_member: "Participates in security operations and incident response.",
  training_coordinator: "Manages training events, attendance, and certifications.",
  medical_coordinator: "Manages medical inventory and incident medical tracking.",
  hardware_manager: "Manages security hardware, cameras, sensors, and maintenance.",
  event_coordinator: "Plans events, schedules coverage, and coordinates volunteers.",
  pastor: "Executive visibility into dashboards, reports, incidents, and schedules (read-only).",
  viewer: "Read-only access to permitted church information.",
};

const CAMPUS_ROLE_DESCRIPTIONS: Record<string, string> = {
  campus_administrator:
    "Administers assigned campuses: members, schedules, incidents, hardware, and notifications.",
  campus_security_leader:
    "Leads security operations at assigned campuses without church-wide admin rights.",
  campus_leader: "Campus leadership visibility and coordination.",
  campus_security_member: "Campus security team participant.",
  campus_staff: "General campus staff access.",
  campus_viewer: "Read-only campus visibility.",
};

export type RoleCatalogEntry = {
  roleKind: RoleTemplateKind;
  roleKey: string;
  displayName: string;
  description: string;
  isSystem: boolean;
  defaultPermissionKeys: PermissionKey[];
};

export function getSystemRoleCatalog(): RoleCatalogEntry[] {
  const church = CHURCH_SYSTEM_ROLE_KEYS.map((roleKey) => ({
    roleKind: "church" as const,
    roleKey,
    displayName: labelForMembershipRole(roleKey),
    description: CHURCH_ROLE_DESCRIPTIONS[roleKey] ?? "",
    isSystem: true,
    defaultPermissionKeys: ROLE_PERMISSION_MAPPING[roleKey] ?? [],
  }));

  const campus = CAMPUS_SYSTEM_ROLE_KEYS.map((roleKey) => ({
    roleKind: "campus" as const,
    roleKey,
    displayName: labelForCampusRole(roleKey),
    description: CAMPUS_ROLE_DESCRIPTIONS[roleKey] ?? "",
    isSystem: true,
    defaultPermissionKeys: CAMPUS_ROLE_PERMISSION_MAPPING[roleKey] ?? [],
  }));

  return [...church, ...campus];
}

export function getSystemRoleEntry(
  roleKind: RoleTemplateKind,
  roleKey: string,
): RoleCatalogEntry | null {
  return (
    getSystemRoleCatalog().find(
      (role) => role.roleKind === roleKind && role.roleKey === roleKey,
    ) ?? null
  );
}
