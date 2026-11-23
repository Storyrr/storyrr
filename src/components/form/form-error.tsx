import { CircleAlertIcon } from "lucide-react";

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
