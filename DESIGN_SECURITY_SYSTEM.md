# Sanctuary Protected: Security Permissions & Access Control System

**Design Document**  
**Status:** Phase 2 Design Specification  
**Last Updated:** July 26, 2026

---

## 1. Executive Summary

This document specifies the architecture and implementation approach for Sanctuary Protected's comprehensive security permissions and access-control system. The system enables authorized church leaders to manage which users can access specific tools, features, records, campuses, and actions within their church organization.

**Key Design Decisions:**

1. **Group-based primary model** with direct-permission exceptions
2. **Permission catalog** (structured keys, not hard-coded checks)
3. **Multi-layer precedence:** Subscription tier > Role > Group > Campus scope > Date/time > Direct exceptions
4. **Authorization service** for centralized, reusable permission evaluation
5. **Audit logging** for all security changes with immutable records
6. **Default-deny** security model with explicit grants
7. **Server-side enforcement only** (UI restrictions for usability only)
8. **Backward compatible** with existing roles and access patterns

---

## 2. Architectural Overview

### 2.1 Current State Analysis

**Existing Components:**
- **Authentication:** Supabase Auth with session cookies
- **Tenancy:** `church_id` + RLS for multi-tenant isolation
- **Roles:** 6 church roles (owner, co_owner, administrator, security_leader, security_member, viewer) with rank-based access
- **Campus:** Operational subdivisions under a church; partial access control implemented
- **Tiers:** Feature-key subscription model; gates features but not granular permissions
- **Audit:** Comprehensive action logging for church-wide operations

**Gaps to Address:**
- No fine-grained permission model (beyond role)
- No security groups / group-based access control
- No direct user-level permissions (exceptions)
- No temporal access (effective/expiration dates)
- No centralized authorization service
- Limited campus-scoped permission enforcement
- Subscription tier restrictions on specific operations not fully implemented
- No permission conflict detection or resolution

### 2.2 New Architecture Components

```
Authentication (Supabase Auth + Session)
    ↓
Church Context (validated church_id + membership)
    ↓
Authorization Service
    ├── Permission Catalog (structured keys, metadata)
    ├── Group-based grants (security_groups, security_group_permissions)
    ├── Direct-permission exceptions (user_permissions)
    ├── Subscription tier gating (feature_keys)
    ├── Campus scope evaluation
    ├── Temporal validation (effective/expiration)
    └── Conflict detection
    ↓
Result: { allowed: boolean, reason: string, source: string, message: string }
    ↓
Server-side enforcement (API routes, server actions, RLS)
    ↓
Audit Log (immutable records of all security changes)
```

### 2.3 Principle: Default Deny

- All access begins as denied
- Access is granted only by explicit permission assignments
- Role, group, and direct grants are evaluated against a centralized permission catalog
- Subscription tier restrictions always take precedence
- The absence of a denial is not permission

---

## 3. Permission Catalog

### 3.1 Permission Key Structure

Permission keys use a hierarchical dot-separated format:

```
{feature}.{action}
```

Examples:
- `dashboard.view`
- `incidents.create`
- `reports.export`
- `cameras.manage`

### 3.2 Permission Categories and Keys

