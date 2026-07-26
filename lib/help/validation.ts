import {
  HELP_ARTICLE_TYPES,
  HELP_AUDIENCE_SCOPES,
  HELP_BODY_FORMATS,
  HELP_CATEGORY_STATUSES,
  HELP_DIFFICULTIES,
  HELP_RELATION_TYPES,
  MAX_HELP_SEARCH_LIMIT,
  MAX_HELP_SEARCH_QUERY_LENGTH,
} from "@/lib/help/constants";
import { isHelpDeepLinkPath, normalizeHelpDeepLinkPath } from "@/lib/help/deep-links";
import { isValidHelpSlug, slugifyHelpText } from "@/lib/help/slug";
import type {
  HelpActionState,
  HelpArticleType,
  HelpAudienceScope,
  HelpBodyFormat,
  HelpCategoryStatus,
  HelpDifficulty,
  HelpRelationType,
  HelpSearchOptions,
} from "@/lib/help/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FEATURE_KEY_RE = /^[a-z][a-z0-9_.]*$/;
const CONTEXT_KEY_RE = /^[a-z][a-z0-9_.]*$/;

function text(formData: FormData, key: string, max: number): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  return value.slice(0, max);
}

function enumValue<T extends string>(
  formData: FormData,
  key: string,
  options: { value: T }[],
  fallback?: T,
): T | null {
  const raw = text(formData, key, 80);
  if (!raw) return fallback ?? null;
  return options.some((item) => item.value === raw) ? (raw as T) : null;
}

function parseStringList(raw: string | null, maxItems: number, maxLen: number): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLen));
}

export type HelpCategoryFormData = {
  parent_category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  status: HelpCategoryStatus;
};

export type HelpArticleFormData = {
  category_id: string;
  article_type: HelpArticleType;
  title: string;
  slug: string;
  summary: string | null;
  body_content: string;
  body_format: HelpBodyFormat;
  audience_scope: HelpAudienceScope;
  estimated_minutes: number | null;
  difficulty: HelpDifficulty | null;
  is_featured: boolean;
  is_popular: boolean;
  display_order: number;
  search_keywords: string[];
  context_keys: string[];
  prerequisites: string[];
  expected_result: string | null;
  support_cta_label: string | null;
  support_cta_path: string | null;
  feature_keys: string[];
  role_keys: string[];
  plan_keys: string[];
};

export type HelpStepFormData = {
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
};

export type HelpRelationFormData = {
  target_article_id: string;
  relationship_type: HelpRelationType;
  display_order: number;
};

export function validateHelpSearchQuery(
  rawQuery: string,
  options?: {
    limit?: number;
    offset?: number;
    categoryId?: string | null;
    articleType?: string | null;
  },
): { error?: string; data?: HelpSearchOptions } {
  const query = rawQuery.trim().slice(0, MAX_HELP_SEARCH_QUERY_LENGTH);
  if (!query) {
    return { error: "Enter a search term." };
  }

  const limit = Math.min(
    MAX_HELP_SEARCH_LIMIT,
    Math.max(1, Math.floor(options?.limit ?? 20)),
  );
  const offset = Math.max(0, Math.floor(options?.offset ?? 0));

  const categoryId: string | null = options?.categoryId ?? null;
  if (categoryId && !UUID_RE.test(categoryId)) {
    return { error: "Invalid category filter." };
  }

  let articleType: HelpArticleType | null = null;
  if (options?.articleType) {
    const match = HELP_ARTICLE_TYPES.find(
      (item) => item.value === options.articleType,
    );
    if (!match) return { error: "Invalid article type filter." };
    articleType = match.value;
  }

  return {
    data: {
      query,
      limit,
      offset,
      categoryId,
      articleType,
    },
  };
}

