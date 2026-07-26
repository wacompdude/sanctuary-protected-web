import type { SupabaseClient } from "@supabase/supabase-js";
import { helpMigrationHintFromError } from "@/lib/help/constants";
import { validateHelpSearchQuery } from "@/lib/help/validation";
import type {
  HelpArticleDetail,
  HelpArticleListItem,
  HelpArticleRelation,
  HelpArticleStep,
  HelpArticleType,
  HelpAudienceScope,
  HelpBodyFormat,
  HelpCategory,
  HelpCategoryStatus,
  HelpCategoryTreeNode,
  HelpDifficulty,
  HelpFeedbackRating,
  HelpRelationType,
  HelpSearchOptions,
  HelpSearchPage,
  HelpSearchResult,
} from "@/lib/help/types";

/** Lazy Next server client — mobile callers must pass their own SupabaseClient. */
async function getServerSupabaseClient(): Promise<SupabaseClient> {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message && helpMigrationHintFromError(error.message))
  );
}

type CategoryRow = {
  id: string;
  parent_category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  status: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type ArticleListRow = {
  id: string;
  category_id: string;
  article_type: string;
  title: string;
  slug: string;
  summary: string | null;
  status: string;
  audience_scope: string;
  estimated_minutes: number | null;
  difficulty: string | null;
  is_featured: boolean;
  is_popular: boolean;
  display_order: number;
  published_version_id: string | null;
  published_version_number: number | null;
  published_at: string | null;
  help_categories?: { id: string; name: string; slug: string } | null;
};

type ArticleDetailRow = ArticleListRow & {
  body_content: string;
  body_format: string;
  search_keywords: string[] | null;
  context_keys: string[] | null;
  prerequisites: string[] | null;
  expected_result: string | null;
  support_cta_label: string | null;
  support_cta_path: string | null;
};

type VersionRow = {
  id: string;
  title: string;
  summary: string | null;
  body_content: string;
  body_format: string;
  article_type: string;
  audience_scope: string;
  estimated_minutes: number | null;
  difficulty: string | null;
  search_keywords: string[] | null;
  context_keys: string[] | null;
  prerequisites: string[] | null;
  expected_result: string | null;
  version_number: number;
  published_at: string;
};

type StepRow = {
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

type RelationRow = {
  id: string;
  source_article_id: string;
  target_article_id: string;
  relationship_type: string;
  display_order: number;
};

function mapCategory(row: CategoryRow): HelpCategory {
  return {
    id: row.id,
    parent_category_id: row.parent_category_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    display_order: row.display_order,
    status: row.status as HelpCategoryStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
  };
}

function categoryJoin(
  value: ArticleListRow["help_categories"] | ArticleListRow["help_categories"][] | null | undefined,
): { id: string; name: string; slug: string } | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function mapListItem(row: ArticleListRow): HelpArticleListItem {
  const category = categoryJoin(row.help_categories);
  return {
    id: row.id,
    category_id: row.category_id,
    article_type: row.article_type as HelpArticleType,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    status: row.status as HelpArticleListItem["status"],
    audience_scope: row.audience_scope as HelpAudienceScope,
    estimated_minutes: row.estimated_minutes,
    difficulty: (row.difficulty as HelpDifficulty | null) ?? null,
    is_featured: Boolean(row.is_featured),
    is_popular: Boolean(row.is_popular),
    display_order: row.display_order ?? 0,
    published_version_id: row.published_version_id,
    published_version_number: row.published_version_number,
    published_at: row.published_at,
    category_name: category?.name ?? null,
    category_slug: category?.slug ?? null,
  };
}

function mapStep(row: StepRow): HelpArticleStep {
  return {
    id: row.id,
    article_id: row.article_id,
    version_id: row.version_id,
    step_number: row.step_number,
    title: row.title,
    instruction: row.instruction ?? "",
    expected_result: row.expected_result,
    tip_text: row.tip_text,
    warning_text: row.warning_text,
    deep_link_path: row.deep_link_path,
    deep_link_label: row.deep_link_label,
    required_permission: row.required_permission,
    required_feature_key: row.required_feature_key,
    screenshot_storage_path: row.screenshot_storage_path,
  };
}

function mapRelation(
  row: RelationRow,
  target: { title: string; slug: string; summary: string | null } | undefined,
): HelpArticleRelation | null {
  if (!target) return null;
  return {
    id: row.id,
    source_article_id: row.source_article_id,
    target_article_id: row.target_article_id,
    relationship_type: row.relationship_type as HelpRelationType,
    display_order: row.display_order,
    target_title: target.title,
    target_slug: target.slug,
    target_summary: target.summary,
  };
}

export function buildHelpCategoryTree(
  categories: HelpCategory[],
  articleCounts: ReadonlyMap<string, number> = new Map(),
): HelpCategoryTreeNode[] {
  const nodes = new Map<string, HelpCategoryTreeNode>();
  for (const category of categories) {
    nodes.set(category.id, {
      ...category,
      children: [],
      article_count: articleCounts.get(category.id) ?? 0,
    });
  }

  const roots: HelpCategoryTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_category_id && nodes.has(node.parent_category_id)) {
      nodes.get(node.parent_category_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: HelpCategoryTreeNode[]) => {
    list.sort(
      (a, b) =>
        a.display_order - b.display_order || a.name.localeCompare(b.name),
    );
    for (const child of list) sortNodes(child.children);
  };
  sortNodes(roots);
  return roots;
}

export async function listHelpCategories(
  client?: SupabaseClient,
): Promise<HelpCategory[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  const { data, error } = await supabase
    .from("help_categories")
    .select(
      "id, parent_category_id, name, slug, description, icon, display_order, status, created_at, updated_at, archived_at",
    )
    .eq("status", "active")
    .is("archived_at", null)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as CategoryRow[]).map(mapCategory);
}

export async function getHelpCategoryBySlug(
  slug: string,
  client?: SupabaseClient,
): Promise<HelpCategory | null> {
  const supabase = client ?? (await getServerSupabaseClient());
  const { data, error } = await supabase
    .from("help_categories")
    .select(
      "id, parent_category_id, name, slug, description, icon, display_order, status, created_at, updated_at, archived_at",
    )
    .eq("slug", slug)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  return data ? mapCategory(data as CategoryRow) : null;
}

export async function listHelpCategoryTree(
  client?: SupabaseClient,
): Promise<HelpCategoryTreeNode[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  const categories = await listHelpCategories(supabase);

  const { data: articles, error } = await supabase
    .from("help_articles")
    .select("id, category_id, published_version_id, status, archived_at, audience_scope")
    .not("published_version_id", "is", null)
    .neq("status", "archived")
    .is("archived_at", null)
    .neq("audience_scope", "platform_operators");

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }

  const counts = new Map<string, number>();
  for (const row of articles ?? []) {
    const categoryId = (row as { category_id: string }).category_id;
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }

  return buildHelpCategoryTree(categories, counts);
}

