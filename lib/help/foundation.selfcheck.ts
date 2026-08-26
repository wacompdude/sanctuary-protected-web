/**
 * Help Center foundation self-check (no database required).
 * Run: npx --yes tsx lib/help/foundation.selfcheck.ts
 */
import { HELP_SEED_CATEGORY_TREE } from "@/lib/help/constants";
import {
  HELP_SEED_ARTICLE_CATALOG,
  listHelpSeedArticleSlugs,
  listHelpSeedCategorySlugs,
} from "@/lib/help/seed-content";
import {
  assertHelpCoverageCatalogIntegrity,
  HELP_FEATURE_COVERAGE,
  planDisplayNamesForFeature,
} from "@/lib/help/coverage";
import {
  HELP_DEEP_LINK_ALLOWED_PREFIXES,
  isHelpDeepLinkPath,
  normalizeHelpDeepLinkPath,
  helpDeepLinkScreenHint,
} from "@/lib/help/deep-links";
import { canAccessCustomerHelpCenter } from "@/lib/help/access-policy";
import {
  canAccessHelpConsole,
  canManageHelpContent,
  canPublishHelp,
  canReadHelpDrafts,
} from "@/lib/help/permissions";
import { buildHelpFeatureNotice } from "@/lib/help/plan-notices";
import { buildHelpCategoryTree } from "@/lib/help/queries";
import { isValidHelpSlug, slugifyHelpText } from "@/lib/help/slug";
import {
  validateHelpSearchQuery,
  validateHelpStepForm,
} from "@/lib/help/validation";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { PLATFORM_PERMISSIONS } from "@/lib/platform/permission-keys";
import { EXPECTED_PLATFORM_ROLE_PERMISSIONS } from "@/lib/platform/expected-matrix";
import { PLATFORM_ROLE_KEYS } from "@/lib/platform/role-keys";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(canAccessCustomerHelpCenter(), "customer help is always available");
assert(
  PLATFORM_PERMISSIONS.includes("help.manage"),
  "help.manage permission registered",
);
assert(
  PLATFORM_PERMISSIONS.includes("help.publish"),
  "help.publish permission registered",
);

const platformAdmin =
  EXPECTED_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE_KEYS.PLATFORM_ADMIN];
assert(canManageHelpContent(platformAdmin), "platform_admin manages help");
assert(canPublishHelp(platformAdmin), "platform_admin publishes help");
assert(canAccessHelpConsole(platformAdmin), "platform_admin console access");

const developer =
  EXPECTED_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE_KEYS.DEVELOPER];
assert(canReadHelpDrafts(developer), "developer reads drafts");
assert(!canPublishHelp(developer), "developer does not publish by default");

assert(isValidHelpSlug("getting-started"), "valid slug");
assert(!isValidHelpSlug("Getting Started"), "uppercase slug invalid");
assert(slugifyHelpText("Create an Event!") === "create-an-event", "slugify");

assert(isHelpDeepLinkPath("/events/new"), "events deep link allowed");
assert(isHelpDeepLinkPath("/incidents/new"), "incidents deep link allowed");
assert(isHelpDeepLinkPath("/training/events/new"), "training deep link allowed");
assert(
  isHelpDeepLinkPath("/settings/security?tab=groups"),
  "security groups deep link allowed",
);
assert(!isHelpDeepLinkPath("javascript:alert(1)"), "javascript blocked");
assert(!isHelpDeepLinkPath("//evil.example"), "protocol-relative blocked");
assert(!isHelpDeepLinkPath("https://example.com"), "external blocked");
assert(
  normalizeHelpDeepLinkPath("/settings/billing") === "/settings/billing",
  "normalize keeps allowlisted path",
);
assert(
  HELP_DEEP_LINK_ALLOWED_PREFIXES.includes("/help"),
  "help prefix allowlisted",
);
assert(
  helpDeepLinkScreenHint("/schedule/shifts/new") === "schedule.shifts.new",
  "screen hint maps path segments",
);

const search = validateHelpSearchQuery("create event", { limit: 10 });
assert(Boolean(search.data?.query === "create event"), "search validates");
assert(!validateHelpSearchQuery("   ").data, "empty search rejected");

const stepForm = new FormData();
stepForm.set("step_number", "1");
stepForm.set("title", "Open Events");
stepForm.set("instruction", "Go to Events and choose New.");
stepForm.set("deep_link_path", "/events/new");
const step = validateHelpStepForm(stepForm);
assert(Boolean(step.data?.deep_link_path === "/events/new"), "step deep link ok");

