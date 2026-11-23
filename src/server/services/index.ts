import "@tanstack/react-start/server-only";

import { settings } from "#/server/settings";

import { createServices } from "./factory";

export { createServices, type Services } from "./factory";

/** The app's service clients, using the global fetch. */
export const services = createServices(settings, (input, init) => fetch(input, init));
