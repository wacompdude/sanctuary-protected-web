import type { ReactNode } from "react";

/**
 * Visual shell only. Authorization lives in nested layouts:
 * - /platform/setup/* → setup layout (account required)
 * - /platform/(console)/* → console layout (permissions + MFA)
 */
export default function PlatformRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-app bg-slate-950 text-slate-50 [color-scheme:dark]">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
              Platform Administration
            </p>
            <p className="text-sm text-slate-400">
              Sanctuary Protected operators — separate from church administration
            </p>
          </div>
          <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">
            {process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
