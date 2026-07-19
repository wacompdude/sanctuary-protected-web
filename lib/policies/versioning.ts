export function formatVersionLabel(versionNumber: number): string {
  return (Math.round(versionNumber * 10) / 10).toFixed(1);
}

export function initialDraftVersionNumber(): number {
  return 0.1;
}

/** First publish promotes pre-1.0 drafts to 1.0. */
export function versionNumberForPublish(
  current: number,
  hasPriorPublished: boolean,
): number {
  if (!hasPriorPublished && current < 1) {
    return 1.0;
  }
  return Math.round(current * 10) / 10;
}

/** Next editable draft after a published version (1.0 → 1.1). */
export function nextDraftVersionNumber(publishedNumber: number): number {
  return Math.round((publishedNumber + 0.1) * 10) / 10;
}

export function countWords(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function slugifyPolicyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 79);
  return base || "policy";
}
