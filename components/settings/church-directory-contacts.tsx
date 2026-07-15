"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deleteChurchContact,
  upsertChurchContact,
} from "@/app/(app)/settings/church/contact-actions";
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
import { textareaClassName } from "@/components/incidents/incident-badges";
import {
  isMultiContactType,
  labelForContactType,
  type ChurchContactRecord,
  type ChurchContactType,
} from "@/lib/church/contacts";
import type { ActionState } from "@/lib/church/types";

function ContactFields({
  contactType,
  contact,
  fieldErrors,
  canEdit,
}: {
  contactType: ChurchContactType;
  contact?: ChurchContactRecord | null;
  fieldErrors?: Record<string, string>;
  canEdit: boolean;
}) {
  const prefix = contact?.id ?? `new-${contactType}`;
  return (
    <>
      <input type="hidden" name="contact_type" value={contactType} />
      {contact?.id ? (
        <input type="hidden" name="contact_id" value={contact.id} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-organization_name`}>Organization</Label>
          <Input
            id={`${prefix}-organization_name`}
            name="organization_name"
            defaultValue={contact?.organization_name ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-full_name`}>Contact name</Label>
          <Input
            id={`${prefix}-full_name`}
            name="full_name"
            defaultValue={contact?.full_name ?? ""}
            disabled={!canEdit}
            aria-invalid={!!fieldErrors?.full_name}
          />
          {fieldErrors?.full_name && (
            <p className="text-sm text-destructive">{fieldErrors.full_name}</p>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-phone`}>Phone</Label>
          <Input
            id={`${prefix}-phone`}
            name="phone"
            type="tel"
            defaultValue={contact?.phone ?? ""}
            disabled={!canEdit}
            aria-invalid={!!fieldErrors?.phone}
          />
          {fieldErrors?.phone && (
            <p className="text-sm text-destructive">{fieldErrors.phone}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-email`}>Email</Label>
          <Input
            id={`${prefix}-email`}
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
            disabled={!canEdit}
            aria-invalid={!!fieldErrors?.email}
          />
          {fieldErrors?.email && (
            <p className="text-sm text-destructive">{fieldErrors.email}</p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-notes`}>Notes</Label>
        <textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={3}
          defaultValue={contact?.notes ?? ""}
          disabled={!canEdit}
          className={textareaClassName}
          aria-invalid={!!fieldErrors?.notes}
        />
        {fieldErrors?.notes && (
          <p className="text-sm text-destructive">{fieldErrors.notes}</p>
        )}
      </div>
    </>
  );
}

function DeleteContactButton({
  contactId,
  canEdit,
}: {
  contactId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    deleteChurchContact,
    {} as ActionState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  if (!canEdit) return null;

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Remove this contact?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="contact_id" value={contactId} />
      {state.error && (
        <p className="mb-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </Button>
    </form>
  );
}

function ContactEditorCard({
  contactType,
  contact,
  canEdit,
  title,
  description,
}: {
  contactType: ChurchContactType;
  contact?: ChurchContactRecord | null;
  canEdit: boolean;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    upsertChurchContact,
    {} as ActionState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title ?? labelForContactType(contactType)}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          {state.error && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Contact saved.
            </p>
          )}
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <ContactFields
              contactType={contactType}
              contact={contact}
              fieldErrors={state.fieldErrors}
              canEdit={canEdit}
            />
          </fieldset>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Saving…"
                  : contact?.id
                    ? "Save contact"
                    : "Add contact"}
              </Button>
              {contact?.id ? (
                <DeleteContactButton contactId={contact.id} canEdit={canEdit} />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              View only. Owners and administrators can edit contacts.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function ChurchDirectoryContacts({
  contactTypes,
  contacts,
  canEdit,
}: {
  contactTypes: ChurchContactType[];
  contacts: ChurchContactRecord[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-6">
      {contactTypes.map((type) => {
        const forType = contacts.filter((contact) => contact.contact_type === type);
        if (isMultiContactType(type)) {
          return (
            <div key={type} className="space-y-4">
              <div>
                <h3 className="text-base font-semibold">
                  {labelForContactType(type)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  You can save more than one contact for this type.
                </p>
              </div>
              {forType.map((contact) => (
                <ContactEditorCard
                  key={contact.id}
                  contactType={type}
                  contact={contact}
                  canEdit={canEdit}
                  title={
                    contact.organization_name ||
                    contact.full_name ||
                    labelForContactType(type)
                  }
                />
              ))}
              <ContactEditorCard
                contactType={type}
                canEdit={canEdit}
                title={`Add ${labelForContactType(type)}`}
                description="Save another vendor or service contact."
              />
            </div>
          );
        }

        return (
          <ContactEditorCard
            key={type}
            contactType={type}
            contact={forType[0] ?? null}
            canEdit={canEdit}
          />
        );
      })}
    </div>
  );
}
