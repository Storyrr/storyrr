import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BanIcon,
  BookAudioIcon,
  BookOpenIcon,
  CircleArrowUpIcon,
  CompassIcon,
  HardDriveIcon,
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "#/components/ui/sidebar";
import type { SessionUser } from "#/functions/auth.functions";
import { can, type Permission } from "#/lib/permissions";
import { aboutQuery } from "#/lib/queries/about";
import { pendingCountQuery } from "#/lib/queries/requests";
import { cn } from "#/lib/utils";
import { Logo } from "#/components/layout/logo";
import { m } from "#/paraglide/messages.js";

type NavItem = { href: string; label: () => string; icon: LucideIcon; permission?: Permission };

const NAV: NavItem[] = [
  { href: "/", label: m.nav_discover, icon: CompassIcon },
  { href: "/books", label: m.nav_books, icon: BookOpenIcon },
  { href: "/audiobooks", label: m.nav_audiobooks, icon: BookAudioIcon },
  { href: "/requests", label: m.nav_requests, icon: InboxIcon },
  { href: "/blocklist", label: m.nav_blocklist, icon: BanIcon, permission: "manage_blocklist" },
  { href: "/issues", label: m.nav_issues, icon: TriangleAlertIcon },
  { href: "/users", label: m.nav_users, icon: UsersIcon, permission: "manage_users" },
  { href: "/settings", label: m.nav_settings, icon: SettingsIcon, permission: "manage_settings" },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/** Requests waiting for approval, next to Requests (request managers). */
function PendingBadge() {
  const { data } = useQuery(pendingCountQuery());
  if (!data?.count) return null;
  return (
    <SidebarMenuBadge className="rounded-full bg-primary px-1.5 text-primary-foreground">
      {data.count}
      <span className="sr-only">{m.requests_pending_badge({ count: data.count })}</span>
    </SidebarMenuBadge>
  );
}

/** Seerr-like version card, linking to Settings → About (settings managers). */
function VersionCard({ version, onNavigate }: { version: string; onNavigate: () => void }) {
  // Releases are cached by the server for an hour: no need to ask more often.
  const { data } = useQuery({ ...aboutQuery(), staleTime: 60 * 60_000 });
  const outdated = data?.updateAvailable === true;
  return (
    <Link
      to="/settings/about"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        outdated && "border-primary",
      )}
    >
      {outdated ? (
        <CircleArrowUpIcon className="size-5 shrink-0 text-primary" aria-hidden />
      ) : (
        <HardDriveIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{m.app_name()}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {outdated ? m.sidebar_update_available() : version}
        </span>
      </span>
    </Link>
  );
}

/** Seerr-like navigation: a sidebar on desktop, a drawer on phones. */
export function AppSidebar({ user, version }: { user: SessionUser; version: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="flex px-2 py-4" onClick={() => setOpenMobile(false)}>
          <Logo className="text-3xl" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label={m.sidebar_title()}>
              <SidebarMenu>
                {NAV.filter((item) => !item.permission || can(user, item.permission)).map(
                  (item) => {
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
                        {item.href === "/requests" && can(user, "manage_requests") ? (
                          <PendingBadge />
                        ) : null}
                      </SidebarMenuItem>
                    );
                  },
                )}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {can(user, "manage_settings") ? (
          <VersionCard version={version} onNavigate={() => setOpenMobile(false)} />
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {m.app_name()} {version}
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
