# Ghost Draw Web

An independent, local-first blind-drawing game in ten languages. Free/daily drawing, hidden ink, stroke replay, a browser-local gallery, image export and hosted replay links are implemented without an account. It uses the actual App challenge IDs and Featured stroke data, not placeholder illustrations.

## Develop

```sh
npm ci
npm run build
npm run dev
npm test
npm run test:e2e
```

Default local URL: `http://127.0.0.1:8877/zh-Hans/`. Playwright uses the installed macOS Chrome because the Browser plugin was not available during implementation. Test screenshots/results are written under `/tmp`.

`content/` holds independent copies of App translations, prompts and Featured replay JSON. Building this project does not require the parent App repo or network access. When App content changes, run `npm run import:app`; add `-- --refresh-replays` to refresh existing official replay payloads. User-created drawings and drafts use IndexedDB; clearing browser/site data removes them. They are not automatically synced with the App or iCloud.

## Hosting And SEO

Cloudflare Pages project `ghost-draw`; domain `https://ghost-draw.luopeike.com`. The existing Git integration automatically publishes the repository root when `main` is pushed; its build command and output-directory settings are empty. No deployment token or Pages settings change is needed for this workflow.

Run `npm ci` and `npm run build` locally before committing. The builder synchronizes only generated public HTML, CSS/JS assets, the icon, sitemap, robots, 404 page, localized `llms.txt` and Markdown summaries to the tracked root. Commit these generated files together with the source/content changes; pushing triggers the existing automatic release. `dist/` remains an ignored local preview/test copy. Google site-verification files and the favicon directory are preserved in both outputs.

`content/seo.json` is the authoritative ten-language SEO copy. Titles, descriptions, visible headings and FAQs cover the actual browser game's free blind drawing, daily challenges, stroke reveal and same-prompt sharing. The help page describes browser and native App differences accurately; the game does not claim live multiplayer or AI image generation. All important explanations and links are available without JavaScript. Canonical URLs use the actual clean documentation routes, not redirecting `.html` URLs. There are no fabricated ratings, keyword stuffing or ranking promises.

The site emits WebPage/WebApplication/FAQ structured data matching visible content, canonical/hreflang links, crawlable language links and a sitemap. User replay query URLs are excluded from crawling. JSON data remains fetchable for rendering but carries a noindex header.

### IndexNow

The manual Node CLI follows the [official IndexNow protocol](https://www.indexnow.org/documentation). It uses the existing XML parser and checks all 40 sitemap URLs against the locale routes and public HTML canonicals. Only exact canonical sitemap URLs are permitted; replay/query URLs, fragments, private data, assets and other hosts cannot be submitted. Nothing is added to browser scripts, tracking, Git hooks or scheduled jobs. No new dependencies are needed. Node 24 is supported.

The durable UTF-8 ownership file is `fac5ab115cb18f45db961c47cdde2f7b.txt` at the repository root, published at `https://ghost-draw.luopeike.com/fac5ab115cb18f45db961c47cdde2f7b.txt`. The build validates it and preserves identical copies in the Git-published root and `dist/`. Keep it published for future validation; do not regenerate it for each submission.

After reviewing changes, build/test, commit the source and generated public files together, and push through the existing Git auto-publication workflow. Wait for that publication before manually submitting:

```sh
npm run indexnow                         # Offline dry run; lists all 40 URLs, sends nothing
npm run indexnow -- --submit             # Initial notification, only after publication
npm run indexnow -- --url https://ghost-draw.luopeike.com/help
npm run indexnow -- --submit --url https://ghost-draw.luopeike.com/help
```

Repeat `--url URL` for multiple changed pages (at most 40 arguments, deduplicated). Omit `--submit` to preview the exact selection offline. After the initial notification, submit only when public content actually changes, and select only the changed canonical pages. Do not repeatedly notify unchanged pages or schedule periodic resubmission. No arbitrary URL-list input or automatic retries are supported.

With `--submit`, the CLI first GETs the live root key with a timeout, rejecting redirects, non-200 responses, invalid UTF-8 or mismatched content before sending anything to IndexNow. It then sends one bounded JSON POST to `https://api.indexnow.org/indexnow`. HTTP 200 means the notification was received; HTTP 202 means received with key validation pending, not completed verification. Neither guarantees crawling, indexing, ranking or removal of Bing's warning. Other statuses fail with a nonzero exit code; 400/403/422/429 have explicit explanations. A timeout/network failure after POST leaves receipt unknown; investigate before manually retrying. Even after a successful local key check, IndexNow performs its own validation.

This addresses IndexNow support only. Bing's separate insufficient-quality-inbound-links recommendation is not addressed; no backlinks are created or purchased.

### GEO

`/llms.txt` links to canonical pages and all nine other language manifests. Each language has its own `llms.txt` and `index.md` summary, generated from the same descriptions, instructions, FAQs and privacy facts used in HTML. No extra product claims or private user data appear only in the agent summaries.

These files are optional aids, not access controls or guaranteed ranking signals. [Google's AI-search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) says `llms.txt` is not required and does not influence Google Search visibility or ranking. Useful crawlable content and consistent facts take priority. The [llms.txt proposal](https://llmstxt.org/) explains its use as an agent-friendly summary format; it does not establish universal support by search providers.

## Statistics

Usage statistics are on by default with an explicit off switch. Turning off cancels sending and clears the queue; deletion of sent statistics is available. Local and automated test runs are excluded. Only predefined action values are sent, not drawings/titles/nicknames/hardware IDs. Browser and iOS metrics remain separate. See the parent `server/ANALYTICS.md` for the D1/dashboard details. The website is usable without downloading the App; App Store clicks are measured separately, never counted as installs.
