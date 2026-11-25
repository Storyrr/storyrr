import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type {
  MediaCollection,
  MediaDetails,
  MediaSummary,
  MediaTag,
  MediaTagPage,
  SeriesSummary,
} from "#/lib/media";
import { titleKey } from "#/lib/match";
import { fail, ok, requestJson, type FetchFn, type ServiceResult } from "#/server/services/result";

import { EXPLORE_PAGE_SIZE, type BookFilters, type BookSort } from "#/lib/explore";
import { canonicalLanguage } from "#/lib/languages";
import { htmlToText } from "#/server/services/text";

/*
 * Hardcover's GraphQL API (beta), per the docs repo hardcoverapp/hardcover-docs:
 * POST https://api.hardcover.app/v1/graphql, `authorization: Bearer <token>`,
 * search through Typesense (`search { results }`), details through `books_by_pk`.
 */
const ENDPOINT = "https://api.hardcover.app/v1/graphql";

const GraphQLResponse = <TSchema extends v.GenericSchema>(data: TSchema) =>
  v.object({
    data: v.optional(v.nullable(data)),
    errors: v.optional(v.array(v.looseObject({ message: v.string() }))),
  });

// The book document fields documented in the search guide. UNVERIFIED: `id` comes as a string in
// Typesense documents, and `image` (cover) isn't listed for books; both are read defensively.
const SearchDocumentSchema = v.looseObject({
  id: v.union([v.string(), v.number()]),
  title: v.optional(v.nullable(v.string())),
  subtitle: v.optional(v.nullable(v.string())),
  author_names: v.optional(v.nullable(v.array(v.string())), []),
  release_year: v.optional(v.nullable(v.number())),
  series_names: v.optional(v.nullable(v.array(v.string())), []),
  featured_series_position: v.optional(v.nullable(v.number())),
  image: v.optional(v.nullable(v.looseObject({ url: v.optional(v.nullable(v.string())) }))),
  has_ebook: v.optional(v.nullable(v.boolean())),
});
type SearchDocument = v.InferOutput<typeof SearchDocumentSchema>;

const SearchDataSchema = v.object({
  search: v.object({
    results: v.looseObject({
      hits: v.optional(v.array(v.looseObject({ document: SearchDocumentSchema })), []),
    }),
  }),
});

const EditionLanguagesSchema = v.optional(
  v.array(
    v.looseObject({
      language: v.optional(
        v.nullable(
          v.looseObject({
            code3: v.optional(v.nullable(v.string())),
            code2: v.optional(v.nullable(v.string())),
          }),
        ),
      ),
    }),
  ),
  [],
);

/** Readers' tags per category ("Genre", "Mood", "Tag", "Content Warning"), checked on 2026-11-24. */
const CachedTagsSchema = v.record(
  v.string(),
  v.array(
    v.looseObject({
      tag: v.string(),
      tagSlug: v.string(),
      count: v.optional(v.number(), 0),
      spoilerRatio: v.optional(v.nullable(v.number())),
    }),
  ),
);

const BookSchema = v.looseObject({
  id: v.number(),
  cached_tags: v.optional(v.nullable(CachedTagsSchema)),
  title: v.nullable(v.string()),
  subtitle: v.optional(v.nullable(v.string())),
  description: v.optional(v.nullable(v.string())),
  release_date: v.optional(v.nullable(v.string())),
  pages: v.optional(v.nullable(v.number())),
  image: v.optional(v.nullable(v.looseObject({ url: v.optional(v.nullable(v.string())) }))),
  contributions: v.optional(
    v.array(
      v.looseObject({
        author: v.optional(
          v.nullable(v.looseObject({ name: v.string(), id: v.optional(v.number()) })),
        ),
      }),
    ),
    [],
  ),
  featured_book_series: v.optional(
    v.nullable(
      v.looseObject({
        position: v.optional(v.nullable(v.number())),
        details: v.optional(v.nullable(v.string())),
        series: v.optional(
          v.nullable(v.looseObject({ name: v.string(), id: v.optional(v.number()) })),
        ),
      }),
    ),
  ),
  editions: EditionLanguagesSchema,
  default_ebook_edition: v.optional(
    v.nullable(
      v.looseObject({
        publisher: v.optional(v.nullable(v.looseObject({ name: v.string() }))),
        language: v.optional(v.nullable(v.looseObject({ language: v.string() }))),
      }),
    ),
  ),
});
type HardcoverBook = v.InferOutput<typeof BookSchema>;
const BookDataSchema = v.object({ books_by_pk: v.nullable(BookSchema) });

