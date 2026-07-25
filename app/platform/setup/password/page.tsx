import { PlatformPasswordSetupForm } from "@/components/platform/platform-password-setup-form";

export default function PlatformPasswordSetupPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Change platform password
      </h1>
      <p className="max-w-xl text-sm text-slate-300">
        You must set a new password before accessing the platform console. After
        this step you will enroll multi-factor authentication.
      </p>
      <PlatformPasswordSetupForm />
    </div>
  );
}
