import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { RequestStatusBadge } from "#/components/requests/request-status-badge";
import type { SearchableType } from "#/lib/media-types";
import { mediaKeys } from "#/lib/queries/media";
import { titleDownloadQuery } from "#/lib/queries/requests";

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
  return <RequestStatusBadge status="submitted" download={download} />;
}
