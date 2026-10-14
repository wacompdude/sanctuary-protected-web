"use client";

import { useActionState, useState } from "react";
import { saveOrganizationBillingAddressAction } from "@/app/(app)/settings/billing/billing-address-actions";
import {
  submittedOrganizationBillingState,
  US_STATE_CODES,
  type OrganizationBillingAddress,
} from "@/lib/billing/organization-billing-address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function FieldMessage({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function BillingAddressForm({
  canManage,
  address,
}: {
  canManage: boolean;
  address: OrganizationBillingAddress | null;
}) {
  const [formState, action, pending] = useActionState(saveOrganizationBillingAddressAction, {});
  const [stateCode, setStateCode] = useState(address?.state ?? "");
  const submittedState = submittedOrganizationBillingState(stateCode);
  const fieldErrors = formState.fieldErrors ?? {};
  const locked = !canManage;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="state" value={submittedState} />
      <div className="sm:col-span-2">
        <Label htmlFor="billing-business-name">Business / Organization Name</Label>
        <Input
          id="billing-business-name"
          name="businessName"
          defaultValue={address?.businessName ?? ""}
          disabled={locked}
          autoComplete="organization"
          aria-invalid={Boolean(fieldErrors.businessName)}
          aria-describedby={fieldErrors.businessName ? "billing-business-name-error" : undefined}
        />
        <FieldMessage id="billing-business-name-error" message={fieldErrors.businessName} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="billing-line1">Address Line 1</Label>
        <Input
          id="billing-line1"
          name="line1"
          defaultValue={address?.line1 ?? ""}
          disabled={locked}
          autoComplete="address-line1"
          aria-invalid={Boolean(fieldErrors.line1)}
          aria-describedby={fieldErrors.line1 ? "billing-line1-error" : undefined}
        />
        <FieldMessage id="billing-line1-error" message={fieldErrors.line1} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="billing-line2">Address Line 2</Label>
        <Input
          id="billing-line2"
          name="line2"
          defaultValue={address?.line2 ?? ""}
          disabled={locked}
          autoComplete="address-line2"
          aria-invalid={Boolean(fieldErrors.line2)}
          aria-describedby={fieldErrors.line2 ? "billing-line2-error" : undefined}
        />
        <FieldMessage id="billing-line2-error" message={fieldErrors.line2} />
      </div>
      <div>
        <Label htmlFor="billing-city">City</Label>
        <Input
          id="billing-city"
          name="city"
          defaultValue={address?.city ?? ""}
          disabled={locked}
          autoComplete="address-level2"
          aria-invalid={Boolean(fieldErrors.city)}
          aria-describedby={fieldErrors.city ? "billing-city-error" : undefined}
        />
        <FieldMessage id="billing-city-error" message={fieldErrors.city} />
      </div>
      <div>
        <Label htmlFor="billing-state">State / Province</Label>
        <select
          id="billing-state"
          value={submittedState}
          onChange={(event) => setStateCode(event.target.value)}
          disabled={locked}
          aria-invalid={Boolean(fieldErrors.state)}
          aria-describedby={fieldErrors.state ? "billing-state-error" : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
        >
          <option value="">Select a state</option>
          {US_STATE_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <FieldMessage id="billing-state-error" message={fieldErrors.state} />
      </div>
      <div>
        <Label htmlFor="billing-postal">ZIP / Postal Code</Label>
        <Input
          id="billing-postal"
          name="postalCode"
          defaultValue={address?.postalCode ?? ""}
          disabled={locked}
          autoComplete="postal-code"
          aria-invalid={Boolean(fieldErrors.postalCode)}
          aria-describedby={fieldErrors.postalCode ? "billing-postal-error" : undefined}
        />
        <FieldMessage id="billing-postal-error" message={fieldErrors.postalCode} />
      </div>
      <div>
        <Label htmlFor="billing-country">Country</Label>
        <select
          id="billing-country"
          name="country"
          value="US"
          onChange={() => undefined}
          disabled={locked}
          aria-invalid={Boolean(fieldErrors.country)}
          aria-describedby={fieldErrors.country ? "billing-country-error" : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
        >
          <option value="US">United States</option>
        </select>
        <FieldMessage id="billing-country-error" message={fieldErrors.country} />
      </div>
      {canManage ? (
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save billing address"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Only an owner or co-owner can change the billing address.
        </p>
      )}
      {formState.error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {formState.error}
        </p>
      ) : null}
      {formState.message ? (
        <p className="text-sm text-muted-foreground sm:col-span-2">{formState.message}</p>
      ) : null}
    </form>
  );
}
