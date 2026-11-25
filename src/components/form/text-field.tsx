import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";

import { SETTINGS_ROW } from "#/components/settings/settings-section";
import { cn } from "#/lib/utils";

import { Field, FieldDescription, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "#/components/ui/input-group";
import { m } from "#/paraglide/messages.js";

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
  placeholder?: string;
  /** "row": label left, input right (settings pages). */
  layout?: "stacked" | "row";
};

/** A labelled text input bound to a TanStack Form field; a password one has an eye to show it. */
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
  placeholder,
  layout = "stacked",
}: TextFieldProps) {
  const row = layout === "row";
  const id = useId();
  const descriptionId = `${id}-description`;
  const invalid = errors.length > 0;
  const [visible, setVisible] = useState(false);
  const inputProps = {
    id,
    name,
    autoComplete,
    value,
    disabled,
    placeholder,
    "aria-invalid": invalid || undefined,
    "aria-describedby": description ? descriptionId : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    onBlur,
  };
  return (
    <Field
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={row ? cn(SETTINGS_ROW, "md:items-center") : undefined}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {type === "password" ? (
        <InputGroup>
          <InputGroupInput {...inputProps} type={visible ? "text" : "password"} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={visible ? m.password_hide() : m.password_show()}
              isDisabled={disabled}
              onPress={() => setVisible(!visible)}
            >
              {visible ? <EyeOffIcon /> : <EyeIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input {...inputProps} type={type} />
      )}
      {description ? (
        <FieldDescription id={descriptionId} className={row ? "md:col-start-2" : undefined}>
          {description}
        </FieldDescription>
      ) : null}
      <FieldError errors={[...errors]} className={row ? "md:col-start-2" : undefined} />
    </Field>
  );
}
