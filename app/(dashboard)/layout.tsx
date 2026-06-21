import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-[1560px] gap-5 px-3 py-4 lg:grid-cols-[260px_1fr] lg:px-4 xl:gap-6">
        <DashboardSidebar />
        <main className="rounded-[28px] border border-white/70 bg-white shadow-sm">
          {children}
        </main>
      </div>
    </div>
  );
}
