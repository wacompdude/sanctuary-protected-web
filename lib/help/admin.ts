import type { SupabaseClient } from "@supabase/supabase-js";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import type {
  HelpArticleFormData,
  HelpCategoryFormData,
  HelpStepFormData,
} from "@/lib/help/validation";
import type {
  HelpArticleListItem,
  HelpArticleStatus,
  HelpArticleStep,
  HelpArticleType,
  HelpAudienceScope,
  HelpBodyFormat,
  HelpCategory,
  HelpCategoryStatus,
  HelpDifficulty,
} from "@/lib/help/types";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import type { PlatformContext } from "@/lib/platform/types";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type HelpAdminDashboardStats = {
  published: number;
  draft: number;
  in_review: number;
  archived: number;
  categories_active: number;
};

export type HelpAdminArticleDetail = HelpArticleListItem & {
  body_content: string;
  body_format: HelpBodyFormat;
  search_keywords: string[];
  context_keys: string[];
  prerequisites: string[];
  expected_result: string | null;
  support_cta_label: string | null;
  support_cta_path: string | null;
  review_due_at: string | null;
  last_reviewed_at: string | null;
  feature_keys: string[];
  role_keys: string[];
  plan_keys: string[];
  steps: HelpArticleStep[];
};

function adminClient(): SupabaseClient {
  return requirePlatformAdminClient();
}

export async function getHelpAdminDashboardStats(): Promise<HelpAdminDashboardStats> {
  const admin = adminClient();
  const { data: articles } = await admin
    .from("help_articles")
    .select("status");
  const { data: categories } = await admin
    .from("help_categories")
    .select("status")
    .eq("status", "active");

  const counts = {
    published: 0,
    draft: 0,
    in_review: 0,
    archived: 0,
    categories_active: categories?.length ?? 0,
  };

  for (const row of articles ?? []) {
    const status = (row as { status: HelpArticleStatus }).status;
    if (status === "published") counts.published += 1;
    else if (status === "draft") counts.draft += 1;
    else if (status === "in_review") counts.in_review += 1;
    else if (status === "archived") counts.archived += 1;
  }

  return counts;
}

export async function listHelpCategoriesForAdmin(options?: {
  includeArchived?: boolean;
}): Promise<HelpCategory[]> {
  const admin = adminClient();
  let query = admin
    .from("help_categories")
    .select(
      "id, parent_category_id, name, slug, description, icon, display_order, status, created_at, updated_at, archived_at",
    )
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options?.includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...(row as HelpCategory),
    status: (row as HelpCategory).status,
  }));
}

