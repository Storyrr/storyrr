import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { MediaCollection, MediaDetails, MediaSummary } from "#/lib/media";
import { fail, ok, requestJson, type FetchFn, type ServiceResult } from "#/server/services/result";

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

const BookSchema = v.looseObject({
  id: v.number(),
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
  books: v.array(v.looseObject({ id: v.number(), editions: EditionLanguagesSchema })),
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

const LANGUAGES_QUERY = `query StoryrrLanguages($ids: [Int!]!) {
  books(where: {id: {_in: $ids}}) { id ${EDITION_LANGUAGES} }
}`;

const TRENDING_QUERY = `query StoryrrTrending($limit: Int!) {
  books_trending(duration: month, limit: $limit) { ids error }
}`;

// Card fields for a list of books (trending, series, author), languages included.
const BOOK_CARD = `id title subtitle release_date
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

const TrendingDataSchema = v.object({
  books_trending: v.looseObject({
    ids: v.optional(v.nullable(v.array(v.number())), []),
    error: v.optional(v.nullable(v.string())),
  }),
});
const BooksDataSchema = v.object({ books: v.array(BookSchema) });

const BOOK_QUERY = `query StoryrrBook($id: Int!) {
  books_by_pk(id: $id) {
    id title subtitle description release_date pages
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
      const byId = new Map(
        languages.value.books.map((book) => [String(book.id), editionLanguages(book.editions)]),
      );
      return ok(items.map((item) => ({ ...item, languages: byId.get(item.externalId) })));
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

    async getById(id: string): Promise<ServiceResult<MediaDetails>> {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0)
        return fail("not_found", `No Hardcover book ${id}`);
      const result = await graphql(BOOK_QUERY, { id: numericId }, BookDataSchema);
      if (!result.ok) return result;
      const book = result.value.books_by_pk;
      if (!book?.title) return fail("not_found", `No Hardcover book ${id}`);
      return ok(toDetails(book));
    },
  };
}

export type HardcoverClient = ReturnType<typeof createHardcoverClient>;

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
    series: series?.series
      ? [
          {
            name: series.series.name,
            position: series.details ?? positionText(series.position),
            id: series.series.id === undefined ? undefined : String(series.series.id),
          },
        ]
      : [],
    coverUrl: book.image?.url ?? undefined,
    language: edition?.language?.language,
    pages: book.pages ?? undefined,
    languages: editionLanguages(book.editions),
    description: book.description ? htmlToText(book.description) : undefined,
  };
}
