import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { signInAgainUrl, UNAUTHORIZED } from "#/lib/auth-errors";

/** TanStack Query's own default. */
const DEFAULT_RETRIES = 3;

/**
 * A call refused for lack of a session (it ended, or the user signed out or in
 * elsewhere in another tab): the page still shows what it had, so go and sign
 * in again instead of leaving "Unauthorized" in the middle of it.
 */
function signInAgain(error: Error) {
  if (typeof window === "undefined" || error.message !== UNAUTHORIZED) return;
  const url = signInAgainUrl(window.location);
  if (url) window.location.assign(url);
}

export function getContext() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: signInAgain }),
    defaultOptions: {
      queries: {
        // Asking again without a session gives the same answer: don't wait three tries.
        retry: (failures, error) => error.message !== UNAUTHORIZED && failures < DEFAULT_RETRIES,
      },
    },
    mutationCache: new MutationCache({ onError: signInAgain }),
  });

  return {
    queryClient,
  };
}
export default function TanstackQueryProvider() {}
