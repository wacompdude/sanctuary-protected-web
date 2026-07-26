import { Badge } from "@/components/ui/badge";
import type { HelpFeatureNotice } from "@/lib/help/types";

export function HelpPlanNotices({ notices }: { notices: HelpFeatureNotice[] }) {
  if (notices.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">Plan availability</p>
      <ul className="space-y-2">
        {notices.map((notice) => (
          <li
            key={notice.feature_key}
            className="flex flex-wrap items-start gap-2 text-sm"
          >
            <Badge variant={notice.included ? "default" : "outline"}>
              {notice.included ? "Included in your plan" : "Upgrade available"}
            </Badge>
            <span className="text-muted-foreground">{notice.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
