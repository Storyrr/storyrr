import { useQuery } from "@tanstack/react-query";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useId, useState } from "react";

import { FormError } from "#/components/form/form-error";
import { SettingsRow } from "#/components/settings/settings-section";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "#/components/ui/input-group";
import { Skeleton } from "#/components/ui/skeleton";
import { chaptarrWebhookQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

/** The URL to paste into Chaptarr so requests turn available on import. */
export function WebhookRow() {
  const webhook = useQuery(chaptarrWebhookQuery());
  const [copied, setCopied] = useState(false);
  const inputId = useId();

  return (
    <SettingsRow
      label={m.settings_webhook_url()}
      description={m.settings_webhook_description()}
      htmlFor={inputId}
    >
      {webhook.isPending ? <Skeleton className="h-8 w-full" /> : null}
      {webhook.isError ? <FormError message={webhook.error.message || m.error_generic()} /> : null}
      {webhook.data ? (
        <InputGroup>
          <InputGroupInput id={inputId} readOnly value={webhook.data.url} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={copied ? m.action_copied() : m.action_copy()}
              onPress={() => {
                void navigator.clipboard.writeText(webhook.data.url).then(() => setCopied(true));
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ) : null}
    </SettingsRow>
  );
}
