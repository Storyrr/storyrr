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
 * The last two parts of a file or folder path, to recognize the same file in two
 * applications that mount it at different places ("/data/ebooks/Author/Book/b.epub"
 * and "/ebooks/Author/Book/b.epub" → "book/b.epub").
 */
export function pathKey(path: string): string {
  const parts = path
    .normalize("NFC")
    .split(/[\\/]+/)
    .filter(Boolean);
  return parts.slice(-2).join("/").toLowerCase();
}

/** The folder of a file path. */
export function parentPath(path: string): string {
  return path.replace(/[\\/]+[^\\/]*[\\/]*$/, "");
}
