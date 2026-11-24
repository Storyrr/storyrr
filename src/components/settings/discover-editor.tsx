import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { saveDiscoverLayout } from "#/functions/media.functions";
import { NewSearchRowSchema, type DiscoverRow } from "#/lib/discover";
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
    default:
      return row.title || row.query || "";
  }
}

/** Settings → General → Discover: which rows show, in which order, and custom search rows. */
export function DiscoverEditor() {
  const { data } = useSuspenseQuery(discoverLayoutQuery());
  const [rows, setRows] = useState<DiscoverRow[]>(data);
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveDiscoverLayout);
  const save = useMutation({
    mutationFn: (next: DiscoverRow[] | null) => saveFn({ data: { rows: next } }),
    onSuccess: async (_, next) => {
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
    defaultValues: { type: "ebook" as SearchableType, title: "", query: "" },
    validators: { onSubmit: NewSearchRowSchema },
    onSubmit: ({ value, formApi }) => {
      setRows([...rows, { id: crypto.randomUUID(), kind: "search", enabled: true, ...value }]);
      formApi.reset();
    },
  });

  return (
    <SettingsSection
      title={m.discover_editor_title()}
      description={m.discover_editor_description()}
    >
      <FormError message={save.error ? save.error.message || m.error_generic() : null} />
      {save.isSuccess ? <FormSuccess message={m.action_saved()} /> : null}
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
              {row.kind === "search" && row.type ? (
                <span className="truncate text-xs text-muted-foreground">
                  {m.discover_row_search({
                    format: typeLabels[row.type](),
                    query: row.query ?? "",
                  })}
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
            {row.kind === "search" ? (
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
        <h3 className="text-sm font-medium">{m.discover_add_row()}</h3>
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
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
          <form.Field name="title">
            {(field) => (
              <TextField
                label={m.discover_row_title()}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="query">
            {(field) => (
              <TextField
                label={m.discover_row_query()}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </FieldGroup>
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
