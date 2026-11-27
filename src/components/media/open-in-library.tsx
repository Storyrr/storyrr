import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";

import { LinkButton } from "#/components/ui/button";
import type { SearchableType } from "#/lib/media-types";
import { titleLinksQuery } from "#/lib/queries/media";
import { serviceNames } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/**
 * On an available title's page: a button to its page in each media server
 * that holds it (read in Kavita, listen in Audiobookshelf…). Loaded after the
 * page, since finding the item may ask Chaptarr.
 */
export function OpenInLibrary({ type, id }: { type: SearchableType; id: string }) {
  const { data } = useQuery(titleLinksQuery(type, id));
  if (!data || data.links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {data.links.map((link) => (
        <LinkButton
          key={link.service}
          variant="outline"
          href={link.url}
          target="_blank"
          rel="noreferrer"
        >
          {m.action_open_in({ server: serviceNames[link.service]() })}
          <ExternalLinkIcon data-icon="inline-end" />
        </LinkButton>
      ))}
    </div>
  );
}
