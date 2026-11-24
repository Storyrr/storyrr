/**
 * Normalized title for matching library items without a shared ID (Kavita):
 * lowercase, no accents, punctuation collapsed. "Le Petit Prince!" → "le petit prince".
 */
export function titleKey(title: string): string {
  return (
    title
      // Drop accents on Latin letters only: other scripts use combining marks for distinct letters (ピ ≠ ヒ).
      .normalize("NFD")
      .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
      .normalize("NFC")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
}

/**
 * Normalized RSS feed URL for matching podcasts: scheme, host case, a leading
 * "www." and a trailing slash don't matter. Unparsable values are trimmed only.
 */
export function feedKey(feedUrl: string): string {
  const trimmed = feedUrl.trim();
  try {
    const url = new URL(trimmed);
    const host = url.host.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}${url.search}`;
  } catch {
    return trimmed;
  }
}
