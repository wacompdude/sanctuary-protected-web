import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppChurchHeader } from "@/components/app-church-header";
import { ChurchStatusBanner } from "@/components/church-status-banner";

function SidebarFallback() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center border-b border-border px-6" />
    </aside>
  );
}

function HeaderFallback() {
  return (
    <div className="mb-6 h-16 animate-pulse rounded-md bg-muted/40" aria-hidden />
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<SidebarFallback />}>
        <AppSidebar />
      </Suspense>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-8">
          <Suspense fallback={<HeaderFallback />}>
            <AppChurchHeader />
          </Suspense>
          <Suspense fallback={null}>
            <ChurchStatusBanner />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
  );
}