```typescript
const PERMISSION_CATALOG = {
  // Dashboard
  DASHBOARD_VIEW: "dashboard.view",

  // Members / Users
  MEMBERS_VIEW: "members.view",
  MEMBERS_CREATE: "members.create",
  MEMBERS_EDIT: "members.edit",
  MEMBERS_DEACTIVATE: "members.deactivate",

  // Security Groups
  GROUPS_VIEW: "groups.view",
  GROUPS_CREATE: "groups.create",
  GROUPS_EDIT: "groups.edit",
  GROUPS_DELETE: "groups.delete",
  GROUPS_MANAGE: "groups.manage",
  GROUPS_MANAGE_MEMBERS: "groups.manage_members",

  // Incidents
  INCIDENTS_VIEW: "incidents.view",
  INCIDENTS_CREATE: "incidents.create",
  INCIDENTS_EDIT: "incidents.edit",
  INCIDENTS_DELETE: "incidents.delete",
  INCIDENTS_EXPORT: "incidents.export",
  INCIDENTS_VIEW_SENSITIVE: "incidents.view_sensitive",
  INCIDENTS_EDIT_SENSITIVE: "incidents.edit_sensitive",
  INCIDENTS_VIEW_ALL_CAMPUSES: "incidents.view_all_campuses",
  INCIDENTS_DELETE_ARCHIVE: "incidents.delete_archive",

  // Reports
  REPORTS_VIEW: "reports.view",
  REPORTS_RUN: "reports.run",
  REPORTS_SAVE: "reports.save",
  REPORTS_EDIT: "reports.edit",
  REPORTS_DELETE: "reports.delete",
  REPORTS_EXPORT: "reports.export",
  REPORTS_SCHEDULE: "reports.schedule",
  REPORTS_MANAGE_DEFINITIONS: "reports.manage_definitions",
  REPORTS_VIEW_ALL_CAMPUSES: "reports.view_all_campuses",

  // Cameras
  CAMERAS_VIEW_LIVE: "cameras.view_live",
  CAMERAS_VIEW_RECORDINGS: "cameras.view_recordings",
  CAMERAS_DOWNLOAD_RECORDINGS: "cameras.download_recordings",
  CAMERAS_MANAGE: "cameras.manage",

  // Notifications
  NOTIFICATIONS_SEND: "notifications.send",
  NOTIFICATIONS_SEND_EMERGENCY: "notifications.send_emergency",
  NOTIFICATIONS_MANAGE_TEMPLATES: "notifications.manage_templates",

  // Events
  EVENTS_VIEW: "events.view",
  EVENTS_CREATE: "events.create",
  EVENTS_EDIT: "events.edit",
  EVENTS_ASSIGN_TEAM: "events.assign_team",
  EVENTS_MANAGE: "events.manage",

  // Policies
  POLICIES_VIEW: "policies.view",
  POLICIES_CREATE: "policies.create",
  POLICIES_EDIT: "policies.edit",
  POLICIES_PUBLISH: "policies.publish",

  // Training & Certifications
  TRAINING_VIEW: "training.view",
  TRAINING_MANAGE: "training.manage",
  CERTIFICATIONS_VIEW: "certifications.view",
  CERTIFICATIONS_MANAGE: "certifications.manage",

  // Equipment
  EQUIPMENT_VIEW: "equipment.view",
  EQUIPMENT_MANAGE: "equipment.manage",

  // Campuses
  CAMPUSES_VIEW: "campuses.view",
  CAMPUSES_MANAGE: "campuses.manage",

  // Security Administration
  SECURITY_VIEW: "security.view",
  SECURITY_MANAGE_GROUPS: "security.manage_groups",
  SECURITY_MANAGE_USERS: "security.manage_users",
  SECURITY_GRANT_DIRECT_PERMISSIONS: "security.grant_direct_permissions",
  SECURITY_MANAGE_TEMPORARY_ACCESS: "security.manage_temporary_access",
  SECURITY_VIEW_AUDIT_LOG: "security.view_audit_log",
  SECURITY_PREVIEW_ACCESS: "security.preview_access",

  // Church Settings
  CHURCH_SETTINGS_VIEW: "church_settings.view",
  CHURCH_SETTINGS_MANAGE: "church_settings.manage",
};
```

### 3.3 Permission Metadata

Each permission definition includes:

```typescript
interface PermissionDefinition {
  key: string;                    // e.g., "incidents.view"
  category: string;               // e.g., "incidents"
  displayName: string;            // e.g., "View Incidents"
  description: string;
  riskLevel: "low" | "medium" | "high";
  minimumTier: string;            // e.g., "servant_standard", "omni_enterprise"
  supportsCampusScope: boolean;
  supportsResourceScope: boolean;
  active: boolean;
}
```

**Risk Levels:**
- **Low:** Standard operations (view, create)
- **Medium:** Modifications (edit, delete data)
- **High:** Administrative (manage groups, security settings, delete/archive incidents, emergency notifications, export sensitive data)