// UNVERIFIED: series_by_pk / authors_by_pk shapes follow the docs repo's schema
// pages and examples (hardcover-docs, Series.mdx, Authors.mdx, GettingBooksInSeries.mdx),
// not a recorded response.
const SeriesDataSchema = v.object({
  series_by_pk: v.nullable(
    v.looseObject({
      id: v.number(),
      name: v.string(),
      description: v.optional(v.nullable(v.string())),
      book_series: v.optional(
        v.array(
          v.looseObject({
            position: v.optional(v.nullable(v.number())),
            details: v.optional(v.nullable(v.string())),
            book: v.nullable(BookSchema),
          }),
        ),
        [],
      ),
    }),
  ),
});
const AuthorDataSchema = v.object({
  authors_by_pk: v.nullable(
    v.looseObject({
      id: v.number(),
      name: v.string(),
      bio: v.optional(v.nullable(v.string())),
      image: v.optional(v.nullable(v.looseObject({ url: v.optional(v.nullable(v.string())) }))),
      contributions: v.optional(v.array(v.looseObject({ book: v.nullable(BookSchema) })), []),
    }),
  ),
});

const LanguagesDataSchema = v.object({
  books: v.array(
    v.looseObject({
      id: v.number(),
      editions: EditionLanguagesSchema,
      featured_book_series: BookSchema.entries.featured_book_series,
    }),
  ),
});

/** The distinct languages of a book's editions (null for editions without one). */
const editionLanguages = (editions: v.InferOutput<typeof EditionLanguagesSchema>) => [
  ...new Set(
    editions.map((edition) =>
      canonicalLanguage(edition.language?.code3 ?? edition.language?.code2),
    ),
  ),
];

const SEARCH_QUERY = `query StoryrrSearch($query: String!, $perPage: Int!) {
  search(query: $query, query_type: "Book", per_page: $perPage, page: 1) { results }
}`;

// One edition per language is enough to know which languages a book exists in.
const EDITION_LANGUAGES = `editions(distinct_on: language_id, order_by: {language_id: asc}) { language { code3 code2 } }`;

const SERIES_SEARCH_QUERY = `query StoryrrSeriesSearch($query: String!, $perPage: Int!) {
  search(query: $query, query_type: "Series", per_page: $perPage, page: 1) { results }
}`;

/** Languages of a series = those of its first main books (a translation is often numbered apart). */
const SERIES_SAMPLE_BOOKS = 3;
const SERIES_LANGUAGES_QUERY = `query StoryrrSeriesLanguages($ids: [Int!]!) {
  series(where: {id: {_in: $ids}}) {
    id
    book_series(
      where: {compilation: {_eq: false}, book: {canonical_id: {_is_null: true}}}
      order_by: {position: asc_nulls_last}
      limit: ${SERIES_SAMPLE_BOOKS}
    ) { book { image { url } ${EDITION_LANGUAGES} } }
  }
}`;

// Search documents carry series names, not ids: the series id (for its page) comes with the languages.
const LANGUAGES_QUERY = `query StoryrrLanguages($ids: [Int!]!) {
  books(where: {id: {_in: $ids}}) {
    id ${EDITION_LANGUAGES}
    featured_book_series { position details series { id name } }
  }
}`;

const TRENDING_QUERY = `query StoryrrTrending($limit: Int!) {
  books_trending(duration: month, limit: $limit) { ids error }
}`;

// Card fields for a list of books (trending, series, author), languages included.
const BOOK_CARD = `id title subtitle release_date pages
    image { url }
    contributions(where: {contributor_role: {slug: {_eq: "author"}}}) { author { id name } }
    featured_book_series { position details series { id name } }
    ${EDITION_LANGUAGES}`;

