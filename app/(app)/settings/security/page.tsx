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
              Manage roles, security groups, permissions, and access control for your church
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-9">
          <TabsTrigger value="overview" className="flex min-h-9 items-center justify-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex min-h-9 items-center justify-center gap-2">
            <BadgeCheck className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Roles</span>
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex min-h-9 items-center justify-center gap-2">
            <Users className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Groups</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex min-h-9 items-center justify-center gap-2">
            <Key className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex min-h-9 items-center justify-center gap-2">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Perms</span>
          </TabsTrigger>
          <TabsTrigger value="campus" className="flex min-h-9 items-center justify-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Campus</span>
          </TabsTrigger>
          <TabsTrigger value="temporary" className="flex min-h-9 items-center justify-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Temp</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex min-h-9 items-center justify-center gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Audit</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex min-h-9 items-center justify-center gap-2">
            <SettingsIcon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
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
