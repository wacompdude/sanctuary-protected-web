import type { SupabaseClient } from "@supabase/supabase-js";
import { isHelpDeepLinkPath } from "@/lib/help/deep-links";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type HelpAnalyticsSummary = {
  views_7d: number;
  searches_7d: number;
  zero_result_searches_7d: number;
  feedback_yes_7d: number;
  feedback_no_7d: number;
  helpful_rate_7d: number | null;
};

export type HelpTopViewedArticle = {
  article_id: string;
  title: string;
  slug: string;
  view_count: number;
};

export type HelpZeroResultQuery = {
  query_text: string;
  count: number;
  last_seen_at: string;
};

export type HelpFeedbackReportRow = {
  article_id: string;
  title: string;
  slug: string;
  yes_count: number;
  no_count: number;
  latest_comment: string | null;
};

export type HelpReviewReminder = {
  article_id: string;
  title: string;
  slug: string;
  status: string;
  review_due_at: string | null;
  last_reviewed_at: string | null;
  published_at: string | null;
  reason: "review_due" | "in_review" | "stale_published";
};

export type HelpBrokenLinkFinding = {
  article_id: string;
  title: string;
  slug: string;
  source: "step_deep_link" | "support_cta";
  path: string;
  step_number: number | null;
};

export type HelpAnalyticsReport = {
  summary: HelpAnalyticsSummary;
  top_viewed: HelpTopViewedArticle[];
  zero_results: HelpZeroResultQuery[];
  low_rated: HelpFeedbackReportRow[];
  review_reminders: HelpReviewReminder[];
  broken_links: HelpBrokenLinkFinding[];
};

