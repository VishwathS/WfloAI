"use client";

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface UseUserResult {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
}

export function useUser(): UseUserResult {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    async function loadSession() {
      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession();

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    }

    void loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    isLoading,
    session,
    user
  };
}
