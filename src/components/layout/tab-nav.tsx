import { useNavigate, useRouterState } from "@tanstack/react-router";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { cn } from "#/lib/utils";

export type Tab = { to: string; label: () => string };

/** Below this many tabs they fit on one line from tablets up; more need a wide screen. */
const MANY_TABS = 7;
// Static class names, for Tailwind to find.
const SELECT_HIDDEN = { few: "sm:hidden", many: "xl:hidden" } as const;
const TABS_SHOWN = { few: "sm:flex", many: "xl:flex" } as const;

/**
 * Tabs (line by default) where each tab is a route (React Aria follows the links through the
 * router); the current route's page is the selected tab's panel. Where they
 * wouldn't fit on one line (phones; tablets too for many tabs), a select instead,
 * like Seerr.
 */
export function TabNav({
  label,
  tabs,
  variant = "line",
  children,
}: {
  label: string;
  tabs: readonly Tab[];
  /** "default": pill tabs, for a bar nested under line tabs (Settings → Notifications' agents). */
  variant?: "line" | "default";
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const selected = tabs.find((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));
  const navigate = useNavigate();
  const size = tabs.length >= MANY_TABS ? "many" : "few";
  return (
    <Tabs selectedKey={selected?.to} className="gap-8">
      <Select
        aria-label={label}
        value={selected?.to ?? null}
        onChange={(key) => {
          if (key !== null) void navigate({ to: String(key) });
        }}
        className={cn("w-full", SELECT_HIDDEN[size])}
      >
        <SelectTrigger className="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tabs.map((tab) => (
            <SelectItem key={tab.to} id={tab.to}>
              {tab.label()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TabsList
        variant={variant}
        aria-label={label}
        // The list's own fixed height (h-8) would let wrapped rows overlap the page below.
        className={cn(
          "hidden flex-wrap justify-start group-data-horizontal/tabs:h-auto",
          variant === "line" ? "w-full border-b pb-1" : "w-fit",
          TABS_SHOWN[size],
        )}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.to}
            id={tab.to}
            href={tab.to}
            className={cn("flex-none px-3", variant === "line" ? "h-8" : "h-7")}
          >
            {tab.label()}
          </TabsTrigger>
        ))}
      </TabsList>
      {selected ? (
        <TabsContent id={selected.to} className="text-base">
          {children}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
