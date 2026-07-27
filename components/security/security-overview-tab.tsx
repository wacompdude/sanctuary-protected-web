/**
 * components/security/security-overview-tab.tsx
 * Overview dashboard showing security metrics and warnings.
 */

"use client";

import { useEffect, useState } from "react";
import { Users, Shield, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSecurityOverviewMetricsAction,
  type SecurityOverviewMetrics,
} from "@/app/(app)/settings/security/actions";

const EMPTY_METRICS: SecurityOverviewMetrics = {
  totalGroups: 0,
  totalUsers: 0,
  usersWithDirectPermissions: 0,
  usersWithTemporaryPermissions: 0,
  permissionsExpiring7Days: 0,
  permissionsExpiring30Days: 0,
  usersWithAllCampusAccess: 0,
  highRiskPermissionAssignments: 0,
};

export function SecurityOverviewTab() {
  const [metrics, setMetrics] = useState<SecurityOverviewMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMetrics();
  }, []);

  async function loadMetrics() {
    try {
      setLoading(true);
      setError(null);
      const result = await getSecurityOverviewMetricsAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMetrics(result.metrics || EMPTY_METRICS);
    } catch (err) {
      console.error("Error loading metrics:", err);
      setError("Failed to load security metrics");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading security overview...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="font-medium text-red-900 dark:text-red-100">Error</p>
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Security Groups" value={metrics.totalGroups} description="Active groups" icon={Shield} color="blue" />
        <MetricCard title="Total Users" value={metrics.totalUsers} description="Active church members" icon={Users} color="purple" />
        <MetricCard title="Direct Permissions" value={metrics.usersWithDirectPermissions} description="Users with individual grants" icon={TrendingUp} color="green" />
        <MetricCard title="Temporary Access" value={metrics.usersWithTemporaryPermissions} description="Users with timed access" icon={Clock} color="orange" />
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Warnings & Issues</h3>

        {metrics.permissionsExpiring7Days > 0 && (
          <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
            <p className="font-medium text-red-900 dark:text-red-100">Permissions Expiring Soon</p>
            <p className="text-sm text-red-800 dark:text-red-200">
              {metrics.permissionsExpiring7Days} permissions will expire within 7 days
            </p>
          </div>
        )}

        {metrics.permissionsExpiring30Days > 0 && (
          <div className="p-4 border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
            <p className="font-medium text-yellow-900 dark:text-yellow-100">Upcoming Expirations</p>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {metrics.permissionsExpiring30Days} permissions will expire within 30 days
            </p>
          </div>
        )}

        {metrics.highRiskPermissionAssignments > 0 && (
          <div className="p-4 border border-orange-200 bg-orange-50 dark:bg-orange-950 rounded-lg">
            <p className="font-medium text-orange-900 dark:text-orange-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              High-Risk Assignments
            </p>
            <p className="text-sm text-orange-800 dark:text-orange-200">
              {metrics.highRiskPermissionAssignments} high-risk direct permissions are currently assigned
            </p>
          </div>
        )}

        {metrics.usersWithAllCampusAccess > 0 && (
          <div className="p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <p className="font-medium text-blue-900 dark:text-blue-100">Broad Campus Access</p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {metrics.usersWithAllCampusAccess} users have all-campus or unrestricted direct permissions
            </p>
          </div>
        )}

        {metrics.totalGroups === 0 && !error && (
          <div className="p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <p className="font-medium text-blue-900 dark:text-blue-100">Getting Started</p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Create your first security group to organize permissions and manage user access
            </p>
          </div>
        )}

        {!error &&
          metrics.totalGroups > 0 &&
          metrics.permissionsExpiring7Days === 0 &&
          metrics.permissionsExpiring30Days === 0 &&
          metrics.highRiskPermissionAssignments === 0 && (
            <div className="p-4 border border-green-200 bg-green-50 dark:bg-green-950 rounded-lg">
              <p className="font-medium text-green-900 dark:text-green-100">No urgent issues</p>
              <p className="text-sm text-green-800 dark:text-green-200">
                No expiring permissions or high-risk assignment warnings right now.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  description: string;
  icon: React.ElementType;
  color: "blue" | "purple" | "green" | "orange";
}

function MetricCard({ title, value, description, icon: Icon, color }: MetricCardProps) {
  const colorClasses = {
    blue: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
    purple: "bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400",
    green: "bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400",
    orange: "bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
