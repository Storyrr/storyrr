import { useQuery } from "@tanstack/react-query";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useId, useState } from "react";

import { FormError } from "#/components/form/form-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Field } from "#/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "#/components/ui/input-group";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { chaptarrWebhookQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

export function WebhookCard() {
  const webhook = useQuery(chaptarrWebhookQuery());
  const [copied, setCopied] = useState(false);
  const inputId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{m.settings_webhook_title()}</h2>
        </CardTitle>
        <CardDescription>{m.settings_webhook_description()}</CardDescription>
      </CardHeader>
      <CardContent>
        {webhook.isPending ? <Skeleton className="h-8 w-full" /> : null}
        {webhook.isError ? (
          <FormError message={webhook.error.message || m.error_generic()} />
        ) : null}
        {webhook.data ? (
          <Field>
            <Label htmlFor={inputId}>{m.settings_webhook_url()}</Label>
            <InputGroup>
              <InputGroupInput id={inputId} readOnly value={webhook.data.url} />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={copied ? m.action_copied() : m.action_copy()}
                  onPress={() => {
                    void navigator.clipboard
                      .writeText(webhook.data.url)
                      .then(() => setCopied(true));
                  }}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        ) : null}
      </CardContent>
    </Card>
  );
}
