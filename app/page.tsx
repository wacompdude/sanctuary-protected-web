import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        
        {/* Navigation Bar */}
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>My Custom App Name</Link>
            </div>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>

        {/* YOUR CUSTOM CONTENT GOES HERE */}
        <div className="flex-1 flex flex-col gap-6 max-w-5xl p-5 items-center text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Welcome to My New Application
          </h1>
          <p className="text-muted-foreground max-w-md">
            The template has been cleared. You can now build out your custom database features here.
          </p>
        </div>

        {/* Footer */}
        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <p>Built with Next.js and Supabase</p>
          <ThemeSwitcher />
        </footer>

      </div>
    </main>
  );
}
