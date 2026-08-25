import { SignUpForm } from "@/components/sign-up-form";
import { AuthPageShell } from "@/components/auth-page-shell";
import { Suspense } from "react";

export default function RegisterPage() {
  return (
    <AuthPageShell>
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthPageShell>
  );
}