export function validateHelpCategoryForm(
  formData: FormData,
): HelpActionState & { data?: HelpCategoryFormData } {
  const fieldErrors: Record<string, string> = {};

  const name = text(formData, "name", 120);
  if (!name) fieldErrors.name = "Name is required.";

  let slug = text(formData, "slug", 80);
  if (!slug && name) slug = slugifyHelpText(name, 80);
  if (!slug || !isValidHelpSlug(slug, 80)) {
    fieldErrors.slug = "Enter a valid slug (lowercase letters, numbers, hyphens).";
  }

  const parentRaw = text(formData, "parent_category_id", 36);
  let parent_category_id: string | null = null;
  if (parentRaw) {
    if (!UUID_RE.test(parentRaw)) {
      fieldErrors.parent_category_id = "Invalid parent category.";
    } else {
      parent_category_id = parentRaw;
    }
  }

  const status =
    enumValue(formData, "status", HELP_CATEGORY_STATUSES, "draft") ?? "draft";

  const displayOrderRaw = text(formData, "display_order", 10);
  const display_order = displayOrderRaw ? Number(displayOrderRaw) : 0;
  if (!Number.isFinite(display_order) || display_order < 0) {
    fieldErrors.display_order = "Display order must be zero or greater.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }

  return {
    data: {
      parent_category_id,
      name: name!,
      slug: slug!,
      description: text(formData, "description", 2000),
      icon: text(formData, "icon", 64),
      display_order: Math.floor(display_order),
      status,
    },
  };
}

export function validateHelpArticleForm(
  formData: FormData,
): HelpActionState & { data?: HelpArticleFormData } {
  const fieldErrors: Record<string, string> = {};

  const category_id = text(formData, "category_id", 36);
  if (!category_id || !UUID_RE.test(category_id)) {
    fieldErrors.category_id = "Category is required.";
  }

  const title = text(formData, "title", 200);
  if (!title) fieldErrors.title = "Title is required.";

  let slug = text(formData, "slug", 120);
  if (!slug && title) slug = slugifyHelpText(title, 120);
  if (!slug || !isValidHelpSlug(slug, 120)) {
    fieldErrors.slug = "Enter a valid slug (lowercase letters, numbers, hyphens).";
  }

  const article_type =
    enumValue(formData, "article_type", HELP_ARTICLE_TYPES, "how_to") ?? "how_to";
  const body_format =
    enumValue(formData, "body_format", HELP_BODY_FORMATS, "markdown") ??
    "markdown";
  const audience_scope =
    enumValue(formData, "audience_scope", HELP_AUDIENCE_SCOPES, "all_authenticated") ??
    "all_authenticated";
  const difficulty = enumValue(formData, "difficulty", HELP_DIFFICULTIES);

  const body_content = String(formData.get("body_content") ?? "").slice(0, 200000);

  const support_cta_path_raw = text(formData, "support_cta_path", 500);
  let support_cta_path: string | null = null;
  if (support_cta_path_raw) {
    support_cta_path = normalizeHelpDeepLinkPath(support_cta_path_raw);
    if (!support_cta_path) {
      fieldErrors.support_cta_path = "Support path must be an approved internal link.";
    }
  }

  const estimatedRaw = text(formData, "estimated_minutes", 10);
  let estimated_minutes: number | null = null;
  if (estimatedRaw) {
    const minutes = Number(estimatedRaw);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
      fieldErrors.estimated_minutes = "Estimated minutes must be between 1 and 240.";
    } else {
      estimated_minutes = Math.floor(minutes);
    }
  }

  const displayOrderRaw = text(formData, "display_order", 10);
  const display_order = displayOrderRaw ? Number(displayOrderRaw) : 0;
  if (!Number.isFinite(display_order) || display_order < 0) {
    fieldErrors.display_order = "Display order must be zero or greater.";
  }

  const search_keywords = parseStringList(
    text(formData, "search_keywords", 4000),
    40,
    64,
  );
  const context_keys = parseStringList(text(formData, "context_keys", 2000), 30, 64);
  for (const key of context_keys) {
    if (!CONTEXT_KEY_RE.test(key)) {
      fieldErrors.context_keys = "Context keys must use lowercase letters, numbers, dots, or underscores.";
      break;
    }
  }

  const feature_keys = parseStringList(text(formData, "feature_keys", 2000), 30, 80);
  for (const key of feature_keys) {
    if (!FEATURE_KEY_RE.test(key)) {
      fieldErrors.feature_keys = "Feature keys must match the entitlement registry format.";
      break;
    }
  }

  const role_keys = parseStringList(text(formData, "role_keys", 1000), 20, 64);
  const plan_keys = parseStringList(text(formData, "plan_keys", 1000), 10, 64);
  const prerequisites = parseStringList(
    text(formData, "prerequisites", 4000),
    20,
    200,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }

  return {
    data: {
      category_id: category_id!,
      article_type,
      title: title!,
      slug: slug!,
      summary: text(formData, "summary", 1000),
      body_content,
      body_format,
      audience_scope,
      estimated_minutes,
      difficulty,
      is_featured: formData.get("is_featured") === "on" || formData.get("is_featured") === "true",
      is_popular: formData.get("is_popular") === "on" || formData.get("is_popular") === "true",
      display_order: Math.floor(display_order),
      search_keywords,
      context_keys,
      prerequisites,
      expected_result: text(formData, "expected_result", 2000),
      support_cta_label: text(formData, "support_cta_label", 80),
      support_cta_path,
      feature_keys,
      role_keys,
      plan_keys,
    },
  };
}

