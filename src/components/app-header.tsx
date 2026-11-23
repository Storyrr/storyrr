import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { InboxIcon, LogOutIcon, SearchIcon, SettingsIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { SessionUser } from "#/functions/auth.functions";
import { authClient } from "#/lib/auth-client";
import { authKeys } from "#/lib/queries/auth";
import { m } from "#/paraglide/messages.js";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" className="text-lg font-semibold">
          {m.app_name()}
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            to="/"
            className={buttonVariants({ variant: "ghost" })}
            activeOptions={{ exact: true, includeSearch: false }}
            aria-label={m.nav_search()}
          >
            <SearchIcon data-icon="inline-start" />
            <span className="hidden sm:inline">{m.nav_search()}</span>
          </Link>
          <Link
            to="/requests"
            className={buttonVariants({ variant: "ghost" })}
            aria-label={m.nav_requests()}
          >
            <InboxIcon data-icon="inline-start" />
            <span className="hidden sm:inline">{m.nav_requests()}</span>
          </Link>
          {user.isAdmin ? (
            <Link
              to="/settings/services"
              className={buttonVariants({ variant: "ghost" })}
              aria-label={m.nav_settings()}
            >
              <SettingsIcon data-icon="inline-start" />
              <span className="hidden sm:inline">{m.nav_settings()}</span>
            </Link>
          ) : null}
          <UserMenu user={user} />
        </nav>
      </div>
    </header>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? m.error_generic());
    },
    onSuccess: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: authKeys.all });
      await router.navigate({ to: "/sign-in" });
    },
  });

  return (
    <DropdownMenuTrigger>
      <Button variant="ghost" aria-label={m.user_menu_label({ name: user.name })}>
        <Avatar className="size-6">
          <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="hidden truncate sm:inline">{user.name}</span>
      </Button>
      <DropdownMenu placement="bottom end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate text-sm text-foreground">{user.email}</div>
            <div>{user.isAdmin ? m.role_admin() : m.role_user()}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem textValue={m.sign_out()} onAction={() => signOut.mutate()}>
            <LogOutIcon />
            {m.sign_out()}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}
