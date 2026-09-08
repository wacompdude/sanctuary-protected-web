import type { LegalBlock, LegalDocument } from "@/lib/legal/types";

function blockText(block: LegalBlock): string[] {
  if (block.type === "p") return [block.text];
  if (block.type === "ul") return block.items;
  if (block.type === "callout") return [block.callout.title, block.callout.body];
  return [block.text];
}

export function flattenLegalDocument(document: LegalDocument): string {
  const parts: string[] = [];
  if (document.intro) parts.push(document.intro);
  for (const section of document.sections) {
    parts.push(section.title);
    for (const block of section.blocks) {
      parts.push(...blockText(block));
    }
  }
  return parts.join("\n");
}

export function flattenAttorneyReviewNotes(document: LegalDocument): string[] {
  return document.sections
    .filter((section) => Boolean(section.attorneyReview))
    .map((section) => `${section.id}: ${section.attorneyReview}`);
}
