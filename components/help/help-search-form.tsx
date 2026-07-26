import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HelpSearchForm({
  defaultQuery = "",
  autoFocus = false,
  size = "default",
}: {
  defaultQuery?: string;
  autoFocus?: boolean;
  size?: "default" | "large";
}) {
  const large = size === "large";

  return (
    <form
      action="/help/search"
      method="get"
      className={
        large
          ? "flex w-full flex-col gap-3 sm:flex-row sm:items-center"
          : "flex w-full flex-col gap-2 sm:flex-row sm:items-center"
      }
      role="search"
    >
      <label htmlFor="help-search-q" className="sr-only">
        Search help articles
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          className={
            large
              ? "pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              : "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          }
          aria-hidden
        />
        <Input
          id="help-search-q"
          name="q"
          type="search"
          defaultValue={defaultQuery}
          autoFocus={autoFocus}
          placeholder="Search help — e.g. create event, invite member, incident"
          className={
            large
              ? "h-12 pl-10 text-base"
              : "h-10 pl-9"
          }
        />
      </div>
      <Button type="submit" className={large ? "h-12 px-6" : undefined}>
        Search
      </Button>
    </form>
  );
}
