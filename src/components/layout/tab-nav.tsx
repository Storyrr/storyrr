import { Link } from "@tanstack/react-router";

export type Tab = { to: string; label: () => string };

/** Seerr-like underlined tabs, one route per tab. */
export function TabNav({ label, tabs }: { label: string; tabs: readonly Tab[] }) {
  return (
    <nav aria-label={label} className="overflow-x-auto border-b">
      <ul className="flex gap-6">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              className="-mb-px block border-b-2 border-transparent py-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "border-primary text-primary", "aria-current": "page" }}
            >
              {tab.label()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
