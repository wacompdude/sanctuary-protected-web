/**
 * components/security/security-overview-tab.tsx
 * Overview dashboard showing security metrics and warnings.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Shield, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSecurityOverviewMetricsAction,
  type SecurityOverviewMetrics,
} from "@/app/(app)/settings/security/actions";
import type { SecurityTabValue } from "@/components/security/security-tabs";
import { securityTabHref } from "@/components/security/security-tabs";

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

function tabHref(tab: SecurityTabValue): string {
  return securityTabHref(tab);
}

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
        <MetricCard
          title="Security Groups"
          value={metrics.totalGroups}
          description="Active groups"
          icon={Shield}
          color="blue"
          href={tabHref("groups")}
        />
        <MetricCard
          title="Total Users"
          value={metrics.totalUsers}
          description="Active church members"
          icon={Users}
          color="purple"
          href={tabHref("users")}
        />
        <MetricCard
          title="Direct Permissions"
          value={metrics.usersWithDirectPermissions}
          description="Users with individual grants"
          icon={TrendingUp}
          color="green"
          href={tabHref("users")}
        />
        <MetricCard
          title="Temporary Access"
          value={metrics.usersWithTemporaryPermissions}
          description="Users with timed access"
          icon={Clock}
          color="orange"
          href={tabHref("temporary")}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Warnings & Issues</h3>

        {metrics.permissionsExpiring7Days > 0 && (
          <WarningLink
            href={tabHref("temporary")}
            className="border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:hover:bg-red-900"
            titleClassName="text-red-900 dark:text-red-100"
            bodyClassName="text-red-800 dark:text-red-200"
            title="Permissions Expiring Soon"
            body={`${metrics.permissionsExpiring7Days} permissions will expire within 7 days — view Temporary Access`}
          />
        )}

        {metrics.permissionsExpiring30Days > 0 && (
          <WarningLink
            href={tabHref("temporary")}
            className="border-yellow-200 bg-yellow-50 hover:bg-yellow-100 dark:border-yellow-900 dark:bg-yellow-950 dark:hover:bg-yellow-900"
            titleClassName="text-yellow-900 dark:text-yellow-100"
            bodyClassName="text-yellow-800 dark:text-yellow-200"
            title="Upcoming Expirations"
            body={`${metrics.permissionsExpiring30Days} permissions will expire within 30 days — view Temporary Access`}
          />
        )}

        {metrics.highRiskPermissionAssignments > 0 && (
          <WarningLink
            href={tabHref("users")}
            className="border-orange-200 bg-orange-50 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950 dark:hover:bg-orange-900"
            titleClassName="text-orange-900 dark:text-orange-100"
            bodyClassName="text-orange-800 dark:text-orange-200"
            title="High-Risk Assignments"
            titleIcon={<AlertTriangle className="h-4 w-4" />}
            body={`${metrics.highRiskPermissionAssignments} high-risk direct permissions are currently assigned — review Users`}
          />
        )}

        {metrics.usersWithAllCampusAccess > 0 && (
          <WarningLink
            href={tabHref("campus")}
            className="border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:hover:bg-blue-900"
            titleClassName="text-blue-900 dark:text-blue-100"
            bodyClassName="text-blue-800 dark:text-blue-200"
            title="Broad Campus Access"
            body={`${metrics.usersWithAllCampusAccess} users have all-campus or unrestricted direct permissions — view Campus`}
          />
        )}

        {metrics.totalGroups === 0 && !error && (
          <WarningLink
            href={tabHref("groups")}
            className="border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:hover:bg-blue-900"
            titleClassName="text-blue-900 dark:text-blue-100"
            bodyClassName="text-blue-800 dark:text-blue-200"
            title="Getting Started"
            body="Create your first security group to organize permissions and manage user access"
          />
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
  href: string;
}

function MetricCard({ title, value, description, icon: Icon, color, href }: MetricCardProps) {
  const colorClasses = {
    blue: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
    purple: "bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400",
    green: "bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400",
    orange: "bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400",
  };

  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Open ${title} section`}
    >
      <Card className="h-full transition-colors hover:bg-accent/40 hover:border-foreground/20 cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
          <p className="mt-2 text-xs text-muted-foreground underline-offset-2 group-hover:underline">
            View section →
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function WarningLink({
  href,
  className,
  titleClassName,
  bodyClassName,
  title,
  body,
  titleIcon,
}: {
  href: string;
  className: string;
  titleClassName: string;
  bodyClassName: string;
  title: string;
  body: string;
  titleIcon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`block w-full rounded-lg border p-4 text-left transition-colors ${className}`}
    >
      <p className={`font-medium flex items-center gap-2 ${titleClassName}`}>
        {titleIcon}
        {title}
      </p>
      <p className={`text-sm ${bodyClassName}`}>{body}</p>
    </Link>
  );
}
