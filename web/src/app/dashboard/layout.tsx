// The frame around every dashboard page: sidebar on the left, page on the right.
// It calls requireRole("reviewer") to know who is signed in, but each page calls
// requireRole() again itself: in Next.js a layout doesn't re-run on every click,
// so a layout check alone is not enough (hard rule 1).

import Link from "next/link";
import { DashboardNav } from "@/components/dashboard-nav";
import { SignOutButton } from "@/components/sign-out-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireRole } from "@/server/require-role";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireRole("reviewer");

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader className="px-4 py-3">
            <Link href="/dashboard" className="font-semibold">
              Harta Accesibilității
            </Link>
            <span className="text-xs text-muted-foreground">Staff dashboard</span>
          </SidebarHeader>
          <SidebarContent>
            <DashboardNav isAdmin={user.role === "admin"} />
          </SidebarContent>
          <SidebarFooter className="gap-2 px-4 py-3 text-sm">
            <div>
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">
                {user.email} · {user.role}
              </div>
            </div>
            <SignOutButton className="w-full" />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger aria-label="Show or hide the menu" />
            <Link href="/" className="ml-auto text-sm text-muted-foreground underline">
              Public map
            </Link>
          </header>
          <div className="flex-1 p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
