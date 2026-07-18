import { Suspense, type ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppChurchHeader } from "@/components/app-church-header";
import { ChurchStatusBanner } from "@/components/church-status-banner";
import { churchBrandStyle } from "@/lib/church/brand-theme";
import { requireChurchMembership } from "@/lib/church/auth";
import { isNextControlFlowError } from "@/lib/church/access-guard";

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

async function loadBrandStyle() {
  try {
    const { supabase, church } = await requireChurchMembership();
    const { data } = await supabase
      .from("churches")
      .select("primary_brand_color, secondary_brand_color")
      .eq("id", church.id)
      .maybeSingle();

    const row = data as {
      primary_brand_color?: string | null;
      secondary_brand_color?: string | null;
    } | null;

    return churchBrandStyle(
      row?.primary_brand_color,
      row?.secondary_brand_color,
    );
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    return {};
  }
}

async function BrandedAppShell({ children }: { children: ReactNode }) {
  const brandStyle = await loadBrandStyle();

  return (
    <div
      style={brandStyle}
      className="flex min-h-screen flex-col md:flex-row"
      data-church-branded=""
    >
      <Suspense fallback={<SidebarFallback />}>
        <AppSidebar />
      </Suspense>
      <main className="min-w-0 flex-1 md:overflow-auto">
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

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col md:flex-row">
          <SidebarFallback />
          <main className="min-w-0 flex-1 md:overflow-auto">
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:p-8">
              <HeaderFallback />
              {children}
            </div>
          </main>
        </div>
      }
    >
      <BrandedAppShell>{children}</BrandedAppShell>
    </Suspense>
  );
}
