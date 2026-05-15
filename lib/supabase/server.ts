import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  createServerClient,
  type CookieOptions
} from "@supabase/ssr";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { url, anonKey };
}

export function createServerSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components may not persist cookies directly.
        }
      }
    }
  });
}

export function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabaseConfig();

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value,
          ...options
        });

        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });

        response.cookies.set({
          name,
          value,
          ...options
        });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value: "",
          ...options
        });

        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });

        response.cookies.set({
          name,
          value: "",
          ...options
        });
      }
    }
  });

  return { supabase, response };
}
