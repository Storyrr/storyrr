import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
import type { MediaSummary } from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import type { MediaAvailability } from "#/lib/request-status";
import { m } from "#/paraglide/messages.js";

type Annotated = MediaSummary & { availability: MediaAvailability; accepted: boolean | null };

/** A series or an author page: header (photo, name, text, actions) and the works as cards. */
export function CollectionPage({
  type,
  kicker,
  name,
  description,
  imageUrl,
  items,
  acceptedLanguages,
  actions,
  showVolumes = false,
}: {
  type: SearchableType;
  kicker: string;
  name: string;
  description?: string;
  imageUrl?: string;
  items: Annotated[];
  acceptedLanguages: readonly string[] | null;
  actions?: React.ReactNode;
  /** Series pages: each work's volume number under its card. */
  showVolumes?: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="size-32 shrink-0 rounded-full border object-cover shadow-md"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {kicker}
          </span>
          <h1 className="text-3xl font-semibold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {m.collection_count({ count: items.length })}
          </p>
          {description ? (
            <p className="line-clamp-6 max-w-3xl text-sm whitespace-pre-line text-muted-foreground">
              {description}
            </p>
          ) : null}
          {actions ? <div className="flex flex-wrap gap-2 pt-2">{actions}</div> : null}
        </div>
      </header>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{m.collection_empty()}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => (
            <li key={item.externalId} className="flex flex-col gap-1">
              <MediaCard type={type} item={item} acceptedLanguages={acceptedLanguages} />
              {showVolumes && item.series[0]?.position ? (
                <span className="text-center text-xs text-muted-foreground">
                  {m.collection_volume({ position: item.series[0].position })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CollectionError({ message }: { message: string }) {
  return <FormError message={message} />;
}
