import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PlatformButton } from "@/components/platform/platform-button";
import { getHelpAnalyticsReport } from "@/lib/help/analytics";
import { requireHelpPermission } from "@/lib/help/permissions";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";

async function HelpAnalyticsContent() {
  await requireHelpPermission("help.analytics.read", "help.console.access");
  const report = await getHelpAnalyticsReport({ days: 7 });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Help analytics
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Last 7 days of views, search, feedback, review reminders, and link
            checks. Empty metrics mean no customer activity yet — not placeholder
            data.
          </p>
        </div>
        <PlatformButton variant="outline" asChild>
          <Link href="/platform/help">Back to articles</Link>
        </PlatformButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ["Views", report.summary.views_7d],
          ["Searches", report.summary.searches_7d],
          ["Zero results", report.summary.zero_result_searches_7d],
          ["Helpful (yes)", report.summary.feedback_yes_7d],
          ["Not helpful", report.summary.feedback_no_7d],
          [
            "Helpful rate",
            report.summary.helpful_rate_7d == null
              ? "—"
              : `${report.summary.helpful_rate_7d}%`,
          ],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3"
          >
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Top viewed articles</h2>
        <ReportTable
          empty="No article views in the last 7 days."
          headers={["Article", "Views", ""]}
          rows={report.top_viewed.map((row) => [
            <div key={`${row.article_id}-title`}>
              <div className="font-medium">{row.title}</div>
              <div className="font-mono text-xs text-slate-500">{row.slug}</div>
            </div>,
            String(row.view_count),
            <Link
              key={`${row.article_id}-link`}
              href={`/platform/help/articles/${row.article_id}`}
              className="text-sky-400 hover:underline"
            >
              Open
            </Link>,
          ])}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Zero-result searches</h2>
        <ReportTable
          empty="No zero-result searches in the last 7 days."
          headers={["Query", "Count", "Last seen"]}
          rows={report.zero_results.map((row) => [
            row.query_text,
            String(row.count),
            new Date(row.last_seen_at).toLocaleString(),
          ])}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Low-rated articles</h2>
        <ReportTable
          empty="No negative feedback in the last 7 days."
          headers={["Article", "Yes", "No", "Latest comment", ""]}
          rows={report.low_rated.map((row) => [
            <div key={`${row.article_id}-title`}>
              <div className="font-medium">{row.title}</div>
              <div className="font-mono text-xs text-slate-500">{row.slug}</div>
            </div>,
            String(row.yes_count),
            String(row.no_count),
            row.latest_comment || "—",
            <Link
              key={`${row.article_id}-link`}
              href={`/platform/help/articles/${row.article_id}`}
              className="text-sky-400 hover:underline"
            >
              Open
            </Link>,
          ])}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Review reminders</h2>
        <ReportTable
          empty="No review reminders right now."
          headers={["Article", "Reason", "Due / published", ""]}
          rows={report.review_reminders.map((row) => [
            <div key={`${row.article_id}-title`}>
              <div className="font-medium">{row.title}</div>
              <div className="text-xs text-slate-500">{row.status}</div>
            </div>,
            row.reason.replaceAll("_", " "),
            row.review_due_at
              ? new Date(row.review_due_at).toLocaleDateString()
              : row.published_at
                ? new Date(row.published_at).toLocaleDateString()
                : "—",
            <Link
              key={`${row.article_id}-link`}
              href={`/platform/help/articles/${row.article_id}`}
              className="text-sky-400 hover:underline"
            >
              Open
            </Link>,
          ])}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Broken internal links</h2>
        <p className="text-sm text-slate-400">
          Paths that fail the Help deep-link allowlist (draft and published step
          links, plus support CTAs).
        </p>
        <ReportTable
          empty="No broken internal links detected."
          headers={["Article", "Source", "Path", ""]}
          rows={report.broken_links.map((row, index) => [
            <div key={`${row.article_id}-${index}-title`}>
              <div className="font-medium">{row.title}</div>
              {row.step_number != null ? (
                <div className="text-xs text-slate-500">
                  Step {row.step_number}
                </div>
              ) : null}
            </div>,
            row.source.replaceAll("_", " "),
            <span
              key={`${row.article_id}-${index}-path`}
              className="font-mono text-xs text-rose-300"
            >
              {row.path}
            </span>,
            <Link
              key={`${row.article_id}-${index}-link`}
              href={`/platform/help/articles/${row.article_id}`}
              className="text-sky-400 hover:underline"
            >
              Fix
            </Link>,
          ])}
        />
      </section>
    </div>
  );
}

function ReportTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            {headers.map((header) => (
              <th key={header || "actions"} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-3 py-6 text-slate-400"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-800">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function PlatformHelpAnalyticsPage() {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading analytics…</div>}
    >
      <HelpAnalyticsContentWrapper />
    </Suspense>
  );
}

async function HelpAnalyticsContentWrapper() {
  try {
    return await HelpAnalyticsContent();
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
    throw error;
  }
}
