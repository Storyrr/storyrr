import { ExternalLinkIcon } from "lucide-react";

import { LinkButton } from "#/components/ui/button";
import { formatList } from "#/lib/format";
import { languageName } from "#/lib/languages";
import { m } from "#/paraglide/messages.js";

/**
 * Shown instead of Request when Chaptarr's metadata profile would filter the
 * work out. With `addEditionUrl` (the title's page): a link to the provider's
 * form to add an edition in an accepted language, when someone knows one exists.
 */
export function LanguageNotice({
  acceptedLanguages,
  addEditionUrl,
}: {
  acceptedLanguages: readonly string[];
  addEditionUrl?: string;
}) {
  const languages = formatList(acceptedLanguages.map(languageName));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {m.media_language_not_accepted({ languages })}
      </p>
      {addEditionUrl ? (
        <>
          <LinkButton
            variant="outline"
            size="sm"
            href={addEditionUrl}
            target="_blank"
            rel="noreferrer"
            // The notice above names the languages; the full label is for screen readers.
            aria-label={m.media_add_edition({ languages })}
          >
            {m.media_add_edition_short()}
            <ExternalLinkIcon data-icon="inline-end" />
          </LinkButton>
          <p className="text-xs text-muted-foreground">{m.media_add_edition_hint()}</p>
        </>
      ) : null}
    </div>
  );
}
