import { m } from "#/paraglide/messages.js";

/*
 * Hardcover's genres and moods are English-only reader tags. Until Hardcover
 * translates them (planned on its side, no date), Storyrr translates the most
 * used ones (top genres and moods, checked on 2026-11-25); any other keeps
 * Hardcover's name. Keyed by normalized English name: tag slugs sometimes carry
 * a random suffix ("art-3edc3db2-…"), and the same tag comes in several spellings
 * ("fast-paced", "fast paced").
 */

/** "Children's Stories" → "children s stories". */
const normalize = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();

const NAMES: Record<string, () => string> = {
  fiction: m.hardcover_tag_fiction,
  fantasy: m.hardcover_tag_fantasy,
  "young adult": m.hardcover_tag_young_adult,
  "science fiction": m.hardcover_tag_science_fiction,
  adventure: m.hardcover_tag_adventure,
  comics: m.hardcover_tag_comics,
  classics: m.hardcover_tag_classics,
  history: m.hardcover_tag_history,
  romance: m.hardcover_tag_romance,
  lgbtq: m.hardcover_tag_lgbtq,
  war: m.hardcover_tag_war,
  "juvenile fiction": m.hardcover_tag_juvenile_fiction,
  biography: m.hardcover_tag_biography,
  mystery: m.hardcover_tag_mystery,
  "comics and graphic novels": m.hardcover_tag_comics_and_graphic_novels,
  general: m.hardcover_tag_general,
  religion: m.hardcover_tag_religion,
  dystopian: m.hardcover_tag_dystopian,
  nonfiction: m.hardcover_tag_nonfiction,
  "biography and autobiography": m.hardcover_tag_biography_and_autobiography,
  philosophy: m.hardcover_tag_philosophy,
  aliens: m.hardcover_tag_aliens,
  "juvenile nonfiction": m.hardcover_tag_juvenile_nonfiction,
  "business and economics": m.hardcover_tag_business_and_economics,
  space: m.hardcover_tag_space,
  science: m.hardcover_tag_science,
  "young adult fiction": m.hardcover_tag_young_adult_fiction,
  thriller: m.hardcover_tag_thriller,
  psychology: m.hardcover_tag_psychology,
  computers: m.hardcover_tag_computers,
  suspense: m.hardcover_tag_suspense,
  politics: m.hardcover_tag_politics,
  humor: m.hardcover_tag_humor,
  "graphic novels": m.hardcover_tag_graphic_novels,
  poetry: m.hardcover_tag_poetry,
  literature: m.hardcover_tag_literature,
  travel: m.hardcover_tag_travel,
  friendship: m.hardcover_tag_friendship,
  "social science": m.hardcover_tag_social_science,
  women: m.hardcover_tag_women,
  mathematics: m.hardcover_tag_mathematics,
  business: m.hardcover_tag_business,
  murder: m.hardcover_tag_murder,
  cooking: m.hardcover_tag_cooking,
  "political science": m.hardcover_tag_political_science,
  family: m.hardcover_tag_family,
  magic: m.hardcover_tag_magic,
  horror: m.hardcover_tag_horror,
  "historical fiction": m.hardcover_tag_historical_fiction,
  children: m.hardcover_tag_children,
  art: m.hardcover_tag_art,
  manga: m.hardcover_tag_manga,
  education: m.hardcover_tag_education,
  "short stories": m.hardcover_tag_short_stories,
  "self help": m.hardcover_tag_self_help,
  "african americans": m.hardcover_tag_african_americans,
  body: m.hardcover_tag_body,
  "mind and spirit": m.hardcover_tag_mind_and_spirit,
  "literary fiction": m.hardcover_tag_literary_fiction,
  "literary criticism": m.hardcover_tag_literary_criticism,
  "science fiction and fantasy": m.hardcover_tag_science_fiction_and_fantasy,
  "family and relationships": m.hardcover_tag_family_and_relationships,
  "health and fitness": m.hardcover_tag_health_and_fitness,
  folklore: m.hardcover_tag_folklore,
  contemporary: m.hardcover_tag_contemporary,
  police: m.hardcover_tag_police,
  "literary collections": m.hardcover_tag_literary_collections,
  "children s stories": m.hardcover_tag_children_s_stories,
  "thriller and suspense": m.hardcover_tag_thriller_and_suspense,
  crime: m.hardcover_tag_crime,
  "literature and fiction": m.hardcover_tag_literature_and_fiction,
  "detective and mystery stories": m.hardcover_tag_detective_and_mystery_stories,
  nature: m.hardcover_tag_nature,
  "action and adventure": m.hardcover_tag_action_and_adventure,
  "language arts and disciplines": m.hardcover_tag_language_arts_and_disciplines,
  drama: m.hardcover_tag_drama,
  spanish: m.hardcover_tag_spanish,
  "sports and recreation": m.hardcover_tag_sports_and_recreation,
  adventurous: m.hardcover_tag_adventurous,
  emotional: m.hardcover_tag_emotional,
  dark: m.hardcover_tag_dark,
  mysterious: m.hardcover_tag_mysterious,
  tense: m.hardcover_tag_tense,
  funny: m.hardcover_tag_funny,
  reflective: m.hardcover_tag_reflective,
  lighthearted: m.hardcover_tag_lighthearted,
  sad: m.hardcover_tag_sad,
  hopeful: m.hardcover_tag_hopeful,
  challenging: m.hardcover_tag_challenging,
  inspiring: m.hardcover_tag_inspiring,
  informative: m.hardcover_tag_informative,
  relaxing: m.hardcover_tag_relaxing,
  "fast paced": m.hardcover_tag_fast_paced,
  "medium paced": m.hardcover_tag_medium_paced,
  suspenseful: m.hardcover_tag_suspenseful,
  "slow paced": m.hardcover_tag_slow_paced,
  "thought provoking": m.hardcover_tag_thought_provoking,
  humorous: m.hardcover_tag_humorous,
  romantic: m.hardcover_tag_romantic,
  exciting: m.hardcover_tag_exciting,
  cozy: m.hardcover_tag_cozy,
  scary: m.hardcover_tag_scary,
  steamy: m.hardcover_tag_steamy,
  moving: m.hardcover_tag_moving,
  action: m.hardcover_tag_action,
  introspective: m.hardcover_tag_introspective,
  sexy: m.hardcover_tag_sexy,
};

/** A Hardcover genre or mood in the reader's language, else Hardcover's own name. */
export function hardcoverTagName(name: string): string {
  return NAMES[normalize(name)]?.() ?? name.trim();
}
