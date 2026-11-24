import { Link, useRouterState } from "@tanstack/react-router";
import { BookAudioIcon, BookOpenIcon, CompassIcon, InboxIcon, MenuIcon } from "lucide-react";

import { useSidebar } from "#/components/ui/sidebar";
import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

const ITEMS = [
  { to: "/", label: m.nav_discover, icon: CompassIcon },
  { to: "/books", label: m.nav_books, icon: BookOpenIcon },
  { to: "/audiobooks", label: m.nav_audiobooks, icon: BookAudioIcon },
  { to: "/requests", label: m.nav_requests, icon: InboxIcon },
] as const;

const itemClass =
  "flex flex-1 flex-col items-center gap-1 py-2 text-[0.7rem] text-muted-foreground transition-colors";

/** Seerr-like bottom bar on phones: the main pages, and More for the full menu. */
export function MobileNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenMobile } = useSidebar();
  return (
    <nav
      aria-label={m.mobile_nav_label()}
      className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {ITEMS.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(itemClass, active && "text-primary")}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label()}
          </Link>
        );
      })}
      <button type="button" className={itemClass} onClick={() => setOpenMobile(true)}>
        <MenuIcon className="size-5" aria-hidden />
        {m.mobile_nav_more()}
      </button>
    </nav>
  );
}
