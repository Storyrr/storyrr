import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";

import { SETTINGS_ROW } from "#/components/settings/settings-section";
import { Field, FieldDescription, FieldError, FieldLabel } from "#/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "#/components/ui/input-group";
import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

/**
 * Seerr-like secret input: masked, with a button to show what's typed. A saved
 * secret is never sent back to the browser, so `saved` only shows a masked
 * placeholder; leaving the field blank keeps it.
 */
export function SecretField({
  label,
  description,
  saved,
  value,
  onChange,
  onBlur,
  errors,
  name,
  layout = "stacked",
}: {
  label: string;
  description?: string;
  saved: boolean;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  errors: ReadonlyArray<{ message?: string } | undefined>;
  name: string;
  layout?: "stacked" | "row";
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const [visible, setVisible] = useState(false);
  const invalid = errors.length > 0;
  const row = layout === "row";
  return (
    <Field
      data-invalid={invalid || undefined}
      className={row ? cn(SETTINGS_ROW, "md:items-center") : undefined}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={saved ? "••••••••••••••••••••••••" : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={description ? descriptionId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={visible ? m.secret_hide() : m.secret_show()}
            onPress={() => setVisible(!visible)}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description ? (
        <FieldDescription id={descriptionId} className={row ? "md:col-start-2" : undefined}>
          {description}
        </FieldDescription>
      ) : null}
      <FieldError errors={[...errors]} className={row ? "md:col-start-2" : undefined} />
    </Field>
  );
}
