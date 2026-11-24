import { useRouterState } from "@tanstack/react-router";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

export type Tab = { to: string; label: () => string };

/**
 * Line tabs where each tab is a route (React Aria follows the links through the
 * router); the current route's page is the selected tab's panel.
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
  return (
    <Tabs selectedKey={selected?.to} className="gap-8">
      <TabsList
        variant="line"
        aria-label={label}
        className="h-auto w-full flex-wrap justify-start border-b pb-1"
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.to} id={tab.to} href={tab.to} className="flex-none px-3">
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
