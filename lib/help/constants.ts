import type {
  HelpArticleStatus,
  HelpArticleType,
  HelpAudienceScope,
  HelpBodyFormat,
  HelpCategoryStatus,
  HelpDifficulty,
  HelpRelationType,
} from "@/lib/help/types";

export const HELP_MIGRATION_HINT =
  "Help Center is not configured yet. Run supabase/migrations/051–054 (permission category, schema, search trigger fix, then initial content) in the Supabase SQL Editor.";

export const DEFAULT_HELP_SEARCH_LIMIT = 20;
export const MAX_HELP_SEARCH_LIMIT = 50;
export const MAX_HELP_SEARCH_QUERY_LENGTH = 200;

export const HELP_CATEGORY_STATUSES: {
  value: HelpCategoryStatus;
  label: string;
}[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

export const HELP_ARTICLE_STATUSES: {
  value: HelpArticleStatus;
  label: string;
}[] = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export const HELP_ARTICLE_TYPES: {
  value: HelpArticleType;
  label: string;
}[] = [
  { value: "overview", label: "Overview" },
  { value: "how_to", label: "How-to" },
  { value: "workflow", label: "Workflow" },
  { value: "reference", label: "Reference" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "faq", label: "FAQ" },
  { value: "release_note", label: "Release note" },
];

export const HELP_BODY_FORMATS: {
  value: HelpBodyFormat;
  label: string;
}[] = [
  { value: "markdown", label: "Markdown" },
  { value: "structured_json", label: "Structured JSON" },
  { value: "rich_text", label: "Rich text" },
];

export const HELP_AUDIENCE_SCOPES: {
  value: HelpAudienceScope;
  label: string;
}[] = [
  { value: "all_authenticated", label: "All authenticated users" },
  { value: "church_members", label: "Church members" },
  { value: "security_team", label: "Security team" },
  { value: "church_admins", label: "Church administrators" },
  { value: "platform_operators", label: "Platform operators only" },
];

export const HELP_DIFFICULTIES: {
  value: HelpDifficulty;
  label: string;
}[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export const HELP_RELATION_TYPES: {
  value: HelpRelationType;
  label: string;
}[] = [
  { value: "related", label: "Related" },
  { value: "prerequisite", label: "Prerequisite" },
  { value: "next_step", label: "Next step" },
  { value: "previous_step", label: "Previous step" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "upgrade_information", label: "Upgrade information" },
];

export const HELP_SUPPORT_PATH = "/help";

/** Initial topic tree for Phase 8 seeding (stable slugs). */
export const HELP_SEED_CATEGORY_TREE: {
  name: string;
  slug: string;
  description: string;
  children?: { name: string; slug: string; description: string }[];
}[] = [
  {
    name: "Getting Started",
    slug: "getting-started",
    description: "Welcome, setup, and first-week guidance.",
    children: [
      {
        name: "First week",
        slug: "getting-started-first-week",
        description: "Welcome and initial setup checklist.",
      },
    ],
  },
  {
    name: "Dashboard",
    slug: "dashboard",
    description: "Home dashboard, threat level, and boxes.",
  },
  {
    name: "Churches & Campuses",
    slug: "churches-campuses",
    description: "Church settings and multi-campus management.",
  },
  {
    name: "Members & Teams",
    slug: "members-teams",
    description: "Invitations, roles, teams, and certifications.",
    children: [
      {
        name: "Invitations",
        slug: "members-invitations",
        description: "Invite and onboard church members.",
      },
    ],
  },
  {
    name: "Events & Scheduling",
    slug: "events-scheduling",
    description: "Events, shifts, availability, and assignments.",
    children: [
      {
        name: "Events",
        slug: "scheduling-events",
        description: "Create and manage schedule events.",
      },
      {
        name: "Shifts",
        slug: "scheduling-shifts",
        description: "Create shifts and assign members.",
      },
    ],
  },
  {
    name: "Incidents",
    slug: "incidents",
    description: "Logging incidents, photos, and analytics.",
  },
  {
    name: "Notifications",
    slug: "notifications",
    description: "Groups, email, SMS, and preferences.",
    children: [
      {
        name: "Groups",
        slug: "notification-groups",
        description: "Build groups for messaging.",
      },
      {
        name: "Email",
        slug: "notification-email",
        description: "Send group email notifications.",
      },
    ],
  },
  {
    name: "Medical Supplies",
    slug: "medical-supplies",
    description: "Inventory and incident usage.",
  },
  {
    name: "Security Hardware",
    slug: "security-hardware",
    description: "Hardware inventory and maintenance.",
  },
  {
    name: "Policies",
    slug: "policies",
    description: "Policies and procedures library.",
  },
  {
    name: "Known Safety Concerns",
    slug: "known-safety-concerns",
    description: "Safety concern profiles and reviews.",
  },
  {
    name: "Cameras & Sensors",
    slug: "cameras-sensors",
    description: "Cameras, sensors, and alarms.",
  },
  {
    name: "Reports",
    slug: "reports",
    description: "Analytics and reporting.",
  },
  {
    name: "Subscription & Billing",
    slug: "subscription-billing",
    description: "Plans, entitlements, and billing.",
  },
  {
    name: "Account & Security",
    slug: "account-security",
    description: "Profile, MFA, and account settings.",
  },
  {
    name: "Troubleshooting",
    slug: "troubleshooting",
    description: "Common problems and fixes.",
  },
];

/** Stable article slugs seeded in migration 054 (insert-if-absent only). */
export const HELP_SEED_ARTICLE_SLUGS = [
  "welcome-to-sanctuary-protected",
  "initial-setup-checklist",
  "invite-church-members",
  "create-an-event",
  "create-a-shift",
  "assign-members-to-shifts",
  "log-a-security-incident",
  "create-a-notification-group",
  "send-a-group-email",
  "subscription-plans-overview",
  "get-help-and-support",
] as const;

export function helpMigrationHintFromError(message: string): string | null {
  if (
    /help_categories|help_articles|help_article_|search_help_articles|PGRST205|42P01|does not exist/i.test(
      message,
    )
  ) {
    return HELP_MIGRATION_HINT;
  }
  return null;
}

export function labelForHelpArticleType(value: HelpArticleType): string {
  return HELP_ARTICLE_TYPES.find((item) => item.value === value)?.label ?? value;
}

export function labelForHelpRelationType(value: HelpRelationType): string {
  return HELP_RELATION_TYPES.find((item) => item.value === value)?.label ?? value;
}