export function validateHelpStepForm(
  formData: FormData,
): HelpActionState & { data?: HelpStepFormData } {
  const fieldErrors: Record<string, string> = {};

  const stepRaw = text(formData, "step_number", 10);
  const step_number = stepRaw ? Number(stepRaw) : NaN;
  if (!Number.isFinite(step_number) || step_number < 1) {
    fieldErrors.step_number = "Step number must be 1 or greater.";
  }

  const title = text(formData, "title", 200);
  if (!title) fieldErrors.title = "Step title is required.";

  const instruction = String(formData.get("instruction") ?? "").trim().slice(0, 20000);
  if (!instruction) fieldErrors.instruction = "Instruction is required.";

  const deep_link_path_raw = text(formData, "deep_link_path", 500);
  let deep_link_path: string | null = null;
  if (deep_link_path_raw) {
    if (!isHelpDeepLinkPath(deep_link_path_raw)) {
      fieldErrors.deep_link_path = "Deep link must be an approved internal path.";
    } else {
      deep_link_path = deep_link_path_raw.trim();
    }
  }

  const required_feature_key = text(formData, "required_feature_key", 80);
  if (required_feature_key && !FEATURE_KEY_RE.test(required_feature_key)) {
    fieldErrors.required_feature_key = "Invalid feature key format.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }

  return {
    data: {
      step_number: Math.floor(step_number),
      title: title!,
      instruction,
      expected_result: text(formData, "expected_result", 2000),
      tip_text: text(formData, "tip_text", 2000),
      warning_text: text(formData, "warning_text", 2000),
      deep_link_path,
      deep_link_label: text(formData, "deep_link_label", 80),
      required_permission: text(formData, "required_permission", 80),
      required_feature_key,
    },
  };
}

export function validateHelpRelationForm(
  formData: FormData,
): HelpActionState & { data?: HelpRelationFormData } {
  const fieldErrors: Record<string, string> = {};

  const target_article_id = text(formData, "target_article_id", 36);
  if (!target_article_id || !UUID_RE.test(target_article_id)) {
    fieldErrors.target_article_id = "Target article is required.";
  }

  const relationship_type =
    enumValue(formData, "relationship_type", HELP_RELATION_TYPES, "related") ??
    "related";

  const displayOrderRaw = text(formData, "display_order", 10);
  const display_order = displayOrderRaw ? Number(displayOrderRaw) : 0;
  if (!Number.isFinite(display_order) || display_order < 0) {
    fieldErrors.display_order = "Display order must be zero or greater.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }

  return {
    data: {
      target_article_id: target_article_id!,
      relationship_type,
      display_order: Math.floor(display_order),
    },
  };
}

export function validateHelpFeedback(params: {
  articleId: string;
  rating: string;
  comment?: string | null;
}): HelpActionState & { data?: { articleId: string; rating: "yes" | "no"; comment: string | null } } {
  if (!UUID_RE.test(params.articleId)) {
    return { error: "Invalid article." };
  }
  if (params.rating !== "yes" && params.rating !== "no") {
    return { error: "Choose Yes or No." };
  }
  const comment = params.comment?.trim().slice(0, 2000) || null;
  return {
    data: {
      articleId: params.articleId,
      rating: params.rating,
      comment,
    },
  };
}
