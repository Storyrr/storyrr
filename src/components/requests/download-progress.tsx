import { Progress } from "#/components/ui/progress";
import { m } from "#/paraglide/messages.js";

/** Chaptarr's download of a sent request: a bar, filling as it goes (moving when the size is unknown). */
export function DownloadProgress({
  download,
  className,
}: {
  download: { progress: number | null };
  className?: string;
}) {
  return (
    <Progress
      aria-label={m.status_downloading()}
      value={download.progress === null ? undefined : Math.round(download.progress * 100)}
      isIndeterminate={download.progress === null}
      className={className}
    />
  );
}
