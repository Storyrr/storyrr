import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GaugeIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { RequestLimitFields } from "#/components/settings/request-limit-fields";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { setUserLimits } from "#/functions/users.functions";
import { userKeys } from "#/lib/queries/users";
import { DEFAULT_REQUEST_LIMITS, type RequestLimits } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

/** Per-user request limits, overriding the global ones from Settings → Users. */
export function RequestLimitsDialog({
  userId,
  name,
  current,
  global,
}: {
  userId: string;
  name: string;
  current: RequestLimits | null;
  global: RequestLimits;
}) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(current !== null);
  const [limits, setLimits] = useState<RequestLimits>(current ?? global ?? DEFAULT_REQUEST_LIMITS);
  const queryClient = useQueryClient();
  const saveFn = useServerFn(setUserLimits);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { userId, requestLimits: override ? limits : null } }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline">
        <GaugeIcon data-icon="inline-start" />
        {m.users_limits()}
      </Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.users_limits_title({ name })}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <FormError message={save.error ? save.error.message || m.error_generic() : null} />
          <Switch isSelected={override} onChange={setOverride}>
            <span className="text-sm">{m.users_limits_override()}</span>
          </Switch>
          {override ? (
            <>
              <RequestLimitFields
                label={m.settings_limit_audiobook()}
                value={limits.audiobook}
                onChange={(audiobook) => setLimits({ ...limits, audiobook })}
              />
              <RequestLimitFields
                label={m.settings_limit_ebook()}
                value={limits.ebook}
                onChange={(ebook) => setLimits({ ...limits, ebook })}
              />
            </>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <DialogClose>{m.action_cancel()}</DialogClose>
          <Button isDisabled={save.isPending} onPress={() => save.mutate()}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.action_save()}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}
