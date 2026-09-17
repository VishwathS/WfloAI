import Link from "next/link";
import { Bot } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MarketingLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Bot className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-gray-900">WfloAI</span>
          </Link>
          <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
            WfloAI
          </p>
          <nav className="flex gap-5 text-sm text-gray-600">
            <Link href="/help" className="hover:text-gray-900">
              Help
            </Link>
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-gray-900">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