**Tier Mapping:**
```
servant_standard:
  - dashboard.view
  - members.view
  - incidents.view
  - reports.view
  - events.view
  - policies.view
  - campuses.view

steward_pro:
  - [all servant_standard permissions]
  - incidents.create
  - reports.run, reports.save
  - events.create, events.edit
  - policies.create
  - incidents.edit
  - reports.export

shepherd_plus:
  - [all steward_pro permissions]
  - incidents.delete, incidents.export
  - incidents.view_sensitive, incidents.edit_sensitive
  - reports.edit, reports.delete, reports.manage_definitions
  - events.manage
  - cameras.view_live
  - notifications.send
  - training.manage

omni_enterprise:
  - [all shepherd_plus permissions]
  - incidents.view_all_campuses, incidents.delete_archive
  - reports.view_all_campuses, reports.schedule
  - cameras.view_recordings, cameras.download_recordings, cameras.manage
  - notifications.send_emergency
  - security.manage_groups, security.manage_users, security.grant_direct_permissions
  - church_settings.manage
```

---

## 4. Data Model

### 4.1 New Database Tables

#### `security_groups`
```sql
CREATE TABLE security_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  
  -- Temporal scope (optional; applies to all memberships and permissions in the group)
  effective_at timestamp with time zone,
  expires_at timestamp with time zone,
  
  -- Audit
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Metadata
  system_template boolean DEFAULT false,
  notes text,
  
  UNIQUE (church_id, name) WHERE status = 'active'
);

CREATE INDEX idx_security_groups_church_id ON security_groups(church_id);
CREATE INDEX idx_security_groups_status ON security_groups(status);
```

#### `security_group_members`
```sql
CREATE TABLE security_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_group_id uuid NOT NULL REFERENCES security_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Temporal scope (optional; specific to this membership)
  effective_at timestamp with time zone,
  expires_at timestamp with time zone,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  
  -- Audit
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  removed_by uuid,
  removed_at timestamp with time zone,
  
  UNIQUE (security_group_id, user_id) WHERE status = 'active'
);

CREATE INDEX idx_security_group_members_user_id ON security_group_members(user_id);
CREATE INDEX idx_security_group_members_group_id ON security_group_members(security_group_id);
```

#### `permission_definitions`
```sql
CREATE TABLE permission_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  category text NOT NULL,
  display_name text NOT NULL,
  description text,
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  minimum_tier text NOT NULL DEFAULT 'servant_standard',
  supports_campus_scope boolean DEFAULT true,
  supports_resource_scope boolean DEFAULT false,
  active boolean DEFAULT true,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE (permission_key)
);

CREATE INDEX idx_permission_definitions_category ON permission_definitions(category);
```

#### `security_group_permissions`
```sql
CREATE TABLE security_group_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_group_id uuid NOT NULL REFERENCES security_groups(id) ON DELETE CASCADE,
  permission_definition_id uuid NOT NULL REFERENCES permission_definitions(id),
  
  -- Permission state
  permission_effect text NOT NULL DEFAULT 'grant' CHECK (permission_effect IN ('grant', 'deny')),
  
  -- Scope
  scope_type text NOT NULL DEFAULT 'all_current_future_campuses' CHECK (
    scope_type IN (
      'all_current_future_campuses',   -- All now and future
      'all_current_campuses',           -- All existing only
      'selected_campuses',              -- Specific campuses
      'primary_campus',                 -- User's primary
      'no_restriction'                  -- Organization-wide
    )
  ),
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  resource_type text,
  resource_id text,
  
  -- Temporal scope (optional)
  effective_at timestamp with time zone,
  expires_at timestamp with time zone,
  
  -- Audit
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  reason text,
  
  UNIQUE (security_group_id, permission_definition_id, scope_type, campus_id, resource_type, resource_id)
);

CREATE INDEX idx_security_group_permissions_group_id ON security_group_permissions(security_group_id);
CREATE INDEX idx_security_group_permissions_permission_id ON security_group_permissions(permission_definition_id);
```

