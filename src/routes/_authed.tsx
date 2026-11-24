import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppSidebar } from "#/components/layout/app-sidebar";
import { MobileNav } from "#/components/layout/mobile-nav";
import { TopBar } from "#/components/layout/top-bar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { getLocale, isLocale, setLocale } from "#/paraglide/runtime.js";

/** Layout for every page that needs a signed-in user: sidebar, top bar, content. */
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    const { setupComplete, user, version } = context.authState;
    if (!setupComplete) throw redirect({ to: "/setup" });
    if (!user) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    return { user, version };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, version } = Route.useRouteContext();
  // The language picked in the user's settings wins over this browser's (e.g. after signing in elsewhere).
  useEffect(() => {
    if (user.locale && isLocale(user.locale) && user.locale !== getLocale())
      void setLocale(user.locale);
  }, [user.locale]);
  return (
    <SidebarProvider>
      <AppSidebar user={user} version={version} />
      {/* min-w-0: wide content (scrolling rows) must not stretch the column past the screen,
          or the top bar and its account menu slide out of view. */}
      <SidebarInset className="min-w-0">
        <TopBar user={user} />
        {/* SidebarInset is already the page's <main>. */}
        {/* Bottom padding on phones: room for the bottom menu. */}
        <div className="w-full min-w-0 flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-6">
          <Outlet />
        </div>
        <MobileNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
