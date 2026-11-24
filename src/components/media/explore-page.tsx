import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrowIcon, FilterIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Key } from "react-aria-components";

import { FormError } from "#/components/form/form-error";
import { SwitchField } from "#/components/form/switch-field";
import { InfiniteScrollTrigger } from "#/components/media/infinite-scroll-trigger";
import { MediaCard } from "#/components/media/media-card";
import { Button } from "#/components/ui/button";
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
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { Slider } from "#/components/ui/slider";
import { useDebouncedValue } from "#/hooks/use-debounced-value";
import {
  AUDIOBOOK_SORTS,
  BOOK_SORTS,
  EXPLORE_LANGUAGES,
  PAGES_RANGE,
  YEAR_RANGE,
  audiobookFilterCount,
  bookFilterCount,
  sortLabels,
  type AudiobookFilters,
  type AudiobookSort,
  type BookFilters,
  type BookSort,
} from "#/lib/explore";
import { formatNumber } from "#/lib/format";
import { languageName } from "#/lib/languages";
import { exploreQuery, genreOptionsQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

type Explore =
  | { type: "audiobook"; filters: AudiobookFilters; onChange: (f: AudiobookFilters) => void }
  | { type: "ebook"; filters: BookFilters; onChange: (f: BookFilters) => void };

/**
 * Seerr's Movies / Series page for books: the catalog as a grid that loads while
 * scrolling, a sort and a Filters panel. Filters live in the URL (shareable).
 */
export function ExplorePage({ title, ...explore }: Explore & { title: string }) {
  const pages = useInfiniteQuery(
    explore.type === "audiobook"
      ? exploreQuery({ type: "audiobook", filters: explore.filters })
      : exploreQuery({ type: "ebook", filters: explore.filters }),
  );
  const { hideOwned = false, acceptedOnly = false } = explore.filters;
  const first = pages.data?.pages[0];
  const seen = new Set<string>();
  const items = (pages.data?.pages ?? [])
    .flatMap((page) => (page.ok ? page.results : []))
    // Pages can overlap when the ranking moves: one card per title.
    .filter((item) => !seen.has(item.externalId) && seen.add(item.externalId))
    .filter((item) => !hideOwned || item.availability === "none")
    .filter((item) => !acceptedOnly || item.accepted !== false);
  const acceptedLanguages = first?.ok ? first.acceptedLanguages : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SortSelect {...explore} />
          <FiltersSheet {...explore} />
        </div>
      </div>
      {pages.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {first && !first.ok ? (
        <FormError
          message={serviceErrorMessage(
            explore.type === "ebook" ? "hardcover" : "audible",
            first.error,
          )}
        />
      ) : null}
      {first?.ok && items.length === 0 && !pages.hasNextPage ? (
        <p className="text-muted-foreground">{m.explore_empty()}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {items.map((item) => (
          <li key={item.externalId}>
            <MediaCard type={explore.type} item={item} acceptedLanguages={acceptedLanguages} />
          </li>
        ))}
      </ul>
      <InfiniteScrollTrigger
        hasNextPage={pages.hasNextPage}
        isFetchingNextPage={pages.isFetchingNextPage}
        fetchNextPage={pages.fetchNextPage}
      />
    </div>
  );
}

function SortSelect(explore: Explore) {
  const sorts: readonly (AudiobookSort | BookSort)[] =
    explore.type === "audiobook" ? AUDIOBOOK_SORTS : BOOK_SORTS;
  const value = explore.filters.sort ?? sorts[0];
  return (
    <Select
      aria-label={m.explore_sort()}
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
    >
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

function FiltersSheet(explore: Explore) {
  const count =
    explore.type === "audiobook"
      ? audiobookFilterCount(explore.filters)
      : bookFilterCount(explore.filters);
  // Reset keeps the sort.
  const reset = () =>
    explore.type === "audiobook"
      ? explore.onChange({ sort: explore.filters.sort })
      : explore.onChange({ sort: explore.filters.sort });
  return (
    <SheetTrigger>
      <Button variant="outline">
        <FilterIcon data-icon="inline-start" />
        {m.explore_filters_active({ count })}
      </Button>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{m.explore_filters()}</SheetTitle>
          <SheetDescription>{m.explore_filters_count({ count })}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4">
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
        </div>
        <SheetFooter>
          <Button variant="outline" isDisabled={count === 0} onPress={reset}>
            {m.explore_reset()}
          </Button>
        </SheetFooter>
      </SheetContent>
    </SheetTrigger>
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
