import { useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrowIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Key } from "react-aria-components";

import { SwitchField } from "#/components/form/switch-field";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Slider } from "#/components/ui/slider";
import { useDebouncedValue } from "#/hooks/use-debounced-value";
import {
  AUDIOBOOK_SORTS,
  BOOK_SORTS,
  EXPLORE_LANGUAGES,
  PAGES_RANGE,
  YEAR_RANGE,
  sortLabels,
  type AudiobookFilters,
  type AudiobookSort,
  type BookFilters,
  type BookSort,
} from "#/lib/explore";
import { formatNumber } from "#/lib/format";
import { languageName } from "#/lib/languages";
import { genreOptionsQuery } from "#/lib/queries/media";
import { m } from "#/paraglide/messages.js";

/** The Books / Audiobooks sort and filters, shared by those pages and Discover's filtered rows. */
export type Explore =
  | { type: "audiobook"; filters: AudiobookFilters; onChange: (f: AudiobookFilters) => void }
  | { type: "ebook"; filters: BookFilters; onChange: (f: BookFilters) => void };

/** The sort menu; `label` shows a visible label above it (Settings), else it's only for screen readers. */
export function SortSelect({ label, ...explore }: Explore & { label?: boolean }) {
  const sorts: readonly (AudiobookSort | BookSort)[] =
    explore.type === "audiobook" ? AUDIOBOOK_SORTS : BOOK_SORTS;
  const value = explore.filters.sort ?? sorts[0];
  return (
    <Select
      aria-label={label ? undefined : m.explore_sort()}
      value={value}
      onChange={(key) => {
        if (explore.type === "audiobook") {
          const sort = AUDIOBOOK_SORTS.find((s) => s === key);
          if (sort) explore.onChange({ ...explore.filters, sort });
        } else {
          const sort = BOOK_SORTS.find((s) => s === key);
          if (sort) explore.onChange({ ...explore.filters, sort });
        }
      }}
      className={label ? "flex flex-col gap-2" : undefined}
    >
      {label ? <Label className="leading-snug">{m.explore_sort()}</Label> : null}
      <SelectTrigger className="min-w-56">
        <ArrowDownWideNarrowIcon />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sorts.map((sort) => (
          <SelectItem key={sort} id={sort}>
            {sortLabels[sort]()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The Filters panel's fields: the catalog's filters, then Storyrr's own switches. */
export function ExploreFilterFields(explore: Explore) {
  return (
    <>
      {explore.type === "audiobook" ? (
        <AudiobookFilterFields filters={explore.filters} onChange={explore.onChange} />
      ) : (
        <BookFilterFields filters={explore.filters} onChange={explore.onChange} />
      )}
      <FieldGroup>
        <SwitchField
          label={m.browse_hide_owned()}
          isSelected={explore.filters.hideOwned ?? false}
          onChange={(value) =>
            explore.type === "audiobook"
              ? explore.onChange({ ...explore.filters, hideOwned: value || undefined })
              : explore.onChange({ ...explore.filters, hideOwned: value || undefined })
          }
        />
        <SwitchField
          label={m.browse_accepted_only()}
          isSelected={explore.filters.acceptedOnly ?? false}
          onChange={(value) =>
            explore.type === "audiobook"
              ? explore.onChange({ ...explore.filters, acceptedOnly: value || undefined })
              : explore.onChange({ ...explore.filters, acceptedOnly: value || undefined })
          }
        />
      </FieldGroup>
    </>
  );
}

/** A labelled block of the Filters panel. */
function FilterBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-heading font-medium">{label}</span>
      {children}
    </div>
  );
}

/** A text filter applied after typing stops (one catalog call, not one per key). */
function TextFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const [input, setInput] = useState(value ?? "");
  // Follow outside changes (Reset, back button), adjusting state while rendering.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (input.trim() !== (value ?? "")) setInput(value ?? "");
  }
  const debounced = useDebouncedValue(input.trim(), 500);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  // Apply what was typed, once typing stops.
  useEffect(() => {
    if (debounced !== (latest.current.value ?? "")) latest.current.onChange(debounced || undefined);
  }, [debounced]);
  return (
    <Field>
      <FieldLabel className="font-heading">{label}</FieldLabel>
      <Input aria-label={label} value={input} onChange={(event) => setInput(event.target.value)} />
    </Field>
  );
}

function AudiobookFilterFields({
  filters,
  onChange,
}: {
  filters: AudiobookFilters;
  onChange: (f: AudiobookFilters) => void;
}) {
  const genres = useQuery(genreOptionsQuery("audiobook"));
  return (
    <>
      <Select
        value={filters.genre ?? null}
        placeholder={m.explore_genre_any()}
        onChange={(key: Key | null) =>
          onChange({ ...filters, genre: key === null || key === "any" ? undefined : String(key) })
        }
        className="flex w-full flex-col gap-2"
      >
        <Label className="font-heading">{m.explore_genre()}</Label>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem id="any">{m.explore_genre_any()}</SelectItem>
          {(genres.data ?? []).map((genre) => (
            <SelectItem key={genre.id} id={genre.id}>
              {genre.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TextFilter
        label={m.explore_author()}
        value={filters.author}
        onChange={(author) => onChange({ ...filters, author })}
      />
      <TextFilter
        label={m.explore_narrator()}
        value={filters.narrator}
        onChange={(narrator) => onChange({ ...filters, narrator })}
      />
      <TextFilter
        label={m.explore_publisher()}
        value={filters.publisher}
        onChange={(publisher) => onChange({ ...filters, publisher })}
      />
    </>
  );
}

/** A range slider whose ends mean "no limit" (stored as undefined). */
function RangeFilter({
  label,
  bounds,
  value,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  bounds: readonly [number, number];
  value: [number | undefined, number | undefined];
  step?: number;
  format: (low: number, high: number) => string;
  onChange: (value: [number | undefined, number | undefined]) => void;
}) {
  const low = value[0] ?? bounds[0];
  const high = value[1] ?? bounds[1];
  const [draft, setDraft] = useState<[number, number]>([low, high]);
  // Follow outside changes (Reset, back button), adjusting state while rendering.
  const [shown, setShown] = useState(`${low}-${high}`);
  if (shown !== `${low}-${high}`) {
    setShown(`${low}-${high}`);
    setDraft([low, high]);
  }
  return (
    <FilterBlock label={label}>
      <Slider
        aria-label={label}
        minValue={bounds[0]}
        maxValue={bounds[1]}
        step={step}
        value={draft}
        onChange={(next) => setDraft([next[0] ?? bounds[0], next[1] ?? bounds[1]])}
        onChangeEnd={(next) => {
          const from = next[0] ?? bounds[0];
          const to = next[1] ?? bounds[1];
          onChange([from > bounds[0] ? from : undefined, to < bounds[1] ? to : undefined]);
        }}
      />
      <p className="text-center text-xs text-muted-foreground">{format(draft[0], draft[1])}</p>
    </FilterBlock>
  );
}

function BookFilterFields({
  filters,
  onChange,
}: {
  filters: BookFilters;
  onChange: (f: BookFilters) => void;
}) {
  const genres = useQuery(genreOptionsQuery("ebook"));
  const [rating, setRating] = useState(filters.ratingMin ?? 0);
  const [shownRating, setShownRating] = useState(filters.ratingMin);
  if (shownRating !== filters.ratingMin) {
    setShownRating(filters.ratingMin);
    setRating(filters.ratingMin ?? 0);
  }
  return (
    <>
      <Select
        selectionMode="multiple"
        value={filters.genres ?? []}
        placeholder={m.explore_genres_placeholder()}
        onChange={(keys: Key[]) =>
          onChange({ ...filters, genres: keys.length > 0 ? keys.map(String) : undefined })
        }
        className="flex w-full flex-col gap-2"
      >
        <Label className="font-heading">{m.explore_genres()}</Label>
        <SelectTrigger className="w-full">
          <SelectValue className="truncate" />
        </SelectTrigger>
        <SelectContent>
          {(genres.data ?? []).map((genre) => (
            <SelectItem key={genre.id} id={genre.id}>
              {genre.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.language ?? "any"}
        onChange={(key: Key | null) => {
          const language = EXPLORE_LANGUAGES.find((code) => code === key);
          onChange({ ...filters, language });
        }}
        className="flex w-full flex-col gap-2"
      >
        <Label className="font-heading">{m.explore_language()}</Label>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem id="any">{m.explore_language_any()}</SelectItem>
          {EXPLORE_LANGUAGES.map((code) => (
            <SelectItem key={code} id={code}>
              {languageName(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <RangeFilter
        label={m.explore_release_year()}
        bounds={YEAR_RANGE}
        value={[filters.yearFrom, filters.yearTo]}
        format={(low, high) => m.explore_year_range({ from: String(low), to: String(high) })}
        onChange={([yearFrom, yearTo]) => onChange({ ...filters, yearFrom, yearTo })}
      />
      <RangeFilter
        label={m.explore_pages()}
        bounds={PAGES_RANGE}
        step={50}
        value={[filters.pagesMin, filters.pagesMax]}
        format={(low, high) =>
          m.explore_pages_range({ from: formatNumber(low), to: formatNumber(high) })
        }
        onChange={([pagesMin, pagesMax]) => onChange({ ...filters, pagesMin, pagesMax })}
      />
      <FilterBlock label={m.explore_rating()}>
        <Slider
          aria-label={m.explore_rating()}
          minValue={0}
          maxValue={5}
          step={0.5}
          value={rating}
          onChange={setRating}
          onChangeEnd={(value) =>
            onChange({ ...filters, ratingMin: value > 0 ? value : undefined })
          }
        />
        <p className="text-center text-xs text-muted-foreground">
          {rating > 0
            ? m.explore_rating_min({ rating: formatNumber(rating) })
            : m.explore_rating_any()}
        </p>
      </FilterBlock>
    </>
  );
}
