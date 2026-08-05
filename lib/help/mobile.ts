/**
 * Mobile / Expo readiness surface for Help Center.
 *
 * Import this module from a future React Native app — not `@/lib/help`
 * if you need to avoid any Next.js server defaults. Prefer the typed
 * `helpMobile*Service` helpers which require an authenticated SupabaseClient.
 *
 * Authorization:
 *   1. Supabase Auth session (JWT) on the device — never cookie bridging
 *   2. Postgres RLS (published customer-visible content only)
 *   3. Plan notices via pure helpers — never hide the Help Center by tier
 *
 * Do not import `@/lib/help/permissions` (platform console) from Expo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { HELP_ASSET_SIGNED_URL_SECONDS } from "@/lib/help/attachment-storage";
import {
  getHelpArticleBySlug,
  getHelpCategoryBySlug,
  listFeaturedHelpArticles,
  listHelpArticlesByCategory,
  listHelpCategoryTree,
  listPopularHelpArticles,
  recordHelpArticleView,
  recordHelpSearchEvent,
  searchHelpArticles,
  submitHelpArticleFeedback,
} from "@/lib/help/queries";
import type {
  HelpArticleDetail,
  HelpArticleListItem,
  HelpCategory,
  HelpCategoryTreeNode,
  HelpSearchOptions,
  HelpSearchPage,
} from "@/lib/help/types";
import { buildHelpWorkflow } from "@/lib/help/workflow";

export type {
  HelpArticleDetail,
  HelpArticleListItem,
  HelpArticleRelation,
  HelpArticleStep,
  HelpArticleType,
  HelpCategory,
  HelpCategoryTreeNode,
  HelpFeatureNotice,
  HelpSearchOptions,
  HelpSearchPage,
  HelpSearchResult,
} from "@/lib/help/types";

export type { HelpMobileDeepLink } from "@/lib/help/deep-links";
export type { HelpWorkflow, HelpWorkflowStep } from "@/lib/help/workflow";

export {
  HELP_ARTICLE_TYPES,
  HELP_MIGRATION_HINT,
  HELP_SEED_ARTICLE_SLUGS,
  HELP_SEED_CATEGORY_TREE,
  labelForHelpArticleType,
} from "@/lib/help/constants";

export {
  HELP_SEED_ARTICLE_CATALOG,
  listHelpSeedArticleSlugs,
  listHelpSeedCategorySlugs,
} from "@/lib/help/seed-content";

export {
  HELP_DEEP_LINK_ALLOWED_PREFIXES,
  helpDeepLinkScreenHint,
  isHelpDeepLinkPath,
  normalizeHelpDeepLinkPath,
  translateHelpDeepLinkForMobile,
} from "@/lib/help/deep-links";

export { canAccessCustomerHelpCenter } from "@/lib/help/access-policy";

export {
  buildHelpFeatureNotice,
  buildHelpFeatureNotices,
} from "@/lib/help/plan-notices";

export {
  buildHelpWorkflow,
  orderHelpArticleSteps,
} from "@/lib/help/workflow";

export {
  HELP_ASSET_ALLOWED_MIME,
  HELP_ASSET_MAX_BYTES,
  HELP_ASSET_SIGNED_URL_SECONDS,
  HELP_CENTER_ASSETS_BUCKET,
  isHelpAssetStoragePath,
} from "@/lib/help/attachment-storage";

export { createHelpAssetSignedUrl } from "@/lib/help/asset-urls";

export {
  validateHelpFeedback,
  validateHelpSearchQuery,
} from "@/lib/help/validation";

/** Typed category service — client required (no Next cookie fallback). */
export type HelpMobileCategoryService = {
  listTree: (client: SupabaseClient) => Promise<HelpCategoryTreeNode[]>;
  getBySlug: (
    slug: string,
    client: SupabaseClient,
  ) => Promise<HelpCategory | null>;
};

export const helpMobileCategoryService: HelpMobileCategoryService = {
  listTree: (client) => listHelpCategoryTree(client),
  getBySlug: (slug, client) => getHelpCategoryBySlug(slug, client),
};

