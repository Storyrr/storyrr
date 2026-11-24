import { useEffect, useRef } from "react";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { m } from "#/paraglide/messages.js";

/**
 * Infinite scroll for a `useInfiniteQuery` list: fetches the next page when this
 * marker nears the viewport. The button stays as a fallback (keyboard users,
 * or a page too short to scroll).
 */
export function InfiniteScrollTrigger({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  const marker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = marker.current;
    if (!element || !hasNextPage) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      // Start loading a bit before the end is reached.
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!hasNextPage) return null;
  return (
    <div ref={marker} className="flex justify-center">
      {isFetchingNextPage ? (
        <Spinner aria-label={m.browse_loading_more()} />
      ) : (
        <Button variant="outline" onPress={() => void fetchNextPage()}>
          {m.browse_load_more()}
        </Button>
      )}
    </div>
  );
}
