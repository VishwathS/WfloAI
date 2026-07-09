import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-10 text-center shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-violet-600">404</p>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Page not found</h1>
        <p className="max-w-md text-sm text-gray-600">
          The page you requested does not exist or you no longer have access to it.
        </p>
        <Link href="/" className={buttonVariants()}>
          Return home
        </Link>
      </div>
    </main>
  );
}
