import { useId } from "react";

import { Field, FieldLabel } from "#/components/ui/field";
import { Switch } from "#/components/ui/switch";

/** A switch with its label beside it (shadcn's pattern: the Switch draws only the track). */
export function SwitchField({
  label,
  isSelected,
  onChange,
  isDisabled,
}: {
  label: string;
  isSelected: boolean;
  onChange: (value: boolean) => void;
  isDisabled?: boolean;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <Switch id={id} isSelected={isSelected} onChange={onChange} isDisabled={isDisabled} />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
    </Field>
  );
}
