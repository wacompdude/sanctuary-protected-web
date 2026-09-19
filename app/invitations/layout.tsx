import { ThemeSwitcher } from "@/components/theme-switcher";
import { SiteFooter } from "@/components/site-footer";

export default function InvitationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-app flex-col bg-background">
      <main className="flex-1">
        <div className="flex justify-end px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <ThemeSwitcher />
        </div>
        <div className="mx-auto max-w-lg p-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