const BOOKS_QUERY = `query StoryrrBooks($ids: [Int!]!) {
  books(where: {id: {_in: $ids}}) { ${BOOK_CARD} }
}`;

// Main books only (no compilations or duplicates), one per position, the most read first.
const SERIES_QUERY = `query StoryrrSeries($id: Int!) {
  series_by_pk(id: $id) {
    id name description
    book_series(
      where: {compilation: {_eq: false}, book: {canonical_id: {_is_null: true}}}
      distinct_on: position
      order_by: [{position: asc}, {book: {users_count: desc}}]
    ) { position details book { ${BOOK_CARD} } }
  }
}`;

const AUTHOR_QUERY = `query StoryrrAuthor($id: Int!) {
  authors_by_pk(id: $id) {
    id name bio image { url }
    contributions(
      where: {contributable_type: {_eq: "Book"}, book: {canonical_id: {_is_null: true}}}
      order_by: {book: {users_count: desc}}
      limit: 60
    ) { book { ${BOOK_CARD} } }
  }
}`;

/** Books with a tag, the most read first (main books only), with the tag's name. */
const TAG_QUERY = `query StoryrrTag($slug: String!, $limit: Int!, $offset: Int!) {
  tags(where: {slug: {_eq: $slug}}, limit: 1) { tag }
  books(
    where: {canonical_id: {_is_null: true}, taggings: {tag: {slug: {_eq: $slug}}}}
    order_by: {users_count: desc}
    limit: $limit
    offset: $offset
  ) { ${BOOK_CARD} }
}`;
const TAG_PAGE = 40;

/** The catalog filtered and sorted (Books page); `where` and `order_by` built by `exploreQuery`. */
const EXPLORE_QUERY = `query StoryrrExplore($where: books_bool_exp!, $order: [books_order_by!], $limit: Int!, $offset: Int!) {
  books(where: $where, order_by: $order, limit: $limit, offset: $offset) { ${BOOK_CARD} }
}`;

const GENRES_QUERY = `query StoryrrGenres {
  tags(where: {tag_category: {slug: {_eq: "genre"}}}, order_by: {count: desc}, limit: 80) { tag slug }
}`;
const GenresDataSchema = v.object({
  tags: v.array(v.looseObject({ tag: v.string(), slug: v.string() })),
});

/**
 * Readers needed for a book to show in a non-popularity sort: without a floor,
 * newest / oldest / title sorts surface placeholder records (blank titles,
 * year 202309), checked live on 2026-11-24. Best rated needs ratings instead.
 */
const MIN_READERS: Record<BookSort, number> = {
  popular: 0,
  upcoming: 0,
  rating: 0,
  newest: 5,
  oldest: 5,
  title_asc: 5,
  title_desc: 5,
};
/** Ratings needed to rank by rating (else unreleased books with a few 5-star ratings lead). */
const MIN_RATINGS = 50;

