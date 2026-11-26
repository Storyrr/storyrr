import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { DownloadProgress } from "#/components/requests/download-progress";
import { formatPercent } from "#/lib/format";
import type { SearchableType } from "#/lib/media-types";
import { mediaKeys } from "#/lib/queries/media";
import { titleDownloadQuery } from "#/lib/queries/requests";
import { m } from "#/paraglide/messages.js";

/**
 * On a title's page, while its request is with Chaptarr: the download's
 * progress, followed live. When the request moves on (available, failed), the
 * page's own data is refreshed so its status follows.
 */
export function TitleDownload({ type, id }: { type: SearchableType; id: string }) {
  const { data } = useQuery(titleDownloadQuery(type, id));
  const queryClient = useQueryClient();
  const status = data?.status;
  useEffect(() => {
    if (status !== undefined && status !== "submitted")
      void queryClient.invalidateQueries({ queryKey: mediaKeys.detail(type, id) });
  }, [status, queryClient, type, id]);

  const download = data?.download;
  if (!download) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">
        {download.progress === null
          ? m.status_downloading()
          : m.status_downloading_progress({ percent: formatPercent(download.progress) })}
      </p>
      <DownloadProgress download={download} />
    </div>
  );
}
