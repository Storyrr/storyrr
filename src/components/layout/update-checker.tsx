import { useQuery } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { m } from "#/paraglide/messages.js";

const HealthSchema = v.object({ version: v.string() });

/**
 * Seerr's status checker: when the server runs another version than the one
 * this page was loaded with (Storyrr was updated), offers to reload.
 */
export function UpdateChecker({ version }: { version: string }) {
  const [dismissed, setDismissed] = useState(false);
  const health = useQuery({
    queryKey: ["health", "version"],
    queryFn: async () => {
      const response = await fetch("/api/health", { cache: "no-store" });
      return v.parse(HealthSchema, await response.json());
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const updated = health.data !== undefined && health.data.version !== version;
  return (
    <Dialog
      isOpen={updated && !dismissed}
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{m.update_title()}</DialogTitle>
        <DialogDescription>
          {m.update_description({ version: health.data?.version ?? "" })}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onPress={() => setDismissed(true)}>
          {m.update_later()}
        </Button>
        <Button onPress={() => window.location.reload()}>
          <RefreshCwIcon data-icon="inline-start" />
          {m.update_reload()}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
