"use client";

import { useState, useTransition } from "react";
import { PlatformButton } from "@/components/platform/platform-button";

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

export function HelpDeleteButton({
  action,
  confirmMessage,
  label = "Delete",
  pendingLabel = "Deleting…",
  size = "sm",
  hiddenFields,
}: {
  action: (formData: FormData) => Promise<void>;
  confirmMessage: string;
  label?: string;
  pendingLabel?: string;
  size?: "default" | "sm" | "lg";
  hiddenFields: Record<string, string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <form
        action={(formData) => {
          if (!window.confirm(confirmMessage)) return;
          setError(null);
          startTransition(async () => {
            try {
              await action(formData);
            } catch (err) {
              if (isNextRedirectError(err)) throw err;
              setError(
                err instanceof Error ? err.message : "Unable to delete.",
              );
            }
          });
        }}
      >
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <PlatformButton
          type="submit"
          variant="destructive"
          size={size}
          disabled={pending}
        >
          {pending ? pendingLabel : label}
        </PlatformButton>
      </form>
      {error ? (
        <p className="max-w-xs text-right text-xs text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}
