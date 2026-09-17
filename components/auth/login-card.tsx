"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { safeRedirectPath } from "@/lib/security/redirect";

interface LoginCardProps {
  nextPath?: string;
}

export function LoginCard({ nextPath = "/dashboard" }: LoginCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleGoogleSignIn() {
    setIsLoading(true);

    const supabase = createBrowserSupabaseClient();
    const params = new URLSearchParams({
      next: safeRedirectPath(nextPath)
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
    <Card className="w-full max-w-md shadow-panel">
      <CardHeader className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-violet-600">
          WfloAI
        </p>
        <div>
          <CardTitle className="text-2xl tracking-tight text-gray-900">Sign in</CardTitle>
          <CardDescription className="mt-2 text-gray-600">
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
        <p className="mt-4 text-center text-xs leading-5 text-gray-500">
          By signing in you agree to our{" "}
          <Link href="/terms" className="font-medium text-violet-700 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-violet-700 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
