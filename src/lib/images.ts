import { useRouteContext } from "@tanstack/react-router";

/** A cover URL, through Storyrr's image cache when it's on (Settings → Network). */
export function useImageUrl(): (src: string | null | undefined) => string | undefined {
  const { authState } = useRouteContext({ from: "__root__" });
  return (src) => {
    if (!src) return undefined;
    return authState.imageCache ? `/api/images?url=${encodeURIComponent(src)}` : src;
  };
}
