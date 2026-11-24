import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FormError } from "#/components/form/form-error";
import { FieldGroup } from "#/components/ui/field";
import { Switch } from "#/components/ui/switch";
import { getMediaServerSignIn, saveMediaServerSignIn } from "#/functions/settings.functions";
import type { MediaServer } from "#/lib/media-server-login";
import { authKeys } from "#/lib/queries/auth";
import { m } from "#/paraglide/messages.js";

import { SettingsRow, SettingsSection } from "./settings-section";

const queryKey = ["settings", "media-server-sign-in"] as const;

/** Sign in with this server's accounts, and whether unknown accounts get a Storyrr account. */
export function MediaServerSignInSection({ server, name }: { server: MediaServer; name: string }) {
  const getFn = useServerFn(getMediaServerSignIn);
  const saveFn = useServerFn(saveMediaServerSignIn);
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey, queryFn: () => getFn() });
  const save = useMutation({
    mutationFn: (value: { enabled: boolean; allowNew: boolean }) =>
      saveFn({ data: { server, value } }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: authKeys.all }),
      ]),
  });
  const current = config.data?.[server];
  if (!current) return null;
  return (
    <SettingsSection
      title={m.media_sign_in_title()}
      description={m.media_sign_in_description({ server: name })}
    >
      <FieldGroup>
        <FormError message={save.error ? save.error.message || m.error_generic() : null} />
        <SettingsRow label={m.media_sign_in_enable({ server: name })}>
          <Switch
            aria-label={m.media_sign_in_enable({ server: name })}
            isSelected={current.enabled}
            isDisabled={save.isPending}
            onChange={(enabled) => save.mutate({ ...current, enabled })}
          />
        </SettingsRow>
        <SettingsRow
          label={m.media_sign_in_allow_new()}
          description={m.media_sign_in_allow_new_description({ server: name })}
        >
          <Switch
            aria-label={m.media_sign_in_allow_new()}
            isSelected={current.allowNew}
            isDisabled={save.isPending || !current.enabled}
            onChange={(allowNew) => save.mutate({ ...current, allowNew })}
          />
        </SettingsRow>
      </FieldGroup>
    </SettingsSection>
  );
}