/** Hasura `where` and `order_by` of the Books page (main books only). */
export function exploreQuery(filters: BookFilters, today = new Date()) {
  const sort = filters.sort ?? "popular";
  const and: Record<string, unknown>[] = [{ canonical_id: { _is_null: true } }];
  if (MIN_READERS[sort] > 0) and.push({ users_count: { _gte: MIN_READERS[sort] } });
  if (sort.startsWith("title")) and.push({ title: { _neq: "" } });
  const released = { release_date: { _lte: today.toISOString().slice(0, 10) } };
  if (sort === "newest") and.push(released);
  // Out within a year, the most awaited (want-to-read) first; far-off placeholders
  // ("Untitled Stormlight Archive #10", 2035) left out, checked live on 2026-11-24.
  if (sort === "upcoming") {
    const inAYear = new Date(today);
    inAYear.setFullYear(inAYear.getFullYear() + 1);
    and.push(
      {
        release_date: {
          _gt: today.toISOString().slice(0, 10),
          _lte: inAYear.toISOString().slice(0, 10),
        },
      },
      { title: { _nilike: "untitled%" } },
    );
  }
  if (sort === "rating") and.push({ ratings_count: { _gte: MIN_RATINGS } }, released);
  // Placeholder dates (year 1) come first otherwise.
  if (sort === "oldest") and.push({ release_year: { _gte: 1000 } });
  // Any of the genres, by the book's own most-used genre tags (cached_tags): faster and
  // more relevant than any reader's tagging, checked live on 2026-11-24.
  if (filters.genres?.length)
    and.push({
      _or: filters.genres.map((slug) => ({
        cached_tags: { _contains: { Genre: [{ tagSlug: slug }] } },
      })),
    });
  if (filters.yearFrom !== undefined) and.push({ release_year: { _gte: filters.yearFrom } });
  if (filters.yearTo !== undefined) and.push({ release_year: { _lte: filters.yearTo } });
  if (filters.pagesMin !== undefined) and.push({ pages: { _gte: filters.pagesMin } });
  if (filters.pagesMax !== undefined) and.push({ pages: { _lte: filters.pagesMax } });
  if (filters.ratingMin !== undefined) and.push({ rating: { _gte: filters.ratingMin } });
  if (filters.language) and.push({ editions: { language: { code2: { _eq: filters.language } } } });
  const order: Record<BookSort, Record<string, string>[]> = {
    popular: [{ users_count: "desc" }],
    upcoming: [{ users_count: "desc" }, { release_date: "asc" }],
    rating: [{ rating: "desc_nulls_last" }, { users_count: "desc" }],
    newest: [{ release_date: "desc_nulls_last" }],
    oldest: [{ release_date: "asc_nulls_last" }],
    title_asc: [{ title: "asc" }],
    title_desc: [{ title: "desc" }],
  };
  return { where: { _and: and }, order: order[sort] };
}

const ExploreDataSchema = v.object({ books: v.array(BookSchema) });

// Series search documents, checked live on 2026-11-25 (no cover: the first book's is used).
const SeriesSearchDataSchema = v.object({
  search: v.object({
    results: v.looseObject({
      hits: v.optional(
        v.array(
          v.looseObject({
            document: v.looseObject({
              id: v.union([v.string(), v.number()]),
              name: v.string(),
              author_name: v.optional(v.nullable(v.string())),
              books_count: v.optional(v.nullable(v.number())),
              primary_books_count: v.optional(v.nullable(v.number())),
            }),
          }),
        ),
        [],
      ),
    }),
  }),
});

const SeriesLanguagesDataSchema = v.object({
  series: v.array(
    v.looseObject({
      id: v.number(),
      book_series: v.optional(
        v.array(
          v.looseObject({
            book: v.nullable(
              v.looseObject({
                image: v.optional(
                  v.nullable(v.looseObject({ url: v.optional(v.nullable(v.string())) })),
                ),
                editions: EditionLanguagesSchema,
              }),
            ),
          }),
        ),
        [],
      ),
    }),
  ),
});

const TrendingDataSchema = v.object({
  books_trending: v.looseObject({
    ids: v.optional(v.nullable(v.array(v.number())), []),
    error: v.optional(v.nullable(v.string())),
  }),
});
const BooksDataSchema = v.object({ books: v.array(BookSchema) });
const TagDataSchema = v.object({
  tags: v.array(v.looseObject({ tag: v.string() })),
  books: v.array(BookSchema),
});

const BOOK_QUERY = `query StoryrrBook($id: Int!) {
  books_by_pk(id: $id) {
    id title subtitle description release_date pages cached_tags
    image { url }
    contributions(where: {contributor_role: {slug: {_eq: "author"}}}) { author { id name } }
    featured_book_series { position details series { id name } }
    default_ebook_edition { publisher { name } language { language } }
    ${EDITION_LANGUAGES}
  }
}`;

