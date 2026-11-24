import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { CreateUserDialog } from "#/components/users/create-user-dialog";
import { roleLabels } from "#/components/users/role-labels";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import {
  deleteUser,
  setUserAutoApprove,
  setUserBanned,
  setUserRole,
} from "#/functions/users.functions";
import { formatDate } from "#/lib/format";
import { authKeys } from "#/lib/queries/auth";
import { userKeys, usersQuery } from "#/lib/queries/users";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/users")({
  beforeLoad: ({ context }) => {
    if (!context.user.isAdmin) throw redirect({ to: "/" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(usersQuery()),
  head: () => ({ meta: [{ title: `${m.users_title()} · ${m.app_name()}` }] }),
  component: UsersPage,
});

function useUsers() {
  return useSuspenseQuery(usersQuery()).data;
}

/** One mutation per action; every change refreshes the list (and the caller's own auth state). */
function useUserAction<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: userKeys.all }),
        queryClient.invalidateQueries({ queryKey: authKeys.all }),
      ]),
  });
}

function UsersPage() {
  const users = useUsers();
  const { user: me } = Route.useRouteContext();
  const roleFn = useServerFn(setUserRole);
  const autoApproveFn = useServerFn(setUserAutoApprove);
  const bannedFn = useServerFn(setUserBanned);
  const setRole = useUserAction((data: { userId: string; role: "user" | "admin" }) =>
    roleFn({ data }),
  );
  const setAutoApprove = useUserAction((data: { userId: string; autoApprove: boolean }) =>
    autoApproveFn({ data }),
  );
  const setBanned = useUserAction((data: { userId: string; banned: boolean }) =>
    bannedFn({ data }),
  );
  const error = setRole.error ?? setAutoApprove.error ?? setBanned.error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">{m.users_title()}</h1>
          <p className="text-muted-foreground">{m.users_description()}</p>
        </div>
        <CreateUserDialog />
      </div>
      <FormError message={error ? error.message || m.error_generic() : null} />
      <ul className="flex flex-col divide-y">
        {users.map((account) => {
          const isMe = account.id === me.id;
          const isAdmin = account.role === "admin";
          return (
            <li key={account.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
              <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{account.name}</span>
                  <Badge variant={isAdmin ? "default" : "secondary"}>
                    {roleLabels[isAdmin ? "admin" : "user"]()}
                  </Badge>
                  {isMe ? <Badge variant="outline">{m.users_you()}</Badge> : null}
                  {account.banned ? <Badge variant="destructive">{m.users_banned()}</Badge> : null}
                </div>
                <p className="truncate text-sm text-muted-foreground">{account.email}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(new Date(account.createdAt))} ·{" "}
                  {m.users_requests({ count: account.requests })}
                </p>
              </div>
              <Switch
                isSelected={isAdmin || account.autoApprove}
                isDisabled={isAdmin}
                onChange={(autoApprove) =>
                  setAutoApprove.mutate({ userId: account.id, autoApprove })
                }
              >
                <span className="text-sm">{m.field_auto_approve()}</span>
              </Switch>
              {isMe ? null : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={setRole.isPending}
                    onPress={() =>
                      setRole.mutate({ userId: account.id, role: isAdmin ? "user" : "admin" })
                    }
                  >
                    {isAdmin ? m.users_make_user() : m.users_make_admin()}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={setBanned.isPending}
                    onPress={() =>
                      setBanned.mutate({ userId: account.id, banned: !account.banned })
                    }
                  >
                    {account.banned ? m.action_unban() : m.action_ban()}
                  </Button>
                  <DeleteUserButton id={account.id} name={account.name} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeleteUserButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const deleteFn = useServerFn(deleteUser);
  const remove = useUserAction(() => deleteFn({ data: { userId: id } }));

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size="sm" variant="destructive">
        <Trash2Icon data-icon="inline-start" />
        {m.action_delete()}
      </Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.users_delete_title({ name })}</DialogTitle>
          <DialogDescription>{m.users_delete_description()}</DialogDescription>
        </DialogHeader>
        <FormError message={remove.error ? remove.error.message || m.error_generic() : null} />
        <DialogFooter>
          <DialogClose>{m.action_cancel()}</DialogClose>
          <Button
            variant="destructive"
            isDisabled={remove.isPending}
            onPress={() => remove.mutate(undefined, { onSuccess: () => setOpen(false) })}
          >
            {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.action_delete()}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}