function adminClient(): SupabaseClient {
  return requirePlatformAdminClient();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function getHelpAnalyticsReport(options?: {
  days?: number;
}): Promise<HelpAnalyticsReport> {
  const days = options?.days ?? 7;
  const since = daysAgoIso(days);
  const admin = adminClient();

  const [
    viewsResult,
    searchesResult,
    feedbackResult,
    articlesResult,
    draftStepsResult,
  ] = await Promise.all([
    admin
      .from("help_article_views")
      .select("article_id, created_at")
      .gte("created_at", since),
    admin
      .from("help_search_events")
      .select("query_text, result_count, created_at")
      .gte("created_at", since),
    admin
      .from("help_article_feedback")
      .select("article_id, rating, comment, created_at")
      .gte("created_at", since),
    admin
      .from("help_articles")
      .select(
        "id, title, slug, status, review_due_at, last_reviewed_at, published_at, support_cta_path",
      ),
    admin
      .from("help_article_steps")
      .select("article_id, step_number, deep_link_path, version_id")
      .not("deep_link_path", "is", null),
  ]);

  if (viewsResult.error) throw new Error(viewsResult.error.message);
  if (searchesResult.error) throw new Error(searchesResult.error.message);
  if (feedbackResult.error) throw new Error(feedbackResult.error.message);
  if (articlesResult.error) throw new Error(articlesResult.error.message);
  if (draftStepsResult.error) throw new Error(draftStepsResult.error.message);

  const articles = (articlesResult.data ?? []) as Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    review_due_at: string | null;
    last_reviewed_at: string | null;
    published_at: string | null;
    support_cta_path: string | null;
  }>;
  const articleById = new Map(articles.map((article) => [article.id, article]));

  const views = (viewsResult.data ?? []) as Array<{
    article_id: string;
    created_at: string;
  }>;
  const searches = (searchesResult.data ?? []) as Array<{
    query_text: string;
    result_count: number;
    created_at: string;
  }>;
  const feedback = (feedbackResult.data ?? []) as Array<{
    article_id: string;
    rating: "yes" | "no";
    comment: string | null;
    created_at: string;
  }>;

  const viewCounts = new Map<string, number>();
  for (const row of views) {
    viewCounts.set(row.article_id, (viewCounts.get(row.article_id) ?? 0) + 1);
  }

  const top_viewed: HelpTopViewedArticle[] = [...viewCounts.entries()]
    .map(([article_id, view_count]) => {
      const article = articleById.get(article_id);
      return {
        article_id,
        title: article?.title ?? "Unknown article",
        slug: article?.slug ?? "",
        view_count,
      };
    })
    .sort((a, b) => b.view_count - a.view_count)
    .slice(0, 15);

  const zeroMap = new Map<string, { count: number; last_seen_at: string }>();
  for (const row of searches) {
    if (row.result_count !== 0) continue;
    const key = row.query_text.trim().toLowerCase();
    if (!key) continue;
    const existing = zeroMap.get(key);
    if (!existing) {
      zeroMap.set(key, { count: 1, last_seen_at: row.created_at });
    } else {
      existing.count += 1;
      if (row.created_at > existing.last_seen_at) {
        existing.last_seen_at = row.created_at;
      }
    }
  }

  const zero_results: HelpZeroResultQuery[] = [...zeroMap.entries()]
    .map(([query_text, value]) => ({
      query_text,
      count: value.count,
      last_seen_at: value.last_seen_at,
    }))
    .sort((a, b) => b.count - a.count || b.last_seen_at.localeCompare(a.last_seen_at))
    .slice(0, 25);

  const feedbackMap = new Map<
    string,
    { yes: number; no: number; latest_comment: string | null; latest_at: string }
  >();
  for (const row of feedback) {
    const current = feedbackMap.get(row.article_id) ?? {
      yes: 0,
      no: 0,
      latest_comment: null,
      latest_at: "",
    };
    if (row.rating === "yes") current.yes += 1;
    else current.no += 1;
    if (row.comment && row.created_at >= current.latest_at) {
      current.latest_comment = row.comment;
      current.latest_at = row.created_at;
    }
    feedbackMap.set(row.article_id, current);
  }

  const low_rated: HelpFeedbackReportRow[] = [...feedbackMap.entries()]
    .map(([article_id, value]) => {
      const article = articleById.get(article_id);
      return {
        article_id,
        title: article?.title ?? "Unknown article",
        slug: article?.slug ?? "",
        yes_count: value.yes,
        no_count: value.no,
        latest_comment: value.latest_comment,
      };
    })
    .filter((row) => row.no_count > 0)
    .sort((a, b) => b.no_count - a.no_count || a.yes_count - b.yes_count)
    .slice(0, 20);

  const now = Date.now();
  const staleCutoff = now - 180 * 24 * 60 * 60 * 1000;
  const review_reminders: HelpReviewReminder[] = [];

  for (const article of articles) {
    if (article.status === "in_review") {
      review_reminders.push({
        article_id: article.id,
        title: article.title,
        slug: article.slug,
        status: article.status,
        review_due_at: article.review_due_at,
        last_reviewed_at: article.last_reviewed_at,
        published_at: article.published_at,
        reason: "in_review",
      });
      continue;
    }

    if (
      article.review_due_at &&
      new Date(article.review_due_at).getTime() <= now &&
      article.status !== "archived"
    ) {
      review_reminders.push({
        article_id: article.id,
        title: article.title,
        slug: article.slug,
        status: article.status,
        review_due_at: article.review_due_at,
        last_reviewed_at: article.last_reviewed_at,
        published_at: article.published_at,
        reason: "review_due",
      });
      continue;
    }

    if (
      article.status === "published" &&
      article.published_at &&
      new Date(article.published_at).getTime() <= staleCutoff &&
      !article.review_due_at
    ) {
      review_reminders.push({
        article_id: article.id,
        title: article.title,
        slug: article.slug,
        status: article.status,
        review_due_at: article.review_due_at,
        last_reviewed_at: article.last_reviewed_at,
        published_at: article.published_at,
        reason: "stale_published",
      });
    }
  }

  review_reminders.sort((a, b) => {
    const aDue = a.review_due_at ?? a.published_at ?? "";
    const bDue = b.review_due_at ?? b.published_at ?? "";
    return aDue.localeCompare(bDue);
  });

  const broken_links: HelpBrokenLinkFinding[] = [];
  for (const article of articles) {
    if (
      article.support_cta_path &&
      !isHelpDeepLinkPath(article.support_cta_path)
    ) {
      broken_links.push({
        article_id: article.id,
        title: article.title,
        slug: article.slug,
        source: "support_cta",
        path: article.support_cta_path,
        step_number: null,
      });
    }
  }

  for (const step of (draftStepsResult.data ?? []) as Array<{
    article_id: string;
    step_number: number;
    deep_link_path: string | null;
    version_id: string | null;
  }>) {
    if (!step.deep_link_path || isHelpDeepLinkPath(step.deep_link_path)) {
      continue;
    }
    const article = articleById.get(step.article_id);
    if (!article) continue;
    broken_links.push({
      article_id: article.id,
      title: article.title,
      slug: article.slug,
      source: "step_deep_link",
      path: step.deep_link_path,
      step_number: step.step_number,
    });
  }

  const yes = feedback.filter((row) => row.rating === "yes").length;
  const no = feedback.filter((row) => row.rating === "no").length;
  const totalFeedback = yes + no;

  return {
    summary: {
      views_7d: views.length,
      searches_7d: searches.length,
      zero_result_searches_7d: searches.filter((row) => row.result_count === 0)
        .length,
      feedback_yes_7d: yes,
      feedback_no_7d: no,
      helpful_rate_7d:
        totalFeedback === 0 ? null : Math.round((yes / totalFeedback) * 100),
    },
    top_viewed,
    zero_results,
    low_rated,
    review_reminders: review_reminders.slice(0, 50),
    broken_links: broken_links.slice(0, 100),
  };
}
