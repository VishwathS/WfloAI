"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, LayoutTemplate, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const linkClass =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const activeClass = "bg-violet-50 text-violet-700 hover:bg-violet-100";
const inactiveClass = "text-gray-600 hover:bg-gray-50 hover:text-gray-900";

export function SidebarNav() {
  const pathname = usePathname();
  const isDashboard = pathname === "/";

  function handleTemplatesClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!isDashboard) {
      return;
    }

    const section = document.getElementById("templates");
    if (!section) {
      return;
    }

    event.preventDefault();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    section.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });
    window.history.replaceState(null, "", "/#templates");
  }

  return (
    <nav className="space-y-1">
      <Link href="/" className={cn(linkClass, isDashboard ? activeClass : inactiveClass)}>
        <LayoutGrid className="h-4 w-4" />
        Dashboard
      </Link>
      <Link
        href="/#templates"
        onClick={handleTemplatesClick}
        className={cn(linkClass, inactiveClass)}
      >
        <LayoutTemplate className="h-4 w-4" />
        Templates
      </Link>
      <Link
        href="/settings"
        className={cn(
          linkClass,
          pathname.startsWith("/settings") ? activeClass : inactiveClass
        )}
      >
        <Settings className="h-4 w-4" />
        Settings
      </Link>
    </nav>
  );
}
