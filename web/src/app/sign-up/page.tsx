import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { isGoogleSignInEnabled } from "@/server/auth";
import { getCurrentUser } from "@/server/require-role";

export const dynamic = "force-dynamic";

// Anyone may create an account (decided 2026-10-30), but a new account has the role
// "user", which can't open the dashboard. An admin promotes staff on the Users page.
export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <AuthForm mode="sign-up" googleEnabled={isGoogleSignInEnabled()} />
    </main>
  );
}
