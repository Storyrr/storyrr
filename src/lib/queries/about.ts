import { queryOptions } from "@tanstack/react-query";

import { getAbout } from "#/functions/settings.functions";

export const aboutQuery = () =>
  queryOptions({ queryKey: ["settings", "about"] as const, queryFn: () => getAbout() });
