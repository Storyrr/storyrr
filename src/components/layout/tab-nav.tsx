import { useNavigate, useRouterState } from "@tanstack/react-router";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

export type Tab = { to: string; label: () => string };

/**
 * Line tabs where each tab is a route (React Aria follows the links through the
 * router); the current route's page is the selected tab's panel. On phones, a
 * select instead, like Seerr: a dozen tabs wrapped over several lines there.
 */
export function TabNav({
  label,
  tabs,
  children,
}: {
  label: string;
  tabs: readonly Tab[];
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const selected = tabs.find((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));
  const navigate = useNavigate();
  return (
    <Tabs selectedKey={selected?.to} className="gap-8">
      <Select
        aria-label={label}
        value={selected?.to ?? null}
        onChange={(key) => {
          if (key !== null) void navigate({ to: String(key) });
        }}
        className="w-full sm:hidden"
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
        variant="line"
        aria-label={label}
        // The list's own fixed height (h-8) would let wrapped rows overlap the page below.
        className="hidden w-full flex-wrap justify-start border-b pb-1 group-data-horizontal/tabs:h-auto sm:flex"
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.to} id={tab.to} href={tab.to} className="h-8 flex-none px-3">
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
