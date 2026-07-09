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
      <body className="bg-gray-50">
        <div className="flex min-h-screen items-center justify-center px-6 py-16">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 shadow-card">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
              Fatal error
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
              The app could not render
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              A global rendering error occurred. Refresh or try resetting the app
              state.
            </p>
            <details className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-900">
                Error details
              </summary>
              <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-gray-600">
                {error.message}
              </pre>
            </details>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-700"
            >
              Reset app
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
