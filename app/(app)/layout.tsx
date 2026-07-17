import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppChurchHeader } from "@/components/app-church-header";
import { ChurchStatusBanner } from "@/components/church-status-banner";

function SidebarFallback() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
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
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense fallback={<SidebarFallback />}>
        <AppSidebar />
      </Suspense>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:p-8">
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
