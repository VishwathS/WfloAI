// redeem_invite_code returns an outcome string rather than raising, so the
// mapping lives here in one place instead of being parsed out of an error.
//
// Messages are about the code the user typed, never about the inventory: no
// counts, no limits, nothing about other codes or other users. A disabled code
// is reported by the function as 'invalid', so it has no message of its own.
export const INVITE_OUTCOMES: Record<string, { status: number; message: string }> = {
  approved: { status: 200, message: "You're in. Taking you to your dashboard." },
  already_approved: { status: 200, message: "Your account already has access." },
  invalid: {
    status: 400,
    message: "That invite code isn't valid. Check it for typos and try again."
  },
  expired: {
    status: 400,
    message: "That invite code has expired. Ask whoever invited you for a new one."
  },
  exhausted: {
    status: 400,
    message: "That invite code has already been used up. Ask whoever invited you for a new one."
  },
  // Enforced inside redeem_invite_code, where a direct RPC cannot skip it; this
  // is only the message. It names no window because two limits exist.
  rate_limited: {
    status: 429,
    message: "Too many attempts. Wait a while before trying again."
  },
  unauthenticated: { status: 401, message: "Unauthorized" }
};

export const MAX_INVITE_CODE_LENGTH = 64;
