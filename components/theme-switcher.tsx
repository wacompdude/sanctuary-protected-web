"use client";

import { ChevronDown, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { nativeSelectClassName } from "@/components/ui/form-control";
import { cn } from "@/lib/utils";

const ICON_SIZE = 16;

const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = theme ?? "system";
  const label =
    current === "light"
      ? "Color theme: Light"
      : current === "dark"
        ? "Color theme: Dark"
        : "Color theme: System";

  const Icon =
    mounted && resolvedTheme === "dark" && theme !== "light"
      ? Moon
      : theme === "light"
        ? Sun
        : Laptop;

  return (
    <div className="relative inline-flex">
      <Icon
        size={ICON_SIZE}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <select
        suppressHydrationWarning
        aria-label={label}
        title={label}
        className={cn(
          nativeSelectClassName,
          "h-11 min-h-11 w-[9.5rem] cursor-pointer appearance-none py-0 pl-9 pr-8 md:h-11 md:min-h-11 md:text-sm",
        )}
        value={current}
        onChange={(event) => setTheme(event.currentTarget.value)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
      <ChevronDown
        size={ICON_SIZE}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
};

export { ThemeSwitcher };
