/**
 * Safety concern storage / validation self-check (no database).
 * Run: npx --yes tsx lib/safety-concerns/storage.selfcheck.ts
 */
import {
  extensionForSafetyConcernPhotoMime,
  isSafetyConcernPhotoStoragePath,
  safetyConcernPhotoObjectPath,
  sniffImageMimeFromBytes,
  validateSafetyConcernPhotoFile,
} from "@/lib/safety-concerns/attachment-storage";
import { validateSafetyConcernProfileForm } from "@/lib/safety-concerns/validation";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  extensionForSafetyConcernPhotoMime("image/jpeg") === "jpg",
  "jpeg extension",
);
assert(
  extensionForSafetyConcernPhotoMime("image/gif") === null,
  "gif not allowed",
);

const path = safetyConcernPhotoObjectPath({
  organizationId: "11111111-1111-4111-8111-111111111111",
  profileId: "22222222-2222-4222-8222-222222222222",
  mimeType: "image/png",
});
assert(Boolean(path?.endsWith(".png")), "path ends with png");
assert(
  isSafetyConcernPhotoStoragePath(
    path!,
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ),
  "path validates for church/profile",
);
assert(
  !isSafetyConcernPhotoStoragePath(
    path!,
    "11111111-1111-4111-8111-111111111111",
    "33333333-3333-4333-8333-333333333333",
  ),
  "path rejects other profile",
);

const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
assert(sniffImageMimeFromBytes(jpegHeader) === "image/jpeg", "sniff jpeg");

const pngHeader = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
assert(sniffImageMimeFromBytes(pngHeader) === "image/png", "sniff png");

const fakeFile = {
  type: "image/jpeg",
  size: 1024,
} as File;
assert(validateSafetyConcernPhotoFile(fakeFile) === null, "valid jpeg file");

const badFile = { type: "image/gif", size: 1024 } as File;
assert(
  validateSafetyConcernPhotoFile(badFile) !== null,
  "gif rejected",
);

const form = new FormData();
form.set("display_name", "JD");
form.set("scope_type", "church_wide");
form.set("profile_status", "draft");
form.set("risk_context", "documented_threat");
form.set("restriction_type", "written_no_trespass");
form.set("restriction_status", "active");
form.set("short_note", "Written no-trespass on file. Contact security leader.");
const validated = validateSafetyConcernProfileForm(form);
assert(Boolean(validated.data), "profile form validates");
assert(
  validated.data?.display_name === "JD",
  "display name preserved",
);

const campusForm = new FormData();
campusForm.set("display_name", "Unknown individual");
campusForm.set("scope_type", "campus_specific");
campusForm.set("profile_status", "draft");
campusForm.set("risk_context", "other_documented_concern");
campusForm.set("restriction_type", "none");
campusForm.set("restriction_status", "not_applicable");
const campusValidated = validateSafetyConcernProfileForm(campusForm);
assert(
  Boolean(campusValidated.fieldErrors?.primary_campus_id),
  "campus-specific requires campus",
);

console.log("safety concern storage self-check passed");
