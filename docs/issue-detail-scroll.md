# Issue detail scroll contract

The issue route has one focusable vertical content region (`Issue content`): title, unbounded description/editor, Chat/Activity tabs, full timeline and reply form. Navigation and properties remain outside it. No description cap or nested timeline scroller is used. Code blocks retain horizontal overflow; URLs and table cells wrap within the center width.

The reply form is sticky at the content region's bottom on tall surfaces and remains in normal flow. When that region is at most 420px high it becomes static, allowing short landscape and keyboard-sized surfaces to scroll the entire form. Mobile uses visualViewport height when available. BottomNav is in normal flow on this route, reserving its 56px plus safe-area inset exactly once; other callers retain their existing fixed navigation.

## Scroll intent

- New issue routes open at the title/description, not at the latest comment.
- Jump to latest and successful own sends intentionally scroll only the content ref via `scrollTo`, never `scrollIntoView` on hidden ancestors.
- New comment IDs follow only when the reader's last scroll was within 80px of the bottom. Initial fetch, comment edits, duplicate SSE events and activity-only updates do not initiate scrolling. Browser scroll anchoring may still compensate for content resizing above the reading position.
- Responsive owner replacement resets follow intent when the DOM ref attaches, before any new-owner scroll event. A reader scrolling the replacement owner to the bottom immediately opts back into following; a resize alone does not inherit the prior owner's bottom intent.
- Existing SSE subscription/deduplication and failed-send draft restoration remain in place. Reconnect uses the same comment-ID rule.

## Scope choice

Capping the description with another scrollbar is smaller but creates a nested vertical trap. Document scrolling requires broader sidebar/property changes. One bounded center scroller preserves navigation and makes every description/comment reachable without either tradeoff.

`TaskDrawer` has an analogous legacy layout but has no mounted callers in current source: Pulse imports it without rendering it and navigates to `/issues/...` instead. This change targets the supported issue route, not that dormant component. Reintroducing the drawer requires applying and testing this contract there.

## Reproducible browser checks

```sh
npm ci
npx playwright install --with-deps chromium
npm run build
npm run test:browser
```

Playwright starts its own loopback-only production server with a temporary HOME, refuses to reuse an existing server, blocks service workers and intercepts all browser API responses using synthetic issue/comment fixtures. No production task, database, gateway or credential is needed. The quality workflow runs these checks after the production build. Unit tests separately exercise scroll intent.

Browser tests exercise long/short/empty descriptions, long URLs/code/tables, many/zero comments, desktop/mobile and the 767/768 breakpoint, wheel/keyboard/touch scrolling, a nonzero 34px safe-area inset, synthetic visualViewport keyboard resize, deliberate jump/send, SSE append/edit/activity, failed-send draft restoration and short-height composer fallback. Browser emulation is not physical iOS/Android keyboard or real-Gateway proof.
