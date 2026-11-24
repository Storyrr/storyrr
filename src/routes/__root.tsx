import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";

import { authStateQuery } from "#/lib/queries/auth";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  // Setup state and the signed-in user, for route guards and the app shell. This is
  // UX only: server functions check the session themselves.
  beforeLoad: async ({ context }) => {
    const authState = await context.queryClient.fetchQuery(authStateQuery());
    return { authState };
  },
  head: ({ match }) => {
    // Link previews (chat apps, social networks) need absolute URLs.
    const appUrl = match.context.authState?.appUrl;
    const absolute = (path: string) => (appUrl ? new URL(path, appUrl).toString() : path);
    const locale = getLocale();
    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        {
          title: m.app_name(),
        },
        {
          name: "theme-color",
          content: "#17140F",
        },
        { name: "description", content: m.meta_description() },
        // A private, invite-only instance: keep it out of search engines. Link
        // previews still work (they read the tags below, not the index).
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: m.app_name() },
        { property: "og:title", content: m.app_name() },
        { property: "og:description", content: m.meta_description() },
        { property: "og:locale", content: locale === "fr" ? "fr_FR" : "en_US" },
        ...(appUrl ? [{ property: "og:url", content: appUrl }] : []),
        { property: "og:image", content: absolute(`/og-image.${locale}.png`) },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: m.meta_image_alt() },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: m.app_name() },
        { name: "twitter:description", content: m.meta_description() },
        { name: "twitter:image", content: absolute(`/og-image.${locale}.png`) },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
    };
  },
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    // Dark-first, like Seerr.
    <html lang={getLocale()} className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background text-foreground antialiased">
        {/* React Aria links and buttons with href navigate through TanStack Router (no full reloads). */}
        <AriaRouterProvider
          navigate={(href) => void router.navigate({ href })}
          useHref={(href) => href}
        >
          {children}
        </AriaRouterProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
