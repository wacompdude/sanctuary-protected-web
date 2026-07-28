import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TRAINING_UPGRADE_MESSAGE } from "@/lib/training/constants";

export function TrainingUpgradeGate() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-muted-foreground" />
          <div>
            <CardTitle>Training Management</CardTitle>
            <CardDescription>{TRAINING_UPGRADE_MESSAGE}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/settings/billing">View plans</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
