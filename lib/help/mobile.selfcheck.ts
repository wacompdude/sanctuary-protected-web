/**
 * Help Center mobile readiness self-check (no database).
 * Run: npx --yes tsx lib/help/mobile.selfcheck.ts
 */
import {
  HELP_ASSET_SIGNED_URL_SECONDS,
  HELP_CENTER_ASSETS_BUCKET,
  HELP_EXPO_INTEGRATION_POINTS,
  HELP_MOBILE_CACHE_POLICY,
  buildHelpWorkflow,
  canAccessCustomerHelpCenter,
  helpDeepLinkScreenHint,
  helpMobileArticleService,
  helpMobileCategoryService,
  helpMobileSearchService,
  isHelpAssetStoragePath,
  isHelpDeepLinkPath,
  orderHelpArticleSteps,
  translateHelpDeepLinkForMobile,
} from "@/lib/help/mobile";
import type { HelpArticleDetail } from "@/lib/help/types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Access: never tier-gated; pure policy (no platform/Next import path).
assert(canAccessCustomerHelpCenter(), "help never gated by tier on mobile");

// Typed services exist and require client as last/required arg in contract.
assert(
  typeof helpMobileCategoryService.listTree === "function",
  "typed category service",
);
assert(
  typeof helpMobileArticleService.getBySlug === "function",
  "typed article service",
);
assert(
  typeof helpMobileArticleService.getWorkflowBySlug === "function",
  "typed workflow article helper",
);
assert(
  typeof helpMobileSearchService.search === "function",
  "typed search service",
);

assert(
  HELP_EXPO_INTEGRATION_POINTS.includes(
    "data.helpMobileCategoryService.listTree(client)",
  ),
  "category helper listed for Expo",
);
assert(
  HELP_EXPO_INTEGRATION_POINTS.includes(
    "data.helpMobileSearchService.search(options, client)",
  ),
  "search helper listed for Expo",
);
assert(
  HELP_EXPO_INTEGRATION_POINTS.includes(
    "data.helpMobileArticleService.getBySlug(slug, client)",
  ),
  "article helper listed for Expo",
);
assert(
  HELP_EXPO_INTEGRATION_POINTS.includes(
    "data.helpMobileArticleService.getWorkflowBySlug(slug, client)",
  ),
  "workflow helper listed for Expo",
);
assert(
  HELP_EXPO_INTEGRATION_POINTS.includes("links.translateHelpDeepLinkForMobile(path)"),
  "deep-link translator listed",
);
assert(
  HELP_EXPO_INTEGRATION_POINTS.includes("assets.createHelpAssetSignedUrl"),
  "asset signing listed",
);

// Deep links
assert(isHelpDeepLinkPath("/team/invite"), "invite deep link allowed");
assert(isHelpDeepLinkPath("/training/events/new"), "training deep link allowed");
assert(!isHelpDeepLinkPath("https://evil.example"), "external URL blocked");
assert(!isHelpDeepLinkPath("/platform/help"), "platform console not allowlisted");
assert(
  helpDeepLinkScreenHint("/notification-groups/new") ===
    "notification-groups.new",
  "native screen hint",
);

const translated = translateHelpDeepLinkForMobile(
  "/schedule/events/new?from=help",
);
assert(translated?.allowed === true, "mobile deep link allowed flag");
assert(translated?.screen_hint === "schedule.events.new", "screen hint path");
assert(translated?.query.from === "help", "query params parsed");
assert(
  translateHelpDeepLinkForMobile("/not-a-real-area") === null,
  "unknown prefix rejected",
);

// Ordered workflow representation
const sampleArticle = {
  id: "a1",
  category_id: "c1",
  article_type: "how_to",
  title: "Sample",
  slug: "sample",
  summary: null,
  status: "published",
  audience_scope: "all_authenticated",
  estimated_minutes: 5,
  difficulty: "beginner",
  is_featured: false,
  is_popular: false,
  display_order: 0,
  published_version_id: "v1",
  published_version_number: 1,
  published_at: null,
  category_name: null,
  category_slug: null,
  body_content: "Body",
  body_format: "markdown",
  search_keywords: [],
  context_keys: [],
  prerequisites: ["Have a church"],
  expected_result: "Done",
  support_cta_label: null,
  support_cta_path: null,
  feature_keys: [],
  role_keys: [],
  plan_keys: [],
  steps: [
    {
      id: "s2",
      article_id: "a1",
      version_id: "v1",
      step_number: 2,
      title: "Second",
      instruction: "Two",
      expected_result: null,
      tip_text: null,
      warning_text: null,
      deep_link_path: "/incidents/new",
      deep_link_label: "Incidents",
      required_permission: null,
      required_feature_key: null,
      screenshot_storage_path: null,
    },
    {
      id: "s1",
      article_id: "a1",
      version_id: "v1",
      step_number: 1,
      title: "First",
      instruction: "One",
      expected_result: null,
      tip_text: null,
      warning_text: null,
      deep_link_path: "javascript:alert(1)",
      deep_link_label: "Bad",
      required_permission: null,
      required_feature_key: null,
      screenshot_storage_path: null,
    },
  ],
  relations: [
    {
      id: "r1",
      source_article_id: "a1",
      target_article_id: "a2",
      relationship_type: "next_step",
      display_order: 1,
      target_title: "Next",
      target_slug: "next",
      target_summary: null,
    },
  ],
} satisfies HelpArticleDetail;

const ordered = orderHelpArticleSteps(sampleArticle.steps);
assert(ordered[0]?.step_number === 1, "steps ordered ascending");

const workflow = buildHelpWorkflow(sampleArticle);
assert(workflow.steps.length === 2, "workflow includes steps");
assert(workflow.steps[0]?.title === "First", "workflow uses ordered steps");
assert(
  workflow.steps[0]?.deep_link_path === null,
  "unsafe deep links stripped in workflow",
);
assert(
  workflow.steps[1]?.deep_link_path === "/incidents/new",
  "safe deep links kept",
);
assert(workflow.next_steps.length === 1, "next_step relations grouped");
assert(workflow.prerequisites[0] === "Have a church", "prerequisites copied");

// Asset handling
assert(HELP_CENTER_ASSETS_BUCKET === "help-center-assets", "private bucket name");
assert(
  isHelpAssetStoragePath(
    "articles/11111111-1111-1111-1111-111111111111/shot.png",
  ),
  "article asset path valid",
);
assert(
  !isHelpAssetStoragePath("../etc/passwd"),
  "path traversal rejected",
);
assert(
  HELP_MOBILE_CACHE_POLICY.persistSignedUrls === false,
  "do not persist signed URLs",
);
assert(
  HELP_MOBILE_CACHE_POLICY.signedUrlTtlSeconds === HELP_ASSET_SIGNED_URL_SECONDS,
  "cache TTL matches signed URL TTL",
);
assert(
  HELP_MOBILE_CACHE_POLICY.maxDiskCacheTtlSeconds <=
    HELP_ASSET_SIGNED_URL_SECONDS,
  "disk cache not longer than signed URL",
);

console.log("help mobile readiness self-check passed");
