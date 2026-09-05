import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deriveZeroCountDashboardBoxPalette,
  isDashboardBoxZeroCount,
} from "@/lib/dashboard/presentation";
import type { ResolvedDashboardBoxSetting } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export function DashboardStatBox({
  box,
  value,
  description,
  itemCount,
}: {
  box: ResolvedDashboardBoxSetting;
  value: string;
  description: string;
  itemCount: number;
}) {
  const subdued = isDashboardBoxZeroCount(itemCount);
  const lightSubdued = subdued
    ? deriveZeroCountDashboardBoxPalette(
        box.backgroundColor,
        box.textColor,
        "light",
      )
    : box.palette;
  const darkSubdued = subdued
    ? deriveZeroCountDashboardBoxPalette(
        box.backgroundColor,
        box.textColor,
        "dark",
      )
    : box.palette;

  const cardStyle: CSSProperties = subdued
    ? {
        ["--dash-box-bg" as string]: lightSubdued.backgroundColor,
        ["--dash-box-fg" as string]: lightSubdued.textColor,
        ["--dash-box-muted" as string]: lightSubdued.mutedTextColor,
        ["--dash-box-border" as string]: lightSubdued.borderColor,
        ["--dash-box-bg-dark" as string]: darkSubdued.backgroundColor,
        ["--dash-box-fg-dark" as string]: darkSubdued.textColor,
        ["--dash-box-muted-dark" as string]: darkSubdued.mutedTextColor,
        ["--dash-box-border-dark" as string]: darkSubdued.borderColor,
        backgroundColor: "var(--dash-box-bg)",
        color: "var(--dash-box-fg)",
        borderColor: "var(--dash-box-border)",
        borderStyle: "solid",
        borderWidth: "1px",
      }
    : {
        backgroundColor: box.palette.backgroundColor,
        color: box.palette.textColor,
        borderColor: box.palette.borderColor,
        borderStyle: "solid",
        borderWidth: "1px",
      };

  return (
    <Link
      href={box.route}
      className="block"
      aria-disabled={box.isPlaceholder ? true : undefined}
    >
      <Card
        className={cn(
          "h-full border shadow-none transition-opacity hover:opacity-90",
          subdued &&
            "dark:[background-color:var(--dash-box-bg-dark)] dark:[color:var(--dash-box-fg-dark)] dark:[border-color:var(--dash-box-border-dark)]",
        )}
        style={cardStyle}
      >
        <CardHeader className="space-y-1 p-3 pb-1">
          <CardDescription
            className={cn(
              "text-xs leading-snug",
              subdued && "dark:[color:var(--dash-box-muted-dark)]",
            )}
            style={{
              color: subdued
                ? "var(--dash-box-muted)"
                : box.palette.mutedTextColor,
            }}
          >
            {box.title}
          </CardDescription>
          <CardTitle
            className={cn(
              "text-xl font-semibold tabular-nums",
              subdued && "dark:[color:var(--dash-box-fg-dark)]",
            )}
            style={{
              color: subdued ? "var(--dash-box-fg)" : box.palette.textColor,
            }}
          >
            {value}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <p
            className={cn(
              "text-xs leading-snug",
              subdued && "dark:[color:var(--dash-box-muted-dark)]",
            )}
            style={{
              color: subdued
                ? "var(--dash-box-muted)"
                : box.palette.mutedTextColor,
            }}
          >
            {description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
