/** Public command-palette results; never includes authors, moderation fields or draft content. */
export type SearchHit = { id: string; title: string; excerpt: string };
export type PortalSearchResults = { feedback: SearchHit[]; changelog: SearchHit[] };
export const SEARCH_LIMIT = 8;
export const SEARCH_QUERY_LIMIT = 100;
