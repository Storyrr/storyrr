import { useState } from "react";

import { useImageUrl } from "#/lib/images";
import { cn } from "#/lib/utils";

/** Square cover art; Storyrr's mark, greyed, when the provider has none or it fails to load (like Seerr). */
export function Cover({
  src,
  type = "audiobook",
  className,
}: {
  src?: string | null;
  type?: "audiobook" | "ebook";
  className?: string;
}) {
  const imageUrl = useImageUrl();
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  return (
    // Audiobook covers are square, book covers portrait.
    <div
      className={cn(
        type === "ebook" ? "aspect-[2/3]" : "aspect-square",
        "overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      {src && showImage ? (
        <img
          src={imageUrl(src)}
          alt=""
          loading="lazy"
          onError={() => setFailed(src)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          {/* The mark as a mask: one flat tone whatever the theme. */}
          <div className="aspect-[108/91] w-2/5 bg-muted-foreground/25 mask-[url(/logo-mark.svg)] mask-contain mask-center mask-no-repeat" />
        </div>
      )}
    </div>
  );
}
