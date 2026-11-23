import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppHeader } from "#/components/app-header";

/** Layout for every page that needs a signed-in user. */
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    const { setupComplete, user } = context.authState;
    if (!setupComplete) throw redirect({ to: "/setup" });
    if (!user) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    return { user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
