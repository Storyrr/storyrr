import { useId } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";

type TextFieldProps = {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Validation issues for this field (TanStack Form `field.state.meta.errors`). */
  errors: ReadonlyArray<{ message?: string } | undefined>;
  type?: "text" | "email" | "password";
  name: string;
  autoComplete?: string;
  disabled?: boolean;
};

/** A labelled text input bound to a TanStack Form field. */
export function TextField({
  label,
  description,
  value,
  onChange,
  onBlur,
  errors,
  type = "text",
  name,
  autoComplete,
  disabled,
}: TextFieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const invalid = errors.length > 0;
  return (
    <Field data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={description ? descriptionId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      <FieldError errors={[...errors]} />
    </Field>
  );
}
