import { Link } from "@tanstack/react-router";

import { UserAvatar } from "#/components/layout/user-avatar";
import { Cover } from "#/components/media/cover";
import { DownloadProgress } from "#/components/requests/download-progress";
import { RequestStatusBadge } from "#/components/requests/request-status-badge";
import { yearOf } from "#/lib/format";
import type { MediaType, RequestStatus } from "#/lib/requests";
import { useImageUrl } from "#/lib/images";
import { m } from "#/paraglide/messages.js";

export type RequestCardItem = {
  status: RequestStatus;
  waitingForChaptarr: boolean;
  /** Null once the requester's account is deleted. */
  requester: { name: string } | null;
  /** Present while Chaptarr downloads it. */
  download?: { progress: number | null } | null;
  media: {
    type: MediaType;
    externalId: string;
    title: string;
    coverUrl: string | null;
    releaseDate: string | null;
  };
};

/** Seerr-like request card: the cover blurred behind, year, title, requester, status. */
export function RequestCard({ request }: { request: RequestCardItem }) {
  const imageUrl = useImageUrl();
  const year = yearOf(request.media.releaseDate ?? undefined);
  const requesterName = request.requester?.name ?? m.users_deleted();
  return (
    <Link
      to="/media/$type/$id"
      params={{ type: request.media.type, id: request.media.externalId }}
      className="group relative flex h-full gap-3 overflow-hidden rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
    >
      {request.media.coverUrl ? (
        <img
          src={imageUrl(request.media.coverUrl)}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-sm"
        />
      ) : null}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-card via-card/80 to-card/30"
      />
      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        {year ? <span className="text-xs font-medium">{year}</span> : null}
        <span className="line-clamp-2 font-semibold group-hover:underline">
          {request.media.title}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserAvatar name={requesterName} className="size-5 text-[0.6rem]" />
          <span className="truncate">{requesterName}</span>
        </span>
        <span className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          {m.request_card_status()}
          <RequestStatusBadge
            status={request.status}
            waitingForChaptarr={request.waitingForChaptarr}
            download={request.download}
          />
        </span>
        {request.status === "submitted" && request.download ? (
          <DownloadProgress download={request.download} />
        ) : null}
      </div>
      <Cover
        src={request.media.coverUrl}
        type={request.media.type}
        className="relative w-24 shrink-0 self-center shadow-lg"
      />
    </Link>
  );
}
