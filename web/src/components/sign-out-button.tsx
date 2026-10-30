"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" className={className} onClick={signOut}>
      Sign out
    </Button>
  );
}
