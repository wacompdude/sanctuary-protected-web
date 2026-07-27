/**
 * components/security/campus-access-tab.tsx
 * View campuses and explain how campus scopes apply to permissions.
 */

"use client";

import { useEffect, useState } from "react";
import { MapPin, Globe, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listCampusesForSecurityAction,
  type CampusOption,
} from "@/app/(app)/settings/security/actions";

const SCOPE_GUIDE = [
  {
    title: "All current & future campuses",
    description: "Permission applies to every campus now and any campus added later.",
  },
  {
    title: "All current campuses",
    description: "Permission applies to campuses that exist today only.",
  },
  {
    title: "Primary campus",
    description: "Permission is limited to the user's primary campus assignment.",
  },
  {
    title: "Selected campuses",
    description: "Permission is limited to specific campuses chosen on the grant.",
  },
  {
    title: "No campus restriction",
    description: "Campus filtering is not applied for this permission.",
  },
];

export function CampusAccessTab() {
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCampuses();
  }, []);

  async function loadCampuses() {
    try {
      setLoading(true);
      setError(null);
      const result = await listCampusesForSecurityAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setCampuses(result.campuses || []);
    } catch (err) {
      console.error("Error loading campuses:", err);
      setError("Failed to load campuses");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading campuses...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Campus Access</h2>
        <p className="text-sm text-muted-foreground">
          Campus scope is applied when assigning permissions to groups or users
        </p>
      </div>

      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            How Campus Scope Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SCOPE_GUIDE.map((item) => (
            <div key={item.title} className="p-3 border rounded-lg">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Configure campus scope when assigning permissions under Security Groups, Users and Access,
            or Temporary Access. Create or edit campuses under the Campuses section of the app.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Campuses in this church
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campuses.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-lg">
              <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">
                No campuses found. Add campuses in the Campuses area to use campus-scoped permissions.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {campuses.map((campus) => (
                <div
                  key={campus.id}
                  className="p-4 border rounded-lg flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">{campus.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        Status: {campus.status}
                        {campus.isPrimary ? " · Primary campus" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
