"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createHelpArticleForAdmin,
  createHelpCategoryForAdmin,
  deleteHelpArticleForAdmin,
  deleteHelpCategoryForAdmin,
  deleteHelpStepForAdmin,
  moveHelpStepForAdmin,
  publishHelpArticleForAdmin,
  restoreHelpArticleVersionForAdmin,
  setHelpArticleReviewDueForAdmin,
  setHelpArticleStatusForAdmin,
  updateHelpArticleForAdmin,
  updateHelpCategoryForAdmin,
  upsertHelpStepForAdmin,
} from "@/lib/help/admin";
import { requireHelpPermission } from "@/lib/help/permissions";
import type { HelpActionState } from "@/lib/help/types";
import {
  validateHelpArticleForm,
  validateHelpCategoryForm,
  validateHelpStepForm,
} from "@/lib/help/validation";

function revalidateHelpPaths(articleId?: string) {
  revalidatePath("/platform/help");
  revalidatePath("/platform/help/categories");
  revalidatePath("/help");
  if (articleId) {
    revalidatePath(`/platform/help/articles/${articleId}`);
  }
}

export async function createHelpCategoryAction(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  try {
    const context = await requireHelpPermission(
      "help.categories.manage",
      "help.create",
    );
    const validation = validateHelpCategoryForm(formData);
    if (!validation.data) {
      return {
        error: validation.error,
        fieldErrors: validation.fieldErrors,
      };
    }
    await createHelpCategoryForAdmin({ context, data: validation.data });
    revalidateHelpPaths();
    return { success: "Category created." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to create category.",
    };
  }
}

export async function updateHelpCategoryAction(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  try {
    const context = await requireHelpPermission(
      "help.categories.manage",
      "help.update",
    );
    const categoryId = String(formData.get("category_id") ?? "").trim();
    if (!categoryId) return { error: "Category id is required." };

    const validation = validateHelpCategoryForm(formData);
    if (!validation.data) {
      return {
        error: validation.error,
        fieldErrors: validation.fieldErrors,
      };
    }

    await updateHelpCategoryForAdmin({
      context,
      categoryId,
      data: validation.data,
    });
    revalidateHelpPaths();
    return { success: "Category updated." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update category.",
    };
  }
}

export async function createHelpArticleAction(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  try {
    const context = await requireHelpPermission("help.create");
    const validation = validateHelpArticleForm(formData);
    if (!validation.data) {
      return {
        error: validation.error,
        fieldErrors: validation.fieldErrors,
      };
    }
    const { id } = await createHelpArticleForAdmin({
      context,
      data: validation.data,
    });
    revalidateHelpPaths(id);
    redirect(`/platform/help/articles/${id}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      error:
        error instanceof Error ? error.message : "Unable to create article.",
    };
  }
}

export async function updateHelpArticleAction(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  try {
    const context = await requireHelpPermission("help.update");
    const articleId = String(formData.get("article_id") ?? "").trim();
    if (!articleId) return { error: "Article id is required." };

    const validation = validateHelpArticleForm(formData);
    if (!validation.data) {
      return {
        error: validation.error,
        fieldErrors: validation.fieldErrors,
      };
    }

    await updateHelpArticleForAdmin({
      context,
      articleId,
      data: validation.data,
    });
    revalidateHelpPaths(articleId);
    revalidatePath(`/help/article/${validation.data.slug}`);
    return { success: "Article saved." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update article.",
    };
  }
}

export async function submitHelpArticleAction(
  formData: FormData,
): Promise<void> {
  const context = await requireHelpPermission("help.update");
  const articleId = String(formData.get("article_id") ?? "").trim();
  if (!articleId) return;
  await setHelpArticleStatusForAdmin({
    context,
    articleId,
    status: "in_review",
  });
  revalidateHelpPaths(articleId);
}

export async function archiveHelpArticleAction(
  formData: FormData,
): Promise<void> {
  const context = await requireHelpPermission("help.archive");
  const articleId = String(formData.get("article_id") ?? "").trim();
  if (!articleId) return;
  await setHelpArticleStatusForAdmin({
    context,
    articleId,
    status: "archived",
  });
  revalidateHelpPaths(articleId);
}

export async function restoreHelpArticleAction(
  formData: FormData,
): Promise<void> {
  const context = await requireHelpPermission("help.update", "help.archive");
  const articleId = String(formData.get("article_id") ?? "").trim();
  if (!articleId) return;
  await setHelpArticleStatusForAdmin({
    context,
    articleId,
    status: "draft",
  });
  revalidateHelpPaths(articleId);
}

export async function publishHelpArticleAction(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  try {
    const context = await requireHelpPermission("help.publish");
    const articleId = String(formData.get("article_id") ?? "").trim();
    if (!articleId) return { error: "Article id is required." };
    const changeSummary = String(formData.get("change_summary") ?? "").trim();

    const result = await publishHelpArticleForAdmin({
      context,
      articleId,
      changeSummary: changeSummary || null,
    });
    revalidateHelpPaths(articleId);
    return {
      success: `Published as version ${result.versionNumber}.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to publish article.",
    };
  }
}

