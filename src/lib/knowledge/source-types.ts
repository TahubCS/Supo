// Source types whose content lives elsewhere and is re-fetched by the nightly
// sync. Kept free of server imports: the knowledge UI reads it too.
export const AUTO_SYNC_SOURCE_TYPES: readonly string[] = ["url", "github", "sitemap", "website", "confluence"];
