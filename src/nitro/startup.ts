import { definePlugin } from "nitro";

/**
 * Nitro loads the app on the first request, so without this a broken data
 * folder or migration would leave a server that listens and answers 500
 * forever, and background jobs would wait for a first visitor. In production,
 * warm the app up through its health route right after startup, and stop with a
 * clear message if the database can't be opened: Docker then restarts or
 * reports the container instead of keeping a dead one.
 */
export default definePlugin((nitroApp) => {
  if (process.env.NODE_ENV !== "production") return;
  setImmediate(() => {
    void Promise.resolve(nitroApp.fetch(new Request("http://localhost/api/health")))
      .then((response) => response.ok)
      .catch(() => false)
      .then((ok) => {
        if (ok) return;
        // The cause (a SQLite or file system error) is logged just above.
        console.error(
          "Storyrr can't start: its database isn't usable. Check that the data folder exists " +
            "and is writable by the user Storyrr runs as (uid 1000 in the Docker image).",
        );
        process.exit(1);
      });
  });
});
