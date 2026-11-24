import { useId } from "react";

import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "#/components/ui/field";
import { NOTIFICATION_EVENTS, eventLabels, type NotificationEvent } from "#/lib/notifications";

function EventOption({
  event,
  isSelected,
  onChange,
}: {
  event: NotificationEvent;
  isSelected: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} isSelected={isSelected} onChange={onChange} />
      <FieldLabel htmlFor={id} className="font-normal">
        {eventLabels[event]()}
      </FieldLabel>
    </Field>
  );
}

/** Checkboxes for which events a channel (or a user) gets. */
export function EventChecklist({
  label,
  value,
  onChange,
  events = NOTIFICATION_EVENTS,
}: {
  label: string;
  value: readonly NotificationEvent[];
  onChange: (value: NotificationEvent[]) => void;
  events?: readonly NotificationEvent[];
}) {
  return (
    <FieldSet>
      <FieldLegend className="sr-only">{label}</FieldLegend>
      <div className="grid gap-3 sm:grid-cols-2">
        {events.map((event) => (
          <EventOption
            key={event}
            event={event}
            isSelected={value.includes(event)}
            onChange={(on) => onChange(on ? [...value, event] : value.filter((e) => e !== event))}
          />
        ))}
      </div>
    </FieldSet>
  );
}
