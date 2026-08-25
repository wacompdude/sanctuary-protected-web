import { LoginForm } from "@/components/login-form";
import { AuthPageShell } from "@/components/auth-page-shell";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <AuthPageShell>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthPageShell>
  );
}
