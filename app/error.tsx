"use client";

import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
          Application error
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          The page hit an unexpected error. You can try again without losing your
          current session.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
