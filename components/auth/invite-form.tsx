"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InviteForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not redeem that code.");
        return;
      }

      // The gate reads approval live on every request, so a refresh is enough:
      // the proxy sends an approved user on from the waitlist page.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="invite-code"
          className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
        >
          Invite code
        </label>
        <Input
          id="invite-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Paste your code"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-code-error" : undefined}
          className="mt-1.5"
          disabled={isSubmitting}
        />
      </div>

      {error ? (
        <p id="invite-code-error" role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting || code.trim() === ""}>
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Redeem code
      </Button>
    </form>
  );
}
