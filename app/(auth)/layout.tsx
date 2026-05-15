export default function AuthLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12">
      {children}
    </main>
  );
}
