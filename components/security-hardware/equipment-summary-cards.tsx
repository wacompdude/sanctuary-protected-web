import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EquipmentSummary } from "@/lib/security-hardware/types";

const CARDS: {
  key: keyof EquipmentSummary;
  label: string;
  href: string;
}[] = [
  { key: "total", label: "Total equipment", href: "/security-hardware" },
  {
    key: "active",
    label: "Active",
    href: "/security-hardware?status=active",
  },
  {
    key: "outOfService",
    label: "Out of service / maintenance",
    href: "/security-hardware?status=out_of_service",
  },
  {
    key: "maintenanceDue",
    label: "Maintenance due",
    href: "/security-hardware?maintenanceDue=1",
  },
  {
    key: "warrantyExpiring",
    label: "Warranty expiring",
    href: "/security-hardware?warrantyExpiring=1",
  },
  {
    key: "replacementDue",
    label: "Replacement due",
    href: "/security-hardware?replacementDue=1",
  },
  {
    key: "critical",
    label: "High / critical",
    href: "/security-hardware?criticalOnly=1",
  },
  {
    key: "unassigned",
    label: "Unassigned",
    href: "/security-hardware?unassigned=1",
  },
];

export function EquipmentSummaryCards({ summary }: { summary: EquipmentSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card) => (
        <Link key={card.key} href={card.href} className="block">
          <Card className="transition-colors hover:border-foreground/20">
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {summary[card.key]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">View filtered list</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
