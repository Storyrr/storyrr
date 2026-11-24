import { SelectField } from "#/components/form/select-field";
import type { RequestLimit } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

const LIMITS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 100] as const;
const PERIODS = [1, 7, 14, 30] as const;

/** "Unlimited" or "N requests" every "D days", like Seerr's request limit pickers. */
export function RequestLimitFields({
  label,
  value,
  onChange,
  layout = "stacked",
}: {
  label: string;
  value: RequestLimit;
  onChange: (value: RequestLimit) => void;
  layout?: "stacked" | "row";
}) {
  const days = PERIODS.some((d) => d === value.days) ? PERIODS : [...PERIODS, value.days];
  const limits =
    value.limit === null || LIMITS.some((l) => l === value.limit)
      ? LIMITS
      : [...LIMITS, value.limit];
  return (
    <>
      <SelectField
        label={label}
        layout={layout}
        options={[
          { id: "unlimited", label: m.settings_limit_unlimited() },
          ...limits.map((limit) => ({
            id: String(limit),
            label: m.settings_limit_requests({ count: limit }),
          })),
        ]}
        value={value.limit === null ? "unlimited" : String(value.limit)}
        onChange={(id) =>
          onChange({ ...value, limit: id === null || id === "unlimited" ? null : Number(id) })
        }
      />
      {value.limit === null ? null : (
        <SelectField
          label={m.settings_limit_period()}
          layout={layout}
          options={days.map((d) => ({ id: String(d), label: m.settings_limit_days({ count: d }) }))}
          value={String(value.days)}
          onChange={(id) => onChange({ ...value, days: id === null ? value.days : Number(id) })}
        />
      )}
    </>
  );
}
