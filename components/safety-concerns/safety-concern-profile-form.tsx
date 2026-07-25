"use client";

import { useActionState, useState } from "react";
import {
  createSafetyConcernProfile,
  updateSafetyConcernProfile,
} from "@/app/(app)/safety-concerns/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SAFETY_CONCERN_FACTUAL_NOTE_GUIDANCE,
  SAFETY_CONCERN_PROFILE_STATUSES,
  SAFETY_CONCERN_RESTRICTION_STATUSES,
  SAFETY_CONCERN_RESTRICTION_TYPES,
  SAFETY_CONCERN_RISK_CONTEXTS,
  SAFETY_CONCERN_SCOPE_TYPES,
} from "@/lib/safety-concerns/constants";
import type {
  SafetyConcernActionState,
  SafetyConcernProfile,
  SafetyConcernScopeType,
} from "@/lib/safety-concerns/types";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type CampusOption = { id: string; name: string };

export function SafetyConcernProfileForm({
  profile,
  campuses,
  selectedCampusIds = [],
}: {
  profile?: SafetyConcernProfile;
  campuses: CampusOption[];
  selectedCampusIds?: string[];
}) {
  const action = profile
    ? updateSafetyConcernProfile.bind(null, profile.id)
    : createSafetyConcernProfile;
  const [state, formAction, pending] = useActionState(
    action,
    {} as SafetyConcernActionState,
  );
  const [scopeType, setScopeType] = useState(
    profile?.scope_type ?? "church_wide",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {profile ? "Edit Safety Concern Profile" : "New Safety Concern Profile"}
        </CardTitle>
        <CardDescription>
          Document factual, behavior-based safety information for authorized
          security personnel only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Profile saved.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="display_name">Display name or identifier</Label>
            <Input
              id="display_name"
              name="display_name"
              defaultValue={profile?.display_name ?? ""}
              required
              maxLength={200}
              placeholder="e.g. John D. or Unknown male associated with March incident"
            />
            {state.fieldErrors?.display_name && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.display_name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="known_aliases">Known aliases</Label>
            <Input
              id="known_aliases"
              name="known_aliases"
              defaultValue={profile?.known_aliases ?? ""}
              maxLength={500}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="scope_type">Campus scope</Label>
              <select
                id="scope_type"
                name="scope_type"
                className={selectClassName}
                value={scopeType}
                onChange={(event) =>
                  setScopeType(event.target.value as SafetyConcernScopeType)
                }
              >
                {SAFETY_CONCERN_SCOPE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile_status">Status</Label>
              <select
                id="profile_status"
                name="profile_status"
                className={selectClassName}
                defaultValue={profile?.profile_status ?? "draft"}
              >
                {SAFETY_CONCERN_PROFILE_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {scopeType === "campus_specific" ? (
            <div className="space-y-2">
              <Label htmlFor="primary_campus_id">Campus</Label>
              <select
                id="primary_campus_id"
                name="primary_campus_id"
                className={selectClassName}
                defaultValue={profile?.primary_campus_id ?? ""}
                required
              >
                <option value="">Select campus…</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.primary_campus_id && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.primary_campus_id}
                </p>
              )}
            </div>
          ) : null}

          {scopeType === "selected_campuses" ? (
            <div className="space-y-2">
              <Label>Campuses</Label>
              <div className="space-y-2 rounded-md border p-3">
                {campuses.map((campus) => (
                  <label
                    key={campus.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="campus_ids"
                      value={campus.id}
                      defaultChecked={selectedCampusIds.includes(campus.id)}
                    />
                    {campus.name}
                  </label>
                ))}
              </div>
              {state.fieldErrors?.campus_ids && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.campus_ids}
                </p>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="risk_context">Documented basis</Label>
            <select
              id="risk_context"
              name="risk_context"
              className={selectClassName}
              defaultValue={profile?.risk_context ?? "other_documented_concern"}
            >
              {SAFETY_CONCERN_RISK_CONTEXTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="restriction_type">Restriction type</Label>
              <select
                id="restriction_type"
                name="restriction_type"
                className={selectClassName}
                defaultValue={profile?.restriction_type ?? "none"}
              >
                {SAFETY_CONCERN_RESTRICTION_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="restriction_status">Restriction status</Label>
              <select
                id="restriction_status"
                name="restriction_status"
                className={selectClassName}
                defaultValue={profile?.restriction_status ?? "not_applicable"}
              >
                {SAFETY_CONCERN_RESTRICTION_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="restriction_start_date">Restriction start</Label>
              <Input
                id="restriction_start_date"
                name="restriction_start_date"
                type="date"
                defaultValue={profile?.restriction_start_date ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="restriction_end_date">Restriction end</Label>
              <Input
                id="restriction_end_date"
                name="restriction_end_date"
                type="date"
                defaultValue={profile?.restriction_end_date ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="restriction_reference">Restriction reference</Label>
            <Input
              id="restriction_reference"
              name="restriction_reference"
              defaultValue={profile?.restriction_reference ?? ""}
              maxLength={500}
              placeholder="Internal reference only — do not invent legal claims"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="short_note">Concise safety note</Label>
            <textarea
              id="short_note"
              name="short_note"
              className={textareaClassName}
              maxLength={500}
              defaultValue={profile?.short_note ?? ""}
              placeholder="e.g. Written no-trespass order on file. Contact security leader if seen."
            />
            <p className="text-xs text-muted-foreground">
              {SAFETY_CONCERN_FACTUAL_NOTE_GUIDANCE}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="response_guidance">Response guidance</Label>
            <textarea
              id="response_guidance"
              name="response_guidance"
              className={textareaClassName}
              maxLength={2000}
              defaultValue={profile?.response_guidance ?? ""}
              placeholder="What security personnel should do if this person is observed."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="general_notes">Detailed notes</Label>
            <textarea
              id="general_notes"
              name="general_notes"
              className={textareaClassName}
              maxLength={5000}
              defaultValue={profile?.general_notes ?? ""}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="next_review_date">Next review date</Label>
              <Input
                id="next_review_date"
                name="next_review_date"
                type="date"
                defaultValue={profile?.next_review_date ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expires_at">Expires</Label>
              <Input
                id="expires_at"
                name="expires_at"
                type="date"
                defaultValue={profile?.expires_at ?? ""}
              />
            </div>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : profile ? "Save changes" : "Create profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
