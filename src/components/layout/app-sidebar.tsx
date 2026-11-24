import { Link, useRouterState } from "@tanstack/react-router";
import {
  BanIcon,
  BookAudioIcon,
  BookOpenIcon,
  CompassIcon,
  InboxIcon,
  SettingsIcon,
  TriangleAlertIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "#/components/ui/sidebar";
import type { SessionUser } from "#/functions/auth.functions";
import { Logo } from "#/components/layout/logo";
import { m } from "#/paraglide/messages.js";

type NavItem = { href: string; label: () => string; icon: LucideIcon; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: m.nav_discover, icon: CompassIcon },
  { href: "/books", label: m.nav_books, icon: BookOpenIcon },
  { href: "/audiobooks", label: m.nav_audiobooks, icon: BookAudioIcon },
  { href: "/requests", label: m.nav_requests, icon: InboxIcon },
  { href: "/blocklist", label: m.nav_blocklist, icon: BanIcon, adminOnly: true },
  { href: "/issues", label: m.nav_issues, icon: TriangleAlertIcon },
  { href: "/users", label: m.nav_users, icon: UsersIcon, adminOnly: true },
  { href: "/settings", label: m.nav_settings, icon: SettingsIcon, adminOnly: true },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/** Seerr-like navigation: a sidebar on desktop, a drawer on phones. */
export function AppSidebar({ user, version }: { user: SessionUser; version: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="flex px-2 py-4" onClick={() => setOpenMobile(false)}>
          <Logo className="h-9" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label={m.sidebar_title()}>
              <SidebarMenu>
                {NAV.filter((item) => !item.adminOnly || user.isAdmin).map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        href={item.href}
                        isActive={active}
                        aria-current={active ? "page" : undefined}
                        size="lg"
                        onPress={() => setOpenMobile(false)}
                      >
                        <item.icon />
                        <span>{item.label()}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="px-2 py-1 text-xs text-muted-foreground">
          {m.app_name()} {version}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
