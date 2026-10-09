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

### GEO

`/llms.txt` links to canonical pages and all nine other language manifests. Each language has its own `llms.txt` and `index.md` summary, generated from the same descriptions, instructions, FAQs and privacy facts used in HTML. No extra product claims or private user data appear only in the agent summaries.

These files are optional aids, not access controls or guaranteed ranking signals. [Google's AI-search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) says `llms.txt` is not required and does not influence Google Search visibility or ranking. Useful crawlable content and consistent facts take priority. The [llms.txt proposal](https://llmstxt.org/) explains its use as an agent-friendly summary format; it does not establish universal support by search providers.

## Statistics

Usage statistics are on by default with an explicit off switch. Turning off cancels sending and clears the queue; deletion of sent statistics is available. Local and automated test runs are excluded. Only predefined action values are sent, not drawings/titles/nicknames/hardware IDs. Browser and iOS metrics remain separate. See the parent `server/ANALYTICS.md` for the D1/dashboard details. The website is usable without downloading the App; App Store clicks are measured separately, never counted as installs.
