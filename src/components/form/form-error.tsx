import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import { Alert, AlertDescription } from "#/components/ui/alert";

/** Form-level error (e.g. rejected by the server), announced to screen readers. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Form-level success notice, announced politely (`<output>` is a status region). */
export function FormSuccess({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <output className="block">
      {/* The status region announces it; the alert role would interrupt. */}
      <Alert role={undefined}>
        <CircleCheckIcon />
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </output>
  );
}
