import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { labelForHelpArticleType } from "@/lib/help/constants";
import type { HelpArticleListItem, HelpSearchResult } from "@/lib/help/types";

type CardSource =
  | HelpArticleListItem
  | (HelpSearchResult & {
      estimated_minutes?: number | null;
      category_name?: string | null;
    });

export function HelpArticleCard({ article }: { article: CardSource }) {
  const href = `/help/article/${article.slug}`;
  const minutes =
    "estimated_minutes" in article ? article.estimated_minutes : null;
  const categoryName =
    "category_name" in article ? article.category_name : null;

  return (
    <Card className="h-full transition-colors hover:border-primary/40">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {labelForHelpArticleType(article.article_type)}
          </Badge>
          {categoryName ? (
            <span className="text-xs text-muted-foreground">{categoryName}</span>
          ) : null}
        </div>
        <CardTitle className="text-lg leading-snug">
          <Link href={href} className="hover:underline underline-offset-4">
            {article.title}
          </Link>
        </CardTitle>
        {article.summary ? (
          <CardDescription className="line-clamp-2">
            {article.summary}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {minutes ? (
            <>
              <Clock className="h-3.5 w-3.5" aria-hidden />
              <span>{minutes} min</span>
            </>
          ) : (
            <span>Guide</span>
          )}
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          Read
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
