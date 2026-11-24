import { useRouteContext } from "@tanstack/react-router";

import { LanguageNotice } from "#/components/media/language-notice";
import { MediaPoster } from "#/components/media/media-poster";
import { RequestDialog } from "#/components/media/request-dialog";
import type { MediaSummary } from "#/lib/media";
import { can } from "#/lib/permissions";
import type { SearchableType } from "#/lib/media-types";
import type { MediaAvailability } from "#/lib/request-status";

/** A search or Discover result: poster card with Request when it can be requested. */
export function MediaCard({
  type,
  item,
  acceptedLanguages,
}: {
  type: SearchableType;
  item: MediaSummary & { availability: MediaAvailability; accepted: boolean | null };
  /** Languages Chaptarr accepts for this type (null: any). */
  acceptedLanguages: readonly string[] | null;
}) {
  const { user } = useRouteContext({ from: "/_authed" });
  const refused = item.availability === "none" && item.accepted === false;
  let action: React.ReactNode;
  if (refused && acceptedLanguages)
    action = <LanguageNotice acceptedLanguages={acceptedLanguages} />;
  else if (item.availability === "none" && !refused && can(user, `request_${type}`))
    action = <RequestDialog item={{ ...item, type }} size="sm" className="w-full" />;
  return (
    <MediaPoster
      type={type}
      item={item}
      availability={item.availability}
      refused={refused}
      action={action}
    />
  );
}
