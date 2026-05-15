import { LoginCard } from "@/components/auth/login-card";

interface LoginPageProps {
  searchParams?: {
    next?: string;
  };
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return <LoginCard nextPath={searchParams?.next} />;
}
