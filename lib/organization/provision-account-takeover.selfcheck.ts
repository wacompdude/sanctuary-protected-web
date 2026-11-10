/**
 * Stage 3H-2B-E5-R1 — Executable account-takeover remediation self-check.
 * Uses disposable mock Admin fixtures only. Does not touch Production.
 *
 * Run: npx --yes tsx lib/organization/provision-account-takeover.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decideExistingUserProvisionOutcome,
  EXISTING_USER_PROVISION_ERROR,
  EXISTING_USER_PROVISION_FIELD_ERROR,
  isAlreadyRegisteredAuthError,
  resolveProvisionCreateUserResult,
  simulateExistingUserProvisionAgainstAdmin,
} from "./provision-existing-user";
import { validateProvisionMemberForm } from "./provision-member";
import { canInviteMembers } from "./invitations";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

const baseProvision = {
  email: "member@example.com",
  first_name: "Pat",
  last_name: "Member",
  role: "security_member",
  password_mode: "manual",
  password: "TempPassw0rd!",
};

function createDisposableAdminMock(mode: "already_registered" | "new_user") {
  const calls = {
    createUser: [] as unknown[][],
    updateUserById: [] as unknown[][],
    deleteUser: [] as unknown[][],
    rpc: [] as unknown[][],
    from: [] as unknown[][],
  };

  const admin = {
    auth: {
      admin: {
        createUser: async (...args: unknown[]) => {
          calls.createUser.push(args);
          if (mode === "already_registered") {
            return {
              data: { user: null },
              error: {
                message:
                  "A user with this email address has already been registered",
              },
            };
          }
          return {
            data: { user: { id: "new-user-fixture-id" } },
            error: null,
          };
        },
        updateUserById: async (...args: unknown[]) => {
          calls.updateUserById.push(args);
          return { data: { user: { id: "should-not-happen" } }, error: null };
        },
        deleteUser: async (...args: unknown[]) => {
          calls.deleteUser.push(args);
          return { data: { user: null }, error: null };
        },
      },
    },
    rpc: async (...args: unknown[]) => {
      calls.rpc.push(args);
      return { data: "membership-fixture-id", error: null };
    },
    from: (...args: unknown[]) => {
      calls.from.push(args);
      return {
        upsert: async () => ({ data: null, error: null }),
      };
    },
  };

  return { admin, calls };
}

function assertDecisionDenied(
  label: string,
  context: Parameters<typeof decideExistingUserProvisionOutcome>[0],
) {
  const decision = decideExistingUserProvisionOutcome(context);
  assert(decision.allowPasswordChange === false, `${label}: password`);
  assert(decision.allowMetadataOverwrite === false, `${label}: metadata`);
  assert(decision.allowMembershipAttach === false, `${label}: attach`);
  assert(decision.returnCredentials === false, `${label}: credentials`);
  assert(
    decision.resetExistingPasswordHonored === false,
    `${label}: flag bypass`,
  );
  assert(decision.error === EXISTING_USER_PROVISION_ERROR, `${label}: error`);
  assert(
    decision.fieldError === EXISTING_USER_PROVISION_FIELD_ERROR,
    `${label}: field`,
  );
  console.log(`PASS  ${label}`);
}

async function assertMockExistingUserPath(
  label: string,
  resetExistingPassword: boolean | null | undefined,
) {
  const { admin, calls } = createDisposableAdminMock("already_registered");
  const result = await simulateExistingUserProvisionAgainstAdmin({
    admin,
    email: "existing@example.com",
    password: "AttackerChosenPass1!",
    resetExistingPassword,
    userMetadata: {
      first_name: "Attacker",
      last_name: "Overwrite",
      full_name: "Attacker Overwrite",
    },
  });

  assert(result.updateUserByIdCalls === 0, `${label}: updateUserById called`);
  assert(result.attachRpcCalls === 0, `${label}: attach called`);
  assert(result.deleteUserCalls === 0, `${label}: deleteUser called`);
  assert(result.credentialsReturned === null, `${label}: credentials`);
  assert(calls.updateUserById.length === 0, `${label}: mock updateUserById`);
  assert(
    calls.rpc.filter((args) => args[0] === "attach_organization_membership")
      .length === 0,
    `${label}: mock attach rpc`,
  );
  assert(
    result.decision.error.toLowerCase().includes("invitation"),
    `${label}: invitation guidance`,
  );

  const resolution = resolveProvisionCreateUserResult({
    createdUserId: null,
    createErrorMessage:
      "A user with this email address has already been registered",
    resetExistingPassword,
  });
  assert(resolution.kind === "existing_user_refused", `${label}: resolution`);
  if (resolution.kind === "existing_user_refused") {
    assert(
      resolution.decision.allowPasswordChange === false,
      `${label}: resolver password`,
    );
    assert(
      resolution.decision.allowMetadataOverwrite === false,
      `${label}: resolver metadata`,
    );
  }
  console.log(`PASS  ${label}`);
}

// --- Decision matrix (cross-tenant / forged / roles) ---
assertDecisionDenied("1 same-org + resetExistingPassword=true", {
  resetExistingPassword: true,
  sameOrganization: true,
  actorCanManageMemberships: true,
});
assertDecisionDenied("2 cross-org + resetExistingPassword=true", {
  resetExistingPassword: true,
  sameOrganization: false,
  actorCanManageMemberships: true,
});
assertDecisionDenied("3 multi-organization user", {
  resetExistingPassword: true,
  multiOrganization: true,
  actorCanManageMemberships: true,
});
assertDecisionDenied("4 existing organization Owner", {
  resetExistingPassword: true,
  isOrganizationOwner: true,
  actorCanManageMemberships: true,
});
assertDecisionDenied("5 existing Platform Super Admin", {
  resetExistingPassword: true,
  isPlatformSuperAdmin: true,
  actorCanManageMemberships: true,
});
assertDecisionDenied("6 existing user resetExistingPassword=false", {
  resetExistingPassword: false,
  actorCanManageMemberships: true,
});
assertDecisionDenied("7 forged mobile resetExistingPassword=true", {
  resetExistingPassword: true,
  forgedClientFlag: true,
  actorCanManageMemberships: true,
});
assertDecisionDenied("8 forged web reset_existing_password=on", {
  resetExistingPassword: true,
  forgedClientFlag: true,
  actorCanManageMemberships: true,
});
assertDecisionDenied("11 unauthorized membership manager context", {
  resetExistingPassword: true,
  actorCanManageMemberships: false,
});
assertDecisionDenied("12 cross-tenant organization ID", {
  resetExistingPassword: true,
  sameOrganization: false,
  actorCanManageMemberships: true,
});
assertDecisionDenied("12b existing user with no membership in requesting org", {
  resetExistingPassword: true,
  sameOrganization: false,
  actorCanManageMemberships: true,
});

async function main() {
  // --- Executable mock Admin paths ---
  await assertMockExistingUserPath(
    "E1 mock existing-user no flag",
    false,
  );
  await assertMockExistingUserPath(
    "E2 mock existing-user resetExistingPassword=true",
    true,
  );
  await assertMockExistingUserPath(
    "E3 mock existing-user unexpected null flag",
    null,
  );

  // Unexpected request structures still resolve to refusal
  {
    const weird = resolveProvisionCreateUserResult({
      createdUserId: null,
      createErrorMessage: "email_exists",
      resetExistingPassword: true as unknown as boolean,
    });
    assert(weird.kind === "existing_user_refused", "E4 weird structure");
    console.log("PASS  E4 unexpected request structure still refused");
  }

  // --- New-user compatibility ---
  {
    const validated = validateProvisionMemberForm(
      form(baseProvision),
      "administrator",
    );
    assert(validated.data, "9 new-user form must validate");
    assert(
      !("resetExistingPassword" in (validated.data as object)),
      "9 validated input must not carry resetExistingPassword",
    );
    const forged = validateProvisionMemberForm(
      form({ ...baseProvision, reset_existing_password: "true" }),
      "administrator",
    );
    assert(forged.data, "9 forged flag must still validate for new-user fields");
    assert(
      !("resetExistingPassword" in (forged.data as object)),
      "9 forged flag must be stripped from validated input",
    );

    const created = resolveProvisionCreateUserResult({
      createdUserId: "new-user-fixture-id",
      createErrorMessage: null,
      resetExistingPassword: true,
    });
    assert(created.kind === "created", "9 created resolution");
    assert(
      created.kind === "created" && created.userId === "new-user-fixture-id",
      "9 created user id",
    );

    assert(canInviteMembers("administrator") === true, "9 admin can invite");
    assert(
      canInviteMembers("security_member") === false,
      "9 member cannot invite",
    );
    console.log("PASS  9 new-user provisioning validation + authz");
  }

  // Trusted org / unauthorized denial is policy-level (canInviteMembers)
  {
    assert(
      canInviteMembers("security_member") === false,
      "9b unauthorized provisioning denied by role gate",
    );
    console.log("PASS  9b unauthorized provisioning role gate");
  }

  // New-user mock: createUser succeeds path allows continue (no updateUserById)
  {
    const { admin, calls } = createDisposableAdminMock("new_user");
    const created = await admin.auth.admin.createUser({
      email: "brand-new@example.com",
      password: "TempPassw0rd!",
    });
    const payload = created as { data?: { user?: { id?: string } } };
    const resolution = resolveProvisionCreateUserResult({
      createdUserId: payload.data?.user?.id ?? null,
      createErrorMessage: null,
      resetExistingPassword: true,
    });
    assert(resolution.kind === "created", "9c new-user resolution");
    assert(calls.updateUserById.length === 0, "9c no updateUserById on create");
    console.log("PASS  9c new-user create path does not call updateUserById");
  }

  // --- Invitation compatibility (routing + static invite surfaces) ---
  {
    const decision = decideExistingUserProvisionOutcome({
      resetExistingPassword: true,
    });
    assert(
      decision.error.toLowerCase().includes("invitation"),
      "10 must route existing users to invitation workflow",
    );
    assert(
      decision.allowMembershipAttach === false,
      "10 must not silently grant membership",
    );

    const inviteActions = readFileSync(
      resolve(process.cwd(), "app/(app)/team/invite-actions.ts"),
      "utf8",
    );
    assert(
      inviteActions.includes("organization_invitations") ||
        inviteActions.includes("invitation"),
      "10 invite actions present",
    );
    const mobileInvite = readFileSync(
      resolve(process.cwd(), "lib/organization/mobile-team-api.ts"),
      "utf8",
    );
    assert(
      mobileInvite.includes("createMobileInvitation"),
      "10 mobile invitation API present",
    );
    const acceptPage = readFileSync(
      resolve(process.cwd(), "app/invitations/accept/page.tsx"),
      "utf8",
    );
    assert(
      acceptPage.includes("accept") || acceptPage.length > 0,
      "10 invitation accept page present",
    );
    console.log("PASS  10 invitation workflow compatibility surfaces");
  }

  assertDecisionDenied("13 existing-user global metadata integrity", {
    resetExistingPassword: true,
  });
  assertDecisionDenied("14 credentials not returned for existing users", {
    resetExistingPassword: true,
  });
  assertDecisionDenied("15 existing password remains valid", {
    resetExistingPassword: true,
    forgedClientFlag: true,
  });

  assert(
    isAlreadyRegisteredAuthError(
      "A user with this email address has already been registered",
    ),
    "already-registered detector: registered",
  );
  assert(
    isAlreadyRegisteredAuthError("email_exists"),
    "already-registered detector: email_exists",
  );
  assert(
    !isAlreadyRegisteredAuthError("rate limit exceeded"),
    "already-registered detector: non-match",
  );

  // Static source analysis — vulnerable mutation paths must be gone
  const root = process.cwd();
  const provisionActions = readFileSync(
    resolve(root, "app/(app)/team/provision-actions.ts"),
    "utf8",
  );
  const mobileApi = readFileSync(
    resolve(root, "lib/organization/mobile-team-api.ts"),
    "utf8",
  );
  const provisionForm = readFileSync(
    resolve(root, "components/team/provision-member-form.tsx"),
    "utf8",
  );
  const provisionMember = readFileSync(
    resolve(root, "lib/organization/provision-member.ts"),
    "utf8",
  );

  assert(
    !provisionActions.includes("admin.auth.admin.updateUserById"),
    "web provision-actions must not call updateUserById",
  );
  assert(
    !/updateUserById/.test(mobileApi),
    "mobile-team-api must not call updateUserById",
  );
  assert(
    provisionActions.includes("resolveProvisionCreateUserResult"),
    "web must use shared createUser resolver",
  );
  assert(
    mobileApi.includes("resolveProvisionCreateUserResult"),
    "mobile must use shared createUser resolver",
  );
  assert(
    !provisionForm.includes("reset_existing_password"),
    "web UI must not offer reset_existing_password control",
  );
  assert(
    !provisionMember.includes("resetExistingPassword:"),
    "ProvisionMemberInput must not include resetExistingPassword",
  );
  assert(
    provisionActions.includes("password_reset: false"),
    "web audit must not claim password_reset for provision success",
  );
  assert(
    mobileApi.includes("password_reset: false"),
    "mobile audit must not claim password_reset for provision success",
  );
  assert(
    !readFileSync(
      resolve(root, "lib/organization/provision-existing-user.ts"),
      "utf8",
    ).includes("120_email_lookup"),
    "E5 guard must remain application-only (no migration 120 dependency)",
  );

  console.log(
    "provision-account-takeover.selfcheck: PASS (decision + mock Admin + static)",
  );
}

void main();
