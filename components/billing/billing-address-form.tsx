"use client";

import { useActionState } from "react";
import { saveOrganizationBillingAddressAction } from "@/app/(app)/settings/billing/billing-address-actions";
import { US_STATE_CODES, type OrganizationBillingAddress } from "@/lib/billing/organization-billing-address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BillingAddressForm({
  canManage,
  address,
}: {
  canManage: boolean;
  address: OrganizationBillingAddress | null;
}) {
  const [state, action, pending] = useActionState(saveOrganizationBillingAddressAction, {});

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="billing-business-name">Business / Organization Name</Label>
        <Input
          id="billing-business-name"
          name="businessName"
          defaultValue={address?.businessName ?? ""}
          disabled={!canManage || pending}
          autoComplete="organization"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="billing-line1">Address Line 1</Label>
        <Input
          id="billing-line1"
          name="line1"
          defaultValue={address?.line1 ?? ""}
          disabled={!canManage || pending}
          autoComplete="address-line1"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="billing-line2">Address Line 2</Label>
        <Input
          id="billing-line2"
          name="line2"
          defaultValue={address?.line2 ?? ""}
          disabled={!canManage || pending}
          autoComplete="address-line2"
        />
      </div>
      <div>
        <Label htmlFor="billing-city">City</Label>
        <Input
          id="billing-city"
          name="city"
          defaultValue={address?.city ?? ""}
          disabled={!canManage || pending}
          autoComplete="address-level2"
        />
      </div>
      <div>
        <Label htmlFor="billing-state">State / Province</Label>
        <select
          id="billing-state"
          name="state"
          defaultValue={address?.state ?? ""}
          disabled={!canManage || pending}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
        >
          <option value="">Select a state</option>
          {US_STATE_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="billing-postal">ZIP / Postal Code</Label>
        <Input
          id="billing-postal"
          name="postalCode"
          defaultValue={address?.postalCode ?? ""}
          disabled={!canManage || pending}
          autoComplete="postal-code"
        />
      </div>
      <div>
        <Label htmlFor="billing-country">Country</Label>
        <select
          id="billing-country"
          name="country"
          defaultValue="US"
          disabled={!canManage || pending}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
        >
          <option value="US">United States</option>
        </select>
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
      {state.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-muted-foreground sm:col-span-2">{state.message}</p> : null}
    </form>
  );
}
