import "@tanstack/react-start/server-only";

import packageJson from "../../package.json" with { type: "json" };

/** App version, bumped by release-please in package.json. */
export const APP_VERSION: string = packageJson.version;
