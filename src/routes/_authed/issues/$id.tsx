import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId } from "react";

import { FormError } from "#/components/form/form-error";
import { IssueStatusBadge, issueTypeLabels } from "#/components/issues/issue-labels";
import { Cover } from "#/components/media/cover";
import { Button } from "#/components/ui/button";
import { Field, FieldError } from "#/components/ui/field";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { commentIssue, updateIssueStatus } from "#/functions/issues.functions";
import { formatDate, formatList } from "#/lib/format";
import { issueKeys, issueQuery } from "#/lib/queries/issues";
import { CommentFormSchema } from "#/lib/schemas/issues";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/issues/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(issueQuery(params.id)),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData ? loaderData.media.title : m.issues_title()} · ${m.app_name()}` },
    ],
  }),
  component: IssuePage,
});

function IssuePage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data: issue } = useSuspenseQuery(issueQuery(id));
  const queryClient = useQueryClient();
  const statusFn = useServerFn(updateIssueStatus);
  const setStatus = useMutation({
    mutationFn: (status: "open" | "resolved") => statusFn({ data: { id, status } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: issueKeys.all }),
  });

  return (
    <article className="flex max-w-3xl flex-col gap-6">
      <header className="flex gap-4">
        <Cover src={issue.media.coverUrl} type={issue.media.type} className="w-20 shrink-0" />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{issueTypeLabels[issue.type]()}</h1>
            <IssueStatusBadge status={issue.status} />
          </div>
          <Link
            to="/media/$type/$id"
            params={{ type: issue.media.type, id: issue.media.externalId }}
            className="font-medium hover:underline"
          >
            {issue.media.title}
          </Link>
          {issue.media.authors.length > 0 ? (
            <span className="text-sm text-muted-foreground">{formatList(issue.media.authors)}</span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {m.issue_reported_by({
              name: issue.reporter.name,
              date: formatDate(new Date(issue.createdAt)),
            })}
          </span>
        </div>
      </header>

      {user.isAdmin ? (
        <div className="flex gap-2">
          <Button
            variant={issue.status === "open" ? "default" : "outline"}
            size="sm"
            isDisabled={setStatus.isPending}
            onPress={() => setStatus.mutate(issue.status === "open" ? "resolved" : "open")}
          >
            {issue.status === "open" ? m.action_resolve() : m.action_reopen()}
          </Button>
          <FormError
            message={setStatus.error ? setStatus.error.message || m.error_generic() : null}
          />
        </div>
      ) : null}

      <ol className="flex flex-col gap-3">
        {issue.comments.map((comment) => (
          <li key={comment.id} className="rounded-xl border bg-card p-4">
            <p className="mb-1 text-xs text-muted-foreground">
              {comment.userName ?? "—"} ·{" "}
              {formatDate(new Date(comment.createdAt), { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <p className="whitespace-pre-line text-sm">{comment.message}</p>
          </li>
        ))}
      </ol>

      <CommentForm id={id} />
    </article>
  );
}

function CommentForm({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const commentFn = useServerFn(commentIssue);
  const messageId = useId();
  const comment = useMutation({
    mutationFn: (message: string) => commentFn({ data: { id, message } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: issueKeys.all }),
  });
  const form = useForm({
    defaultValues: { message: "" },
    validators: { onSubmit: CommentFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await comment
        .mutateAsync(value.message)
        .then(() => formApi.reset())
        .catch(() => undefined);
    },
  });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-3"
    >
      <FormError message={comment.error ? comment.error.message || m.error_generic() : null} />
      <form.Field name="message">
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <Label htmlFor={messageId}>{m.issue_comment_add()}</Label>
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
      <div className="flex justify-end">
        <Button type="submit" isDisabled={comment.isPending}>
          {m.action_send()}
        </Button>
      </div>
    </form>
  );
}
