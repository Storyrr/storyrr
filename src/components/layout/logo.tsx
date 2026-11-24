import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

/** The Storyrr wordmark: cream lettering on dark themes, ink lettering on light ones. */
export function Logo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/logo-light.svg"
        alt={m.app_name()}
        width={449}
        height={101}
        className={cn("h-8 w-auto dark:hidden", className)}
      />
      <img
        src="/logo-dark.svg"
        alt={m.app_name()}
        width={449}
        height={101}
        className={cn("hidden h-8 w-auto dark:block", className)}
      />
    </>
  );
}