async function listCustomerVisibleArticles(
  supabase: SupabaseClient,
  filters?: {
    categoryId?: string;
    featuredOnly?: boolean;
    popularOnly?: boolean;
    limit?: number;
  },
): Promise<HelpArticleListItem[]> {
  let query = supabase
    .from("help_articles")
    .select(
      `
      id, category_id, article_type, title, slug, summary, status, audience_scope,
      estimated_minutes, difficulty, is_featured, is_popular, display_order,
      published_version_id, published_version_number, published_at,
      help_categories ( id, name, slug )
    `,
    )
    .not("published_version_id", "is", null)
    .neq("status", "archived")
    .is("archived_at", null)
    .neq("audience_scope", "platform_operators")
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });

  if (filters?.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters?.featuredOnly) query = query.eq("is_featured", true);
  if (filters?.popularOnly) query = query.eq("is_popular", true);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown as ArticleListRow[]).map(mapListItem);
}

export async function listHelpArticlesByCategory(
  categoryId: string,
  client?: SupabaseClient,
): Promise<HelpArticleListItem[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  return listCustomerVisibleArticles(supabase, { categoryId });
}

export async function listFeaturedHelpArticles(
  limit = 6,
  client?: SupabaseClient,
): Promise<HelpArticleListItem[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  return listCustomerVisibleArticles(supabase, {
    featuredOnly: true,
    limit,
  });
}

export async function listPopularHelpArticles(
  limit = 6,
  client?: SupabaseClient,
): Promise<HelpArticleListItem[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  return listCustomerVisibleArticles(supabase, {
    popularOnly: true,
    limit,
  });
}

