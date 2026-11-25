import { Link } from "@tanstack/react-router";
import { BanIcon, CheckIcon, ClockIcon, LanguagesIcon, LoaderIcon } from "lucide-react";

import { Cover } from "#/components/media/cover";
import { formatList, yearOf } from "#/lib/format";
import type { SearchableType } from "#/lib/media-types";
import type { MediaAvailability } from "#/lib/request-status";
import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

const typeLabels: Record<SearchableType, () => string> = {
  audiobook: m.media_type_audiobook,
  ebook: m.media_type_ebook,
};

const statusLabels: Record<Exclude<MediaAvailability, "none">, () => string> = {
  available: m.availability_available,
  requested: m.availability_requested,
  processing: m.availability_processing,
  blocked: m.availability_blocked,
};

/** Seerr-like corner icon for a title's status (or a language Chaptarr would refuse). */
function StatusIcon({
  availability,
  refused,
}: {
  availability: MediaAvailability;
  refused: boolean;
}) {
  let icon: React.ReactNode = null;
  let label: string | null = null;
  let tone = "bg-secondary text-secondary-foreground";
  if (availability === "available") {
    icon = <CheckIcon />;
    tone = "bg-primary text-primary-foreground";
  } else if (availability === "requested") icon = <ClockIcon />;
  else if (availability === "processing") icon = <LoaderIcon />;
  else if (availability === "blocked") {
    icon = <BanIcon />;
    tone = "bg-destructive text-white";
  } else if (refused) {
    icon = <LanguagesIcon />;
    label = m.media_language_refused_short();
  }
  if (!icon) return null;
  label ??= availability === "none" ? null : statusLabels[availability]();
  return (
    <span
      title={label ?? undefined}
      className={cn(
        "flex size-6 items-center justify-center rounded-full shadow-md [&_svg]:size-3.5",
        tone,
      )}
    >
      {icon}
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export type PosterItem = {
  externalId: string;
  title: string;
  authors: readonly string[];
  narrators?: readonly string[];
  releaseDate?: string;
  coverUrl?: string | null;
};

/**
 * Seerr-like poster card: the cover with its type and status, the details on
 * hover or keyboard focus, and an optional action (Request) at the bottom. The
 * whole card links to the title's page.
 */
export function MediaPoster({
  type,
  item,
  availability,
  refused = false,
  action,
  series,
}: {
  type: SearchableType;
  item: PosterItem;
  /** A series card: links to the series page, with its book count in place of the year. */
  series?: { booksCount: number };
  availability: MediaAvailability;
  /** Chaptarr's language profile would filter it out. */
  refused?: boolean;
  /** Shown at the bottom of the hover panel (e.g. the Request button). */
  action?: React.ReactNode;
}) {
  const year = yearOf(item.releaseDate);
  return (
    <article className="group relative overflow-hidden rounded-xl border bg-card shadow-sm ring-primary/70 transition duration-200 focus-within:ring-2 hover:scale-[1.03] hover:ring-2">
      <Cover src={item.coverUrl} type={type} className="rounded-none" />
      <Link
        to={series ? "/series/$type/$id" : "/media/$type/$id"}
        params={{ type, id: item.externalId }}
        className="absolute inset-0 outline-none"
      >
        <span className="sr-only">{item.title}</span>
      </Link>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-background via-background/85 to-background/20 p-3 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
        {series ? (
          <span className="text-xs font-medium">
            {m.collection_count({ count: series.booksCount })}
          </span>
        ) : year ? (
          <span className="text-xs font-medium">{year}</span>
        ) : null}
        <h3 className="line-clamp-3 leading-tight font-semibold">{item.title}</h3>
        {item.authors.length > 0 ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">{formatList(item.authors)}</p>
        ) : null}
        {item.narrators && item.narrators.length > 0 ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {m.media_narrated_by({ narrators: formatList(item.narrators) })}
          </p>
        ) : null}
        {/* Touch screens have no hover: the panel stays hidden, so its button must not
            catch taps meant for the card (the title's page has Request too). */}
        {action ? (
          <div className="pointer-events-auto relative hidden pt-2 [@media(hover:hover)]:block">
            {action}
          </div>
        ) : null}
      </div>
      {/* After the panel, so they stay on top of it like Seerr's. */}
      <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-background/80 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase backdrop-blur">
        {series ? m.collection_series() : typeLabels[type]()}
      </span>
      <span className="pointer-events-none absolute top-2 right-2">
        <StatusIcon availability={availability} refused={refused} />
      </span>
    </article>
  );
}
