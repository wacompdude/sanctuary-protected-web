import Link from "next/link";
import { FolderTree } from "lucide-react";
import type { HelpCategoryTreeNode } from "@/lib/help/types";

function CategoryBranch({
  node,
  depth = 0,
}: {
  node: HelpCategoryTreeNode;
  depth?: number;
}) {
  return (
    <li>
      <Link
        href={`/help/category/${node.slug}`}
        className="flex items-start justify-between gap-3 rounded-md px-3 py-2 hover:bg-muted/70"
        style={{ paddingLeft: `${0.75 + depth * 0.875}rem` }}
      >
        <span className="min-w-0">
          <span className="block font-medium text-foreground">{node.name}</span>
          {node.description ? (
            <span className="mt-0.5 block text-sm text-muted-foreground line-clamp-2">
              {node.description}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {node.article_count}
        </span>
      </Link>
      {node.children.length > 0 ? (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <CategoryBranch key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function HelpCategoryTree({
  tree,
  emptyMessage = "Topics will appear here once Help content is published.",
}: {
  tree: HelpCategoryTreeNode[];
  emptyMessage?: string;
}) {
  if (tree.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <FolderTree className="h-4 w-4" aria-hidden />
        Browse topics
      </div>
      <ul className="space-y-0.5 rounded-lg border bg-card p-1">
        {tree.map((node) => (
          <CategoryBranch key={node.id} node={node} />
        ))}
      </ul>
    </div>
  );
}
