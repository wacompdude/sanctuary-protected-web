/**
 * Organization billing address rules. No Stripe network or database writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canManageOrganizationBilling,
  canViewOrganizationBilling,
} from "@/lib/billing/access";
import {
  isOrganizationBillingAddressComplete,
  normalizeBillingCountry,
  readOrganizationBillingAddress,
  stripeCustomerAddressUpdate,
  synchronizeOrganizationBillingAddress,
  validateOrganizationBillingAddress,
} from "@/lib/billing/organization-billing-address";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const complete = {
  businessName: "Sanctuary Protected LLC",
  line1: "1 Main St",
  line2: "Suite 2",
  city: "Seattle",
  state: "wa",
  postalCode: "98101",
  country: "United States",
};

const saved = validateOrganizationBillingAddress(complete);
assert(saved.ok === true, "owner-valid address shape");
if (!saved.ok) throw new Error("unreachable");
const address = saved.address;
assert(address.country === "US", "country normalized");
assert(address.state === "WA", "state normalized");
assert(address.line2 === "Suite 2", "line2 kept");
assert(isOrganizationBillingAddressComplete(address), "complete");
assert(canManageOrganizationBilling("owner"), "owner can manage");
assert(canManageOrganizationBilling("co_owner"), "co-owner can manage");
assert(!canManageOrganizationBilling("administrator"), "administrator cannot modify");
assert(!canManageOrganizationBilling("security_leader"), "security leader cannot modify");
assert(!canManageOrganizationBilling("security_member"), "security member cannot modify");
assert(!canManageOrganizationBilling("viewer"), "viewer cannot modify");
assert(canViewOrganizationBilling("administrator"), "administrator can view");
assert(!canViewOrganizationBilling("security_leader"), "security leader cannot view billing");

for (const field of ["line1", "city", "state", "postalCode", "country", "businessName"] as const) {
  const missing = validateOrganizationBillingAddress({ ...complete, [field]: "" });
  assert(missing.ok === false && missing.fieldErrors[field], `missing ${field}`);
}
const optionalLine = validateOrganizationBillingAddress({ ...complete, line2: "" });
assert(optionalLine.ok && optionalLine.address.line2 === null, "line2 optional");
assert(normalizeBillingCountry("usa") === "US", "USA alias");

const stripeFields = stripeCustomerAddressUpdate(address);
assert(stripeFields.name === "Sanctuary Protected LLC", "stripe name");
assert(stripeFields.address.line1 === "1 Main St", "stripe line1");
assert(stripeFields.address.line2 === "Suite 2", "stripe line2");
assert(stripeFields.address.city === "Seattle", "stripe city");
assert(stripeFields.address.state === "WA", "stripe state");
assert(stripeFields.address.postal_code === "98101", "stripe postal");
assert(stripeFields.address.country === "US", "stripe country");

let creates = 0;
const updates: string[] = [];
async function main() {
const synced = await synchronizeOrganizationBillingAddress({
  organizationId: "org_1",
  address,
  getCustomerId: async () => "cus_existing",
  ensureCustomer: async () => {
    creates += 1;
    return { providerCustomerId: "cus_new" };
  },
  updateCustomer: async (customerId) => {
    updates.push(customerId);
  },
});
assert(synced === "synced" && updates[0] === "cus_existing" && creates < 1, "updates existing customer");

const created = await synchronizeOrganizationBillingAddress({
  organizationId: "org_1",
  address,
  getCustomerId: async () => null,
  ensureCustomer: async () => {
    creates += 1;
    return { providerCustomerId: "cus_new" };
  },
  updateCustomer: async (customerId) => {
    updates.push(customerId);
  },
});
assert(created === "synced" && updates[1] === "cus_new" && creates === 1, "creates once when missing");

const failed = await synchronizeOrganizationBillingAddress({
  organizationId: "org_1",
  address,
  getCustomerId: async () => "cus_existing",
  ensureCustomer: async () => ({ providerCustomerId: "cus_new" }),
  updateCustomer: async () => {
    throw new Error("sk_test_secret raw stripe failure");
  },
});
assert(failed === "needs_attention", "sync failure is recoverable");

const stored = readOrganizationBillingAddress({
  business_name: "Sanctuary Protected LLC",
  line1: "1 Main St",
  city: "Seattle",
  state: "WA",
  postal_code: "98101-1234",
  country: "US",
});
assert(stored?.postalCode === "98101-1234", "stored postal");
assert(readOrganizationBillingAddress({ country: "CA", line1: "1", city: "Vancouver", state: "BC", postal_code: "V6B", business_name: "North" }) === null, "canada not activated");

const root = process.cwd();
const live = readFileSync(join(root, "lib/billing/stripe/billing-address-live.ts"), "utf8");
const action = readFileSync(join(root, "app/(app)/settings/billing/billing-address-actions.ts"), "utf8");
assert(action.includes("requireBillingManageAccess"), "server authorization");
assert(!action.includes("formData.get(\"organizationId\")"), "browser cannot choose organization");
assert(!live.includes("paymentIntents"), "no PaymentIntent");
assert(!live.includes("checkout.sessions"), "no Checkout");
assert(!live.includes("setupIntents"), "no SetupIntent");
assert(!live.includes("automatic_tax"), "tax collection stays off");
assert(!live.includes("STRIPE_SMS_TAX_COLLECTION"), "tax gate unchanged");
assert(live.includes("customers.update"), "customer update");
assert(live.includes("ensureStripeCustomerForOrganization"), "reuses customer helper");
assert(!live.includes("sk_live") && !live.includes("sk_test"), "no secret");
console.log("organization billing address self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
