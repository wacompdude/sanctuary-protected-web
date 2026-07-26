import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-700/60 bg-emerald-950/50 text-emerald-300",
  trial: "border-sky-700/60 bg-sky-950/50 text-sky-300",
  trialing: "border-sky-700/60 bg-sky-950/50 text-sky-300",
  suspended: "border-amber-700/60 bg-amber-950/50 text-amber-300",
  closed: "border-rose-700/60 bg-rose-950/50 text-rose-300",
  past_due: "border-orange-700/60 bg-orange-950/50 text-orange-300",
  disabled: "border-rose-700/60 bg-rose-950/50 text-rose-300",
  locked: "border-rose-700/60 bg-rose-950/50 text-rose-300",
  invited: "border-slate-600 bg-slate-900 text-slate-300",
  archived: "border-slate-600 bg-slate-900 text-slate-400",
  ended: "border-slate-600 bg-slate-900 text-slate-400",
  expired: "border-amber-700/60 bg-amber-950/50 text-amber-300",
  revoked: "border-rose-700/60 bg-rose-950/50 text-rose-300",
  pending: "border-sky-700/60 bg-sky-950/50 text-sky-300",
  queued: "border-sky-700/60 bg-sky-950/50 text-sky-300",
  failed: "border-rose-700/60 bg-rose-950/50 text-rose-300",
  processed: "border-emerald-700/60 bg-emerald-950/50 text-emerald-300",
  received: "border-slate-600 bg-slate-900 text-slate-300",
  draft: "border-slate-600 bg-slate-900 text-slate-300",
  in_review: "border-sky-700/60 bg-sky-950/50 text-sky-300",
  published: "border-emerald-700/60 bg-emerald-950/50 text-emerald-300",
};

export function PlatformStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const value = (status ?? "unknown").toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex rounded border px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[value] ?? "border-slate-600 bg-slate-900 text-slate-300",
        className,
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
