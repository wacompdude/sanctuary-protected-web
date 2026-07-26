import {
  HELP_SEED_ARTICLE_SLUGS,
  HELP_SEED_CATEGORY_TREE,
} from "@/lib/help/constants";

/**
 * Catalog of Phase 8 seed articles. Database rows are inserted by
 * `054_help_center_initial_content.sql` using insert-if-absent on slug —
 * re-running never overwrites platform-admin edits.
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
