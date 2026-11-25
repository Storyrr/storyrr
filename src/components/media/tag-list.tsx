import { Link } from "@tanstack/react-router";
import { TagIcon } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import type { MediaTag } from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import { m } from "#/paraglide/messages.js";

/** Genres and keywords as chips, like Seerr's keywords, each opening its titles. */
export function TagList({ type, tags }: { type: SearchableType; tags: readonly MediaTag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label={m.media_tags()} className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Link to="/tags/$type/$id" params={{ type, id: tag.id }}>
            <Badge variant="outline" className="h-7 gap-1.5 px-3 text-sm hover:bg-muted">
              <TagIcon aria-hidden />
              {tag.name}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
