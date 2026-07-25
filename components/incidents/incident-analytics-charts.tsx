import type { IncidentAnalyticsBucket } from "@/lib/incidents/analytics";

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function PieChart({
  title,
  buckets,
  total,
}: {
  title: string;
  buckets: IncidentAnalyticsBucket[];
  total: number;
}) {
  const active = buckets.filter((bucket) => bucket.count > 0);
  let angle = 0;
  const arcs =
    active.length === 1
      ? [
          {
            ...active[0],
            path: undefined as string | undefined,
            fullCircle: true,
          },
        ]
      : active.map((bucket) => {
          const sweep = (bucket.count / total) * 360;
          const startAngle = angle;
          const endAngle = angle + sweep;
          angle = endAngle;
          return {
            ...bucket,
            path: describeArc(100, 100, 90, startAngle, endAngle),
            fullCircle: false,
          };
        });

  return (
    <div className="mx-auto w-full max-w-[220px]">
      {total === 0 ? (
        <div className="flex aspect-square items-center justify-center rounded-full border border-dashed border-border text-sm text-muted-foreground">
          No data
        </div>
      ) : (
        <svg viewBox="0 0 200 200" className="h-auto w-full" role="img">
          <title>{title}</title>
          {arcs.map((arc) =>
            arc.fullCircle ? (
              <circle
                key={arc.key}
                cx="100"
                cy="100"
                r="90"
                fill={arc.color}
                stroke="#111111"
                strokeWidth="1"
              />
            ) : (
              <path
                key={arc.key}
                d={arc.path}
                fill={arc.color}
                stroke="#111111"
                strokeWidth="1"
              />
            ),
          )}
        </svg>
      )}
    </div>
  );
}

function BarChart({
  title,
  buckets,
  total,
}: {
  title: string;
  buckets: IncidentAnalyticsBucket[];
  total: number;
}) {
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return (
    <div className="space-y-3" aria-label={title}>
      {buckets.map((bucket) => {
        const width = total === 0 ? 0 : (bucket.count / max) * 100;
        return (
          <div key={bucket.key} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{bucket.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {bucket.count}
                {total > 0 ? ` · ${bucket.percent}%` : ""}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${width}%`,
                  backgroundColor: bucket.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function IncidentBreakdownChart({
  title,
  description,
  buckets,
  total,
}: {
  title: string;
  description: string;
  buckets: IncidentAnalyticsBucket[];
  total: number;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-center">
        <PieChart title={title} buckets={buckets} total={total} />
        <BarChart title={`${title} bars`} buckets={buckets} total={total} />
      </div>
    </div>
  );
}

export function IncidentAnalyticsDetailTable({
  title,
  buckets,
  total,
}: {
  title: string;
  buckets: IncidentAnalyticsBucket[];
  total: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              {title}
            </th>
            <th className="pb-3 pr-4 font-medium text-muted-foreground">
              Count
            </th>
            <th className="pb-3 font-medium text-muted-foreground">Share</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr
              key={bucket.key}
              className="border-b border-border last:border-0"
            >
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-sm border border-border"
                    style={{ backgroundColor: bucket.color }}
                    aria-hidden
                  />
                  <span className="font-medium">{bucket.label}</span>
                </div>
              </td>
              <td className="py-3 pr-4 tabular-nums">{bucket.count}</td>
              <td className="py-3 tabular-nums text-muted-foreground">
                {total === 0 ? "—" : `${bucket.percent}%`}
              </td>
            </tr>
          ))}
          <tr>
            <td className="pt-3 pr-4 font-medium text-muted-foreground">
              Total
            </td>
            <td className="pt-3 pr-4 font-semibold tabular-nums">{total}</td>
            <td className="pt-3 tabular-nums text-muted-foreground">
              {total === 0 ? "—" : "100%"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
