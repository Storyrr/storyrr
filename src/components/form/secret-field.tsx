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
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

/** What a password field shows for a key: the disc glyph browsers mask with. */
const SAVED_MASK = "\u25CF".repeat(40);

/**
 * Seerr-like secret input: masked, with a button to show it. When a secret is
 * saved, the field shows a masked placeholder and the button fetches the saved
 * value (`onReveal`) into the field; leaving the field blank keeps it.
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
  onReveal,
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
  /** Fetches the saved secret (admins). */
  onReveal?: () => Promise<string | null>;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const [visible, setVisible] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const toggle = async () => {
    if (visible) return setVisible(false);
    // Nothing typed yet: show the saved one.
    if (!value && saved && onReveal) {
      setRevealing(true);
      setRevealError(null);
      try {
        const secret = await onReveal();
        if (secret) onChange(secret);
      } catch (error) {
        setRevealError(error instanceof Error && error.message ? error.message : m.error_generic());
        return;
      } finally {
        setRevealing(false);
      }
    }
    setVisible(true);
  };
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
          // Looks like the masked key itself (not fetched until the eye is pressed).
          placeholder={saved && !visible ? SAVED_MASK : undefined}
          className={saved ? "placeholder:text-foreground" : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={description ? descriptionId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={visible ? m.secret_hide() : m.secret_show()}
            isDisabled={revealing}
            onPress={() => void toggle()}
          >
            {revealing ? <Spinner /> : visible ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description ? (
        <FieldDescription id={descriptionId} className={row ? "md:col-start-2" : undefined}>
          {description}
        </FieldDescription>
      ) : null}
      <FieldError
        errors={revealError ? [...errors, { message: revealError }] : [...errors]}
        className={row ? "md:col-start-2" : undefined}
      />
    </Field>
  );
}
