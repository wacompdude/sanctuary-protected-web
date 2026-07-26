export type HelpCategoryStatus = "draft" | "active" | "archived";

export type HelpArticleStatus = "draft" | "in_review" | "published" | "archived";

export type HelpArticleType =
  | "overview"
  | "how_to"
  | "workflow"
  | "reference"
  | "troubleshooting"
  | "faq"
  | "release_note";

export type HelpBodyFormat = "markdown" | "structured_json" | "rich_text";

export type HelpAudienceScope =
  | "all_authenticated"
  | "church_members"
  | "security_team"
  | "church_admins"
  | "platform_operators";

export type HelpDifficulty = "beginner" | "intermediate" | "advanced";

export type HelpRelationType =
  | "related"
  | "prerequisite"
  | "next_step"
  | "previous_step"
  | "troubleshooting"
  | "upgrade_information";

export type HelpFeedbackRating = "yes" | "no";

export type HelpCategory = {
  id: string;
  parent_category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  status: HelpCategoryStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type HelpCategoryTreeNode = HelpCategory & {
  children: HelpCategoryTreeNode[];
  article_count: number;
};

export type HelpArticleListItem = {
  id: string;
  category_id: string;
  article_type: HelpArticleType;
  title: string;
  slug: string;
  summary: string | null;
  status: HelpArticleStatus;
  audience_scope: HelpAudienceScope;
  estimated_minutes: number | null;
  difficulty: HelpDifficulty | null;
  is_featured: boolean;
  is_popular: boolean;
  display_order: number;
  published_version_id: string | null;
  published_version_number: number | null;
  published_at: string | null;
  category_name: string | null;
  category_slug: string | null;
};

export type HelpArticleStep = {
  id: string;
  article_id: string;
  version_id: string | null;
  step_number: number;
  title: string;
  instruction: string;
  expected_result: string | null;
  tip_text: string | null;
  warning_text: string | null;
  deep_link_path: string | null;
  deep_link_label: string | null;
  required_permission: string | null;
  required_feature_key: string | null;
  screenshot_storage_path: string | null;
};

export type HelpArticleRelation = {
  id: string;
  source_article_id: string;
  target_article_id: string;
  relationship_type: HelpRelationType;
  display_order: number;
  target_title: string;
  target_slug: string;
  target_summary: string | null;
};

export type HelpArticleDetail = HelpArticleListItem & {
  body_content: string;
  body_format: HelpBodyFormat;
  search_keywords: string[];
  context_keys: string[];
  prerequisites: string[];
  expected_result: string | null;
  support_cta_label: string | null;
  support_cta_path: string | null;
  feature_keys: string[];
  role_keys: string[];
  plan_keys: string[];
  steps: HelpArticleStep[];
  relations: HelpArticleRelation[];
};

export type HelpSearchResult = {
  article_id: string;
  slug: string;
  title: string;
  summary: string | null;
  category_id: string;
  article_type: HelpArticleType;
  rank: number;
};

export type HelpSearchOptions = {
  query: string;
  limit?: number;
  offset?: number;
  categoryId?: string | null;
  articleType?: HelpArticleType | null;
};

export type HelpSearchPage = {
  query: string;
  results: HelpSearchResult[];
  result_count: number;
};

export type HelpFeatureNotice = {
  feature_key: string;
  feature_label: string;
  included: boolean;
  plan_keys_with_feature: string[];
  plan_display_names: string[];
  message: string;
};

export type HelpActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};
