export * from "@/lib/help/types";
export * from "@/lib/help/constants";
export * from "@/lib/help/seed-content";
export * from "@/lib/help/coverage";
export * from "@/lib/help/deep-links";
export * from "@/lib/help/slug";
export * from "@/lib/help/access-policy";
export * from "@/lib/help/permissions";
export * from "@/lib/help/plan-notices";
export * from "@/lib/help/feature-notices";
export * from "@/lib/help/validation";
export * from "@/lib/help/workflow";
export * from "@/lib/help/attachment-storage";
export * from "@/lib/help/queries";
export type {
  HelpAdminArticleDetail,
  HelpAdminDashboardStats,
  HelpArticleVersionSummary,
} from "@/lib/help/admin";
export type {
  HelpAnalyticsReport,
  HelpBrokenLinkFinding,
  HelpReviewReminder,
} from "@/lib/help/analytics";
export { getHelpAnalyticsReport } from "@/lib/help/analytics";

/** Prefer `@/lib/help/mobile` from Expo — keeps integration surface explicit. */
export {
  HELP_MOBILE_CACHE_POLICY,
  HELP_EXPO_INTEGRATION_POINTS,
} from "@/lib/help/mobile";
