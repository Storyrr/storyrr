import type { Key } from "react-aria-components";

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
}: SelectFieldProps) {
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
        className="flex flex-col gap-2"
      >
        <Label>{label}</Label>
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
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={[...errors]} />
    </Field>
  );
}