export async function getHelpArticleBySlug(
  slug: string,
  client?: SupabaseClient,
): Promise<HelpArticleDetail | null> {
  const supabase = client ?? (await getServerSupabaseClient());

  const { data, error } = await supabase
    .from("help_articles")
    .select(
      `
      id, category_id, article_type, title, slug, summary, status, audience_scope,
      estimated_minutes, difficulty, is_featured, is_popular, display_order,
      published_version_id, published_version_number, published_at,
      body_content, body_format, search_keywords, context_keys, prerequisites,
      expected_result, support_cta_label, support_cta_path,
      help_categories ( id, name, slug )
    `,
    )
    .eq("slug", slug)
    .not("published_version_id", "is", null)
    .neq("status", "archived")
    .is("archived_at", null)
    .neq("audience_scope", "platform_operators")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  const article = data as unknown as ArticleDetailRow;
  if (!article.published_version_id) return null;

  const { data: versionData, error: versionError } = await supabase
    .from("help_article_versions")
    .select(
      `
      id, title, summary, body_content, body_format, article_type, audience_scope,
      estimated_minutes, difficulty, search_keywords, context_keys, prerequisites,
      expected_result, version_number, published_at
    `,
    )
    .eq("id", article.published_version_id)
    .maybeSingle();

  if (versionError) {
    if (isMissingTableError(versionError)) return null;
    throw new Error(versionError.message);
  }

  const version = versionData as VersionRow | null;

  const { data: stepRows, error: stepsError } = await supabase
    .from("help_article_steps")
    .select(
      `
      id, article_id, version_id, step_number, title, instruction, expected_result,
      tip_text, warning_text, deep_link_path, deep_link_label, required_permission,
      required_feature_key, screenshot_storage_path
    `,
    )
    .eq("article_id", article.id)
    .eq("version_id", article.published_version_id)
    .order("step_number", { ascending: true });

  if (stepsError && !isMissingTableError(stepsError)) {
    throw new Error(stepsError.message);
  }

  const { data: relationRows, error: relationsError } = await supabase
    .from("help_article_relations")
    .select(
      "id, source_article_id, target_article_id, relationship_type, display_order",
    )
    .eq("source_article_id", article.id)
    .order("display_order", { ascending: true });

  if (relationsError && !isMissingTableError(relationsError)) {
    throw new Error(relationsError.message);
  }

  const targetIds = [
    ...new Set(
      ((relationRows ?? []) as Array<{ target_article_id: string }>).map(
        (row) => row.target_article_id,
      ),
    ),
  ];

  const targetById = new Map<
    string,
    { id: string; title: string; slug: string; summary: string | null }
  >();

  if (targetIds.length > 0) {
    const { data: targets, error: targetsError } = await supabase
      .from("help_articles")
      .select("id, title, slug, summary")
      .in("id", targetIds)
      .not("published_version_id", "is", null)
      .neq("status", "archived")
      .is("archived_at", null)
      .neq("audience_scope", "platform_operators");

    if (targetsError && !isMissingTableError(targetsError)) {
      throw new Error(targetsError.message);
    }

    for (const target of targets ?? []) {
      const row = target as {
        id: string;
        title: string;
        slug: string;
        summary: string | null;
      };
      targetById.set(row.id, row);
    }
  }

  const [{ data: featureRows }, { data: roleRows }, { data: planRows }] =
    await Promise.all([
      supabase
        .from("help_article_features")
        .select("feature_key")
        .eq("article_id", article.id),
      supabase
        .from("help_article_roles")
        .select("role_key")
        .eq("article_id", article.id),
      supabase
        .from("help_article_plan_visibility")
        .select("plan_key")
        .eq("article_id", article.id),
    ]);

  const listItem = mapListItem(article);
  const title = version?.title ?? listItem.title;
  const summary = version?.summary ?? listItem.summary;

  return {
    ...listItem,
    title,
    summary,
    article_type: (version?.article_type as HelpArticleType) ?? listItem.article_type,
    audience_scope:
      (version?.audience_scope as HelpAudienceScope) ?? listItem.audience_scope,
    estimated_minutes: version?.estimated_minutes ?? listItem.estimated_minutes,
    difficulty:
      ((version?.difficulty as HelpDifficulty | null) ?? listItem.difficulty) ||
      null,
    body_content: version?.body_content ?? article.body_content ?? "",
    body_format:
      ((version?.body_format as HelpBodyFormat) ??
        (article.body_format as HelpBodyFormat)) ||
      "markdown",
    search_keywords: version?.search_keywords ?? article.search_keywords ?? [],
    context_keys: version?.context_keys ?? article.context_keys ?? [],
    prerequisites: version?.prerequisites ?? article.prerequisites ?? [],
    expected_result: version?.expected_result ?? article.expected_result,
    support_cta_label: article.support_cta_label,
    support_cta_path: article.support_cta_path,
    feature_keys: (featureRows ?? []).map(
      (row) => (row as { feature_key: string }).feature_key,
    ),
    role_keys: (roleRows ?? []).map(
      (row) => (row as { role_key: string }).role_key,
    ),
    plan_keys: (planRows ?? []).map(
      (row) => (row as { plan_key: string }).plan_key,
    ),
    steps: ((stepRows ?? []) as StepRow[]).map(mapStep),
    relations: ((relationRows ?? []) as RelationRow[])
      .map((row) => mapRelation(row, targetById.get(row.target_article_id)))
      .filter((item): item is HelpArticleRelation => Boolean(item)),
  };
}