export function createHardcoverClient({ token, fetch }: { token: string; fetch: FetchFn }) {
  // The token page shows the value with its "Bearer " prefix; accept it with or without.
  const authorization = /^bearer\s/i.test(token) ? token : `Bearer ${token}`;

  async function graphql<TSchema extends v.GenericSchema>(
    query: string,
    variables: Record<string, unknown>,
    data: TSchema,
  ): Promise<ServiceResult<v.InferOutput<TSchema>>> {
    const result = await requestJson({
      fetch,
      service: "Hardcover",
      url: ENDPOINT,
      schema: GraphQLResponse(data),
      // Hardcover stops searches after 2 s and other queries after 30 s.
      timeoutMs: 15_000,
      init: {
        method: "POST",
        headers: { authorization, "content-type": "application/json", "user-agent": "Storyrr" },
        body: JSON.stringify({ query, variables }),
      },
    });
    if (!result.ok) return result;
    const { data: payload, errors } = result.value;
    if (errors?.length) return fail("rejected", errors.map((e) => e.message).join("; "));
    if (payload === undefined || payload === null)
      return fail("rejected", "Hardcover returned no data");
    return ok(payload);
  }

  /** Series matching a search, with their languages and first book's cover; empty series left out. */
  async function searchSeries(
    query: string,
    { limit = 10 } = {},
  ): Promise<ServiceResult<SeriesSummary[]>> {
    const result = await graphql(
      SERIES_SEARCH_QUERY,
      { query, perPage: limit },
      SeriesSearchDataSchema,
    );
    if (!result.ok) return result;
    const hits = result.value.search.results.hits
      .map(({ document }) => document)
      .filter((doc) => (doc.primary_books_count ?? doc.books_count ?? 0) > 0);
    const ids = hits.map((doc) => Number(doc.id)).filter(Number.isInteger);
    if (ids.length === 0) return ok([]);
    // Best effort, like book search: without it, series just have no cover or languages.
    const details = await graphql(SERIES_LANGUAGES_QUERY, { ids }, SeriesLanguagesDataSchema);
    const byId = new Map(
      details.ok ? details.value.series.map((series) => [String(series.id), series]) : [],
    );
    return ok(
      hits.map((doc) => {
        const books = byId
          .get(String(doc.id))
          ?.book_series.flatMap(({ book }) => (book ? [book] : []));
        return {
          id: String(doc.id),
          name: doc.name,
          author: doc.author_name ?? undefined,
          booksCount: doc.primary_books_count ?? doc.books_count ?? 0,
          coverUrl: books?.find((book) => book.image?.url)?.image?.url ?? undefined,
          languages: books
            ? [...new Set(books.flatMap((book) => editionLanguages(book.editions)))]
            : undefined,
        };
      }),
    );
  }

  return {
    async search(query: string, { limit = 20 } = {}): Promise<ServiceResult<MediaSummary[]>> {
      const result = await graphql(SEARCH_QUERY, { query, perPage: limit }, SearchDataSchema);
      if (!result.ok) return result;
      const items = result.value.search.results.hits.flatMap(
        ({ document }) => toSummary(document) ?? [],
      );
      // Search documents don't carry languages: one more query covers all results. Best effort.
      const ids = items.map((item) => Number(item.externalId)).filter(Number.isInteger);
      if (ids.length === 0) return ok(items);
      const languages = await graphql(LANGUAGES_QUERY, { ids }, LanguagesDataSchema);
      if (!languages.ok) return ok(items);
      const byId = new Map(languages.value.books.map((book) => [String(book.id), book]));
      return ok(
        items.map((item) => {
          const book = byId.get(item.externalId);
          if (!book) return item;
          return {
            ...item,
            languages: editionLanguages(book.editions),
            series: featuredSeries(book.featured_book_series) ?? item.series,
          };
        }),
      );
    },

    searchSeries,

    /**
     * Other series with the same name apart from a qualifier, e.g. "Solo Leveling
     * (French Numbering)" for "Solo Leveling (Comic)": Hardcover keeps a translation
     * cut into other volumes as its own series, with no link between the two.
     */
    async relatedSeries(id: string, name: string): Promise<ServiceResult<SeriesSummary[]>> {
      const base = seriesBaseName(name);
      if (!base) return ok([]);
      const result = await searchSeries(base, { limit: 25 });
      if (!result.ok) return result;
      const key = titleKey(base);
      return ok(
        result.value.filter(
          (series) => series.id !== id && titleKey(seriesBaseName(series.name)) === key,
        ),
      );
    },

    /** Books the most Hardcover readers finished this month (worldwide), in rank order. */
    async trending({ limit = 20 } = {}): Promise<ServiceResult<MediaSummary[]>> {
      const trending = await graphql(TRENDING_QUERY, { limit }, TrendingDataSchema);
      if (!trending.ok) return trending;
      const { ids, error } = trending.value.books_trending;
      if (error) return fail("rejected", error);
      if (!ids?.length) return ok([]);
      const books = await graphql(BOOKS_QUERY, { ids }, BooksDataSchema);
      if (!books.ok) return books;
      const byId = new Map(books.value.books.map((book) => [book.id, book]));
      return ok(
        ids.flatMap((id) => {
          const book = byId.get(id);
          if (!book?.title) return [];
          const { description: _description, ...summary } = toDetails(book);
          return [summary];
        }),
      );
    },

    /** A series' main books in reading order. */
    async series(id: string): Promise<ServiceResult<MediaCollection>> {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0)
        return fail("not_found", `No Hardcover series ${id}`);
      const result = await graphql(SERIES_QUERY, { id: numericId }, SeriesDataSchema);
      if (!result.ok) return result;
      const series = result.value.series_by_pk;
      if (!series) return fail("not_found", `No Hardcover series ${id}`);
      return ok({
        name: series.name,
        description: series.description ? htmlToText(series.description) : undefined,
        items: series.book_series.flatMap(({ book, details, position }) => {
          if (!book?.title) return [];
          const { description: _description, ...summary } = toDetails(book);
          // The position in *this* series (a book's featured series may be another one).
          return [
            {
              ...summary,
              series: [{ name: series.name, id, position: details ?? positionText(position) }],
            },
          ];
        }),
      });
    },

    /** An author's books, the most read first, with their bio and photo. */
    async author(id: string): Promise<ServiceResult<MediaCollection>> {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0)
        return fail("not_found", `No Hardcover author ${id}`);
      const result = await graphql(AUTHOR_QUERY, { id: numericId }, AuthorDataSchema);
      if (!result.ok) return result;
      const author = result.value.authors_by_pk;
      if (!author) return fail("not_found", `No Hardcover author ${id}`);
      const seen = new Set<number>();
      return ok({
        name: author.name,
        description: author.bio ? htmlToText(author.bio) : undefined,
        imageUrl: author.image?.url ?? undefined,
        items: author.contributions.flatMap(({ book }) => {
          if (!book?.title || seen.has(book.id)) return [];
          seen.add(book.id);
          const { description: _description, ...summary } = toDetails(book);
          return [summary];
        }),
      });
    },

    /** The catalog filtered and sorted (Books page), page by page. */
    async discover(filters: BookFilters, page = 1): Promise<ServiceResult<MediaSummary[]>> {
      const { where, order } = exploreQuery(filters);
      const result = await graphql(
        EXPLORE_QUERY,
        { where, order, limit: EXPLORE_PAGE_SIZE, offset: (page - 1) * EXPLORE_PAGE_SIZE },
        ExploreDataSchema,
      );
      if (!result.ok) return result;
      return ok(
        result.value.books.flatMap((book) => {
          if (!book.title) return [];
          const { description: _description, ...summary } = toDetails(book);
          return [summary];
        }),
      );
    },

    /** The most used genres, for the Books page's genre filter. */
    async genres(): Promise<ServiceResult<MediaTag[]>> {
      const result = await graphql(GENRES_QUERY, {}, GenresDataSchema);
      if (!result.ok) return result;
      return ok(result.value.tags.map((tag) => ({ id: tag.slug, name: tag.tag })));
    },

    /** A genre's or mood's books, the most read first, page by page. */
    async tag(slug: string, page = 1): Promise<ServiceResult<MediaTagPage>> {
      const result = await graphql(
        TAG_QUERY,
        { slug, limit: TAG_PAGE, offset: (page - 1) * TAG_PAGE },
        TagDataSchema,
      );
      if (!result.ok) return result;
      const [tag] = result.value.tags;
      if (!tag) return fail("not_found", `No Hardcover tag ${slug}`);
      return ok({
        name: tag.tag,
        items: result.value.books.flatMap((book) => {
          if (!book.title) return [];
          const { description: _description, ...summary } = toDetails(book);
          return [summary];
        }),
      });
    },

    async getById(id: string): Promise<ServiceResult<MediaDetails>> {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0)
        return fail("not_found", `No Hardcover book ${id}`);
      const result = await graphql(BOOK_QUERY, { id: numericId }, BookDataSchema);
      if (!result.ok) return result;
      const book = result.value.books_by_pk;
      if (!book?.title) return fail("not_found", `No Hardcover book ${id}`);
      return ok({ ...toDetails(book), tags: bookTags(book.cached_tags) });
    },
  };
}

