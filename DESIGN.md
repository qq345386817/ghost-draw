# Ghost Draw Web

An actual blind-drawing workspace using the app's cyan, charcoal, white and real icon. Default to free drawing, provide the same daily prompt IDs, keep a stable portrait board throughout reveal, and expose local history and replay sharing without an account.

## Design Decisions

The production domain is `ghost-draw.luopeike.com`. Reference mockups and screenshots are temporary local QA artifacts, not published site content.

Use real Featured JSON artwork, no decorative simulated device chrome, charcoal CTA text for contrast, all ten real ink colors, redo, and a viewport-constrained portrait board on phones so reveal remains reachable. Validate the desktop and mobile experience; keep screenshot output outside the repository.

## System

- True white background; neutral cool-gray separators and controls; charcoal `#171c25`; primary cyan `#17c8e8`. Ink stays dark on white paper in both appearance modes.
- System fonts only. Brand 28px desktop/22px mobile; navigation and form controls 15–16px; compact labels 13px. Zero letter spacing.
- One portrait 3:4 canvas is the framed primary tool. Tool rail is unframed. Individual artwork previews use 8px radius. No framed sections, nested cards, gradient decoration, or invented metrics.
- Header: app icon and name, Draw/Gallery/Featured, language selection.
- Desktop: left tools and palette; centered fixed-format board with mode/title/actions; two right-hand Featured previews. Mobile: compact horizontal controls, then board/actions; previews continue below.
- Free/daily segmented modes, optional title, pencil/circle/square/star, brush styles, color swatches, labeled size slider, undo/redo/clear. Primary reveal remains below the board; result sharing opens a modal rather than resizing the board.
- Real icons from Lucide. Actual Featured JSON strokes replace the concept's invented sample pictures. Remove the duplicate clear command in the concept; add redo as a standard drawing action.
- Initial board has a faint grid and no visible strokes. A pointer cursor is functional UI. Revealed paintings are user/official stroke data rendered by canvas, not generated illustrations.
- Reduced-motion users can see the finished result without a forced animation. Keyboard/focus states, 44px mobile actions, empty/loading/offline states and storage failures are part of the usable experience.

## Content And Measurement

Static, fully localized headings, plain-language explanation and FAQ follow the actual game. They support SEO and generative-search understanding; they do not guarantee rankings. Canonicals, hreflang, schema, sitemap and crawl rules match real routes.

Statistics are enabled by default per the owner's decision, with an explicit off switch. They exclude drawings, titles and nicknames. Web/iOS events and App Store clicks remain separate from App installs. Local/debug automation must not pollute production events.
