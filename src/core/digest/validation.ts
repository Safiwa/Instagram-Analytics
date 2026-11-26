const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;
// Same length as the Pro plan trial (see core/billing/plans.ts).
export const DIGEST_TRIAL_DAYS = 14;

export type DigestSignupInput = {
  email?: unknown;
  handle?: unknown;
  consent?: unknown;
  company?: unknown;
};

export type ValidatedSignup = {
  email: string;
  handle: string;
};

export type ValidationResult =
  | { ok: true; value: ValidatedSignup }
  | { ok: false; message: string };

export function validateSignup(input: DigestSignupInput): ValidationResult {
  if (typeof input.company === "string" && input.company.trim() !== "") {
    return { ok: false, message: "Invalid submission." };
  }

  if (input.consent !== true) {
    return { ok: false, message: "Please agree to receive the weekly digest." };
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const handle = typeof input.handle === "string" ? input.handle.trim().replace(/^@/, "").toLowerCase() : "";
  if (!HANDLE_PATTERN.test(handle)) {
    return { ok: false, message: "Enter a valid Instagram username." };
  }

  return { ok: true, value: { email, handle } };
}

export function trialEndsAt(from: Date, days = DIGEST_TRIAL_DAYS): string {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