export type HardcoverClient = ReturnType<typeof createHardcoverClient>;

/** A series' name without its trailing qualifiers: "Solo Leveling (French Numbering)" → "Solo Leveling". */
export function seriesBaseName(name: string): string {
  return name.replace(/(\s*[([][^()[\]]*[)\]])+\s*$/u, "").trim();
}

/** A book's main series (with its id, for the series page), or null when it has none. */
function featuredSeries(
  featured: HardcoverBook["featured_book_series"],
): MediaSummary["series"] | null {
  if (!featured?.series) return null;
  return [
    {
      name: featured.series.name,
      position: featured.details ?? positionText(featured.position),
      id: featured.series.id === undefined ? undefined : String(featured.series.id),
    },
  ];
}

const positionText = (position: number | null | undefined) =>
  position === null || position === undefined ? undefined : String(position);

function toSummary(document: SearchDocument): MediaSummary | null {
  if (!document.title) return null;
  const seriesName = document.series_names?.[0];
  return {
    type: "ebook",
    source: "hardcover",
    externalId: String(document.id),
    title: document.title,
    subtitle: document.subtitle ?? undefined,
    authors: document.author_names ?? [],
    narrators: [],
    releaseDate: document.release_year ? String(document.release_year) : undefined,
    series: seriesName
      ? [{ name: seriesName, position: positionText(document.featured_series_position) }]
      : [],
    coverUrl: document.image?.url ?? undefined,
  };
}

