import Link from "next/link";
import { labelForHelpRelationType } from "@/lib/help/constants";
import type { HelpArticleRelation, HelpRelationType } from "@/lib/help/types";

const GROUP_ORDER: HelpRelationType[] = [
  "prerequisite",
  "next_step",
  "previous_step",
  "troubleshooting",
  "upgrade_information",
  "related",
];

export function HelpRelatedArticles({
  relations,
}: {
  relations: HelpArticleRelation[];
}) {
  if (relations.length === 0) return null;

  const grouped = new Map<HelpRelationType, HelpArticleRelation[]>();
  for (const relation of relations) {
    const list = grouped.get(relation.relationship_type) ?? [];
    list.push(relation);
    grouped.set(relation.relationship_type, list);
  }

  const orderedTypes = GROUP_ORDER.filter((type) => grouped.has(type));

  return (
    <section className="space-y-4" aria-labelledby="help-related-heading">
      <h2 id="help-related-heading" className="text-xl font-semibold tracking-tight">
        Related articles
      </h2>
      <div className="space-y-4">
        {orderedTypes.map((type) => {
          const items = grouped.get(type) ?? [];
          return (
            <div key={type}>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                {labelForHelpRelationType(type)}
              </h3>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/help/article/${item.target_slug}`}
                      className="block min-h-11 rounded-md border border-border px-3 py-2.5 hover:bg-muted/50"
                    >
                      <span className="font-medium text-foreground">
                        {item.target_title}
                      </span>
                      {item.target_summary ? (
                        <span className="mt-0.5 block text-sm text-muted-foreground line-clamp-2">
                          {item.target_summary}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
