import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/require-role";

export const dynamic = "force-dynamic";

// Where requireRole() sends someone who is signed in but lacks the needed role.
export default async function NoAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">You don&apos;t have access to this page</CardTitle>
          <CardDescription>
            You&apos;re signed in as {user.email} with the role “{user.role}”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            The dashboard is for MOTIVAȚIE reviewers and admins. If you work with MOTIVAȚIE, ask an admin to give
            your account the right role.
          </p>
          <div className="flex flex-wrap gap-2">
            {user.role !== "user" && (
              <Link href="/dashboard" className="underline">
                Back to the dashboard
              </Link>
            )}
            <Link href="/" className="underline">
              Go to the public map
            </Link>
          </div>
          <SignOutButton />
        </CardContent>
      </Card>
    </main>
  );
}