/** Typed article service — client required. */
export type HelpMobileArticleService = {
  getBySlug: (
    slug: string,
    client: SupabaseClient,
  ) => Promise<HelpArticleDetail | null>;
  listByCategory: (
    categoryId: string,
    client: SupabaseClient,
  ) => Promise<HelpArticleListItem[]>;
  listFeatured: (client: SupabaseClient) => Promise<HelpArticleListItem[]>;
  listPopular: (client: SupabaseClient) => Promise<HelpArticleListItem[]>;
  /** Ordered workflow DTO for native step UIs. */
  getWorkflowBySlug: (
    slug: string,
    client: SupabaseClient,
  ) => Promise<ReturnType<typeof buildHelpWorkflow> | null>;
  recordView: (params: {
    client: SupabaseClient;
    articleId: string;
    articleVersionId?: string | null;
    organizationId?: string | null;
    userId?: string | null;
  }) => Promise<void>;
  submitFeedback: (params: {
    client: SupabaseClient;
    articleId: string;
    userId: string;
    rating: "yes" | "no";
    comment?: string | null;
    articleVersionId?: string | null;
    organizationId?: string | null;
  }) => Promise<{ error: string | null }>;
};

export const helpMobileArticleService: HelpMobileArticleService = {
  getBySlug: (slug, client) => getHelpArticleBySlug(slug, client),
  listByCategory: (categoryId, client) =>
    listHelpArticlesByCategory(categoryId, client),
  listFeatured: (client) => listFeaturedHelpArticles(6, client),
  listPopular: (client) => listPopularHelpArticles(6, client),
  getWorkflowBySlug: async (slug, client) => {
    const article = await getHelpArticleBySlug(slug, client);
    return article ? buildHelpWorkflow(article) : null;
  },
  recordView: (params) =>
    recordHelpArticleView({
      client: params.client,
      articleId: params.articleId,
      articleVersionId: params.articleVersionId,
      organizationId: params.organizationId,
      userId: params.userId,
    }),
  submitFeedback: (params) =>
    submitHelpArticleFeedback({
      client: params.client,
      articleId: params.articleId,
      userId: params.userId,
      rating: params.rating,
      comment: params.comment,
      articleVersionId: params.articleVersionId,
      organizationId: params.organizationId,
    }),
};

/** Typed search service — client required. */
export type HelpMobileSearchService = {
  search: (
    options: HelpSearchOptions,
    client: SupabaseClient,
  ) => Promise<HelpSearchPage>;
  recordEvent: (params: {
    client: SupabaseClient;
    query: string;
    resultCount: number;
    organizationId?: string | null;
    userId?: string | null;
    selectedArticleId?: string | null;
  }) => Promise<void>;
};

export const helpMobileSearchService: HelpMobileSearchService = {
  search: (options, client) => searchHelpArticles(options, client),
  recordEvent: (params) =>
    recordHelpSearchEvent({
      client: params.client,
      query: params.query,
      resultCount: params.resultCount,
      organizationId: params.organizationId,
      userId: params.userId,
      selectedArticleId: params.selectedArticleId,
    }),
};

export const HELP_MOBILE_CACHE_POLICY = {
  preferredContentCache: "memory" as const,
  maxMemoryCacheTtlSeconds: 300,
  signedUrlTtlSeconds: HELP_ASSET_SIGNED_URL_SECONDS,
  /** Do not persist attachment signed URLs. */
  persistSignedUrls: false as const,
  maxDiskCacheTtlSeconds: HELP_ASSET_SIGNED_URL_SECONDS,
  refreshOnForbidden: true as const,
  /** Help copy is not church-secret; still avoid logging signed URLs. */
  redactSignedUrlsInLogs: true as const,
} as const;

/**
 * Future Expo integration checklist (do not implement native app here):
 * 1. Supabase Auth with secure refresh-token storage
 * 2. Call typed services with authenticated SupabaseClient (required arg)
 * 3. Map translateHelpDeepLinkForMobile(...).screen_hint to native screens
 * 4. Render buildHelpWorkflow / getWorkflowBySlug ordered steps
 * 5. Sign screenshots via createHelpAssetSignedUrl; honor cache policy
 * 6. Resolve plan notices with church entitlements + buildHelpFeatureNotices
 * 7. Never gate Help Center entry by subscription tier
 */
export const HELP_EXPO_INTEGRATION_POINTS = [
  "auth.supabase_session",
  "data.helpMobileCategoryService.listTree(client)",
  "data.helpMobileSearchService.search(options, client)",
  "data.helpMobileArticleService.getBySlug(slug, client)",
  "data.helpMobileArticleService.getWorkflowBySlug(slug, client)",
  "links.translateHelpDeepLinkForMobile(path)",
  "assets.createHelpAssetSignedUrl",
  "notices.buildHelpFeatureNotices",
  "cache.HELP_MOBILE_CACHE_POLICY",
  "rls.help_article_is_customer_visible",
] as const;
