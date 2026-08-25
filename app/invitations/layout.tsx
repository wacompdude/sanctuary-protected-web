import { ThemeSwitcher } from "@/components/theme-switcher";

export default function InvitationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-app bg-background">
      <div className="flex justify-end px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <ThemeSwitcher />
      </div>
      <div className="mx-auto max-w-lg p-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </main>
  );
}
