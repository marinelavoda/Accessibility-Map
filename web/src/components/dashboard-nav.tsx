"use client";

// The sidebar links. A client component only so it can highlight the current page.
// Hiding "Users" from reviewers is just for tidiness: the Users page itself calls
// requireRole("admin"), which is what actually keeps reviewers out.

import { ClipboardList, LayoutDashboard, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, adminOnly: false },
  { href: "/dashboard/review", label: "Review queue", icon: ClipboardList, adminOnly: false },
  { href: "/dashboard/places", label: "Places", icon: MapPin, adminOnly: false },
  { href: "/dashboard/users", label: "Users & roles", icon: Users, adminOnly: true },
];

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {LINKS.filter((link) => isAdmin || !link.adminOnly).map((link) => {
            const isActive = pathname === link.href;
            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton
                  isActive={isActive}
                  render={<Link href={link.href} aria-current={isActive ? "page" : undefined} />}
                >
                  <link.icon aria-hidden />
                  <span>{link.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
