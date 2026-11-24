import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { m } from "#/paraglide/messages.js";

/**
 * A titled horizontal row of cards (Seerr's Discover rows). Scrolls with the
 * buttons, a trackpad or the keyboard (cards are links, Tab moves along).
 */
export function MediaRow({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const headingId = useId();
  const scroll = (direction: 1 | -1) =>
    listRef.current?.scrollBy({
      left: direction * listRef.current.clientWidth * 0.9,
      behavior: "smooth",
    });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 id={headingId} className="text-xl font-semibold">
            {title}
          </h2>
          {action}
        </div>
        <div className="hidden gap-1 sm:flex">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.row_previous()}
            onPress={() => scroll(-1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.row_next()}
            onPress={() => scroll(1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <ul
        ref={listRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]"
      >
        {children}
      </ul>
    </section>
  );
}

/** One item of a MediaRow, at a fixed card width. */
export function MediaRowItem({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <li className={`shrink-0 snap-start ${wide ? "w-80 sm:w-96" : "w-36 sm:w-44"}`}>{children}</li>
  );
}
