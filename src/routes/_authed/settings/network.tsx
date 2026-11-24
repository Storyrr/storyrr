import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2Icon } from "lucide-react";

import { FormError } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import {
  SettingsActions,
  SettingsRow,
  SettingsSection,
} from "#/components/settings/settings-section";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { clearImages, getNetwork, saveNetwork } from "#/functions/settings.functions";
import { authKeys } from "#/lib/queries/auth";
import { NetworkSettingsSchema, type NetworkSettings } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

const networkQuery = { queryKey: ["settings", "network"] as const, queryFn: () => getNetwork() };

export const Route = createFileRoute("/_authed/settings/network")({
  loader: ({ context }) => context.queryClient.ensureQueryData(networkQuery),
  head: () => ({ meta: [{ title: `${m.settings_tab_network()} · ${m.app_name()}` }] }),
  component: NetworkPage,
});

const formatBytes = (bytes: number) =>
  new Intl.NumberFormat(getLocale(), {
    style: "unit",
    unit: bytes >= 1024 * 1024 ? "megabyte" : "kilobyte",
    maximumFractionDigits: 1,
  }).format(bytes / (bytes >= 1024 * 1024 ? 1024 * 1024 : 1024));

function NetworkPage() {
  const { data } = useSuspenseQuery(networkQuery);
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveNetwork);
  const clearFn = useServerFn(clearImages);
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: networkQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: authKeys.all }),
    ]);
  const save = useMutation({
    mutationFn: (value: NetworkSettings) => saveFn({ data: value }),
    onSuccess: invalidate,
  });
  const clear = useMutation({ mutationFn: () => clearFn(), onSuccess: invalidate });
  const form = useForm({
    defaultValues: data.settings,
    validators: { onSubmit: NetworkSettingsSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-12"
    >
      <SettingsSection title={m.network_proxy_title()} description={m.network_proxy_description()}>
        <FieldGroup>
          <FormError message={save.error ? save.error.message || m.error_generic() : null} />
          <form.Field name="proxyUrl">
            {(field) => (
              <TextField
                label={m.network_proxy_url()}
                layout="row"
                description={m.network_proxy_url_description()}
                name={field.name}
                autoComplete="off"
                placeholder="http://proxy:3128"
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="noProxy">
            {(field) => (
              <TextField
                label={m.network_no_proxy()}
                layout="row"
                description={m.network_no_proxy_description()}
                name={field.name}
                autoComplete="off"
                placeholder="chaptarr, audiobookshelf, kavita, .lan"
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </FieldGroup>
      </SettingsSection>
      <SettingsSection
        title={m.network_images_title()}
        description={m.network_images_description()}
      >
        <FieldGroup>
          <form.Field name="imageCache">
            {(field) => (
              <SettingsRow
                label={m.network_image_cache()}
                description={m.network_image_cache_description()}
              >
                <Switch
                  aria-label={m.network_image_cache()}
                  isSelected={field.state.value}
                  onChange={field.handleChange}
                />
              </SettingsRow>
            )}
          </form.Field>
          <SettingsRow
            label={m.network_cache_size()}
            description={m.network_cache_files({ count: data.cache.files })}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm tabular-nums">{formatBytes(data.cache.bytes)}</span>
              <Button
                variant="outline"
                size="sm"
                isDisabled={clear.isPending || data.cache.files === 0}
                onPress={() => clear.mutate()}
              >
                {clear.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Trash2Icon data-icon="inline-start" />
                )}
                {m.network_clear_cache()}
              </Button>
            </div>
          </SettingsRow>
        </FieldGroup>
      </SettingsSection>
      <SettingsActions>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isDisabled={isSubmitting}>
              {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              {save.isSuccess ? m.action_saved() : m.action_save()}
            </Button>
          )}
        </form.Subscribe>
      </SettingsActions>
    </form>
  );
}
