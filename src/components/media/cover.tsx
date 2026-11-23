import { BookAudioIcon, BookOpenIcon } from "lucide-react";

import { cn } from "#/lib/utils";

/** Square cover art, with a placeholder when the provider has none. */
export function Cover({
  src,
  type = "audiobook",
  className,
}: {
  src?: string | null;
  type?: "audiobook" | "ebook" | "podcast";
  className?: string;
}) {
  return (
    // Audiobook covers are square, book covers portrait.
    <div
      className={cn(
        type === "ebook" ? "aspect-[2/3]" : "aspect-square",
        "overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          {type === "ebook" ? <BookOpenIcon /> : <BookAudioIcon />}
        </div>
      )}
    </div>
  );
}
