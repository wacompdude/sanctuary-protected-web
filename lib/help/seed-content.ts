import {
  HELP_SEED_ARTICLE_SLUGS,
  HELP_SEED_CATEGORY_TREE,
} from "@/lib/help/constants";

/**
 * Catalog of product Help articles. Database rows are upserted by
 * `086_help_center_content_expansion.sql` (054 inserted the original 11
 * slugs if absent). Re-running 086 updates these product-owned slugs.
 */
export type HelpSeedArticleCatalogItem = {
  slug: (typeof HELP_SEED_ARTICLE_SLUGS)[number];
  title: string;
  category_slug: string;
  article_type: string;
  feature_keys?: string[];
};

export const HELP_SEED_ARTICLE_CATALOG: HelpSeedArticleCatalogItem[] = [
  {
    slug: "welcome-to-sanctuary-protected",
    title: "Welcome to Sanctuary Protected",
    category_slug: "getting-started-first-week",
    article_type: "overview",
  },
  {
    slug: "initial-setup-checklist",
    title: "Initial setup checklist",
    category_slug: "getting-started-first-week",
    article_type: "workflow",
  },
  {
    slug: "invite-church-members",
    title: "Invite church members",
    category_slug: "members-invitations",
    article_type: "how_to",
  },
  {
    slug: "create-an-event",
    title: "Create an event",
    category_slug: "scheduling-events",
    article_type: "how_to",
    feature_keys: ["scheduling.team.enabled"],
  },
  {
    slug: "create-a-shift",
    title: "Create a shift",
    category_slug: "scheduling-shifts",
    article_type: "how_to",
    feature_keys: ["scheduling.team.enabled"],
  },
  {
    slug: "assign-members-to-shifts",
    title: "Assign members to shifts",
    category_slug: "scheduling-shifts",
    article_type: "how_to",
    feature_keys: ["scheduling.team.enabled"],
  },
  {
    slug: "log-a-security-incident",
    title: "Log a security incident",
    category_slug: "incidents",
    article_type: "how_to",
    feature_keys: ["incidents.logging.enabled"],
  },
  {
    slug: "create-a-notification-group",
    title: "Create a notification group",
    category_slug: "notification-groups",
    article_type: "how_to",
  },
  {
    slug: "send-a-group-email",
    title: "Send a group email",
    category_slug: "notification-email",
    article_type: "how_to",
    feature_keys: ["messaging.group_email.enabled"],
  },
  {
    slug: "subscription-plans-overview",
    title: "Subscription plans overview",
    category_slug: "subscription-billing",
    article_type: "overview",
  },
  {
    slug: "get-help-and-support",
    title: "Get help and support",
    category_slug: "troubleshooting",
    article_type: "faq",
  },
  {
    slug: "church-settings-overview",
    title: "Church settings",
    category_slug: "church-settings",
    article_type: "overview",
  },
  {
    slug: "selecting-a-time-zone",
    title: "Selecting a time zone",
    category_slug: "church-settings",
    article_type: "how_to",
  },
  {
    slug: "understanding-url-names",
    title: "Understanding URL Names (slugs)",
    category_slug: "church-settings",
    article_type: "reference",
  },
  {
    slug: "church-contact-information",
    title: "Church contact information",
    category_slug: "church-settings",
    article_type: "how_to",
  },
  {
    slug: "campuses-overview",
    title: "Campuses overview",
    category_slug: "campuses",
    article_type: "overview",
    feature_keys: ["campuses.multiple.enabled"],
  },
  {
    slug: "create-a-campus",
    title: "Create a campus",
    category_slug: "campuses",
    article_type: "how_to",
    feature_keys: ["campuses.multiple.enabled"],
  },
  {
    slug: "adding-members-to-a-campus",
    title: "Add members to a campus",
    category_slug: "campuses",
    article_type: "how_to",
  },
  {
    slug: "delegating-campus-member-management",
    title: "Delegating campus member management",
    category_slug: "campuses",
    article_type: "how_to",
  },
  {
    slug: "why-cant-i-see-another-campus",
    title: "Why can't I see another campus?",
    category_slug: "troubleshooting",
    article_type: "troubleshooting",
  },
  {
    slug: "security-overview",
    title: "Security overview",
    category_slug: "security-permissions",
    article_type: "overview",
  },
  {
    slug: "church-roles-and-security-groups",
    title: "Church Roles and Groups",
    category_slug: "security-roles",
    article_type: "overview",
  },
  {
    slug: "adding-members-to-a-security-group",
    title: "Adding members to a security group",
    category_slug: "security-groups",
    article_type: "how_to",
  },
  {
    slug: "assigning-group-permissions",
    title: "Assigning permissions",
    category_slug: "security-groups",
    article_type: "how_to",
  },
  {
    slug: "temporary-access",
    title: "Temporary access",
    category_slug: "security-groups",
    article_type: "how_to",
  },
  {
    slug: "subscription-tier-vs-security-permission",
    title: "Subscription plans vs security permissions",
    category_slug: "security-permissions",
    article_type: "reference",
  },
  {
    slug: "why-is-a-feature-greyed-out",
    title: "Why is a feature greyed out?",
    category_slug: "troubleshooting",
    article_type: "troubleshooting",
  },
  {
    slug: "training-overview",
    title: "Training overview",
    category_slug: "training",
    article_type: "overview",
    feature_keys: ["training.management.enabled"],
  },
  {
    slug: "create-a-training-event",
    title: "Create a training event",
    category_slug: "training-events",
    article_type: "how_to",
    feature_keys: ["training.management.enabled"],
  },
  {
    slug: "recording-training-completion",
    title: "Record training attendance and completion",
    category_slug: "training-events",
    article_type: "how_to",
    feature_keys: ["training.management.enabled"],
  },
  {
    slug: "certifications-overview",
    title: "Certifications overview",
    category_slug: "training-certifications",
    article_type: "overview",
  },
  {
    slug: "dashboard-overview",
    title: "Dashboard overview",
    category_slug: "dashboard",
    article_type: "overview",
  },
  {
    slug: "hardware-inventory-overview",
    title: "Hardware inventory",
    category_slug: "security-hardware",
    article_type: "overview",
    feature_keys: ["hardware.inventory.enabled"],
  },
  {
    slug: "medical-inventory-overview",
    title: "Medical supplies",
    category_slug: "medical-supplies",
    article_type: "overview",
    feature_keys: ["medical.inventory.enabled"],
  },
  {
    slug: "policies-and-procedures-overview",
    title: "Policies and procedures",
    category_slug: "policies",
    article_type: "overview",
    feature_keys: ["policies.enabled"],
  },
  {
    slug: "known-safety-concerns-overview",
    title: "Known Safety Concerns",
    category_slug: "known-safety-concerns",
    article_type: "overview",
    feature_keys: ["safety_concerns.profiles.enabled"],
  },
  {
    slug: "cameras-and-sensors-overview",
    title: "Cameras and sensors",
    category_slug: "cameras-sensors",
    article_type: "overview",
    feature_keys: ["cameras.enabled", "sensors.enabled"],
  },
  {
    slug: "reports-and-analytics-overview",
    title: "Reports and analytics",
    category_slug: "reports",
    article_type: "overview",
    feature_keys: ["analytics.standard.enabled", "incidents.analytics.enabled"],
  },
  {
    slug: "account-and-profile-settings",
    title: "Account and profile settings",
    category_slug: "account-security",
    article_type: "overview",
  },
];

export function listHelpSeedCategorySlugs(): string[] {
  const slugs: string[] = [];
  for (const root of HELP_SEED_CATEGORY_TREE) {
    slugs.push(root.slug);
    for (const child of root.children ?? []) {
      slugs.push(child.slug);
    }
  }
  return slugs;
}

export function listHelpSeedArticleSlugs(): string[] {
  return [...HELP_SEED_ARTICLE_SLUGS];
}
