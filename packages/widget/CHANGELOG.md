# Changelog

All notable changes to `@supoapp/widget` will be documented here.

## 0.1.0-alpha.4

- Added stable customer identity support through `customer.externalId`.
- Added `customer.id` as an accepted alias that normalizes to `externalId`.
- Made customer email optional when a stable external id is supplied.
- Updated widget storage keys to prefer `external:{externalId}` while preserving email-based alpha conversation keys.

## 0.1.0-alpha.3

- Changed the widget's "Powered by Supo" link to use the configured `apiBaseUrl` instead of a hardcoded Supo marketing URL.
- This makes self-hosted, preview, and deployment-specific widget installs link back to the correct Supo app.

## 0.1.0-alpha.2

- Added npm package README with React, vanilla TypeScript, headless, runtime API, and fallback script examples.
- Added package metadata for npm: description, license, homepage, repository, bugs, and keywords.
- Published under the official `@supoapp` npm scope.

## 0.1.0-alpha.1

- Initial alpha release of the Supo widget SDK.
- Added core browser widget runtime via `@supoapp/widget`.
- Added React helpers via `@supoapp/widget/react`.
- Added headless client via `@supoapp/widget/headless`.
- Added generated legacy global script support for CMS/no-code fallback embeds.
