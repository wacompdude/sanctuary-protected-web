import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";

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
      <div className="flex flex-1 items-center justify-center p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
        <div className={`w-full ${maxWidthClassName}`}>{children}</div>
      </div>
    </div>
  );
}
