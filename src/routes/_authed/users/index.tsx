import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { SortDescriptor } from "react-aria-components";

import { FormError } from "#/components/form/form-error";
import { UserAvatar } from "#/components/layout/user-avatar";
import { CreateUserDialog } from "#/components/users/create-user-dialog";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { deleteUser, type getUsers } from "#/functions/users.functions";
import { formatDate } from "#/lib/format";
import { authKeys } from "#/lib/queries/auth";
import { userSettingsQuery } from "#/lib/queries/settings";
import { userKeys, usersQuery } from "#/lib/queries/users";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

export const Route = createFileRoute("/_authed/users/")({
  beforeLoad: ({ context }) => {
    if (!context.user.isAdmin) throw redirect({ to: "/" });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(usersQuery()),
      context.queryClient.ensureQueryData(userSettingsQuery()),
    ]),
  head: () => ({ meta: [{ title: `${m.users_title()} · ${m.app_name()}` }] }),
  component: UsersPage,
});

type Account = Awaited<ReturnType<typeof getUsers>>[number];

const PAGE_SIZES = [10, 25, 50, 100] as const;
type SortColumn = "name" | "requests" | "role" | "createdAt";
const isSortColumn = (key: unknown): key is SortColumn =>
  key === "name" || key === "requests" || key === "role" || key === "createdAt";

function compare(a: Account, b: Account, column: SortColumn): number {
  switch (column) {
    case "name":
      return a.name.localeCompare(b.name, getLocale(), { sensitivity: "base" });
    case "requests":
      return a.requests - b.requests;
    case "role":
      return (a.role === "admin" ? 0 : 1) - (b.role === "admin" ? 0 : 1);
    default:
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
}

/** Seerr-like users table: search, sortable columns, pages; Edit opens the user's settings. */
function UsersPage() {
  const { data: users } = useSuspenseQuery(usersQuery());
  const { data: defaults } = useSuspenseQuery(userSettingsQuery());
  const { user: me } = Route.useRouteContext();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortDescriptor>({ column: "name", direction: "ascending" });
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = needle
      ? users.filter(
          (u) =>
            u.name.toLocaleLowerCase().includes(needle) ||
            u.email.toLocaleLowerCase().includes(needle),
        )
      : users;
    const column = isSortColumn(sort.column) ? sort.column : "name";
    const sorted = filtered.toSorted((a, b) => compare(a, b, column));
    return sort.direction === "descending" ? sorted.toReversed() : sorted;
  }, [users, query, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * pageSize, (current + 1) * pageSize);
  const from = rows.length === 0 ? 0 : current * pageSize + 1;
  const to = current * pageSize + visible.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{m.users_title()}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <CreateUserDialog defaultAutoApprove={defaults.defaultAutoApprove} />
          <Label htmlFor={searchId} className="sr-only">
            {m.users_search()}
          </Label>
          <InputGroup className="w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id={searchId}
              type="search"
              placeholder={m.users_search()}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </InputGroup>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{m.users_description()}</p>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table
          aria-label={m.users_title()}
          sortDescriptor={sort}
          onSortChange={(descriptor) => {
            setSort(descriptor);
            setPage(0);
          }}
        >
          <TableHeader className="bg-muted/50">
            <TableHead id="name" isRowHeader allowsSorting className="px-4">
              {m.users_column_user()}
            </TableHead>
            <TableHead id="requests" allowsSorting>
              {m.users_column_requests()}
            </TableHead>
            <TableHead id="role" allowsSorting>
              {m.field_role()}
            </TableHead>
            <TableHead id="createdAt" allowsSorting>
              {m.users_column_joined()}
            </TableHead>
            <TableHead id="actions" className="px-4 text-right">
              <span className="sr-only">{m.users_column_actions()}</span>
            </TableHead>
          </TableHeader>
          <TableBody
            items={visible}
            renderEmptyState={() => (
              <p className="py-6 text-muted-foreground">{m.users_none_found()}</p>
            )}
          >
            {(account) => {
              const isMe = account.id === me.id;
              return (
                <TableRow id={account.id}>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={account.name} className="size-9" />
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 font-medium">
                          {account.name}
                          {isMe ? <Badge variant="outline">{m.users_you()}</Badge> : null}
                          {account.banned ? (
                            <Badge variant="destructive">{m.users_banned()}</Badge>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">{account.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{account.requests}</TableCell>
                  <TableCell>{account.role === "admin" ? m.role_admin() : m.role_user()}</TableCell>
                  <TableCell>{formatDate(new Date(account.createdAt))}</TableCell>
                  <TableCell className="px-4">
                    <div className="flex justify-end gap-2">
                      {isMe ? (
                        <Link
                          to="/profile/settings/general"
                          className={buttonVariants({ size: "sm" })}
                        >
                          <PencilIcon data-icon="inline-start" />
                          {m.action_edit()}
                        </Link>
                      ) : (
                        <Link
                          to="/users/$userId/settings/general"
                          params={{ userId: account.id }}
                          className={buttonVariants({ size: "sm" })}
                        >
                          <PencilIcon data-icon="inline-start" />
                          {m.action_edit()}
                        </Link>
                      )}
                      <DeleteUserButton id={account.id} name={account.name} disabled={isMe} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            {m.users_showing({ from, to, total: rows.length })}
          </p>
          <Select
            aria-label={m.users_page_size()}
            value={String(pageSize)}
            onChange={(key) => {
              setPageSize(Number(key));
              setPage(0);
            }}
            className="flex flex-row items-center gap-2"
          >
            <Label>{m.users_page_size()}</Label>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} id={String(size)}>
                  {String(size)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              isDisabled={current === 0}
              onPress={() => setPage(current - 1)}
            >
              <ChevronLeftIcon data-icon="inline-start" />
              {m.action_previous()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={current >= pages - 1}
              onPress={() => setPage(current + 1)}
            >
              {m.action_next()}
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteUserButton({ id, name, disabled }: { id: string; name: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const deleteFn = useServerFn(deleteUser);
  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { userId: id } }),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userKeys.all }),
        queryClient.invalidateQueries({ queryKey: authKeys.all }),
      ]);
    },
  });

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size="sm" variant="destructive" isDisabled={disabled}>
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
            onPress={() => remove.mutate()}
          >
            {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.action_delete()}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}
