import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BanIcon } from "lucide-react";

import { FormError } from "#/components/form/form-error";
import { Cover } from "#/components/media/cover";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { getBlocklist, unblockMedia } from "#/functions/requests.functions";
import { formatDate } from "#/lib/format";
import { mediaKeys } from "#/lib/queries/media";
import { can } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

const blocklistQuery = () =>
  queryOptions({ queryKey: ["blocklist"] as const, queryFn: () => getBlocklist() });

export const Route = createFileRoute("/_authed/blocklist")({
  beforeLoad: ({ context }) => {
    if (!can(context.user, "manage_blocklist")) throw redirect({ to: "/" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(blocklistQuery()),
  head: () => ({ meta: [{ title: `${m.blocklist_title()} · ${m.app_name()}` }] }),
  component: BlocklistPage,
});

function BlocklistPage() {
  const { data: items } = useSuspenseQuery(blocklistQuery());
  const queryClient = useQueryClient();
  const unblockFn = useServerFn(unblockMedia);
  const unblock = useMutation({
    mutationFn: (id: string) => unblockFn({ data: { id } }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["blocklist"] }),
        queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
      ]),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{m.blocklist_title()}</h1>
        <p className="text-muted-foreground">{m.blocklist_description()}</p>
      </div>
      <FormError message={unblock.error ? unblock.error.message || m.error_generic() : null} />
      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BanIcon />
            </EmptyMedia>
            <EmptyTitle>{m.blocklist_empty()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-3">
              <Cover src={item.coverUrl} type={item.type} className="w-14 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  to="/media/$type/$id"
                  params={{ type: item.type, id: item.externalId }}
                  className="truncate font-medium hover:underline"
                >
                  {item.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {item.createdByName
                    ? m.blocklist_blocked_by({
                        name: item.createdByName,
                        date: formatDate(new Date(item.createdAt)),
                      })
                    : m.blocklist_blocked_on({ date: formatDate(new Date(item.createdAt)) })}
                </p>
                {item.reason ? (
                  <EmptyDescription className="text-left text-sm">{item.reason}</EmptyDescription>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                isDisabled={unblock.isPending && unblock.variables === item.id}
                onPress={() => unblock.mutate(item.id)}
              >
                {m.action_unblock()}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