export async function searchHelpArticles(
  options: HelpSearchOptions,
  client?: SupabaseClient,
): Promise<HelpSearchPage> {
  const validated = validateHelpSearchQuery(options.query, {
    limit: options.limit,
    offset: options.offset,
    categoryId: options.categoryId,
    articleType: options.articleType ?? undefined,
  });

  if (!validated.data) {
    return { query: options.query.trim(), results: [], result_count: 0 };
  }

  const supabase = client ?? (await getServerSupabaseClient());
  const { data, error } = await supabase.rpc("search_help_articles", {
    p_query: validated.data.query,
    p_limit: validated.data.limit ?? 20,
    p_offset: validated.data.offset ?? 0,
    p_category_id: validated.data.categoryId ?? null,
    p_article_type: validated.data.articleType ?? null,
  });

  if (error) {
    if (isMissingTableError(error)) {
      return { query: validated.data.query, results: [], result_count: 0 };
    }
    throw new Error(error.message);
  }

  const results: HelpSearchResult[] = ((data ?? []) as Array<{
    article_id: string;
    slug: string;
    title: string;
    summary: string | null;
    category_id: string;
    article_type: string;
    rank: number;
  }>).map((row) => ({
    article_id: row.article_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category_id: row.category_id,
    article_type: row.article_type as HelpArticleType,
    rank: Number(row.rank) || 0,
  }));

  return {
    query: validated.data.query,
    results,
    result_count: results.length,
  };
}

export async function recordHelpSearchEvent(params: {
  query: string;
  resultCount: number;
  churchId?: string | null;
  userId?: string | null;
  selectedArticleId?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  const query = params.query.trim().slice(0, 500);
  if (!query) return;

  const supabase = params.client ?? (await getServerSupabaseClient());
  const { error } = await supabase.from("help_search_events").insert({
    query_text: query,
    result_count: Math.max(0, Math.floor(params.resultCount)),
    church_id: params.churchId ?? null,
    user_id: params.userId ?? null,
    selected_article_id: params.selectedArticleId ?? null,
  });

  if (error && !isMissingTableError(error)) {
    // Analytics must not break the read path.
    console.warn("help_search_events insert failed:", error.message);
  }
}

export async function recordHelpArticleView(params: {
  articleId: string;
  articleVersionId?: string | null;
  churchId?: string | null;
  userId?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  const supabase = params.client ?? (await getServerSupabaseClient());
  const { error } = await supabase.from("help_article_views").insert({
    article_id: params.articleId,
    article_version_id: params.articleVersionId ?? null,
    church_id: params.churchId ?? null,
    user_id: params.userId ?? null,
  });

  if (error && !isMissingTableError(error)) {
    console.warn("help_article_views insert failed:", error.message);
  }
}

export async function submitHelpArticleFeedback(params: {
  articleId: string;
  rating: HelpFeedbackRating;
  comment?: string | null;
  articleVersionId?: string | null;
  churchId?: string | null;
  userId: string;
  client?: SupabaseClient;
}): Promise<{ error: string | null }> {
  const supabase = params.client ?? (await getServerSupabaseClient());
  const { error } = await supabase.from("help_article_feedback").insert({
    article_id: params.articleId,
    article_version_id: params.articleVersionId ?? null,
    rating: params.rating,
    comment: params.comment?.trim().slice(0, 2000) || null,
    church_id: params.churchId ?? null,
    user_id: params.userId,
  });

  if (error) {
    if (isMissingTableError(error)) {
      return { error: helpMigrationHintFromError(error.message) };
    }
    return { error: error.message };
  }
  return { error: null };
}
