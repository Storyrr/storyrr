import { getLocale } from "#/paraglide/runtime.js";

/** Bibliographic (ISO 639-2/B) codes → terminology (639-2/T, also 639-3) codes, which Intl understands. */
const B_TO_T: Record<string, string> = {
  alb: "sqi",
  arm: "hye",
  baq: "eus",
  bur: "mya",
  chi: "zho",
  cze: "ces",
  dut: "nld",
  fre: "fra",
  geo: "kat",
  ger: "deu",
  gre: "ell",
  ice: "isl",
  mac: "mkd",
  mao: "mri",
  may: "msa",
  per: "fas",
  rum: "ron",
  slo: "slk",
  tib: "bod",
  wel: "cym",
};

const TWO_TO_THREE: Record<string, string> = {
  ar: "ara",
  da: "dan",
  de: "deu",
  en: "eng",
  es: "spa",
  fi: "fin",
  fr: "fra",
  it: "ita",
  ja: "jpn",
  ko: "kor",
  nl: "nld",
  no: "nor",
  pl: "pol",
  pt: "por",
  ru: "rus",
  sv: "swe",
  tr: "tur",
  zh: "zho",
};

/** Audible's language names (product `language`). */
const AUDIBLE_NAMES: Record<string, string> = {
  english: "eng",
  french: "fra",
  german: "deu",
  spanish: "spa",
  castilian: "spa",
  italian: "ita",
  japanese: "jpn",
  portuguese: "por",
  dutch: "nld",
  danish: "dan",
  swedish: "swe",
  norwegian: "nor",
  finnish: "fin",
  polish: "pol",
  russian: "rus",
  chinese: "zho",
  mandarin_chinese: "zho",
  korean: "kor",
  turkish: "tur",
  arabic: "ara",
};

/** One canonical 3-letter code per language ("fre", "fra", "fr" → "fra"), or null if unknown. */
export function canonicalLanguage(code: string | null | undefined): string | null {
  const value = code?.trim().toLowerCase();
  if (!value) return null;
  if (value.length === 2) return TWO_TO_THREE[value] ?? null;
  if (value.length === 3) return B_TO_T[value] ?? value;
  return AUDIBLE_NAMES[value.replace(/\s+/g, "_")] ?? null;
}

/** The language's name in the reader's language ("fra" → "français" in French). */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([getLocale()], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Which languages Chaptarr's metadata profile accepts for a format. */
export type LanguagePolicy = { allowed: string[]; allowUnknown: boolean };

/** Parses a Chaptarr `allowedLanguages` value ("fre,fra,null"); null when it doesn't filter. */
export function parseAllowedLanguages(raw: string | null | undefined): LanguagePolicy | null {
  const allowed = new Set<string>();
  let allowUnknown = false;
  for (const token of (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)) {
    if (/^(null|unknown)$/i.test(token)) allowUnknown = true;
    else {
      const code = canonicalLanguage(token);
      if (code) allowed.add(code);
    }
  }
  return allowed.size > 0 || allowUnknown ? { allowed: [...allowed], allowUnknown } : null;
}

/**
 * Whether Chaptarr would keep a work with editions in these languages (as its
 * EditionMetadataProfileFilter does: one accepted edition is enough). Unknown
 * when the work's languages or the policy aren't known.
 */
export function isLanguageAccepted(
  policy: LanguagePolicy | null,
  languages: readonly (string | null)[] | undefined,
): boolean | null {
  if (!policy || !languages) return null;
  if (languages.length === 0) return policy.allowUnknown;
  return languages.some((code) =>
    code === null ? policy.allowUnknown : policy.allowed.includes(code),
  );
}
