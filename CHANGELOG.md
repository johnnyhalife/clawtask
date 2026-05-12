# Changelog

All notable changes to this project are documented in this file.

## 2026-05-12

### Dependencies
- **React 18 → 19** — `forwardRef` removed from `Button`, `Input`, `TopBar`, `ChipSelect` (ref-as-prop pattern) `00e8770`
- **Next.js 14 → 15** — no async params migration needed; route handlers were already using `Promise<params>` pattern `8930aab`
- **@types/react 18 → 19** `8930aab`
- **TypeScript 5.9 → 6.0** — one fix required: `globals.css.d.ts` shim added for TS6's new side-effect import enforcement `3910da2`
- **uuid 9 → 14** — Node 20+ required (running Node 26 ✅); `import { v4 as uuidv4 }` pattern unchanged `bb0ada0`
- **better-sqlite3** 12.9 → 12.10 (patch) `bb0ada0`
- **ws** 8.20.0 → 8.20.1 (patch) `bb0ada0`
- **postcss** 8.5.12 → 8.5.14 (patch) `bb0ada0`
- Updated `@types/uuid`, `@types/ws`, `@types/better-sqlite3` to match `bb0ada0`


### Bug fixes
- Empty-state CTA on project with no issues now reads **Create Issue** instead of ~~Create Agent~~ (#1) `47ca2b1`
- Agent delete button in Settings → Agents is now always enabled, regardless of probe status (`pending`, `error`) — broken agents can be cleaned up without API workarounds (#2) `992a5a5`
- Backlog status chip on the issue page now renders correctly (was white/empty) `9ffb394`
- Closing the issue page no longer leaves Status/Priority dropdowns open `08f482c`
- Human assignee on an in-progress task no longer locks the UI, hides the Cancel button, or disables property fields — lock behaviour is agent-only `a697554`

### UX improvements
- **T** keyboard shortcut opens the Tags dropdown on the issue page; **Esc** closes it; hover hint shows `T` in the Properties pane (matches S, P, A, J shortcuts) `2876ce0`
- **⌘/Ctrl+Enter** hint text added below comment textareas (mobile and desktop); shortcut was already functional `f2ac227`

### Code quality (React Doctor)
- Page metadata (`<title>`, `<description>`) added via server-component wrappers for home, issue, and settings pages `86a0fc8` `8b2221d`
- `searchParams.get` destructured with `.bind()` in Sidebar, BottomNav, HomeContent for React Compiler memoization compatibility `8c88733`
- Remaining `<img>` replaced with `next/image` in CreateTaskModal logo preview `7ae248f`
- Em dashes replaced in UI text/separators `b31a025`
- Typographic ellipsis (`…`) used in loading fallback `c040fcd`
- Generic `handleClick` handler renamed to `openTask` in TaskRow `839bbb7`

---

## 2026-05-08

### Features
- Group issue list by **Completed Date** `144063c`
- Clawtask claw icon as favicon and PWA icons `6fefd3c`

### Bug fixes
- Group-by button exposed in mobile TopBar `8ef6303`
- Completed Date added to BottomNav GroupingSheet options `87843ee`

---

## 2026-05-06

### Features
- **Backlog** status added (`CWT-024`) `6212df4`
- Collapsible/expandable Properties pane on single issue view (`CWT-027`) `b22ddde`
- Properties pane visible on mobile (`CWT-028`) `5a37ace`
- Mobile: GroupingSheet opens on issues tab re-tap `492e1f6`
- `groupBy` selection persisted to localStorage across page refreshes `b710099`

### CI / Infra
- GitHub Action added: build and push `arm64` Docker image on push to main `0a05760`

### Bug fixes
- Agent adapter wakes on `todo`/`blocked` transitions, not only `in_progress` (`CWT-026`) `8af0f05`
- Mobile create modal no longer trapped below the keyboard `6f85a35`
- Mobile create modal z-index raised above BottomNav `053c724`

---

## 2026-05-01

### Features
- **External systems** — API keys, settings tab, actor display, task creation attribution `02efff3`
- Name resolution in task POST (`projectName`, `assigneeName`, `tagNames`) `215d250`
- Auth token field in settings UI (masked) `4d582e8`
- Group by Project option in issue list `f4b8ea1`
- `/api/health` endpoint for container probes `dedc2f9`
- Dynamic page titles (`clawtask | {workspace} | {page}`) `3e16280`
- Page title reflects active project/tag filter `0d4fb9d`
- Workspace logo used as favicon when configured `3770817`
- `Dockerfile.fast` + `docker-build-fast.sh` for host-built, fast Docker packaging `fc4906d`

### Keyboard navigation
- **J/K** nav on issue list with blue-outline selection; **S** focuses search `37a7b81`
- **J** opens project picker on issue page; arrow nav + Enter/Esc `15a1e26`
- **E** opens title/description editor; **Esc** cancels without navigating away `17b463b`
- J/K uses ID-based index (stable across grouped views) `36d435e`

### Pulse
- Activity heatmap with correct month labels, day alignment, and transparent out-of-range cells `a75cba8`
- Activity groups collapsed by default `725e388`
- Sun label at bottom of heatmap day column `202deb4`
- Year selector removed `a8226fc`

### Theme
- `ThemeSegmentedControl` extracted; System / Light / Night switcher `d0fa090`

### Production
- `Dockerfile`, `docker-compose`, `DEPLOY.md`, `CLAWTASK_PUBLIC_URL` env, standalone output `dfbdedc`

---

## 2026-04-30

### Features
- Full UI, agent adapter, task lifecycle `a4464e9`
- Mobile responsive layout + PWA support `939dd13`
- Live agent streaming on Pulse `6f99b9`
- Same-actor 5-min comment grouping; title/description inline editing `5ff5a28`
- Projects CRUD in Settings `4df926e`

### Bug fixes
- Mobile layout polish (hooks ordering, Pulse layout, BottomNav) `6adfa24`
- Flat timeline — each comment renders independently `737348c`
- ESC returns to issue list; J/K selection stable `a7daa1c`
- `Created by` derives from activity log `67d9536`