/** Tag categories shown on a book, with how many of each (readers' opinions and content warnings left out). */
const TAG_CATEGORIES = [
  ["Genre", 8],
  ["Mood", 4],
] as const;

/** A book's most-tagged genres and moods (spoilers left out). */
function bookTags(cached: HardcoverBook["cached_tags"]): MediaTag[] {
  if (!cached) return [];
  return TAG_CATEGORIES.flatMap(([category, count]) =>
    (cached[category] ?? [])
      .filter((tag) => (tag.spoilerRatio ?? 0) < 0.5)
      .toSorted((a, b) => b.count - a.count)
      .slice(0, count)
      // Readers type some in lowercase ("challenging").
      .map((tag) => ({
        id: tag.tagSlug,
        name: tag.tag.charAt(0).toUpperCase() + tag.tag.slice(1),
      })),
  );
}

function toDetails(book: HardcoverBook): MediaDetails {
  const series = book.featured_book_series;
  const edition = book.default_ebook_edition;
  return {
    type: "ebook",
    source: "hardcover",
    externalId: String(book.id),
    title: book.title ?? "",
    subtitle: book.subtitle ?? undefined,
    authors: book.contributions.flatMap((c) => (c.author ? [c.author.name] : [])),
    authorRefs: book.contributions.flatMap((c) =>
      c.author?.id === undefined ? [] : [{ id: String(c.author.id), name: c.author.name }],
    ),
    narrators: [],
    publisher: edition?.publisher?.name,
    releaseDate: book.release_date ?? undefined,
    series: featuredSeries(series) ?? [],
    coverUrl: book.image?.url ?? undefined,
    language: edition?.language?.language,
    pages: book.pages ?? undefined,
    languages: editionLanguages(book.editions),
    description: book.description ? htmlToText(book.description) : undefined,
  };
}
