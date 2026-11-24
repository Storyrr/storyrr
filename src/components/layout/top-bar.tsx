import { useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useId, useState } from "react";

import { UserMenu } from "#/components/layout/user-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { Label } from "#/components/ui/label";
import { SidebarTrigger } from "#/components/ui/sidebar";
import type { SessionUser } from "#/functions/auth.functions";
import { m } from "#/paraglide/messages.js";

/** Search across audiobooks and books, the menu button on phones, and the account menu. */
export function TopBar({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputId = useId();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
      <SidebarTrigger className="md:hidden" />
      <search className="flex-1">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const q = query.trim();
            if (q.length >= 2) void navigate({ to: "/search", search: { q } });
          }}
        >
          <Label htmlFor={inputId} className="sr-only">
            {m.search_label()}
          </Label>
          <InputGroup className="h-10 rounded-full">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id={inputId}
              type="search"
              placeholder={m.search_placeholder()}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </InputGroup>
        </form>
      </search>
      <UserMenu user={user} />
    </header>
  );
}
