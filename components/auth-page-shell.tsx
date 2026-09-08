import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LegalLinks } from "@/components/legal/legal-links";
import { OPERATOR_DISPLAY_NAME, copyrightYear } from "@/lib/legal/config";

export function AuthPageShell({
  children,
  maxWidthClassName = "max-w-sm",
}: {
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className="flex min-h-app w-full flex-col bg-background text-foreground">
      <div className="flex justify-end px-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <ThemeSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center p-6 pb-4 md:p-10">
        <div className={`w-full ${maxWidthClassName}`}>{children}</div>
      </div>
      <div className="space-y-2 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
        <LegalLinks variant="short" className="justify-center text-xs" />
        <p>
          © {copyrightYear()} {OPERATOR_DISPLAY_NAME}
        </p>
      </div>
    </div>
  );
}
