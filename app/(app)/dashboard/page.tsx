import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardStats } from "@/lib/mock-data";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview of your sanctuary protection status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboardStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            A quick snapshot of the latest events across your site.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between border-b border-border pb-3">
              <span>Motion detected near north gate</span>
              <span className="text-muted-foreground">2 hours ago</span>
            </li>
            <li className="flex justify-between border-b border-border pb-3">
              <span>Camera offline — parking lot B</span>
              <span className="text-muted-foreground">7 hours ago</span>
            </li>
            <li className="flex justify-between">
              <span>Certification renewal reminder sent</span>
              <span className="text-muted-foreground">Yesterday</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
