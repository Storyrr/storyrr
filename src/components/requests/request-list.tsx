import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrowIcon, ArrowUpNarrowWideIcon, InboxIcon } from "lucide-react";
import type { Key } from "react-aria-components";

import { SelectField } from "#/components/form/select-field";
import { RequestRow } from "#/components/requests/request-row";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { requestsQuery, type RequestListParams } from "#/lib/queries/requests";
import {
  MEDIA_TYPES,
  REQUEST_FILTERS,
  REQUEST_SORTS,
  type MediaType,
  type RequestFilter,
  type RequestSort,
} from "#/lib/requests";
import { m } from "#/paraglide/messages.js";

const filterLabels: Record<RequestFilter, () => string> = {
  all: m.requests_filter_all,
  pending: m.requests_filter_pending,
  processing: m.requests_filter_processing,
  available: m.requests_filter_available,
  declined: m.requests_filter_declined,
  failed: m.requests_filter_failed,
  cancelled: m.requests_filter_cancelled,
};
const sortLabels: Record<RequestSort, () => string> = {
  status: m.requests_sort_status,
  added: m.requests_sort_added,
  modified: m.requests_sort_modified,
};
const formatLabels: Record<MediaType, () => string> = {
  audiobook: m.settings_chaptarr_audiobooks,
  ebook: m.settings_chaptarr_ebooks,
};

const firstKey = (keys: Set<Key> | "all") => (keys === "all" ? undefined : [...keys][0]);

/**
 * Requests as a card grid with status, format and sort controls (Seerr-like).
 * `params` comes from the URL; `onChange` writes it back.
 */
export function RequestList({
  params,
  onChange,
  toolbar,
}: {
  params: RequestListParams;
  onChange: (next: Partial<RequestListParams>) => void;
  /** Extra controls before the filters (e.g. Mine / Everyone's). */
  toolbar?: React.ReactNode;
}) {
  const { data: requests } = useSuspenseQuery(requestsQuery(params));
  const sort = params.sort ?? "status";
  const order = params.order ?? "desc";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        {toolbar}
        <ToggleGroup
          aria-label={m.requests_filter_label()}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[params.filter]}
          onSelectionChange={(keys) => {
            const filter = REQUEST_FILTERS.find((f) => f === firstKey(keys));
            if (filter) onChange({ filter });
          }}
          variant="outline"
          className="flex-wrap"
        >
          {REQUEST_FILTERS.map((filter) => (
            <ToggleGroupItem key={filter} id={filter}>
              {filterLabels[filter]()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-44">
          <SelectField
            label={m.requests_format_label()}
            options={[
              { id: "all", label: m.requests_format_all() },
              ...MEDIA_TYPES.map((format) => ({ id: format, label: formatLabels[format]() })),
            ]}
            value={params.format ?? "all"}
            onChange={(value) => onChange({ format: MEDIA_TYPES.find((f) => f === value) })}
          />
        </div>
        <div className="w-52">
          <SelectField
            label={m.requests_sort_label()}
            options={REQUEST_SORTS.map((s) => ({ id: s, label: sortLabels[s]() }))}
            value={sort}
            onChange={(value) => onChange({ sort: REQUEST_SORTS.find((s) => s === value) })}
          />
        </div>
        {sort === "status" ? null : (
          <Button
            variant="outline"
            size="icon"
            aria-label={order === "desc" ? m.requests_order_desc() : m.requests_order_asc()}
            onPress={() => onChange({ order: order === "desc" ? "asc" : "desc" })}
          >
            {order === "desc" ? <ArrowDownWideNarrowIcon /> : <ArrowUpNarrowWideIcon />}
          </Button>
        )}
      </div>
      {requests.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>{m.requests_empty_title()}</EmptyTitle>
            <EmptyDescription>{m.requests_empty_description()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))}
        </ul>
      )}
    </div>
  );
}
