// MASTER section 7.4: every generated legal page carries this as its first
// rendered content. Removing it is a legal sign-off performed by a human, and
// is an explicit hard stop for an agent.
export function DraftBanner() {
  return (
    <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        DRAFT — NOT REVIEWED BY COUNSEL.
      </p>
      <p className="mt-1 text-sm text-amber-800">
        Do not publish without human legal review.
      </p>
    </div>
  );
}
