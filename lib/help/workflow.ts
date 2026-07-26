import { normalizeHelpDeepLinkPath } from "@/lib/help/deep-links";
import type {
  HelpArticleDetail,
  HelpArticleRelation,
  HelpArticleStep,
  HelpRelationType,
} from "@/lib/help/types";

/** Mobile-translatable step (ordered workflow unit). */
export type HelpWorkflowStep = {
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

/** Ordered workflow payload for web + future Expo article screens. */
export type HelpWorkflow = {
  article_id: string;
  slug: string;
  title: string;
  prerequisites: string[];
  expected_result: string | null;
  steps: HelpWorkflowStep[];
  next_steps: HelpArticleRelation[];
  prerequisites_articles: HelpArticleRelation[];
  related: HelpArticleRelation[];
};

export function orderHelpArticleSteps<
  T extends Pick<HelpArticleStep, "step_number" | "id">,
>(steps: readonly T[]): T[] {
  return [...steps].sort(
    (a, b) =>
      a.step_number - b.step_number || a.id.localeCompare(b.id),
  );
}

function relationsOfType(
  relations: readonly HelpArticleRelation[],
  type: HelpRelationType,
): HelpArticleRelation[] {
  return relations
    .filter((row) => row.relationship_type === type)
    .slice()
    .sort(
      (a, b) =>
        a.display_order - b.display_order ||
        a.target_title.localeCompare(b.target_title),
    );
}

export function buildHelpWorkflow(article: HelpArticleDetail): HelpWorkflow {
  const ordered = orderHelpArticleSteps(article.steps);

  return {
    article_id: article.id,
    slug: article.slug,
    title: article.title,
    prerequisites: [...article.prerequisites],
    expected_result: article.expected_result,
    steps: ordered.map((step) => ({
      step_number: step.step_number,
      title: step.title,
      instruction: step.instruction,
      expected_result: step.expected_result,
      tip_text: step.tip_text,
      warning_text: step.warning_text,
      deep_link_path: normalizeHelpDeepLinkPath(step.deep_link_path),
      deep_link_label: step.deep_link_label,
      required_permission: step.required_permission,
      required_feature_key: step.required_feature_key,
      screenshot_storage_path: step.screenshot_storage_path,
    })),
    next_steps: relationsOfType(article.relations, "next_step"),
    prerequisites_articles: relationsOfType(article.relations, "prerequisite"),
    related: relationsOfType(article.relations, "related"),
  };
}