export async function listHelpArticlesForAdmin(options?: {
  status?: HelpArticleStatus | "";
  q?: string;
}): Promise<HelpArticleListItem[]> {
  const admin = adminClient();
  let query = admin
    .from("help_articles")
    .select(
      `
      id, category_id, article_type, title, slug, summary, status, audience_scope,
      estimated_minutes, difficulty, is_featured, is_popular, display_order,
      published_version_id, published_version_number, published_at,
      help_categories ( id, name, slug )
    `,
    )
    .order("updated_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.q?.trim()) {
    const q = options.q.trim().replace(/[%_,]/g, " ").slice(0, 80);
    if (q) {
      query = query.or(
        `title.ilike.%${q}%,slug.ilike.%${q}%,summary.ilike.%${q}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
    (row) => {
      const category = row.help_categories as
        | { name: string; slug: string }
        | { name: string; slug: string }[]
        | null;
      const cat = Array.isArray(category) ? category[0] : category;
      return {
        id: String(row.id),
        category_id: String(row.category_id),
        article_type: row.article_type as HelpArticleType,
        title: String(row.title),
        slug: String(row.slug),
        summary: (row.summary as string | null) ?? null,
        status: row.status as HelpArticleStatus,
        audience_scope: row.audience_scope as HelpAudienceScope,
        estimated_minutes: (row.estimated_minutes as number | null) ?? null,
        difficulty: (row.difficulty as HelpDifficulty | null) ?? null,
        is_featured: Boolean(row.is_featured),
        is_popular: Boolean(row.is_popular),
        display_order: Number(row.display_order ?? 0),
        published_version_id:
          (row.published_version_id as string | null) ?? null,
        published_version_number:
          (row.published_version_number as number | null) ?? null,
        published_at: (row.published_at as string | null) ?? null,
        category_name: cat?.name ?? null,
        category_slug: cat?.slug ?? null,
      };
    },
  );
}

export async function getHelpArticleForAdmin(
  articleId: string,
): Promise<HelpAdminArticleDetail | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("help_articles")
    .select(
      `
      id, category_id, article_type, title, slug, summary, status, audience_scope,
      estimated_minutes, difficulty, is_featured, is_popular, display_order,
      published_version_id, published_version_number, published_at,
      body_content, body_format, search_keywords, context_keys, prerequisites,
      expected_result, support_cta_label, support_cta_path,
      review_due_at, last_reviewed_at,
      help_categories ( id, name, slug )
    `,
    )
    .eq("id", articleId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const category = row.help_categories as
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
  const cat = Array.isArray(category) ? category[0] : category;

  const [{ data: steps }, { data: features }, { data: roles }, { data: plans }] =
    await Promise.all([
      admin
        .from("help_article_steps")
        .select(
          `
          id, article_id, version_id, step_number, title, instruction, expected_result,
          tip_text, warning_text, deep_link_path, deep_link_label, required_permission,
          required_feature_key, screenshot_storage_path
        `,
        )
        .eq("article_id", articleId)
        .is("version_id", null)
        .order("step_number", { ascending: true }),
      admin
        .from("help_article_features")
        .select("feature_key")
        .eq("article_id", articleId),
      admin
        .from("help_article_roles")
        .select("role_key")
        .eq("article_id", articleId),
      admin
        .from("help_article_plan_visibility")
        .select("plan_key")
        .eq("article_id", articleId),
    ]);

  return {
    id: String(row.id),
    category_id: String(row.category_id),
    article_type: row.article_type as HelpArticleType,
    title: String(row.title),
    slug: String(row.slug),
    summary: (row.summary as string | null) ?? null,
    status: row.status as HelpArticleStatus,
    audience_scope: row.audience_scope as HelpAudienceScope,
    estimated_minutes: (row.estimated_minutes as number | null) ?? null,
    difficulty: (row.difficulty as HelpDifficulty | null) ?? null,
    is_featured: Boolean(row.is_featured),
    is_popular: Boolean(row.is_popular),
    display_order: Number(row.display_order ?? 0),
    published_version_id: (row.published_version_id as string | null) ?? null,
    published_version_number:
      (row.published_version_number as number | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    category_name: cat?.name ?? null,
    category_slug: cat?.slug ?? null,
    body_content: String(row.body_content ?? ""),
    body_format: (row.body_format as HelpBodyFormat) || "markdown",
    search_keywords: (row.search_keywords as string[]) ?? [],
    context_keys: (row.context_keys as string[]) ?? [],
    prerequisites: (row.prerequisites as string[]) ?? [],
    expected_result: (row.expected_result as string | null) ?? null,
    support_cta_label: (row.support_cta_label as string | null) ?? null,
    support_cta_path: (row.support_cta_path as string | null) ?? null,
    review_due_at: (row.review_due_at as string | null) ?? null,
    last_reviewed_at: (row.last_reviewed_at as string | null) ?? null,
    feature_keys: (features ?? []).map(
      (item) => (item as { feature_key: string }).feature_key,
    ),
    role_keys: (roles ?? []).map(
      (item) => (item as { role_key: string }).role_key,
    ),
    plan_keys: (plans ?? []).map(
      (item) => (item as { plan_key: string }).plan_key,
    ),
    steps: (steps ?? []) as HelpArticleStep[],
  };
}

async function replaceArticleMeta(
  admin: SupabaseClient,
  articleId: string,
  data: Pick<HelpArticleFormData, "feature_keys" | "role_keys" | "plan_keys">,
) {
  await admin.from("help_article_features").delete().eq("article_id", articleId);
  await admin.from("help_article_roles").delete().eq("article_id", articleId);
  await admin
    .from("help_article_plan_visibility")
    .delete()
    .eq("article_id", articleId);

  if (data.feature_keys.length > 0) {
    const { error } = await admin.from("help_article_features").insert(
      data.feature_keys.map((feature_key) => ({
        article_id: articleId,
        feature_key,
      })),
    );
    if (error) throw new Error(error.message);
  }
  if (data.role_keys.length > 0) {
    const { error } = await admin.from("help_article_roles").insert(
      data.role_keys.map((role_key) => ({
        article_id: articleId,
        role_key,
      })),
    );
    if (error) throw new Error(error.message);
  }
  if (data.plan_keys.length > 0) {
    const { error } = await admin.from("help_article_plan_visibility").insert(
      data.plan_keys.map((plan_key) => ({
        article_id: articleId,
        plan_key,
      })),
    );
    if (error) throw new Error(error.message);
  }
}

export async function createHelpCategoryForAdmin(params: {
  context: PlatformContext;
  data: HelpCategoryFormData;
}): Promise<{ id: string }> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("help_categories")
    .insert({
      parent_category_id: params.data.parent_category_id,
      name: params.data.name,
      slug: params.data.slug,
      description: params.data.description,
      icon: params.data.icon,
      display_order: params.data.display_order,
      status: params.data.status,
      created_by_platform_account_id: params.context.account.id,
      updated_by_platform_account_id: params.context.account.id,
      archived_at:
        params.data.status === "archived" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_CATEGORY_CREATED,
      targetType: AuditEntityType.HELP_CATEGORY,
      targetId: data.id,
      metadata: { slug: params.data.slug, name: params.data.name },
    },
    { client: admin },
  );

  return { id: data.id };
}

export async function updateHelpCategoryForAdmin(params: {
  context: PlatformContext;
  categoryId: string;
  data: HelpCategoryFormData;
}): Promise<void> {
  const admin = adminClient();
  const { error } = await admin
    .from("help_categories")
    .update({
      parent_category_id: params.data.parent_category_id,
      name: params.data.name,
      slug: params.data.slug,
      description: params.data.description,
      icon: params.data.icon,
      display_order: params.data.display_order,
      status: params.data.status as HelpCategoryStatus,
      updated_by_platform_account_id: params.context.account.id,
      updated_at: new Date().toISOString(),
      archived_at:
        params.data.status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", params.categoryId);

  if (error) throw new Error(error.message);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action:
        params.data.status === "archived"
          ? AuditAction.HELP_CATEGORY_ARCHIVED
          : AuditAction.HELP_CATEGORY_UPDATED,
      targetType: AuditEntityType.HELP_CATEGORY,
      targetId: params.categoryId,
      metadata: { slug: params.data.slug },
    },
    { client: admin },
  );
}

export async function deleteHelpCategoryForAdmin(params: {
  context: PlatformContext;
  categoryId: string;
}): Promise<void> {
  const admin = adminClient();

  const { data: category, error: loadError } = await admin
    .from("help_categories")
    .select("id, name, slug")
    .eq("id", params.categoryId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!category) throw new Error("Category not found.");

  const [{ count: childCount, error: childError }, { count: articleCount, error: articleError }] =
    await Promise.all([
      admin
        .from("help_categories")
        .select("id", { count: "exact", head: true })
        .eq("parent_category_id", params.categoryId),
      admin
        .from("help_articles")
        .select("id", { count: "exact", head: true })
        .eq("category_id", params.categoryId),
    ]);

  if (childError) throw new Error(childError.message);
  if (articleError) throw new Error(articleError.message);

  if ((childCount ?? 0) > 0) {
    throw new Error(
      "Move or delete child categories before deleting this category.",
    );
  }
  if ((articleCount ?? 0) > 0) {
    throw new Error(
      "Move or delete articles in this category before deleting it.",
    );
  }

  const { error } = await admin
    .from("help_categories")
    .delete()
    .eq("id", params.categoryId);

  if (error) throw new Error(error.message);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_CATEGORY_DELETED,
      targetType: AuditEntityType.HELP_CATEGORY,
      targetId: params.categoryId,
      metadata: {
        slug: (category as { slug: string }).slug,
        name: (category as { name: string }).name,
      },
    },
    { client: admin },
  );
}

export async function deleteHelpArticleForAdmin(params: {
  context: PlatformContext;
  articleId: string;
}): Promise<void> {
  const admin = adminClient();

  const { data: article, error: loadError } = await admin
    .from("help_articles")
    .select("id, title, slug")
    .eq("id", params.articleId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!article) throw new Error("Article not found.");

  // Clear published pointer first to avoid circular FK with versions.
  const { error: clearError } = await admin
    .from("help_articles")
    .update({
      published_version_id: null,
      published_version_number: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.articleId);

  if (clearError) throw new Error(clearError.message);

  const { error } = await admin
    .from("help_articles")
    .delete()
    .eq("id", params.articleId);

  if (error) throw new Error(error.message);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_ARTICLE_DELETED,
      targetType: AuditEntityType.HELP_ARTICLE,
      targetId: params.articleId,
      metadata: {
        slug: (article as { slug: string }).slug,
        title: (article as { title: string }).title,
      },
    },
    { client: admin },
  );
}

export async function createHelpArticleForAdmin(params: {
  context: PlatformContext;
  data: HelpArticleFormData;
}): Promise<{ id: string }> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("help_articles")
    .insert({
      category_id: params.data.category_id,
      article_type: params.data.article_type,
      title: params.data.title,
      slug: params.data.slug,
      summary: params.data.summary,
      body_content: params.data.body_content,
      body_format: params.data.body_format,
      status: "draft",
      audience_scope: params.data.audience_scope,
      estimated_minutes: params.data.estimated_minutes,
      difficulty: params.data.difficulty,
      is_featured: params.data.is_featured,
      is_popular: params.data.is_popular,
      display_order: params.data.display_order,
      search_keywords: params.data.search_keywords,
      context_keys: params.data.context_keys,
      prerequisites: params.data.prerequisites,
      expected_result: params.data.expected_result,
      support_cta_label: params.data.support_cta_label,
      support_cta_path: params.data.support_cta_path,
      created_by_platform_account_id: params.context.account.id,
      updated_by_platform_account_id: params.context.account.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await replaceArticleMeta(admin, data.id, params.data);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_ARTICLE_CREATED,
      targetType: AuditEntityType.HELP_ARTICLE,
      targetId: data.id,
      metadata: { slug: params.data.slug, title: params.data.title },
    },
    { client: admin },
  );

  return { id: data.id };
}

export async function updateHelpArticleForAdmin(params: {
  context: PlatformContext;
  articleId: string;
  data: HelpArticleFormData;
}): Promise<void> {
  const admin = adminClient();
  const { error } = await admin
    .from("help_articles")
    .update({
      category_id: params.data.category_id,
      article_type: params.data.article_type,
      title: params.data.title,
      slug: params.data.slug,
      summary: params.data.summary,
      body_content: params.data.body_content,
      body_format: params.data.body_format,
      audience_scope: params.data.audience_scope,
      estimated_minutes: params.data.estimated_minutes,
      difficulty: params.data.difficulty,
      is_featured: params.data.is_featured,
      is_popular: params.data.is_popular,
      display_order: params.data.display_order,
      search_keywords: params.data.search_keywords,
      context_keys: params.data.context_keys,
      prerequisites: params.data.prerequisites,
      expected_result: params.data.expected_result,
      support_cta_label: params.data.support_cta_label,
      support_cta_path: params.data.support_cta_path,
      updated_by_platform_account_id: params.context.account.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.articleId);

  if (error) throw new Error(error.message);

  await replaceArticleMeta(admin, params.articleId, params.data);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_ARTICLE_UPDATED,
      targetType: AuditEntityType.HELP_ARTICLE,
      targetId: params.articleId,
      metadata: { slug: params.data.slug },
    },
    { client: admin },
  );
}

export async function setHelpArticleStatusForAdmin(params: {
  context: PlatformContext;
  articleId: string;
  status: Extract<HelpArticleStatus, "draft" | "in_review" | "archived">;
}): Promise<void> {
  const admin = adminClient();
  const archived = params.status === "archived";
  const { error } = await admin
    .from("help_articles")
    .update({
      status: params.status,
      archived_at: archived ? new Date().toISOString() : null,
      updated_by_platform_account_id: params.context.account.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.articleId);

  if (error) throw new Error(error.message);

  const action =
    params.status === "in_review"
      ? AuditAction.HELP_ARTICLE_SUBMITTED
      : params.status === "archived"
        ? AuditAction.HELP_ARTICLE_ARCHIVED
        : AuditAction.HELP_ARTICLE_RESTORED;

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action,
      targetType: AuditEntityType.HELP_ARTICLE,
      targetId: params.articleId,
      metadata: { status: params.status },
    },
    { client: admin },
  );
}

export async function publishHelpArticleForAdmin(params: {
  context: PlatformContext;
  articleId: string;
  changeSummary?: string | null;
}): Promise<{ versionNumber: number }> {
  const admin = adminClient();
  const article = await getHelpArticleForAdmin(params.articleId);
  if (!article) throw new Error("Article not found.");

  const versionNumber = (article.published_version_number ?? 0) + 1;
  const stepsSnapshot = article.steps.map((step) => ({
    step_number: step.step_number,
    title: step.title,
    instruction: step.instruction,
    expected_result: step.expected_result,
    tip_text: step.tip_text,
    warning_text: step.warning_text,
    deep_link_path: step.deep_link_path,
    deep_link_label: step.deep_link_label,
    required_permission: step.required_permission,
    required_feature_key: step.required_feature_key,
  }));

  const { data: version, error: versionError } = await admin
    .from("help_article_versions")
    .insert({
      article_id: params.articleId,
      version_number: versionNumber,
      title: article.title,
      summary: article.summary,
      body_content: article.body_content,
      body_format: article.body_format,
      article_type: article.article_type,
      audience_scope: article.audience_scope,
      estimated_minutes: article.estimated_minutes,
      difficulty: article.difficulty,
      search_keywords: article.search_keywords,
      context_keys: article.context_keys,
      prerequisites: article.prerequisites,
      expected_result: article.expected_result,
      steps_snapshot: stepsSnapshot,
      change_summary: params.changeSummary?.trim() || null,
      published_by_platform_account_id: params.context.account.id,
    })
    .select("id")
    .single();

  if (versionError) throw new Error(versionError.message);

  if (article.steps.length > 0) {
    const { error: stepsError } = await admin.from("help_article_steps").insert(
      article.steps.map((step) => ({
        article_id: params.articleId,
        version_id: version.id,
        step_number: step.step_number,
        title: step.title,
        instruction: step.instruction,
        expected_result: step.expected_result,
        tip_text: step.tip_text,
        warning_text: step.warning_text,
        deep_link_path: step.deep_link_path,
        deep_link_label: step.deep_link_label,
        required_permission: step.required_permission,
        required_feature_key: step.required_feature_key,
        screenshot_storage_path: step.screenshot_storage_path,
      })),
    );
    if (stepsError) throw new Error(stepsError.message);
  }

  const { error: updateError } = await admin
    .from("help_articles")
    .update({
      status: "published",
      archived_at: null,
      published_version_id: version.id,
      published_version_number: versionNumber,
      published_at: new Date().toISOString(),
      published_by_platform_account_id: params.context.account.id,
      updated_by_platform_account_id: params.context.account.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.articleId);

  if (updateError) throw new Error(updateError.message);

  await admin.rpc("refresh_help_article_search", {
    p_article_id: params.articleId,
  });

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_ARTICLE_PUBLISHED,
      targetType: AuditEntityType.HELP_ARTICLE_VERSION,
      targetId: version.id,
      metadata: {
        article_id: params.articleId,
        version_number: versionNumber,
        slug: article.slug,
      },
    },
    { client: admin },
  );

  return { versionNumber };
}

export async function upsertHelpStepForAdmin(params: {
  context: PlatformContext;
  articleId: string;
  stepId?: string | null;
  data: HelpStepFormData;
}): Promise<{ id: string }> {
  const admin = adminClient();

  if (params.stepId) {
    const { error } = await admin
      .from("help_article_steps")
      .update({
        step_number: params.data.step_number,
        title: params.data.title,
        instruction: params.data.instruction,
        expected_result: params.data.expected_result,
        tip_text: params.data.tip_text,
        warning_text: params.data.warning_text,
        deep_link_path: params.data.deep_link_path,
        deep_link_label: params.data.deep_link_label,
        required_permission: params.data.required_permission,
        required_feature_key: params.data.required_feature_key,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.stepId)
      .eq("article_id", params.articleId)
      .is("version_id", null);

    if (error) throw new Error(error.message);

    await writePlatformAdminAction(
      {
        platformAccountId: params.context.account.id,
        actorUserId: params.context.user.id,
        action: AuditAction.HELP_STEP_UPDATED,
        targetType: AuditEntityType.HELP_ARTICLE_STEP,
        targetId: params.stepId,
        metadata: { article_id: params.articleId },
      },
      { client: admin },
    );

    return { id: params.stepId };
  }

  const { data, error } = await admin
    .from("help_article_steps")
    .insert({
      article_id: params.articleId,
      version_id: null,
      step_number: params.data.step_number,
      title: params.data.title,
      instruction: params.data.instruction,
      expected_result: params.data.expected_result,
      tip_text: params.data.tip_text,
      warning_text: params.data.warning_text,
      deep_link_path: params.data.deep_link_path,
      deep_link_label: params.data.deep_link_label,
      required_permission: params.data.required_permission,
      required_feature_key: params.data.required_feature_key,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_STEP_CREATED,
      targetType: AuditEntityType.HELP_ARTICLE_STEP,
      targetId: data.id,
      metadata: { article_id: params.articleId },
    },
    { client: admin },
  );

  return { id: data.id };
}

export async function deleteHelpStepForAdmin(params: {
  context: PlatformContext;
  articleId: string;
  stepId: string;
}): Promise<void> {
  const admin = adminClient();
  const { error } = await admin
    .from("help_article_steps")
    .delete()
    .eq("id", params.stepId)
    .eq("article_id", params.articleId)
    .is("version_id", null);

  if (error) throw new Error(error.message);

  const { data: remaining } = await admin
    .from("help_article_steps")
    .select("id")
    .eq("article_id", params.articleId)
    .is("version_id", null)
    .order("step_number", { ascending: true });

  for (let index = 0; index < (remaining ?? []).length; index += 1) {
    const step = remaining![index]!;
    await admin
      .from("help_article_steps")
      .update({ step_number: index + 1 })
      .eq("id", (step as { id: string }).id);
  }

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_STEP_DELETED,
      targetType: AuditEntityType.HELP_ARTICLE_STEP,
      targetId: params.stepId,
      metadata: { article_id: params.articleId },
    },
    { client: admin },
  );
}

export async function moveHelpStepForAdmin(params: {
  context: PlatformContext;
  articleId: string;
  stepId: string;
  direction: "up" | "down";
}): Promise<void> {
  const admin = adminClient();
  const { data: steps, error } = await admin
    .from("help_article_steps")
    .select("id, step_number")
    .eq("article_id", params.articleId)
    .is("version_id", null)
    .order("step_number", { ascending: true });

  if (error) throw new Error(error.message);

  const list = (steps ?? []) as Array<{ id: string; step_number: number }>;
  const index = list.findIndex((step) => step.id === params.stepId);
  if (index < 0) throw new Error("Step not found.");

  const swapWith =
    params.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) return;

  const current = list[index]!;
  const other = list[swapWith]!;

  // Temporary number avoids unique constraint clashes.
  await admin
    .from("help_article_steps")
    .update({ step_number: 10000 + current.step_number })
    .eq("id", current.id);
  await admin
    .from("help_article_steps")
    .update({ step_number: current.step_number })
    .eq("id", other.id);
  await admin
    .from("help_article_steps")
    .update({ step_number: other.step_number })
    .eq("id", current.id);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_STEP_UPDATED,
      targetType: AuditEntityType.HELP_ARTICLE_STEP,
      targetId: params.stepId,
      metadata: {
        article_id: params.articleId,
        direction: params.direction,
      },
    },
    { client: admin },
  );
}

export type HelpArticleVersionSummary = {
  id: string;
  article_id: string;
  version_number: number;
  title: string;
  summary: string | null;
  change_summary: string | null;
  published_at: string;
  published_by_platform_account_id: string | null;
  is_current_published: boolean;
  step_count: number;
};

type VersionStepSnapshot = {
  step_number: number;
  title: string;
  instruction: string;
  expected_result?: string | null;
  tip_text?: string | null;
  warning_text?: string | null;
  deep_link_path?: string | null;
  deep_link_label?: string | null;
  required_permission?: string | null;
  required_feature_key?: string | null;
};

export async function listHelpArticleVersionsForAdmin(
  articleId: string,
): Promise<HelpArticleVersionSummary[]> {
  const admin = adminClient();
  const [{ data: article }, { data: versions, error }] = await Promise.all([
    admin
      .from("help_articles")
      .select("published_version_id")
      .eq("id", articleId)
      .maybeSingle(),
    admin
      .from("help_article_versions")
      .select(
        "id, article_id, version_number, title, summary, change_summary, published_at, published_by_platform_account_id, steps_snapshot",
      )
      .eq("article_id", articleId)
      .order("version_number", { ascending: false }),
  ]);

  if (error) throw new Error(error.message);

  const publishedVersionId =
    (article as { published_version_id: string | null } | null)
      ?.published_version_id ?? null;

  return ((versions ?? []) as Array<Record<string, unknown>>).map((row) => {
    const snapshot = Array.isArray(row.steps_snapshot)
      ? (row.steps_snapshot as unknown[])
      : [];
    return {
      id: String(row.id),
      article_id: String(row.article_id),
      version_number: Number(row.version_number),
      title: String(row.title),
      summary: (row.summary as string | null) ?? null,
      change_summary: (row.change_summary as string | null) ?? null,
      published_at: String(row.published_at),
      published_by_platform_account_id:
        (row.published_by_platform_account_id as string | null) ?? null,
      is_current_published: String(row.id) === publishedVersionId,
      step_count: snapshot.length,
    };
  });
}

export async function getHelpArticleVersionForAdmin(
  versionId: string,
): Promise<{
  id: string;
  article_id: string;
  version_number: number;
  title: string;
  summary: string | null;
  body_content: string;
  body_format: HelpBodyFormat;
  article_type: HelpArticleType;
  audience_scope: HelpAudienceScope;
  estimated_minutes: number | null;
  difficulty: HelpDifficulty | null;
  search_keywords: string[];
  context_keys: string[];
  prerequisites: string[];
  expected_result: string | null;
  change_summary: string | null;
  published_at: string;
  steps: VersionStepSnapshot[];
} | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("help_article_versions")
    .select(
      `
      id, article_id, version_number, title, summary, body_content, body_format,
      article_type, audience_scope, estimated_minutes, difficulty, search_keywords,
      context_keys, prerequisites, expected_result, change_summary, published_at,
      steps_snapshot
    `,
    )
    .eq("id", versionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const { data: versionSteps } = await admin
    .from("help_article_steps")
    .select(
      `
      step_number, title, instruction, expected_result, tip_text, warning_text,
      deep_link_path, deep_link_label, required_permission, required_feature_key
    `,
    )
    .eq("version_id", versionId)
    .order("step_number", { ascending: true });

  const stepsFromRows = (versionSteps ?? []) as VersionStepSnapshot[];
  const stepsFromSnapshot = Array.isArray(row.steps_snapshot)
    ? (row.steps_snapshot as VersionStepSnapshot[])
    : [];

  return {
    id: String(row.id),
    article_id: String(row.article_id),
    version_number: Number(row.version_number),
    title: String(row.title),
    summary: (row.summary as string | null) ?? null,
    body_content: String(row.body_content ?? ""),
    body_format: (row.body_format as HelpBodyFormat) || "markdown",
    article_type: row.article_type as HelpArticleType,
    audience_scope: row.audience_scope as HelpAudienceScope,
    estimated_minutes: (row.estimated_minutes as number | null) ?? null,
    difficulty: (row.difficulty as HelpDifficulty | null) ?? null,
    search_keywords: (row.search_keywords as string[]) ?? [],
    context_keys: (row.context_keys as string[]) ?? [],
    prerequisites: (row.prerequisites as string[]) ?? [],
    expected_result: (row.expected_result as string | null) ?? null,
    change_summary: (row.change_summary as string | null) ?? null,
    published_at: String(row.published_at),
    steps: stepsFromRows.length > 0 ? stepsFromRows : stepsFromSnapshot,
  };
}

/**
 * Restore a published version into the working draft (does not change the
 * live published_version_id until the article is published again).
 */
export async function restoreHelpArticleVersionForAdmin(params: {
  context: PlatformContext;
  articleId: string;
  versionId: string;
}): Promise<void> {
  const admin = adminClient();
  const version = await getHelpArticleVersionForAdmin(params.versionId);
  if (!version || version.article_id !== params.articleId) {
    throw new Error("Version not found for this article.");
  }

  const { error: updateError } = await admin
    .from("help_articles")
    .update({
      title: version.title,
      summary: version.summary,
      body_content: version.body_content,
      body_format: version.body_format,
      article_type: version.article_type,
      audience_scope: version.audience_scope,
      estimated_minutes: version.estimated_minutes,
      difficulty: version.difficulty,
      search_keywords: version.search_keywords,
      context_keys: version.context_keys,
      prerequisites: version.prerequisites,
      expected_result: version.expected_result,
      status: "draft",
      archived_at: null,
      updated_by_platform_account_id: params.context.account.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.articleId);

  if (updateError) throw new Error(updateError.message);

  const { error: deleteError } = await admin
    .from("help_article_steps")
    .delete()
    .eq("article_id", params.articleId)
    .is("version_id", null);

  if (deleteError) throw new Error(deleteError.message);

  if (version.steps.length > 0) {
    const { error: insertError } = await admin.from("help_article_steps").insert(
      version.steps.map((step, index) => ({
        article_id: params.articleId,
        version_id: null,
        step_number: step.step_number || index + 1,
        title: step.title,
        instruction: step.instruction ?? "",
        expected_result: step.expected_result ?? null,
        tip_text: step.tip_text ?? null,
        warning_text: step.warning_text ?? null,
        deep_link_path: step.deep_link_path ?? null,
        deep_link_label: step.deep_link_label ?? null,
        required_permission: step.required_permission ?? null,
        required_feature_key: step.required_feature_key ?? null,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_ARTICLE_VERSION_RESTORED,
      targetType: AuditEntityType.HELP_ARTICLE_VERSION,
      targetId: params.versionId,
      metadata: {
        article_id: params.articleId,
        version_number: version.version_number,
      },
    },
    { client: admin },
  );
}

export async function setHelpArticleReviewDueForAdmin(params: {
  context: PlatformContext;
  articleId: string;
  reviewDueAt: string | null;
  markReviewed?: boolean;
}): Promise<void> {
  const admin = adminClient();
  const patch: Record<string, unknown> = {
    review_due_at: params.reviewDueAt,
    updated_by_platform_account_id: params.context.account.id,
    updated_at: new Date().toISOString(),
  };
  if (params.markReviewed) {
    patch.last_reviewed_at = new Date().toISOString();
  }

  const { error } = await admin
    .from("help_articles")
    .update(patch)
    .eq("id", params.articleId);

  if (error) throw new Error(error.message);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.HELP_ARTICLE_REVIEW_DUE_SET,
      targetType: AuditEntityType.HELP_ARTICLE,
      targetId: params.articleId,
      metadata: {
        review_due_at: params.reviewDueAt,
        mark_reviewed: Boolean(params.markReviewed),
      },
    },
    { client: admin },
  );
}
