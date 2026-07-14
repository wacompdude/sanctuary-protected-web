import { Card, CardContent } from "@/components/ui/card";

export default function ChurchSettingsLoading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-9 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <Card>
        <CardContent className="py-12 text-sm text-muted-foreground">
          Loading church settings…
        </CardContent>
      </Card>
    </div>
  );
}
