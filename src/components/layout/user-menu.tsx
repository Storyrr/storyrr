import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { InboxIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";

import { UserAvatar } from "#/components/layout/user-avatar";
import { Button } from "#/components/ui/button";
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

/** Seerr-like account menu: who is signed in, profile, requests, settings, sign out. */
export function UserMenu({ user }: { user: SessionUser }) {
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
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label={m.user_menu_label({ name: user.name })}
      >
        <UserAvatar name={user.name} className="size-8" />
      </Button>
      <DropdownMenu placement="bottom end" className="min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            <UserAvatar name={user.name} className="size-10" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-semibold text-foreground">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem href="/profile" textValue={m.nav_profile()}>
            <UserIcon />
            {m.nav_profile()}
          </DropdownMenuItem>
          <DropdownMenuItem href="/requests?scope=mine" textValue={m.nav_requests()}>
            <InboxIcon />
            {m.nav_requests()}
          </DropdownMenuItem>
          <DropdownMenuItem href="/profile/settings" textValue={m.nav_settings()}>
            <SettingsIcon />
            {m.nav_settings()}
          </DropdownMenuItem>
          <DropdownMenuItem textValue={m.sign_out()} onAction={() => signOut.mutate()}>
            <LogOutIcon />
            {m.sign_out()}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}
