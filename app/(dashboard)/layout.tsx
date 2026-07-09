import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto grid min-h-screen w-full max-w-[1560px] gap-5 px-3 py-4 lg:grid-cols-[260px_1fr] lg:px-4 xl:gap-6">
        <DashboardSidebar />
        <main className="rounded-2xl border border-gray-200 bg-white shadow-card">
          {children}
        </main>
      </div>
    </div>
  );
}
