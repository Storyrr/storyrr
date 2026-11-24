import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCwIcon } from "lucide-react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { saveLibrarySelection, syncLibraryNow } from "#/functions/settings.functions";
import { formatDate } from "#/lib/format";
import { librariesQuery, serviceSettingsQuery, settingsKeys } from "#/lib/queries/settings";
import { requestKeys } from "#/lib/queries/requests";
import { mediaKeys } from "#/lib/queries/media";
import type { LibraryService } from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

import { ConnectionForm } from "./connection-form";
import { MediaServerSignInSection } from "./media-server-sign-in";
import { SettingsSection } from "./settings-section";

const copy: Record<
  LibraryService,
  { name: () => string; title: () => string; description: () => string; libraries: () => string }
> = {
  audiobookshelf: {
    name: m.service_audiobookshelf,
    title: m.settings_audiobookshelf_title,
    description: m.service_audiobookshelf_description,
    libraries: m.settings_audiobookshelf_libraries_description,
  },
  kavita: {
    name: m.service_kavita,
    title: m.settings_kavita_title,
    description: m.service_kavita_description,
    libraries: m.settings_kavita_libraries_description,
  },
  komga: {
    name: m.service_komga,
    title: m.settings_komga_title,
    description: m.service_komga_description,
    libraries: m.settings_komga_libraries_description,
  },
};

/** Seerr's Plex tab, for Audiobookshelf or Kavita: the connection, then its libraries. */
export function LibraryServerSettings({ service }: { service: LibraryService }) {
  const { data } = useSuspenseQuery(serviceSettingsQuery());
  const current = data[service];
  return (
    <div className="flex flex-col gap-12">
      <SettingsSection title={copy[service].title()} description={copy[service].description()}>
        <ConnectionForm service={service} current={current} layout="row" />
      </SettingsSection>
      {current ? (
        <Libraries key={current.url} service={service} description={copy[service].libraries()} />
      ) : null}
      {current ? <MediaServerSignInSection server={service} name={copy[service].name()} /> : null}
    </div>
  );
}

function Libraries({ service, description }: { service: LibraryService; description: string }) {
  const queryClient = useQueryClient();
  const libraries = useQuery(librariesQuery(service));
  const saveFn = useServerFn(saveLibrarySelection);
  const syncFn = useServerFn(syncLibraryNow);
  const save = useMutation({
    mutationFn: (excluded: string[]) => saveFn({ data: { service, selection: { excluded } } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.libraries(service) }),
  });
  const sync = useMutation({
    mutationFn: () => syncFn({ data: { service } }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKeys.libraries(service) }),
        queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
        queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      ]),
  });

  const data = libraries.data?.ok ? libraries.data : null;
  const toggle = (id: string, enabled: boolean) => {
    if (!data) return;
    const excluded = data.libraries
      .filter((library) => (library.id === id ? !enabled : !library.enabled))
      .map((library) => library.id);
    save.mutate(excluded);
  };

  let syncFeedback: React.ReactNode = null;
  if (sync.data && !sync.data.ok)
    syncFeedback = <FormError message={serviceErrorMessage(service, sync.data.error)} />;
  else if (sync.data?.ok)
    syncFeedback = (
      <FormSuccess message={m.settings_libraries_synced({ count: sync.data.value.items })} />
    );
  else if (sync.error)
    syncFeedback = <FormError message={sync.error.message || m.error_generic()} />;

  return (
    <SettingsSection title={m.settings_libraries_title()} description={description}>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="outline" isDisabled={sync.isPending} onPress={() => sync.mutate()}>
          {sync.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {m.settings_libraries_sync()}
        </Button>
        {data ? (
          <p className="text-sm text-muted-foreground">
            {data.lastSyncedAt
              ? m.settings_libraries_last_sync({
                  date: formatDate(new Date(data.lastSyncedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })
              : m.settings_libraries_never_synced()}
          </p>
        ) : null}
      </div>
      {syncFeedback}
      <FormError message={save.error ? save.error.message || m.error_generic() : null} />
      {libraries.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {libraries.isError ? (
        <FormError message={libraries.error.message || m.error_generic()} />
      ) : null}
      {libraries.data && !libraries.data.ok ? (
        <FormError
          message={
            libraries.data.reason === "error"
              ? serviceErrorMessage(service, libraries.data.error)
              : m.error_generic()
          }
        />
      ) : null}
      {data?.libraries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.settings_libraries_empty()}</p>
      ) : null}
      {data && data.libraries.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.libraries.map((library) => (
            <li key={library.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{library.name}</span>
                <span className="text-xs text-muted-foreground">
                  {m.settings_libraries_items({ count: library.items })}
                </span>
              </div>
              <Switch
                aria-label={library.name}
                isSelected={library.enabled}
                isDisabled={save.isPending}
                onChange={(enabled) => toggle(library.id, enabled)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}
