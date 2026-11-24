import { useId } from "react";

import { cn } from "#/lib/utils";

/** A Seerr-like settings block: a heading, a short explanation, then its rows. */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-1">
          <h2 id={headingId} className="text-xl font-semibold">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Label column + control column, shared with the `layout="row"` form fields. */
export const SETTINGS_ROW = "grid gap-2 md:grid-cols-[16rem_minmax(0,32rem)] md:gap-x-8";
/** Puts content under the control column of a settings row. */
export const SETTINGS_ROW_OFFSET = "md:ps-[18rem]";

/** One labelled setting whose control isn't a plain form field (switch, read-only value…). */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={SETTINGS_ROW}>
      <div className="flex flex-col gap-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </label>
        ) : (
          <span className="text-sm font-medium">{label}</span>
        )}
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  );
}

/** Save / Test buttons under a settings form, aligned with the controls. */
export function SettingsActions({ children }: { children: React.ReactNode }) {
  return <div className={cn("flex flex-wrap gap-2", SETTINGS_ROW_OFFSET)}>{children}</div>;
}
