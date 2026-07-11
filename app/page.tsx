import { Suspense } from "react";
import { redirect } from "next/navigation";
import { hasEnvVars } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

async function HomeRedirect(): Promise<React.ReactNode> {
  if (!hasEnvVars) {
    redirect("/login");
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims ? "/dashboard" : "/login");
  } catch {
    redirect("/login");
  }
}

export default function Home() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <HomeRedirect />
    </Suspense>
  );
}
