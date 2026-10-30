import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { isGoogleSignInEnabled } from "@/server/auth";
import { getCurrentUser } from "@/server/require-role";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <AuthForm mode="sign-in" googleEnabled={isGoogleSignInEnabled()} />
    </main>
  );
}
