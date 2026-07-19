"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createPolicy,
  updatePolicy,
} from "@/app/(app)/policies/actions";
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
  POLICY_AUDIENCE_SCOPES,
  POLICY_DOCUMENT_TYPES,
  POLICY_MINIMUM_ROLES,
} from "@/lib/policies/constants";
import type {
  PolicyActionState,
  PolicyCategory,
  PolicyDocumentDetail,
} from "@/lib/policies/types";

const initialState: PolicyActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const contentClassName =
  "flex min-h-[320px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function dateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function PolicyForm({
  mode,
  categories,
  campuses,
  policy,
}: {
  mode: "create" | "edit";
  categories: PolicyCategory[];
  campuses: { id: string; name: string; status: string }[];
  policy?: PolicyDocumentDetail;
}) {
  const action =
    mode === "edit" && policy
      ? updatePolicy.bind(null, policy.id)
      : createPolicy;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Policy saved.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Document details</CardTitle>
          <CardDescription>
            Title, type, category, and audience.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={policy?.title ?? ""}
              placeholder="e.g. Active Shooter Response"
            />
            <FieldError message={state.fieldErrors?.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document_type">Document type</Label>
            <select
              id="document_type"
              name="document_type"
              required
              defaultValue={policy?.document_type ?? "policy"}
              className={selectClassName}
            >
              {POLICY_DOCUMENT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.document_type} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category_id">Category</Label>
            <select
              id="category_id"
              name="category_id"
              defaultValue={policy?.category_id ?? ""}
              className={selectClassName}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.category_id} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campus_id">Campus</Label>
            <select
              id="campus_id"
              name="campus_id"
              defaultValue={policy?.campus_id ?? ""}
              className={selectClassName}
            >
              <option value="">Church-wide</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.campus_id} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audience_scope">Audience</Label>
            <select
              id="audience_scope"
              name="audience_scope"
              required
              defaultValue={policy?.audience_scope ?? "all_members"}
              className={selectClassName}
            >
              {POLICY_AUDIENCE_SCOPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.audience_scope} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minimum_role">Minimum role</Label>
            <select
              id="minimum_role"
              name="minimum_role"
              required
              defaultValue={policy?.minimum_role ?? "viewer"}
              className={selectClassName}
            >
              {POLICY_MINIMUM_ROLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.minimum_role} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="summary">Summary</Label>
            <textarea
              id="summary"
              name="summary"
              className={textareaClassName}
              defaultValue={policy?.summary ?? ""}
              placeholder="Short description shown in the library"
            />
            <FieldError message={state.fieldErrors?.summary} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              name="tags"
              defaultValue={policy?.tags.join(", ") ?? ""}
              placeholder="emergency, lockdown, training"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated labels.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Content</CardTitle>
          <CardDescription>
            Write the policy body in Markdown. Headings become the table of
            contents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">Markdown content</Label>
            <textarea
              id="content"
              name="content"
              className={contentClassName}
              defaultValue={policy?.current_version?.content ?? ""}
              placeholder={"# Purpose\n\nDescribe the policy…\n\n## Procedure\n\n1. Step one\n2. Step two"}
            />
            <FieldError message={state.fieldErrors?.content} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change_summary">Change summary</Label>
            <textarea
              id="change_summary"
              name="change_summary"
              className={textareaClassName}
              defaultValue={policy?.current_version?.change_summary ?? ""}
              placeholder="What changed in this version?"
            />
            <FieldError message={state.fieldErrors?.change_summary} />
          </div>
        </CardContent>
      </Card>

      {mode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Attachments</CardTitle>
            <CardDescription>
              Attach PDF or Word documents (.pdf, .doc, .docx). You can add more
              after creating the draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="attachments">PDF or Word files</Label>
            <Input
              id="attachments"
              name="attachments"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
            <p className="text-xs text-muted-foreground">
              Up to 15 MB each. Excel and images are also accepted.
            </p>
            <FieldError message={state.fieldErrors?.attachments} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "4" : "3"}. Publication settings</CardTitle>
          <CardDescription>
            Acknowledgment, mobile availability, and review dates.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="effective_date">Effective date</Label>
            <Input
              id="effective_date"
              name="effective_date"
              type="date"
              defaultValue={dateInputValue(policy?.effective_date)}
            />
            <FieldError message={state.fieldErrors?.effective_date} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review_due_date">Review due date</Label>
            <Input
              id="review_due_date"
              name="review_due_date"
              type="date"
              defaultValue={dateInputValue(policy?.review_due_date)}
            />
            <FieldError message={state.fieldErrors?.review_due_date} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acknowledgment_due_days">
              Acknowledgment due (days)
            </Label>
            <Input
              id="acknowledgment_due_days"
              name="acknowledgment_due_days"
              type="number"
              min={1}
              max={365}
              defaultValue={policy?.acknowledgment_due_days ?? 14}
            />
            <FieldError message={state.fieldErrors?.acknowledgment_due_days} />
          </div>
          <div className="space-y-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="requires_acknowledgment"
                defaultChecked={policy?.requires_acknowledgment ?? false}
              />
              Requires acknowledgment
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="reacknowledge_on_publish"
                defaultChecked={policy?.reacknowledge_on_publish ?? true}
              />
              Re-acknowledge on each publish
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_emergency_document"
                defaultChecked={policy?.is_emergency_document ?? false}
              />
              Emergency document
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_featured"
                defaultChecked={policy?.is_featured ?? false}
              />
              Featured in library
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="mobile_available"
                defaultChecked={policy?.mobile_available ?? true}
              />
              Available in mobile apps
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="offline_mobile_allowed"
                defaultChecked={policy?.offline_mobile_allowed ?? false}
              />
              Allow offline mobile access
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Create draft"
              : "Save changes"}
        </Button>
        <Button variant="outline" asChild>
          <Link
            href={
              mode === "edit" && policy
                ? `/policies/${policy.id}`
                : "/policies/manage"
            }
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