export async function saveHelpStepAction(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  try {
    const context = await requireHelpPermission("help.update", "help.create");
    const articleId = String(formData.get("article_id") ?? "").trim();
    const stepId = String(formData.get("step_id") ?? "").trim() || null;
    if (!articleId) return { error: "Article id is required." };

    const validation = validateHelpStepForm(formData);
    if (!validation.data) {
      return {
        error: validation.error,
        fieldErrors: validation.fieldErrors,
      };
    }

    await upsertHelpStepForAdmin({
      context,
      articleId,
      stepId,
      data: validation.data,
    });
    revalidateHelpPaths(articleId);
    return { success: stepId ? "Step updated." : "Step added." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to save step.",
    };
  }
}

export async function deleteHelpStepAction(formData: FormData): Promise<void> {
  const context = await requireHelpPermission("help.update");
  const articleId = String(formData.get("article_id") ?? "").trim();
  const stepId = String(formData.get("step_id") ?? "").trim();
  if (!articleId || !stepId) return;
  await deleteHelpStepForAdmin({ context, articleId, stepId });
  revalidateHelpPaths(articleId);
}

export async function deleteHelpArticleAction(
  formData: FormData,
): Promise<void> {
  const context = await requireHelpPermission("help.archive", "help.manage");
  const articleId = String(formData.get("article_id") ?? "").trim();
  if (!articleId) {
    throw new Error("Article id is required.");
  }

  await deleteHelpArticleForAdmin({ context, articleId });
  revalidateHelpPaths(articleId);
  revalidatePath("/platform/help/analytics");
  redirect("/platform/help");
}

export async function deleteHelpCategoryAction(
  formData: FormData,
): Promise<void> {
  const context = await requireHelpPermission(
    "help.categories.manage",
    "help.manage",
  );
  const categoryId = String(formData.get("category_id") ?? "").trim();
  if (!categoryId) {
    throw new Error("Category id is required.");
  }

  await deleteHelpCategoryForAdmin({ context, categoryId });
  revalidateHelpPaths();
  redirect("/platform/help/categories");
}

export async function moveHelpStepAction(formData: FormData): Promise<void> {
  const context = await requireHelpPermission("help.update");
  const articleId = String(formData.get("article_id") ?? "").trim();
  const stepId = String(formData.get("step_id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  if (!articleId || !stepId) return;
  if (direction !== "up" && direction !== "down") return;
  await moveHelpStepForAdmin({
    context,
    articleId,
    stepId,
    direction,
  });
  revalidateHelpPaths(articleId);
}

export async function restoreHelpArticleVersionAction(
  formData: FormData,
): Promise<void> {
  const context = await requireHelpPermission("help.update", "help.publish");
  const articleId = String(formData.get("article_id") ?? "").trim();
  const versionId = String(formData.get("version_id") ?? "").trim();
  if (!articleId || !versionId) return;

  await restoreHelpArticleVersionForAdmin({
    context,
    articleId,
    versionId,
  });
  revalidateHelpPaths(articleId);
  revalidatePath(`/platform/help/articles/${articleId}/versions`);
  redirect(`/platform/help/articles/${articleId}`);
}

export async function setHelpArticleReviewDueAction(
  _prev: HelpActionState,
  formData: FormData,
): Promise<HelpActionState> {
  try {
    const context = await requireHelpPermission("help.update");
    const articleId = String(formData.get("article_id") ?? "").trim();
    if (!articleId) return { error: "Article id is required." };

    const rawDue = String(formData.get("review_due_at") ?? "").trim();
    const markReviewed = formData.get("mark_reviewed") === "true";
    let reviewDueAt: string | null = null;
    if (rawDue) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDue)) {
        return { error: "Review due date must be YYYY-MM-DD." };
      }
      reviewDueAt = `${rawDue}T00:00:00.000Z`;
    }

    await setHelpArticleReviewDueForAdmin({
      context,
      articleId,
      reviewDueAt,
      markReviewed: markReviewed || !rawDue,
    });
    revalidateHelpPaths(articleId);
    revalidatePath("/platform/help/analytics");
    return { success: "Review schedule updated." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update review schedule.",
    };
  }
}
