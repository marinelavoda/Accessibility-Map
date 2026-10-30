"use client";

// The sign-in and sign-up form. It runs in the browser and calls Better Auth's
// endpoints (/api/auth/...) through authClient. After success it goes to the
// dashboard, where requireRole() decides whether this person may see it.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    setBusy(true);
    setError(null);
    const { error } =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get("name")) });
    setBusy(false);

    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function signInWithGoogle() {
    setBusy(true);
    // Leaves the site for Google's page, then comes back to /dashboard.
    await authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" });
  }

  const isSignUp = mode === "sign-up";
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{isSignUp ? "Create an account" : "Sign in"}</CardTitle>
        <CardDescription>Harta Accesibilității — staff dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={isSignUp ? 10 : undefined}
              aria-describedby={isSignUp ? "password-hint" : undefined}
              required
            />
            {isSignUp && (
              <p id="password-hint" className="text-sm text-muted-foreground">
                At least 10 characters.
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        {googleEnabled && (
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={signInWithGoogle}>
            Continue with Google
          </Button>
        )}

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>
              Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
            </>
          ) : (
            <>
              No account yet? <Link href="/sign-up" className="underline">Create one</Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
