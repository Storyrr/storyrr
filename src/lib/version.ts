const versionParts = (version: string) =>
  version
    .replace(/^v/, "")
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);

/** Compares two "X.Y.Z" versions (an optional leading "v" is ignored): <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