#### `user_permissions`
```sql
CREATE TABLE user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_definition_id uuid NOT NULL REFERENCES permission_definitions(id),
  
  -- Permission state
  permission_effect text NOT NULL DEFAULT 'grant' CHECK (permission_effect IN ('grant', 'deny')),
  
  -- Scope
  scope_type text NOT NULL DEFAULT 'all_current_future_campuses' CHECK (
    scope_type IN (
      'all_current_future_campuses',
      'all_current_campuses',
      'selected_campuses',
      'primary_campus',
      'no_restriction'
    )
  ),
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  resource_type text,
  resource_id text,
  
  -- Temporal scope (optional)
  effective_at timestamp with time zone,
  expires_at timestamp with time zone,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'scheduled', 'expired', 'revoked')
  ),
  
  -- Audit
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_by uuid,
  revoked_at timestamp with time zone,
  reason text,
  notes text,
  
  UNIQUE (user_id, permission_definition_id, scope_type, campus_id, resource_type, resource_id)
    WHERE permission_effect = 'grant' AND status != 'revoked'
);

CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_church_id ON user_permissions(church_id);
CREATE INDEX idx_user_permissions_status ON user_permissions(status);
```

#### `security_audit_logs`
```sql
CREATE TABLE security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id),
  campus_id uuid REFERENCES campuses(id),
  
  -- Actors
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  
  -- Related entities
  security_group_id uuid REFERENCES security_groups(id),
  permission_definition_id uuid REFERENCES permission_definitions(id),
  
  -- Event details
  event_type text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  
  -- Result
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  failure_reason text,
  
  -- Network
  ip_address inet,
  user_agent text,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Immutability (no UPDATE, no DELETE)
  CHECK (created_at IS NOT NULL)
);

CREATE INDEX idx_security_audit_logs_church_id ON security_audit_logs(church_id);
CREATE INDEX idx_security_audit_logs_actor_user_id ON security_audit_logs(actor_user_id);
CREATE INDEX idx_security_audit_logs_target_user_id ON security_audit_logs(target_user_id);
CREATE INDEX idx_security_audit_logs_event_type ON security_audit_logs(event_type);
CREATE INDEX idx_security_audit_logs_created_at ON security_audit_logs(created_at);
```

### 4.2 Migration Strategy

**New migrations:**
1. `057_security_groups.sql` — Create `security_groups` and `security_group_members`
2. `058_permission_definitions.sql` — Create `permission_definitions`
3. `059_security_group_permissions.sql` — Create `security_group_permissions`
4. `060_user_permissions.sql` — Create `user_permissions`
5. `061_security_audit_logs.sql` — Create `security_audit_logs`
6. `062_security_rls_policies.sql` — Add RLS policies for all security tables
7. `063_security_default_permissions.sql` — Seed permission definitions and role → permission mappings

**Backward Compatibility:**
- Existing roles continue to work via role-to-permission mapping
- Migration maps existing `membership_role` to default security groups
- No deletion of existing data; new system layers on top

---

## 5. Authorization Service

### 5.1 Authorization Function

