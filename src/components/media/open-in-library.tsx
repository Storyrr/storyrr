import { useQuery } from "@tanstack/react-query";
import { BookOpenIcon, ChevronDownIcon, HeadphonesIcon } from "lucide-react";

import { Button, LinkButton } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { SearchableType } from "#/lib/media-types";
import { titleLinksQuery } from "#/lib/queries/media";
import { serviceNames } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/**
 * On an available title's page: a button to its page in the media server that
 * holds it (read in Kavita, listen in Audiobookshelf…), and a menu for the
 * other servers that hold it too. Loaded after the page, since finding the
 * item may ask Chaptarr.
 */
export function OpenInLibrary({ type, id }: { type: SearchableType; id: string }) {
  const { data } = useQuery(titleLinksQuery(type, id));
  const [first, ...others] = data?.links ?? [];
  if (!first) return null;
  const label = type === "audiobook" ? m.action_listen_in : m.action_read_in;
  const Icon = type === "audiobook" ? HeadphonesIcon : BookOpenIcon;
  return (
    <div className="flex">
      <LinkButton
        href={first.url}
        target="_blank"
        rel="noreferrer"
        className={others.length > 0 ? "rounded-r-none" : undefined}
      >
        <Icon data-icon="inline-start" />
        {label({ server: serviceNames[first.service]() })}
      </LinkButton>
      {others.length > 0 ? (
        <DropdownMenuTrigger>
          <Button
            size="icon"
            aria-label={m.action_other_servers()}
            className="rounded-l-none border-l border-l-primary-foreground/20"
          >
            <ChevronDownIcon />
          </Button>
          <DropdownMenu placement="bottom end" className="min-w-max">
            <DropdownMenuGroup>
              {others.map((link) => {
                const text = label({ server: serviceNames[link.service]() });
                return (
                  <DropdownMenuItem
                    key={link.service}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    textValue={text}
                  >
                    <Icon />
                    {text}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenu>
        </DropdownMenuTrigger>
      ) : null}
    </div>
  );
}
