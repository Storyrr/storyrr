import { cn } from "#/lib/utils";

/**
 * The Storyrr logo: the mark, then "story" in ink (cream on dark themes) and
 * "rr" in the accent. Sized by the font size (`className="text-3xl"`).
 */
export function Logo({ className }: { className?: string }) {
  return (
    // The visible text ("storyrr") names it; the mark is decorative.
    <span
      className={cn(
        "inline-flex items-center gap-[0.3em] font-heading font-bold tracking-tight",
        className,
      )}
    >
      <img src="/logo-mark.svg" alt="" className="h-[1.1em] w-auto dark:hidden" />
      <img src="/logo-mark-dark.svg" alt="" className="hidden h-[1.1em] w-auto dark:block" />
      <span className="leading-none">
        <span className="text-foreground">story</span>
        <span className="text-brand">rr</span>
      </span>
    </span>
  );
}
