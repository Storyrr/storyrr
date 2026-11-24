import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppSidebar } from "#/components/layout/app-sidebar";
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
      <SidebarInset>
        <TopBar user={user} />
        <main className="w-full flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
