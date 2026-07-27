/**
 * QUICK REFERENCE: Church Security Permissions System
 * 
 * This file serves as a quick guide for developers using the new security system.
 * For detailed information, see DESIGN_SECURITY_SYSTEM.md and PHASE_3_COMPLETION_REPORT.md
 */

// ============================================================================
// 1. CHECK IF USER CAN PERFORM AN ACTION
// ============================================================================

import { canUserPerform } from "@/lib/security";
import { createClient as createAdmin } from "@/lib/supabase/admin";

const admin = await createAdmin();
const result = await canUserPerform(admin, {
  userId: "user-id",
  churchId: "church-id",
  permissionKey: "incidents.view",
  campusId: "campus-id", // optional
});

if (result.allowed) {
  // User has permission
  console.log(result.message); // "You have permission to perform this action."
  console.log(result.source); // "ROLE" | "GROUP" | "DIRECT"
  console.log(result.expiresAt); // Date or undefined
} else {
  // User does NOT have permission
  console.log(result.reason); // "PERMISSION_NOT_GRANTED" etc.
  console.log(result.message); // "You do not have permission to perform this action."
}

// ============================================================================
// 2. REQUIRE PERMISSION (THROW ERROR IF NOT AUTHORIZED)
// ============================================================================

import { requirePermission, PERMISSION_KEYS } from "@/lib/security";

// In a server action or API route:
export async function myAction() {
  const { user } = await getAuthenticatedUser();
  const { church } = await getActiveChurch();

  // This throws an error if not authorized
  await requirePermission(admin, user.id, church.id, PERMISSION_KEYS.INCIDENTS_CREATE);

  // If we reach here, user has permission
  // Proceed with creating incident...
}

// ============================================================================
// 3. PERMISSION KEYS
// ============================================================================

import { PERMISSION_KEYS } from "@/lib/security";

// All permission keys are available as constants:
PERMISSION_KEYS.DASHBOARD_VIEW;
PERMISSION_KEYS.INCIDENTS_VIEW;
PERMISSION_KEYS.INCIDENTS_CREATE;
PERMISSION_KEYS.INCIDENTS_DELETE;
PERMISSION_KEYS.INCIDENTS_EXPORT;
PERMISSION_KEYS.INCIDENTS_VIEW_SENSITIVE;
PERMISSION_KEYS.INCIDENTS_VIEW_ALL_CAMPUSES;
PERMISSION_KEYS.REPORTS_VIEW;
PERMISSION_KEYS.REPORTS_RUN;
PERMISSION_KEYS.REPORTS_EXPORT;
PERMISSION_KEYS.CAMERAS_VIEW_LIVE;
PERMISSION_KEYS.CAMERAS_MANAGE;
PERMISSION_KEYS.SECURITY_MANAGE_GROUPS;
PERMISSION_KEYS.SECURITY_MANAGE_USERS;
// ... and 40+ more

// ============================================================================
// 4. WORK WITH SECURITY GROUPS
// ============================================================================

import {
  createSecurityGroup,
  addUserToSecurityGroup,
  addPermissionToSecurityGroup,
  listSecurityGroups,
} from "@/lib/security";

const admin = await createAdmin();

// Create a group
const group = await createSecurityGroup(
  admin,
  churchId,
  "Camera Operators",
  "Users who can view and manage cameras",
  currentUserId
);

// Add user to group
const membership = await addUserToSecurityGroup(
  admin,
  group.id,
  userId,
  currentUserId,
  "2026-08-01T00:00:00Z", // effectiveAt (optional)
  "2026-08-31T23:59:59Z"   // expiresAt (optional)
);

// Add permission to group
const perm = await addPermissionToSecurityGroup(
  admin,
  group.id,
  permissionDefinitionId,
  currentUserId,
  "selected_campuses",      // scopeType
  campusId,                 // campusId (required if scopeType is 'selected_campuses')
  "2026-08-01T00:00:00Z",   // effectiveAt (optional)
  "2026-08-31T23:59:59Z",   // expiresAt (optional)
  "Temporary camera access for event"
);

// List all groups
const groups = await listSecurityGroups(admin, churchId);

// ============================================================================
// 5. GRANT DIRECT USER PERMISSIONS
// ============================================================================

import { grantUserPermission, denyUserPermission } from "@/lib/security";

// Grant a permission directly to a user (for exceptions)
const grant = await grantUserPermission(
  admin,
  userId,
  churchId,
  permissionDefinitionId,
  currentUserId,
  "all_current_future_campuses", // scopeType
  null,                           // campusId
  "2026-08-01T08:00:00Z",         // effectiveAt
  "2026-08-05T18:00:00Z",         // expiresAt
  "Temporary access for conference",
  "This user is attending the security conference Aug 1-5"
);

// Deny a permission (explicit override)
const denial = await denyUserPermission(
  admin,
  userId,
  churchId,
  permissionDefinitionId,
  currentUserId,
  "all_current_future_campuses",
  null,
  null,
  null,
  "User account suspended",
  "Temporary denial while account is under review"
);

// ============================================================================
// 6. AUDIT LOGGING
// ============================================================================

import { writeSecurityAuditLog, logUserPermissionGranted } from "@/lib/security";

// Manual audit log (for custom events)
await writeSecurityAuditLog(admin, {
  churchId,
  actorUserId: currentUserId,
  targetUserId: userId,
  eventType: "user_permission.granted",
  newValue: { permission: "incidents.view" },
  reason: "User promoted to security leader",
  result: "success",
});

// Or use a convenience helper
await logUserPermissionGranted(
  admin,
  churchId,
  userId,
  "incidents.delete",
  currentUserId,
  "User promoted to administrator role"
);

