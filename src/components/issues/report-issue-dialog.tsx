import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { TriangleAlertIcon } from "lucide-react";
import { useId, useState } from "react";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldError, FieldGroup } from "#/components/ui/field";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { reportIssue } from "#/functions/issues.functions";
import { ISSUE_TYPES, type IssueType } from "#/lib/issues";
import type { SearchableType } from "#/lib/media-types";
import { issueKeys } from "#/lib/queries/issues";
import { IssueFormSchema } from "#/lib/schemas/issues";
import { m } from "#/paraglide/messages.js";

import { issueTypeLabels } from "./issue-labels";

const isIssueType = (value: string | null): value is IssueType =>
  ISSUE_TYPES.some((t) => t === value);

/** "Report an issue" on an available title; opens the new issue's page afterwards. */
export function ReportIssueDialog({
  type,
  externalId,
  title,
}: {
  type: SearchableType;
  externalId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reportFn = useServerFn(reportIssue);
  const messageId = useId();
  const report = useMutation({
    mutationFn: (data: { type: IssueType; message: string }) =>
      reportFn({ data: { media: { type, id: externalId }, ...data } }),
    onSuccess: async ({ id }) => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: issueKeys.all });
      await navigate({ to: "/issues/$id", params: { id } });
    },
  });
  const form = useForm({
    defaultValues: { type: "other" as IssueType, message: "" },
    validators: { onSubmit: IssueFormSchema },
    onSubmit: async ({ value }) => {
      await report.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm">
        <TriangleAlertIcon data-icon="inline-start" />
        {m.issue_report()}
      </Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{m.issue_report_title({ title })}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <FormError message={report.error ? report.error.message || m.error_generic() : null} />
            <form.Field name="type">
              {(field) => (
                <SelectField
                  label={m.field_issue_type()}
                  options={ISSUE_TYPES.map((t) => ({ id: t, label: issueTypeLabels[t]() }))}
                  value={field.state.value}
                  onChange={(value) => {
                    if (isIssueType(value)) field.handleChange(value);
                  }}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
            <form.Field name="message">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
                  <Label htmlFor={messageId}>{m.field_issue_message()}</Label>
                  <Textarea
                    id={messageId}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose>{m.action_cancel()}</DialogClose>
            <Button type="submit" isDisabled={report.isPending}>
              {m.issue_report()}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
}
