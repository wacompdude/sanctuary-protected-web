import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ResolvedDashboardBoxSetting } from "@/lib/dashboard/types";

export function DashboardStatBox({
  box,
  value,
  description,
}: {
  box: ResolvedDashboardBoxSetting;
  value: string;
  description: string;
}) {
  const cardStyle: CSSProperties = {
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
        className="h-full border shadow-none transition-opacity hover:opacity-90"
        style={cardStyle}
      >
        <CardHeader className="space-y-1 p-3 pb-1">
          <CardDescription
            className="text-xs leading-snug"
            style={{ color: box.palette.mutedTextColor }}
          >
            {box.title}
          </CardDescription>
          <CardTitle
            className="text-xl font-semibold tabular-nums"
            style={{ color: box.palette.textColor }}
          >
            {value}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <p
            className="text-xs leading-snug"
            style={{ color: box.palette.mutedTextColor }}
          >
            {description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