// Query audit logs
const { logs, count } = await querySecurityAuditLogs(admin, {
  churchId,
  startDate: new Date("2026-07-01"),
  endDate: new Date("2026-07-31"),
  eventType: "user_permission.granted",
  limit: 50,
});

// ============================================================================
// 7. QUERY SECURITY DATA
// ============================================================================

import {
  getPermissionDefinitionByKey,
  listAllPermissions,
  getUserDirectPermissions,
  getUserSecurityGroups,
} from "@/lib/security";

// Get a permission definition
const permDef = await getPermissionDefinitionByKey(admin, "incidents.view");
console.log(permDef.display_name);     // "View Incidents"
console.log(permDef.risk_level);       // "low"
console.log(permDef.minimum_tier);     // "servant_standard"

// List all permissions
const allPerms = await listAllPermissions(admin);

// Get user's direct permissions
const directPerms = await getUserDirectPermissions(admin, userId, churchId);

// Get user's security groups
const userGroups = await getUserSecurityGroups(admin, userId, churchId);

// ============================================================================
// 8. ROLE-BASED COMPATIBILITY
// ============================================================================

import { ROLE_PERMISSION_MAPPING } from "@/lib/security";

// Existing roles still work and are mapped to permissions
const ownerPermissions = ROLE_PERMISSION_MAPPING.owner;        // 60+ permissions
const adminPermissions = ROLE_PERMISSION_MAPPING.administrator; // 35 permissions
const viewerPermissions = ROLE_PERMISSION_MAPPING.viewer;       // 9 permissions

// When checking authorization, role permissions are checked automatically
// via canUserPerform()

// ============================================================================
// 9. AUTHORIZATION RULES (in order of precedence)
// ============================================================================

/*
1. User must be active
   - Checked via auth.users.user_metadata.disabled

2. Church must be active
   - Checked via churches.status (must be 'active')

3. Feature available under tier
   - Checked via hasFeature() resolver
   - Each permission has a minimum_tier
   - Tier must be >= minimum_tier

4. Permission within temporal range
   - effective_at must be <= now (if set)
   - expires_at must be >= now (if set)

5. User has church membership
   - Checked via church_memberships

6. Campus scope satisfied
   - If campus specified, grant must include that campus
   - Scope types: all_current_future_campuses, all_current_campuses,
                  selected_campuses, primary_campus, no_restriction

7. Explicit user DENY overrides all
   - If user has explicit deny that matches, access is blocked
   - Deny overrides role, group, and direct grants

8. Grants evaluated as OR
   - Any single grant from role/group/direct allows access
   - If at least one grant is active and in scope, allow

9. Default is DENY
   - No grant = denied
   - Absence of permission = no access
*/

// ============================================================================
// 10. SCOPE TYPES
// ============================================================================

/*
all_current_future_campuses:
  - Permission applies to all existing campuses
  - Also applies to any new campuses created in the future
  - Most permissive campus scope

all_current_campuses:
  - Permission applies to all currently existing campuses
  - Does NOT apply to future campuses
  - Used for temporary time-limited access

selected_campuses:
  - Permission applies only to specific campuses
  - campus_id must be set to the specific campus
  - Most restrictive, precise campus control

primary_campus:
  - Permission applies to user's primary campus
  - Primary campus determined by user's campus_memberships record
  - Requires knowing user's primary campus

no_restriction:
  - Permission is organization-wide, not campus-specific
  - Example: church_settings.manage, security.manage_groups
  - campus_id should be NULL
*/

// ============================================================================
// 11. PERMISSION RISK LEVELS
// ============================================================================

/*
low:
  - Standard view operations
  - Examples: dashboard.view, members.view, incidents.view

medium:
  - Create and edit operations
  - Examples: incidents.create, incidents.edit, reports.save

high:
  - Administrative and dangerous operations
  - Examples: incidents.delete, security.manage_groups, notifications.send_emergency
  - Should show confirmation UI
  - Should log prominently
  - Should optionally require dual approval
*/

// ============================================================================
// 12. COMMON PATTERNS
// ============================================================================

// Pattern: Check permission, then perform action
import { isUserAuthorized } from "@/lib/security";

export async function viewIncident(userId, churchId, incidentId) {
  const authorized = await isUserAuthorized(admin, userId, churchId, PERMISSION_KEYS.INCIDENTS_VIEW);
  
  if (!authorized) {
    throw new Error("Unauthorized: You cannot view incidents");
  }

  const incident = await getIncident(incidentId);
  return incident;
}

// Pattern: Check all required permissions before starting operation
export async function createAndExportReport(userId, churchId) {
  await requirePermission(admin, userId, churchId, PERMISSION_KEYS.REPORTS_RUN);
  await requirePermission(admin, userId, churchId, PERMISSION_KEYS.REPORTS_EXPORT);
  
  // All permissions checked, now proceed
  const report = await generateReport();
  const csv = await exportToCSV(report);
  return csv;
}

// Pattern: Audited permission grant
export async function grantTemporaryAccess(targetUserId, permissionKey, reason) {
  const perm = await getPermissionDefinitionByKey(admin, permissionKey);
  
  const grant = await grantUserPermission(
    admin,
    targetUserId,
    churchId,
    perm.id,
    currentUserId,
    "all_current_future_campuses",
    null,
    startDate,
    endDate,
    reason
  );

  await logUserPermissionGranted(
    admin,
    churchId,
    targetUserId,
    permissionKey,
    currentUserId,
    reason
  );

  return grant;
}

// ============================================================================
// For complete documentation, see:
// - DESIGN_SECURITY_SYSTEM.md
// - PHASE_3_COMPLETION_REPORT.md
// - lib/security/types.ts (type definitions)
// - lib/security/authorization.ts (authorization logic)
// - lib/security/repository.ts (data access)
// ============================================================================
