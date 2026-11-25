import type { Key } from "react-aria-components";

import { SETTINGS_ROW, SETTINGS_ROW_OFFSET } from "#/components/settings/settings-section";
import { cn } from "#/lib/utils";

import { Field, FieldDescription, FieldError } from "#/components/ui/field";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";

export type SelectOption = { id: string; label: string };

type SelectFieldProps = {
  label: string;
  description?: string;
  options: readonly SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur?: () => void;
  errors?: ReadonlyArray<{ message?: string } | undefined>;
  placeholder?: string;
  disabled?: boolean;
  /** "row": label left, select right (settings pages). */
  layout?: "stacked" | "row";
};

/** A labelled single-choice select bound to a form field. */
export function SelectField({
  label,
  description,
  options,
  value,
  onChange,
  onBlur,
  errors = [],
  placeholder,
  disabled,
  layout = "stacked",
}: SelectFieldProps) {
  const row = layout === "row";
  const invalid = errors.length > 0;
  return (
    <Field data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
      <Select
        value={value}
        onChange={(key: Key | null) => onChange(key === null ? null : String(key))}
        onBlur={onBlur}
        isDisabled={disabled}
        isInvalid={invalid}
        placeholder={placeholder}
        className={row ? cn(SETTINGS_ROW, "md:items-center") : "flex flex-col gap-2"}
      >
        {/* Same line height as FieldLabel, so a select lines up with the text fields beside it. */}
        <Label className="leading-snug">{label}</Label>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} id={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? (
        <FieldDescription className={row ? SETTINGS_ROW_OFFSET : undefined}>
          {description}
        </FieldDescription>
      ) : null}
      <FieldError errors={[...errors]} className={row ? SETTINGS_ROW_OFFSET : undefined} />
    </Field>
  );
}
