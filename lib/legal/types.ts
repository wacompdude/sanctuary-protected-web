export type LegalCallout = {
  title: string;
  body: string;
};

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "callout"; callout: LegalCallout }
  | { type: "placeholder"; text: string };

export type LegalSection = {
  id: string;
  title: string;
  /** Source-only review tag; never rendered. */
  attorneyReview?: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  slug: "terms" | "privacy" | "billing";
  title: string;
  metaTitle: string;
  metaDescription: string;
  version: string;
  effectiveDate: string;
  lastUpdated: string;
  intro?: string;
  sections: LegalSection[];
};
