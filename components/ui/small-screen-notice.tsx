import { Monitor } from "lucide-react";

export const SMALL_SCREEN_NOTICE = "WfloAI works best on desktop.";

export function SmallScreenNotice() {
  return (
    <div
      role="note"
      className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 lg:hidden"
    >
      <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{SMALL_SCREEN_NOTICE}</span>
    </div>
  );
}
