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
  BILLING_ADDRESS_LOCAL_SAVE_ERROR,
  orchestrateOrganizationBillingAddressSave,
} from "@/lib/billing/organization-billing-address-save";
import {
  isOrganizationBillingAddressComplete,
  normalizeBillingCountry,
  readOrganizationBillingAddress,
  stripeCustomerAddressUpdate,
  submittedOrganizationBillingState,
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

const form = readFileSync(join(root, "components/billing/billing-address-form.tsx"), "utf8");
const stateSelect = form.slice(form.indexOf('id="billing-state"'), form.indexOf('id="billing-postal"'));
assert(form.includes('<input type="hidden" name="state" value={submittedState} />'), "submitted state is the controlled value");
assert(!stateSelect.includes("name="), "visible state select does not submit a second value");
assert(!stateSelect.includes("defaultValue"), "state select is not uncontrolled");
assert(stateSelect.includes("value={submittedState}"), "visible state matches submitted state");
assert(form.includes("useState(address?.state ?? \"\")"), "saved state initializes the selector");
assert(form.includes('name="country"'), "country is submitted");
assert(form.includes('value="US"'), "country stays US");
assert(form.includes("fieldErrors.businessName"), "business name error is shown");
assert(form.includes("fieldErrors.line1"), "line1 error is shown");
assert(form.includes("fieldErrors.city"), "city error is shown");
assert(form.includes("fieldErrors.state"), "state error is shown");
assert(form.includes("fieldErrors.postalCode"), "postal error is shown");
assert(form.includes("fieldErrors.country"), "country error is shown");
assert(form.includes("aria-invalid"), "invalid fields are marked");
assert(form.includes("aria-describedby"), "errors are described");
assert(action.includes("fieldErrors: validated.fieldErrors"), "server returns field errors");
assert(action.includes("requireBillingManageAccess"), "save stays authorized");

function submittedFields(stateCode: string) {
  const data = new FormData();
  data.set("state", submittedOrganizationBillingState(stateCode));
  data.set("country", "US");
  data.set("businessName", "Sanctuary Protected Test");
  data.set("line1", "1 Main St");
  data.set("city", "Seattle");
  data.set("postalCode", "98101");
  return data;
}

const savedWa = submittedFields("WA");
assert(savedWa.get("state") === "WA", "initialized WA submits WA");
assert(savedWa.get("country") === "US", "country US remains US");
const selectedWa = submittedFields(submittedOrganizationBillingState("WA"));
assert(selectedWa.get("state") === "WA", "selecting WA submits WA");
const selectedCa = submittedFields(submittedOrganizationBillingState("CA"));
assert(selectedCa.get("state") === "CA", "selecting CA submits CA");
const blankState = submittedFields("");
assert(blankState.get("state") === "", "no selection submits blank");
const rejected = validateOrganizationBillingAddress({
  businessName: "Sanctuary Protected Test",
  line1: "1 Main St",
  city: "Seattle",
  state: blankState.get("state"),
  postalCode: "98101",
  country: "US",
});
assert(rejected.ok === false && rejected.fieldErrors.state === "Select a U.S. state.", "blank state stays rejected");
const zipError = validateOrganizationBillingAddress({ ...complete, postalCode: "" });
assert(zipError.ok === false && zipError.fieldErrors.postalCode === "Enter a ZIP code.", "zip error text");
const nameError = validateOrganizationBillingAddress({ ...complete, businessName: "" });
assert(nameError.ok === false && nameError.fieldErrors.businessName === "Enter the billing business name.", "business name error text");
const valid = validateOrganizationBillingAddress({
  businessName: String(savedWa.get("businessName")),
  line1: "1 Main St",
  city: "Seattle",
  state: savedWa.get("state"),
  postalCode: "98101",
  country: savedWa.get("country"),
});
assert(valid.ok === true && valid.address.state === "WA" && valid.address.country === "US", "complete address still passes");

const STRIPE_ATTENTION = "Billing address was saved, but Stripe synchronization needs attention.";
let stripeCalls = 0;
const savedProfile = await orchestrateOrganizationBillingAddressSave({
  ensureProfile: async () => ({ ok: true }),
  updateAddress: async () => ({ ok: true, rowCount: 1 }),
  audit: async () => ({ ok: true }),
  syncStripe: async () => {
    stripeCalls += 1;
    return "synced";
  },
});
assert(savedProfile.ok === true && savedProfile.sync === "synced" && stripeCalls === 1, "existing profile updates then syncs");

stripeCalls = 0;
const createdProfile = await orchestrateOrganizationBillingAddressSave({
  ensureProfile: async () => ({ ok: true }),
  updateAddress: async () => ({ ok: true, rowCount: 1 }),
  audit: async () => ({ ok: true }),
  syncStripe: async () => {
    stripeCalls += 1;
    return "synced";
  },
});
assert(createdProfile.ok === true && stripeCalls === 1, "missing profile is ensured before update and sync");

const ensureFailed = await orchestrateOrganizationBillingAddressSave({
  ensureProfile: async () => ({ ok: false, code: "profile_missing" }),
  updateAddress: async () => {
    throw new Error("update after missing profile");
  },
  audit: async () => {
    throw new Error("audit after missing profile");
  },
  syncStripe: async () => {
    throw new Error("stripe after missing profile");
  },
});
assert(ensureFailed.ok === false && ensureFailed.error === BILLING_ADDRESS_LOCAL_SAVE_ERROR, "missing profile stays a local failure");

const updateFailed = await orchestrateOrganizationBillingAddressSave({
  ensureProfile: async () => ({ ok: true }),
  updateAddress: async () => ({ ok: false, code: "23514" }),
  audit: async () => {
    throw new Error("audit after database failure");
  },
  syncStripe: async () => {
    throw new Error("stripe after database failure");
  },
});
assert(updateFailed.ok === false && updateFailed.error === BILLING_ADDRESS_LOCAL_SAVE_ERROR, "database failure stays local");

const zeroRows = await orchestrateOrganizationBillingAddressSave({
  ensureProfile: async () => ({ ok: true }),
  updateAddress: async () => ({ ok: true, rowCount: 0 }),
  audit: async () => ({ ok: true }),
  syncStripe: async () => "synced",
});
assert(zeroRows.ok === false, "zero updated rows do not claim success");

stripeCalls = 0;
const auditFailed = await orchestrateOrganizationBillingAddressSave({
  ensureProfile: async () => ({ ok: true }),
  updateAddress: async () => ({ ok: true, rowCount: 1 }),
  audit: async () => ({ ok: false }),
  syncStripe: async () => {
    stripeCalls += 1;
    return "synced";
  },
});
assert(auditFailed.ok === true && auditFailed.sync === "synced" && stripeCalls === 1, "audit failure does not roll back the saved address");

const stripeFailed = await orchestrateOrganizationBillingAddressSave({
  ensureProfile: async () => ({ ok: true }),
  updateAddress: async () => ({ ok: true, rowCount: 1 }),
  audit: async () => ({ ok: true }),
  syncStripe: async () => {
    throw new Error("stripe unavailable");
  },
});
assert(stripeFailed.ok === true && stripeFailed.sync === "needs_attention", "stripe failure follows a successful local save");
assert(action.includes(STRIPE_ATTENTION), "action reports stripe attention separately");
assert(action.includes("if (!saved.ok) return { error: saved.error }"), "local failure is returned before stripe messaging");
assert(action.includes("church.id"), "organization comes from the session");
assert(live.includes("ensure_organization_billing_profile"), "reuses the billing profile helper");
assert(live.includes("billing.address_updated") || live.includes("BILLING_ADDRESS_UPDATED"), "audit action is billing.address_updated");
console.log("organization billing address self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
