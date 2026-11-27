import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowDownWideNarrowIcon,
  ArrowUpIcon,
  FilterIcon,
  InboxIcon,
  LibraryIcon,
} from "lucide-react";
import type { Key } from "react-aria-components";

import { RequestRow } from "#/components/requests/request-row";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
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
  removed: m.requests_filter_removed,
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

/**
 * Requests one per line, with status, format and sort controls (Seerr-like).
 * `params` comes from the URL; `onChange` writes it back.
 */
export function RequestList({
  params,
  onChange,
  toolbar,
}: {
  params: RequestListParams;
  onChange: (next: Partial<RequestListParams>) => void;
  /** Extra controls before the menus (e.g. Mine / Everyone's). */
  toolbar?: React.ReactNode;
}) {
  const { data: requests } = useSuspenseQuery(requestsQuery(params));
  const sort = params.sort ?? "status";
  const order = params.order ?? "desc";

  return (
    <div className="flex flex-col gap-6">
      {/* One line of controls, like Seerr: whose requests on the left, then format, status and sort. */}
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <IconSelect
            label={m.requests_format_label()}
            icon={<LibraryIcon />}
            options={[
              { id: "all", label: m.requests_format_all() },
              ...MEDIA_TYPES.map((format) => ({ id: format, label: formatLabels[format]() })),
            ]}
            value={params.format ?? "all"}
            onChange={(value) => onChange({ format: MEDIA_TYPES.find((f) => f === value) })}
          />
          <IconSelect
            label={m.requests_filter_label()}
            icon={<FilterIcon />}
            options={REQUEST_FILTERS.map((f) => ({ id: f, label: filterLabels[f]() }))}
            value={params.filter}
            onChange={(value) => {
              const filter = REQUEST_FILTERS.find((f) => f === value);
              if (filter) onChange({ filter });
            }}
          />
          <IconSelect
            label={m.requests_sort_label()}
            icon={<ArrowDownWideNarrowIcon />}
            options={REQUEST_SORTS.map((s) => ({ id: s, label: sortLabels[s]() }))}
            value={sort}
            onChange={(value) => onChange({ sort: REQUEST_SORTS.find((s) => s === value) })}
          />
          {sort === "status" ? null : (
            <Button
              variant="outline"
              size="icon"
              aria-label={order === "desc" ? m.requests_order_desc() : m.requests_order_asc()}
              onPress={() => onChange({ order: order === "desc" ? "asc" : "desc" })}
            >
              {order === "desc" ? <ArrowDownIcon /> : <ArrowUpIcon />}
            </Button>
          )}
        </div>
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
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** A compact select whose label is its icon (the label is still read to screen readers). */
function IconSelect({
  label,
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(key: Key | null) => {
        if (key !== null) onChange(String(key));
      }}
    >
      <SelectTrigger className="min-w-44">
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} id={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
