import { BookAudioIcon } from "lucide-react";

import { cn } from "#/lib/utils";

/** Square cover art, with a placeholder when the provider has none. */
export function Cover({ src, className }: { src?: string | null; className?: string }) {
  return (
    <div className={cn("aspect-square overflow-hidden rounded-lg bg-muted", className)}>
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <BookAudioIcon />
        </div>
      )}
    </div>
  );
}
