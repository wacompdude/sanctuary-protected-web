"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import {
  recordHelpArticleView,
  submitHelpArticleFeedback,
} from "@/lib/help/queries";
import { validateHelpFeedback } from "@/lib/help/validation";
import type { HelpActionState } from "@/lib/help/types";

export async function submitHelpFeedbackAction(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  const { church, user } = await getAuthenticatedUserWithChurch();

  const articleId = String(formData.get("article_id") ?? "");
  const articleSlug = String(formData.get("article_slug") ?? "");
  const rating = String(formData.get("rating") ?? "");
  const comment = String(formData.get("comment") ?? "");
  const articleVersionId = String(formData.get("article_version_id") ?? "") || null;

  const validated = validateHelpFeedback({ articleId, rating, comment });
  if (!validated.data) {
    return { error: validated.error ?? "Unable to submit feedback." };
  }

  const result = await submitHelpArticleFeedback({
    articleId: validated.data.articleId,
    rating: validated.data.rating,
    comment: validated.data.comment,
    articleVersionId,
    churchId: church.id,
    userId: user.id,
  });

  if (result.error) {
    return { error: result.error };
  }

  if (articleSlug) {
    revalidatePath(`/help/article/${articleSlug}`);
  }

  return { success: "Thanks for your feedback." };
}

export async function recordHelpArticleViewAction(params: {
  articleId: string;
  articleVersionId?: string | null;
}): Promise<void> {
  try {
    const { church, user } = await getAuthenticatedUserWithChurch();
    await recordHelpArticleView({
      articleId: params.articleId,
      articleVersionId: params.articleVersionId ?? null,
      churchId: church.id,
      userId: user.id,
    });
  } catch {
    // Views must not break article rendering.
  }
}
