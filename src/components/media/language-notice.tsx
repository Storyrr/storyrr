import { formatList } from "#/lib/format";
import { languageName } from "#/lib/languages";
import { m } from "#/paraglide/messages.js";

/** Shown instead of Request when Chaptarr's metadata profile would filter the work out. */
export function LanguageNotice({ acceptedLanguages }: { acceptedLanguages: readonly string[] }) {
  return (
    <p className="text-xs text-muted-foreground">
      {m.media_language_not_accepted({
        languages: formatList(acceptedLanguages.map(languageName)),
      })}
    </p>
  );
}
