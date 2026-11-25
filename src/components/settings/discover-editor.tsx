import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { FormError } from "#/components/form/form-error";
import { ExploreFilterFields, SortSelect, type Explore } from "#/components/media/explore-filters";
import { SelectField } from "#/components/form/select-field";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { saveDiscoverLayout } from "#/functions/media.functions";
import {
  NewFilteredRowSchema,
  RowTitleSchema,
  type DiscoverRow,
  type FilteredDiscoverRow,
} from "#/lib/discover";
import {
  AUDIOBOOK_SORTS,
  BOOK_SORTS,
  audiobookFilterCount,
  bookFilterCount,
  sortLabels,
  type AudiobookFilters,
  type BookFilters,
} from "#/lib/explore";
import { SEARCHABLE_TYPES, type SearchableType } from "#/lib/media-types";
import { discoverLayoutQuery } from "#/lib/queries/media";
import { m } from "#/paraglide/messages.js";

import { SettingsActions, SettingsSection } from "./settings-section";

const typeLabels: Record<SearchableType, () => string> = {
  audiobook: m.settings_chaptarr_audiobooks,
  ebook: m.settings_chaptarr_ebooks,
};

function rowLabel(row: DiscoverRow): string {
  switch (row.kind) {
    case "recently_added":
      return m.discover_recently_added();
    case "recent_requests":
      return m.discover_recent_requests();
    case "trending":
      return row.type === "ebook" ? m.discover_trending_books() : m.discover_trending_audiobooks();
    case "genres":
      return row.type === "ebook" ? m.discover_genres_books() : m.discover_genres_audiobooks();
    case "upcoming":
      return m.discover_upcoming_books();
    case "filtered":
      return row.title;
    default:
      return "";
  }
}

/** "eBooks · Most read · Filters (2)", under a filtered row's title. */
function filteredSummary(row: FilteredDiscoverRow): string {
  const sort =
    row.type === "audiobook"
      ? (row.filters.sort ?? AUDIOBOOK_SORTS[0])
      : (row.filters.sort ?? BOOK_SORTS[0]);
  const count =
    row.type === "audiobook" ? audiobookFilterCount(row.filters) : bookFilterCount(row.filters);
  return m.discover_row_filtered({
    format: typeLabels[row.type](),
    sort: sortLabels[sort](),
    filters: m.explore_filters_active({ count }),
  });
}

const NO_AUDIOBOOK_FILTERS: AudiobookFilters = {};
const NO_BOOK_FILTERS: BookFilters = {};

/** Settings → General → Discover: which rows show, in which order, and filtered rows. */
export function DiscoverEditor() {
  const { data } = useSuspenseQuery(discoverLayoutQuery());
  const [rows, setRows] = useState<DiscoverRow[]>(data);
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveDiscoverLayout);
  const save = useMutation({
    mutationFn: (next: DiscoverRow[] | null) => saveFn({ data: { rows: next } }),
    onSuccess: async (_, next) => {
      toast.success(m.action_saved());
      await queryClient.invalidateQueries({ queryKey: discoverLayoutQuery().queryKey });
      if (next === null) setRows((await queryClient.fetchQuery(discoverLayoutQuery())) ?? []);
    },
  });
  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    if (row) next.splice(index + by, 0, row);
    setRows(next);
  };
  const form = useForm({
    defaultValues: {
      type: "ebook" as SearchableType,
      title: "",
      // One set per format, so switching the format back keeps what was chosen.
      audiobookFilters: NO_AUDIOBOOK_FILTERS,
      bookFilters: NO_BOOK_FILTERS,
    },
    onSubmit: ({ value, formApi }) => {
      const parsed = v.safeParse(NewFilteredRowSchema, {
        type: value.type,
        title: value.title,
        filters: value.type === "audiobook" ? value.audiobookFilters : value.bookFilters,
      });
      if (!parsed.success) return;
      setRows([
        ...rows,
        { id: crypto.randomUUID(), kind: "filtered", enabled: true, ...parsed.output },
      ]);
      formApi.reset();
    },
  });

  return (
    <SettingsSection
      title={m.discover_editor_title()}
      description={m.discover_editor_description()}
    >
      <FormError message={save.error ? save.error.message || m.error_generic() : null} />
      <ol className="flex max-w-2xl flex-col divide-y rounded-xl border bg-card">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2">
            <Switch
              aria-label={rowLabel(row)}
              isSelected={row.enabled}
              onChange={(enabled) =>
                setRows(rows.map((r) => (r.id === row.id ? { ...r, enabled } : r)))
              }
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{rowLabel(row)}</span>
              {row.kind === "filtered" ? (
                <span className="truncate text-xs text-muted-foreground">
                  {filteredSummary(row)}
                </span>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.discover_row_up()}
              isDisabled={index === 0}
              onPress={() => move(index, -1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.discover_row_down()}
              isDisabled={index === rows.length - 1}
              onPress={() => move(index, 1)}
            >
              <ArrowDownIcon />
            </Button>
            {row.kind === "filtered" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.action_delete()}
                onPress={() => setRows(rows.filter((r) => r.id !== row.id))}
              >
                <Trash2Icon />
              </Button>
            ) : (
              <span className="size-8" aria-hidden />
            )}
          </li>
        ))}
      </ol>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex max-w-2xl flex-col gap-4 rounded-xl border border-dashed p-4"
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{m.discover_add_row()}</h3>
          <p className="text-sm text-muted-foreground">{m.discover_add_row_description()}</p>
        </div>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <form.Field name="type">
            {(field) => (
              <SelectField
                label={m.requests_format_label()}
                options={SEARCHABLE_TYPES.map((t) => ({ id: t, label: typeLabels[t]() }))}
                value={field.state.value}
                onChange={(value) => {
                  const type = SEARCHABLE_TYPES.find((t) => t === value);
                  if (type) field.handleChange(type);
                }}
              />
            )}
          </form.Field>
          <form.Field name="title" validators={{ onSubmit: RowTitleSchema }}>
            {(field) => (
              <TextField
                label={m.discover_row_title()}
                placeholder={m.discover_row_title_placeholder()}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </FieldGroup>
        <form.Subscribe selector={(state) => state.values.type}>
          {(type) =>
            type === "audiobook" ? (
              <form.Field name="audiobookFilters">
                {(field) => (
                  <RowFilters
                    type="audiobook"
                    filters={field.state.value}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
            ) : (
              <form.Field name="bookFilters">
                {(field) => (
                  <RowFilters
                    type="ebook"
                    filters={field.state.value}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
            )
          }
        </form.Subscribe>
        <Button type="submit" variant="outline" className="self-start">
          <PlusIcon data-icon="inline-start" />
          {m.discover_add_row()}
        </Button>
      </form>
      <SettingsActions>
        <Button variant="ghost" isDisabled={save.isPending} onPress={() => save.mutate(null)}>
          <RotateCcwIcon data-icon="inline-start" />
          {m.discover_reset()}
        </Button>
        <Button isDisabled={save.isPending} onPress={() => save.mutate(rows)}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {m.action_save()}
        </Button>
      </SettingsActions>
    </SettingsSection>
  );
}

/** The Books / Audiobooks sort and filters, as on those pages. */
function RowFilters(explore: Explore) {
  return (
    <div className="flex max-w-md flex-col gap-6">
      <SortSelect {...explore} label />
      <ExploreFilterFields {...explore} />
    </div>
  );
}
