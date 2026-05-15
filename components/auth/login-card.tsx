"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface LoginCardProps {
  nextPath?: string;
}

export function LoginCard({ nextPath = "/" }: LoginCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleGoogleSignIn() {
    setIsLoading(true);

    const supabase = createBrowserSupabaseClient();
    const params = new URLSearchParams({
      next: nextPath.startsWith("/") ? nextPath : "/"
    });
    const redirectTo = `${window.location.origin}/auth/callback?${params.toString()}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo
      }
    });

    if (error) {
      setIsLoading(false);
      throw error;
    }
  }

  return (
    <Card className="w-full max-w-md border-white/10 bg-white/95 shadow-2xl shadow-sky-950/20">
      <CardHeader className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-600">
          FlowAI
        </p>
        <div>
          <CardTitle className="text-3xl text-slate-950">Sign in</CardTitle>
          <CardDescription className="mt-2 text-slate-600">
            Continue with Google to access your workflows and start building AI-powered
            automations.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full"
          size="lg"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign in with Google
        </Button>
      </CardContent>
    </Card>
  );
}
