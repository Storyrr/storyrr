/** Addresses Storyrr makes up for media-server accounts without an email (never deliverable). */
export const PLACEHOLDER_EMAIL_DOMAIN = ".storyrr.invalid";

export const isPlaceholderEmail = (email: string) => email.endsWith(PLACEHOLDER_EMAIL_DOMAIN);
