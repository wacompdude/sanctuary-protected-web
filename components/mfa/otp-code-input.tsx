"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  name?: string;
  disabled?: boolean;
  error?: boolean;
  length?: number;
};

export function OtpCodeInput({
  name = "code",
  disabled,
  error,
  length = 6,
}: Props) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const hiddenRef = useRef<HTMLInputElement | null>(null);

  function syncHidden() {
    const value = inputsRef.current.map((input) => input?.value ?? "").join("");
    if (hiddenRef.current) hiddenRef.current.value = value;
  }

  function focusIndex(index: number) {
    const next = inputsRef.current[index];
    next?.focus();
    next?.select();
  }

  function fillFrom(start: number, digits: string) {
    const cleaned = digits.replace(/\D/g, "").slice(0, length - start);
    for (let i = 0; i < length; i += 1) {
      const input = inputsRef.current[i];
      if (!input) continue;
      if (i >= start && i < start + cleaned.length) {
        input.value = cleaned[i - start] ?? "";
      } else if (i >= start) {
        input.value = "";
      }
    }
    syncHidden();
    const nextIndex = Math.min(start + cleaned.length, length - 1);
    focusIndex(nextIndex);
  }

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-2">
              <input ref={hiddenRef} type="hidden" name={name} />
      <div className="flex justify-center gap-2">
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(node) => {
              inputsRef.current[index] = node;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${index + 1}`}
            maxLength={1}
            disabled={disabled}
            className={cn(
              "h-12 w-10 rounded-md border bg-background text-center text-lg font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              error ? "border-destructive" : "border-input",
            )}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "");
              if (!digits) {
                event.target.value = "";
                syncHidden();
                return;
              }
              fillFrom(index, digits);
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !event.currentTarget.value && index > 0) {
                event.preventDefault();
                const prev = inputsRef.current[index - 1];
                if (prev) prev.value = "";
                syncHidden();
                focusIndex(index - 1);
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                focusIndex(Math.max(0, index - 1));
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                focusIndex(Math.min(length - 1, index + 1));
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              fillFrom(index, event.clipboardData.getData("text"));
            }}
          />
        ))}
      </div>
    </div>
  );
}