```typescript
interface AuthorizationRequest {
  userId: string;
  churchId: string;
  campusId?: string | null;
  permissionKey: string;
  resourceId?: string | null;
  actionDate?: Date;
}

interface AuthorizationResult {
  allowed: boolean;
  reason:
    | "USER_ACTIVE"
    | "USER_INACTIVE"
    | "CHURCH_INACTIVE"
    | "TIER_FEATURE_UNAVAILABLE"
    | "PERMISSION_NOT_GRANTED"
    | "PERMISSION_EXPIRED"
    | "PERMISSION_NOT_ACTIVE"
    | "EXPLICIT_USER_DENY"
    | "CAMPUS_ACCESS_DENIED"
    | "RESOURCE_ACCESS_DENIED"
    | "DATA_CLASSIFICATION_DENIED"
    | "GROUP_MEMBERSHIP_EXPIRED";
  source?: "ROLE" | "GROUP" | "DIRECT" | "INHERITED";
  message: string;
  expiresAt?: Date;
  denialDetails?: {
    deniedBy: "USER" | "GROUP" | "TIER";
    groupId?: string;
    reason?: string;
  };
}

export async function canUserPerform(
  request: AuthorizationRequest,
): Promise<AuthorizationResult> {
  const { userId, churchId, campusId, permissionKey, resourceId, actionDate = new Date() } = request;

  // 1. User must exist and be active
  const user = await getUser(userId);
  if (!user || user.disabled) {
    return {
      allowed: false,
      reason: "USER_INACTIVE",
      message: "Your account is not active.",
    };
  }

  // 2. Church must exist and be active
  const church = await getChurch(churchId);
  if (!church || church.status !== "active") {
    return {
      allowed: false,
      reason: "CHURCH_INACTIVE",
      message: "The church organization is not active.",
    };
  }

  // 3. User must be a member of the church
  const membership = await getChurchMembership(userId, churchId);
  if (!membership || membership.status !== "active") {
    return {
      allowed: false,
      reason: "PERMISSION_NOT_GRANTED",
      message: "You do not have access to this church.",
    };
  }

  // 4. Get permission definition
  const permission = await getPermissionDefinition(permissionKey);
  if (!permission || !permission.active) {
    return {
      allowed: false,
      reason: "PERMISSION_NOT_GRANTED",
      message: "This permission does not exist.",
    };
  }

  // 5. Check tier availability
  const tierResult = await checkTierAvailability(churchId, permission);
  if (!tierResult.available) {
    return {
      allowed: false,
      reason: "TIER_FEATURE_UNAVAILABLE",
      message: `This feature requires the ${tierResult.requiredTier} plan.`,
    };
  }

  // 6. Check explicit user-level DENY (highest priority exception)
  const userDeny = await getUserPermission(userId, churchId, permissionKey, "deny");
  if (userDeny && isPermissionActive(userDeny, actionDate)) {
    if (!campusId || isCampusInScope(userDeny, campusId)) {
      return {
        allowed: false,
        reason: "EXPLICIT_USER_DENY",
        source: "DIRECT",
        message: `You have been explicitly denied access to this feature${userDeny.reason ? ": " + userDeny.reason : ""}.`,
        denialDetails: {
          deniedBy: "USER",
          reason: userDeny.reason,
        },
      };
    }
  }

  // 7. Collect all potential grants (role-based, group-based, direct)
  const grants: PermissionGrant[] = [];

  // 7a. Role-based grants
  const roleGrants = getRolePermissions(membership.role, permissionKey);
  grants.push(...roleGrants);

  // 7b. Group-based grants
  const groupGrants = await getGroupPermissions(userId, churchId, permissionKey);
  grants.push(...groupGrants);

  // 7c. Direct user grants
  const directGrant = await getUserPermission(userId, churchId, permissionKey, "grant");
  if (directGrant) {
    grants.push(directGrant);
  }

  // 8. Filter grants by temporal validity
  const activeGrants = grants.filter((g) => isPermissionActive(g, actionDate));

  if (activeGrants.length === 0) {
    return {
      allowed: false,
      reason: "PERMISSION_NOT_GRANTED",
      message: "You do not have permission to perform this action.",
    };
  }

  // 9. Check campus scope
  if (campusId) {
    const campusAccessible = activeGrants.some((g) => isCampusInScope(g, campusId));
    if (!campusAccessible) {
      return {
        allowed: false,
        reason: "CAMPUS_ACCESS_DENIED",
        message: `You do not have permission to access this campus.`,
      };
    }
  }

  // 10. Determine expiration
  const expiresAt = activeGrants.reduce(
    (earliest, grant) => (grant.expires_at && (!earliest || grant.expires_at < earliest) ? grant.expires_at : earliest),
    undefined as Date | undefined,
  );

  return {
    allowed: true,
    reason: "USER_ACTIVE",
    source: activeGrants[0].source || "ROLE",
    message: "You have permission to perform this action.",
    expiresAt,
  };
}
```

### 5.2 Permission Resolution Rules (Precedence)

1. **User must be active** — disabled users are always denied
2. **Church must be active** — suspended/closed churches deny all access
3. **Feature must be available under tier** — tier restrictions always take precedence
4. **Permission must be within temporal range** — effective/expiration dates are checked
5. **User must have church membership** — non-members are always denied
6. **Campus scope must be satisfied** — if a permission is campus-scoped, user must have access to that campus
7. **Explicit user DENY overrides everything** — an individual denial blocks even role/group access
8. **Grants are evaluated as OR** — any single grant from role/group/direct makes access allowed
9. **Default is DENY** — absence of a grant means denial

---

## 6. Security Settings UI

### 6.1 Page Structure

The new `/settings/security` page (replacing placeholder) will have tabbed sections:

```
Settings > Security
├── Overview
├── Security Groups
├── Users and Access
├── Permission Catalog
├── Campus Access
├── Temporary Access
├── Access Audit Log
└── Settings
```

