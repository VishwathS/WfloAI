"use client";

interface GlobalErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalErrorPage({
  error,
  reset
}: GlobalErrorPageProps) {
  return (
    <html lang="en">
      <body className="bg-slate-100">
        <div className="flex min-h-screen items-center justify-center px-6 py-16">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600/80">
              Fatal error
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              The app could not render
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              A global rendering error occurred. Refresh or try resetting the app
              state.
            </p>
            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-900">
                Error details
              </summary>
              <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-600">
                {error.message}
              </pre>
            </details>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Reset app
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