const badStep = new FormData();
badStep.set("step_number", "1");
badStep.set("title", "Bad");
badStep.set("instruction", "Nope");
badStep.set("deep_link_path", "javascript:alert(1)");
assert(Boolean(validateHelpStepForm(badStep).fieldErrors?.deep_link_path), "bad deep link rejected");

const notice = buildHelpFeatureNotice({
  featureKey: FEATURE_KEYS.MEDICAL_INVENTORY,
  included: false,
});
assert(Boolean(notice?.message.includes("Steward Pro")), "upgrade notice lists plans");
assert(Boolean(notice && !notice.included), "notice marks not included");

const included = buildHelpFeatureNotice({
  featureKey: FEATURE_KEYS.INCIDENT_LOGGING,
  included: true,
});
assert(Boolean(included?.message.includes("included")), "included notice");

assert(HELP_SEED_CATEGORY_TREE.length >= 10, "seed topic tree present");
assert(
  HELP_SEED_CATEGORY_TREE.some((item) => item.slug === "events-scheduling"),
  "events-scheduling seed category",
);
assert(
  HELP_SEED_CATEGORY_TREE.some((item) => item.slug === "security-permissions"),
  "security-permissions seed category",
);
assert(
  HELP_SEED_CATEGORY_TREE.some((item) => item.slug === "training"),
  "training seed category",
);
assert(
  listHelpSeedCategorySlugs().includes("scheduling-shifts"),
  "seed subcategory scheduling-shifts",
);
assert(
  listHelpSeedCategorySlugs().includes("church-settings"),
  "seed subcategory church-settings",
);
assert(
  listHelpSeedCategorySlugs().includes("security-groups"),
  "seed subcategory security-groups",
);
assert(
  listHelpSeedArticleSlugs().length === HELP_SEED_ARTICLE_CATALOG.length,
  "seed article slug count matches catalog",
);
assert(
  listHelpSeedArticleSlugs().length >= 30,
  "expanded Help catalog has 30+ articles",
);
assert(
  HELP_SEED_ARTICLE_CATALOG.every((item) =>
    listHelpSeedArticleSlugs().includes(item.slug),
  ),
  "seed catalog slugs match constants",
);
assert(
  HELP_SEED_ARTICLE_CATALOG.some(
    (item) => item.slug === "welcome-to-sanctuary-protected",
  ),
  "welcome seed article present",
);
assert(
  HELP_SEED_ARTICLE_CATALOG.some(
    (item) => item.slug === "initial-setup-checklist",
  ),
  "setup checklist seed article present",
);
assert(
  HELP_SEED_ARTICLE_CATALOG.some(
    (item) => item.slug === "why-is-a-feature-greyed-out",
  ),
  "greyed-out feature article present",
);
assert(
  HELP_SEED_ARTICLE_CATALOG.some(
    (item) => item.slug === "adding-members-to-a-security-group",
  ),
  "security group members article present",
);
assert(
  HELP_SEED_ARTICLE_CATALOG.some((item) => item.slug === "selecting-a-time-zone"),
  "time zone article present",
);

assertHelpCoverageCatalogIntegrity();
assert(HELP_FEATURE_COVERAGE.length >= 20, "coverage map has major modules");
assert(
  planDisplayNamesForFeature(FEATURE_KEYS.TRAINING_MANAGEMENT).includes(
    "Steward Pro",
  ),
  "training plan names derived from expected matrix",
);
assert(
  !planDisplayNamesForFeature(FEATURE_KEYS.TRAINING_MANAGEMENT).includes(
    "Servant Standard",
  ),
  "Servant Standard does not include training in expected matrix",
);

const tree = buildHelpCategoryTree(
  [
    {
      id: "root",
      parent_category_id: null,
      name: "Events",
      slug: "events",
      description: null,
      icon: null,
      display_order: 1,
      status: "active",
      created_at: "",
      updated_at: "",
      archived_at: null,
    },
    {
      id: "child",
      parent_category_id: "root",
      name: "Shifts",
      slug: "shifts",
      description: null,
      icon: null,
      display_order: 1,
      status: "active",
      created_at: "",
      updated_at: "",
      archived_at: null,
    },
  ],
  new Map([
    ["root", 2],
    ["child", 1],
  ]),
);
assert(tree.length === 1 && tree[0]?.children.length === 1, "category tree nests");
assert(tree[0]?.article_count === 2, "article counts attached");

console.log("help foundation self-check passed");
