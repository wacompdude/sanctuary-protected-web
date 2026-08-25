"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { FieldLabelWithHelp } from "@/components/ui/field-help";
import { cn } from "@/lib/utils";
import { TIMEZONE_HELP } from "@/lib/organization/field-help";
import {
  detectDeviceTimeZone,
  getTimeZoneOption,
  searchTimeZones,
  shouldSuggestDeviceTimeZone,
  type TimeZoneOption,
} from "@/lib/datetime/timezones";

const EMPTY_QUERY_LIMIT = 80;

export function TimeZoneSelector({
  id,
  name = "timezone",
  label = "Time zone",
  help,
  helpLabel = "Time zone help",
  defaultValue,
  value,
  onChange,
  error,
  hint,
  disabled,
  suggestDeviceTimeZone = false,
  className,
}: {
  id?: string;
  name?: string;
  label?: string;
  help?: string;
  helpLabel?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (next: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  suggestDeviceTimeZone?: boolean;
  className?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const listId = `${fieldId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [uncontrolled, setUncontrolled] = useState(
    defaultValue?.trim() || "America/Los_Angeles",
  );
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  const appliedDeviceSuggestion = useRef(false);

  const selectedId = value ?? uncontrolled;

  useEffect(() => {
    if (appliedDeviceSuggestion.current) return;
    if (
      !shouldSuggestDeviceTimeZone({
        enabled: suggestDeviceTimeZone,
        currentValue: value ?? defaultValue,
      })
    ) {
      return;
    }
    const detected = detectDeviceTimeZone();
    if (!detected) return;
    appliedDeviceSuggestion.current = true;
    setDeviceZone(detected);
    if (!value) setUncontrolled(detected);
  }, [suggestDeviceTimeZone, defaultValue, value]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const selected = getTimeZoneOption(selectedId);
  const results = useMemo(
    () => searchTimeZones(query, query.trim() ? 80 : EMPTY_QUERY_LIMIT),
    [query],
  );

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector(`[data-index="${highlight}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function selectOption(option: TimeZoneOption) {
    if (!value) setUncontrolled(option.id);
    onChange?.(option.id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = results[highlight];
      if (option) selectOption(option);
      return;
    }
  }

  const describedBy = error
    ? `${fieldId}-error`
    : hint
      ? `${fieldId}-hint`
      : undefined;

  return (
    <div className={cn("space-y-2", className)} ref={rootRef}>
      <FieldLabelWithHelp
        htmlFor={fieldId}
        label={label}
        helpLabel={helpLabel}
        help={help ?? TIMEZONE_HELP}
      />
      <input type="hidden" name={name} value={selectedId} />
      <div className="relative">
        <input
          id={fieldId}
          role="combobox"
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-opt-${highlight}` : undefined}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          placeholder="Search city or time zone..."
          value={open ? query : selected?.primaryLabel ?? selectedId}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "flex min-h-11 w-full max-w-full rounded-md border border-input bg-background py-2 pl-3 pr-10 text-base text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 md:h-9 md:min-h-0 md:text-sm",
          )}
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        {open ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-[min(15rem,70dvh)] w-full overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {results.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                No time zones found.
                <span className="mt-1 block">
                  Try searching by city, country, or time zone name.
                </span>
              </li>
            ) : (
              results.map((option, index) => {
                const active = option.id === selectedId;
                const highlighted = index === highlight;
                return (
                  <li
                    key={option.id}
                    id={`${listId}-opt-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-2 text-sm",
                      highlighted
                        ? "bg-muted text-foreground"
                        : "text-popover-foreground",
                    )}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectOption(option)}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        active ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug">
                        {option.primaryLabel}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.secondaryLabel}
                      </span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
      {selected ? (
        <p className="break-all text-xs text-muted-foreground">
          {selected.secondaryLabel}
        </p>
      ) : null}
      {open ? (
        <p className="sr-only" role="status" aria-live="polite">
          {results.length === 0
            ? "No time zones found."
            : `${results.length} time zones available.`}
        </p>
      ) : null}
      {suggestDeviceTimeZone && deviceZone && deviceZone !== selectedId ? (
        <button
          type="button"
          className="min-h-11 text-left text-sm text-primary underline-offset-4 hover:underline md:min-h-0"
          onClick={() => {
            const option = getTimeZoneOption(deviceZone);
            if (option) selectOption(option);
          }}
        >
          Use suggested time zone from this device
        </button>
      ) : suggestDeviceTimeZone ? (
        <p className="text-xs text-muted-foreground">
          Suggested from this device. Change it if your church is in a different
          time zone.
        </p>
      ) : null}
      {hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