### 6.2 Overview Tab

Dashboard showing:
- Total active security groups
- Total active users with permissions
- Users with direct permissions (count)
- Users with temporary permissions (count)
- Permissions expiring within 7 days
- Permissions expiring within 30 days
- Users with access to all campuses
- Users with camera access
- Recently expired permissions
- Recently modified permissions

**Warning Cards:**
- Temporary access nearing expiration
- Users without a security group
- Conflicting permission assignments
- Users with unusually broad permissions
- Users with access to inactive campuses

### 6.3 Security Groups Tab

**View/List:**
- Table of groups with name, description, member count, permission count, status, actions

**Create Group:**
- Modal form: name, description, optional system template copy
- If template selected, pre-populate permissions

**Edit Group:**
- Manage name, description, status
- View/edit members (add/remove, set temporal scope)
- View/edit permissions (add/remove, set scope)
- View change history

**Duplicate Group:**
- Copy permissions and member list to a new group
- Allow name customization

**Delete Group:**
- Only if no active members

### 6.4 Users and Access Tab

**User List:**
- Searchable, filterable list of church users
- Columns: name, email, role, account status, assigned groups, direct permissions, temporary permissions, next expiration, last login

**Filters:**
- Name, email, role, security group, campus, permission, active/inactive, temporary access, expiring soon, direct permissions, broad access, no group

**User Detail Page:**
- Overview: basic info, current role, account status
- Permissions breakdown:
  - Role-based permissions (read-only)
  - Group-based permissions (with group names, temporal info)
  - Direct permissions (grants and denials)
  - Campus assignments
  - Temporary access (with countdown or status)
  - Conflict warnings
  - Expiring permissions with action buttons
- History: timeline of permission changes

### 6.5 Permission Catalog Tab

**View/Search:**
- Organized by category (dashboard, incidents, reports, cameras, etc.)
- Each permission shows:
  - Display name
  - Description
  - Risk level (visual indicator)
  - Minimum tier required
  - Campus scope support
  - Number of groups using this permission
  - Number of direct user grants

**Filter/Sort:**
- By category, risk level, tier, support for campus scope

### 6.6 Campus Access Tab

**Configuration:**
- For each group/user, show campus scope options
- Visualize scope in a table: user/group × campus matrix

### 6.7 Temporary Access Tab

**Active/Scheduled:**
- Table of temporary assignments
- Columns: user, permission, scope, effective date, expiration date, status, actions

**Create Temporary Access:**
- User selection
- Permission selection (dropdown, searchable)
- Campus selection (single or multiple)
- Effective date/time with timezone
- Expiration date/time with timezone
- Business reason (required)
- Notes (optional)
- Confirmation summary before saving

**Manage (Extend, Revoke, etc.):**
- Buttons on each row to extend, revoke, shorten

### 6.8 Access Audit Log Tab

**View/Filter:**
- Filterable table of security events
- Columns: timestamp, event type, actor, target user, permission/group, result, reason

**Filters:**
- Date range, actor, target user, security group, permission, event type, successful/failed, high-risk

### 6.9 Settings Tab

**Access Preview Tool:**
- Select: user, campus, permission, date/time
- Display: allowed/denied, reason, source, expiration

**High-Risk Permission Warnings:**
- Toggle for confirmation requirements
- Email notification settings for high-risk actions

---

## 7. Backward Compatibility & Migration

### 7.1 Role-to-Permission Mapping

Existing roles will be mapped to default permissions:

