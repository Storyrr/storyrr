import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import type { SearchableType } from "#/lib/media-types";
import { chaptarrOptionsQuery, podcastLibrariesQuery } from "#/lib/queries/settings";
import { chaptarrOptionsErrorMessage, serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/** An admin's choice of target; empty strings mean "use the defaults". */
export type TargetChoice = {
  rootFolderPath: string;
  qualityProfileId: string;
  libraryId: string;
  folderId: string;
};

export const EMPTY_TARGET: TargetChoice = {
  rootFolderPath: "",
  qualityProfileId: "",
  libraryId: "",
  folderId: "",
};

/** The fields a server function takes from a choice (unset ones left out). */
export function targetOverride(choice: TargetChoice) {
  return {
    rootFolderPath: choice.rootFolderPath || undefined,
    qualityProfileId: choice.qualityProfileId ? Number(choice.qualityProfileId) : undefined,
    libraryId: choice.libraryId || undefined,
    folderId: choice.folderId || undefined,
  };
}

type Props = {
  format: SearchableType;
  value: TargetChoice;
  onChange: (value: TargetChoice) => void;
};

/**
 * Admins only, collapsed by default (Seerr-like "Advanced options"): the
 * Chaptarr root folder and quality profile, or for podcasts the
 * Audiobookshelf library and folder. Options load when it's opened.
 */
export function TargetOptions(props: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Collapsible isExpanded={expanded} onExpandedChange={setExpanded}>
      <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium">
        <ChevronDownIcon className={expanded ? "rotate-180" : undefined} />
        {m.request_advanced_options()}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <FieldGroup className="pt-4">
          {expanded ? (
            props.format === "podcast" ? (
              <PodcastFields {...props} />
            ) : (
              <ChaptarrFields {...props} />
            )
          ) : null}
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ChaptarrFields({ format, value, onChange }: Props) {
  const options = useQuery(chaptarrOptionsQuery(format === "ebook" ? "ebook" : "audiobook"));
  if (options.isPending) return <Spinner />;
  if (options.isError) return <FormError message={options.error.message || m.error_generic()} />;
  if (!options.data.ok) return <FormError message={chaptarrOptionsErrorMessage(options.data)} />;
  return (
    <>
      <SelectField
        label={m.field_root_folder()}
        description={m.request_default_hint()}
        options={options.data.rootFolders.map((f) => ({
          id: f.path,
          label: `${f.name} (${f.path})`,
        }))}
        value={value.rootFolderPath || null}
        onChange={(rootFolderPath) => onChange({ ...value, rootFolderPath: rootFolderPath ?? "" })}
      />
      <SelectField
        label={m.field_quality_profile()}
        description={m.request_default_hint()}
        options={options.data.qualityProfiles.map((p) => ({ id: String(p.id), label: p.name }))}
        value={value.qualityProfileId || null}
        onChange={(qualityProfileId) =>
          onChange({ ...value, qualityProfileId: qualityProfileId ?? "" })
        }
      />
    </>
  );
}

function PodcastFields({ value, onChange }: Props) {
  const options = useQuery(podcastLibrariesQuery());
  if (options.isPending) return <Spinner />;
  if (options.isError) return <FormError message={options.error.message || m.error_generic()} />;
  if (!options.data.ok) {
    return (
      <FormError
        message={
          options.data.reason === "not_configured"
            ? m.request_error_not_configured({ service: m.service_audiobookshelf() })
            : serviceErrorMessage("audiobookshelf", options.data.error)
        }
      />
    );
  }
  const library = options.data.libraries.find((l) => l.id === value.libraryId);
  return (
    <>
      <SelectField
        label={m.field_library()}
        description={m.request_default_hint()}
        options={options.data.libraries.map((l) => ({ id: l.id, label: l.name }))}
        value={value.libraryId || null}
        onChange={(libraryId) => {
          const folders = options.data.ok
            ? options.data.libraries.find((l) => l.id === libraryId)?.folders
            : [];
          // A library with one folder needs no second choice.
          onChange({
            ...value,
            libraryId: libraryId ?? "",
            folderId: folders?.length === 1 ? (folders[0]?.id ?? "") : "",
          });
        }}
      />
      {library && library.folders.length > 1 ? (
        <SelectField
          label={m.field_folder()}
          options={library.folders.map((f) => ({ id: f.id, label: f.path }))}
          value={value.folderId || null}
          onChange={(folderId) => onChange({ ...value, folderId: folderId ?? "" })}
        />
      ) : null}
    </>
  );
}
