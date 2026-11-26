import { useEffect } from "react";

import { TIME_ZONE_COOKIE } from "#/lib/time-zone";

/** Tells the server the browser's time zone (a cookie), for the dates it renders. */
export function RememberTimeZone() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}
