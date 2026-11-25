import { StarIcon } from "lucide-react";

import type { MediaRating } from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import { formatNumber } from "#/lib/format";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

/** Where the ratings come from: Audible's listeners, Hardcover's readers. */
const SOURCE: Record<SearchableType, string> = { audiobook: "Audible", ebook: "Hardcover" };

/** "★ 4.3 (10,807 ratings on Hardcover)": the readers' average out of 5. */
export function Rating({ rating, type }: { rating: MediaRating; type: SearchableType }) {
  const value = new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rating.value);
  return (
    <p className="flex items-center gap-1.5 text-sm">
      <StarIcon className="size-4 fill-brand text-brand" aria-hidden />
      <span className="font-medium">{m.media_rating_value({ value })}</span>
      <span className="text-muted-foreground">
        {m.media_rating_count({ count: formatNumber(rating.count), source: SOURCE[type] })}
      </span>
    </p>
  );
}
