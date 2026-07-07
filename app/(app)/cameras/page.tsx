import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Camera } from "lucide-react";

export default function CamerasPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cameras</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor and manage security cameras across your site.
        </p>
      </div>

      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Camera className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            Camera feeds and device management will be available in a future
            update. You will be able to view live streams and configure
            recording settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          This page is a placeholder for the cameras feature.
        </CardContent>
      </Card>
    </div>
  );
}
