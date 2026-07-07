import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Radio } from "lucide-react";

export default function SensorsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sensors</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor motion, perimeter, and environmental sensors.
        </p>
      </div>

      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Radio className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            Sensor monitoring and alerts will be available in a future update.
            You will be able to view sensor status and configure alert
            thresholds.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          This page is a placeholder for the sensors feature.
        </CardContent>
      </Card>
    </div>
  );
}
