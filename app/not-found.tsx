import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-600">404</p>
        <h1 className="text-3xl font-semibold text-slate-950">Page not found</h1>
        <p className="max-w-md text-sm text-slate-600">
          The page you requested does not exist or you no longer have access to it.
        </p>
        <Link href="/" className={buttonVariants()}>
          Return home
        </Link>
      </div>
    </main>
  );
}
