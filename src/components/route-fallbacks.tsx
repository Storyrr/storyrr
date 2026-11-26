import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { Button, LinkButton } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { m } from "#/paraglide/messages.js";

/** Shown for an address no route matches, in place of the router's bare "Not Found". */
export function NotFoundPage() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.page_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.page_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <LinkButton href="/">{m.action_back_home()}</LinkButton>
      </EmptyContent>
    </Empty>
  );
}

/**
 * Shown when a page fails to load (e.g. a link to an issue that was deleted).
 * Server functions answer with translated messages, so the error's own text is shown.
 */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.page_error_title()}</EmptyTitle>
        <EmptyDescription>
          {(error instanceof Error && error.message) || m.error_generic()}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button
          variant="outline"
          onPress={() => {
            reset();
            void router.invalidate();
          }}
        >
          {m.action_retry()}
        </Button>
        <LinkButton href="/">{m.action_back_home()}</LinkButton>
      </EmptyContent>
    </Empty>
  );
}
