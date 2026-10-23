# Ghost Draw Web

An actual blind-drawing workspace using the app's cyan, charcoal, white and real icon. Default to free drawing, provide the same daily prompt IDs, keep a stable portrait board throughout reveal, and expose local history and replay sharing without an account.

## Design Decisions

The production domain is `ghost-draw.luopeike.com`. Reference mockups and screenshots are temporary local QA artifacts, not published site content.

Use real Featured JSON artwork, no decorative simulated device chrome, charcoal CTA text for contrast, all ten real ink colors, redo, and a viewport-constrained portrait board on phones so reveal remains reachable. Validate the desktop and mobile experience; keep screenshot output outside the repository.

## System

- Neutral workspace `#f4f6f8`, white controls, charcoal `#20242c`, primary cyan `#17c8e8`. Secondary copy `#53616c`, textual cyan `#006579`, control outlines `#7e919c`. Bright cyan carries dark ink, not white text. These foundations are mirrored in the local design-system artifact.
- Dark workspace `#14171a`, surface `#20252a`, text `#f3f5f7`, muted `#b9c3cb`, links `#70e4f5`. Paper remains `#fafaf5` in both themes; rendering the artwork never depends on appearance.
- System fonts only. Brand 26px desktop/22px mobile; controls 14px; compact labels 13px. Zero letter spacing. Native controls and their labels remain localized in all ten languages.
- One portrait 3:4 canvas is the framed primary tool. Tool rail is unframed. Individual artwork previews use 8px radius. No framed sections, nested cards, gradient decoration, or invented metrics.
- Header: app icon and name, Draw/Gallery/Featured, language selection.
- Desktop: left tools and palette; centered fixed-format board with mode/title/actions; two right-hand real Featured previews with localized challenge titles. Mobile: compact horizontal controls; previews continue below the drawing workbench.
- Free/daily segmented modes, optional title, pencil/circle/square/star, brush styles, always-visible color strip, undo/redo/clear. Primary reveal is above the board and remains reachable in the first viewport. Its 48px row is stable when it changes into sharing/replay/draw-again commands. Free and daily prompt fields share the same 48px slot.
- Desktop shows the labeled width slider. Mobile uses a native settings disclosure with current numeric width; its popover supports Escape and outside dismissal and does not change canvas geometry. At 320px, controls wrap instead of shrinking touch targets below 44px.
- Real icons from Lucide. Actual Featured JSON strokes replace the concept's invented sample pictures. Remove the duplicate clear command in the concept; add redo as a standard drawing action.
- Initial board has a faint grid and no visible strokes. A pointer cursor is functional UI. Revealed paintings are user/official stroke data rendered by canvas, not generated illustrations.
- Reduced-motion users can see the finished result without a forced animation. Keyboard/focus states, 44px mobile actions, empty/loading/offline states and storage failures are part of the usable experience.

## Content And Measurement

Static, fully localized headings, plain-language explanation and FAQ follow the actual game. They support SEO and generative-search understanding; they do not guarantee rankings. Canonicals, hreflang, schema, sitemap and crawl rules match real routes.

Statistics are enabled by default per the owner's decision, with an explicit off switch. They exclude drawings, titles and nicknames. Web/iOS events and App Store clicks remain separate from App installs. Local/debug automation must not pollute production events.
