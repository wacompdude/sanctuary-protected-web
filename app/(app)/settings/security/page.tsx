"use client";

import { Suspense, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Shield,
  BarChart3,
  Users,
  Key,
  MapPin,
  Clock,
  FileText,
  Settings as SettingsIcon,
  BadgeCheck,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SecurityOverviewTab } from "@/components/security/security-overview-tab";
import { RolesTab } from "@/components/security/roles-tab";
import { SecurityGroupsTab } from "@/components/security/security-groups-tab";
import { UsersAccessTab } from "@/components/security/users-access-tab";
import { PermissionCatalogTab } from "@/components/security/permission-catalog-tab";
import { CampusAccessTab } from "@/components/security/campus-access-tab";
import { TemporaryAccessTab } from "@/components/security/temporary-access-tab";
import { AuditLogTab } from "@/components/security/audit-log-tab";
import { SettingsTab } from "@/components/security/settings-tab";
import {
  isSecurityTab,
  type SecurityTabValue,
} from "@/components/security/security-tabs";

const SECURITY_NAV_TABS: Array<{
  value: SecurityTabValue;
  label: string;
  icon: typeof BarChart3;
}> = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "roles", label: "Church Roles", icon: BadgeCheck },
  { value: "groups", label: "Groups", icon: Users },
  { value: "users", label: "Users", icon: Key },
  { value: "permissions", label: "Permissions", icon: Shield },
  { value: "campus", label: "Campus", icon: MapPin },
  { value: "temporary", label: "Temporary", icon: Clock },
  { value: "audit", label: "Audit", icon: FileText },
  { value: "settings", label: "Settings", icon: SettingsIcon },
];

function SecuritySettingsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab: SecurityTabValue = useMemo(() => {
    const tab = searchParams.get("tab");
    return isSecurityTab(tab) ? tab : "overview";
  }, [searchParams]);

  const setActiveTab = useCallback(
    (value: string) => {
      const tab = isSecurityTab(value) ? value : "overview";
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Security</h1>
            <p className="text-sm text-muted-foreground">
              Manage church roles, permission groups, and access control for your church
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          {SECURITY_NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-8 shrink-0 gap-1.5 px-2.5 py-1 text-xs sm:h-8 sm:text-sm"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <SecurityOverviewTab />
        </TabsContent>

        <TabsContent value="roles" className="space-y-6">
          <RolesTab />
        </TabsContent>

        <TabsContent value="groups" className="space-y-6">
          <SecurityGroupsTab />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UsersAccessTab />
        </TabsContent>

        <TabsContent value="permissions" className="space-y-6">
          <PermissionCatalogTab />
        </TabsContent>

        <TabsContent value="campus" className="space-y-6">
          <CampusAccessTab />
        </TabsContent>

        <TabsContent value="temporary" className="space-y-6">
          <TemporaryAccessTab />
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <AuditLogTab />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SecuritySettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted-foreground">Loading security…</div>
      }
    >
      <SecuritySettingsPageInner />
    </Suspense>
  );
}
