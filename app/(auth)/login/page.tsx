import { LoginCard } from "@/components/auth/login-card";

interface LoginPageProps {
  searchParams?: Promise<{
    next?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolved = await searchParams;
  return <LoginCard nextPath={resolved?.next} />;
}
