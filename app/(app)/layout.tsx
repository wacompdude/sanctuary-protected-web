import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";

function SidebarFallback() {
  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center border-b border-border px-6" />
    </aside>
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
        <div className="mx-auto max-w-6xl p-8">{children}</div>
      </main>
    </div>
  );
}