```typescript
const ROLE_PERMISSION_MAPPING = {
  viewer: [
    "dashboard.view",
    "members.view",
    "incidents.view",
    "reports.view",
    "events.view",
    "policies.view",
    "campuses.view",
  ],
  security_member: [
    ...viewer,
    "incidents.create",
    "events.view",
  ],
  security_leader: [
    ...security_member,
    "incidents.edit",
    "incidents.create",
    "members.view",
    "events.view",
    "events.edit",
    "events.assign_team",
    "policies.view",
    "notifications.send",
    "reports.run",
    "reports.view",
  ],
  administrator: [
    ...security_leader,
    "members.create",
    "members.edit",
    "members.deactivate",
    "events.manage",
    "incidents.edit",
    "incidents.export",
    "incidents.view_sensitive",
    "incidents.edit_sensitive",
    "reports.export",
    "reports.edit",
    "reports.save",
    "policies.create",
    "policies.edit",
    "policies.publish",
    "certifications.manage",
    "training.manage",
    "equipment.manage",
    "campuses.manage",
    "church_settings.view",
    "church_settings.manage",
    "security.view",
    "security.manage_groups",
    "security.manage_users",
    "security.view_audit_log",
  ],
  co_owner: [
    ...administrator,
    "incidents.delete",
    "incidents.delete_archive",
    "incidents.view_all_campuses",
    "reports.view_all_campuses",
    "reports.schedule",
    "reports.manage_definitions",
    "security.grant_direct_permissions",
    "security.manage_temporary_access",
    "notifications.send_emergency",
    "cameras.view_live",
  ],
  owner: [
    ...co_owner,
    "cameras.view_recordings",
    "cameras.download_recordings",
    "cameras.manage",
  ],
};
```

### 7.2 Migration Steps

1. **Create permission definitions** from the catalog
2. **Seed default role → permission mappings**
3. **Create default security groups** (optional, for convenience)
4. **Test that existing roles still work** with new authorization service
5. **Gradually migrate** to group-based model (optional, not required)

---

## 8. Testing Strategy

### 8.1 Unit Tests

- Permission definition lookup
- Permission key validation
- Temporal validation (active/expired)
- Campus scope matching
- Tier availability checking

### 8.2 Integration Tests

- Tier restriction blocks unauthorized permission
- Group permission grants access
- Direct user grant grants access
- Direct user deny overrides group grant
- Expired permission denies access
- Future-dated permission denies access before activation
- Temporary permission allows access during valid period
- Campus restriction blocks access to another campus
- All-campus permission allows cross-campus access
- Inactive user is denied
- Inactive church organization is denied
- Unauthorized admin cannot grant elevated permissions
- User cannot elevate their own permissions
- Report results exclude unauthorized campuses
- Incident search excludes unauthorized campuses
- Camera access stops after expiration
- Tier downgrade disables access without deleting config
- Audit log records security changes
- High-risk permission requires confirmation and reason
- Access Preview matches real authorization

### 8.3 Multi-Tenant Tests

- User A at Church A cannot access Church B's permissions
- Users at the same church are properly isolated by campus
- Tier changes at one church don't affect other churches

---

## 9. Implementation Order

1. **Phase 3a:** Database migrations (tables, RLS)
2. **Phase 3b:** Permission definitions and role mappings
3. **Phase 3c:** Authorization service and helper functions
4. **Phase 3d:** Server-side enforcement in API routes and server actions
5. **Phase 3e:** Audit logging integration
6. **Phase 4a:** UI components (tables, forms, modals)
7. **Phase 4b:** Security Groups tab
8. **Phase 4c:** Users and Access tab
9. **Phase 4d:** Overview, Catalog, Temporary Access tabs
10. **Phase 4e:** Audit Log and Access Preview
11. **Phase 5:** Comprehensive tests
12. **Phase 6:** Review and documentation

---

## 10. Security Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Privilege escalation | Authorization checks at every layer; user cannot assign permissions they don't have; delegated admin scope enforced |
| Temporal bypass | Tokens revalidated on each request; no long-lived authorization tokens |
| Tier bypass | Tier check happens before permission grant; cannot be overridden |
| Data leakage via campus bypass | Database RLS enforces campus restrictions; API layer validates campus scope; reports filter by authorized campuses |
| Audit log tampering | Database trigger prevents UPDATE/DELETE on audit logs; immutability enforced at DB level |
| Multi-tenant isolation | RLS policies on all tables; church_id checked in every query; no implicit church context |
| Denial of Service | Rate limiting on auth/permission checks; efficient database queries with indexes |

---

## 11. Future Enhancements

- Resource-level permissions (specific camera, report, incident)
- Dual approval for high-risk permissions
- SMS and push notifications for permission changes
- Permission delegation workflows
- Data classification restrictions
- Time-of-day access restrictions (beyond date scope)
- Geographic access restrictions
- Device authentication requirements
- Biometric/MFA requirements for high-risk actions

---

**End of Design Document**
