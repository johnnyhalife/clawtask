# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Features
- `PulseView`: today's square in the contribution graph now has a thin border so the current day is immediately visible at a glance

### Code quality
- Bumped all sub-`0.75rem` font sizes to min `0.75rem` (12px) across TaskDrawer, TaskRow, TaskList, TopBar, PulseView, IssuePageClient, SettingsPageClient — 37 instances (`no-tiny-text`); 10 intentional exceptions kept (6 ALLCAPS group headers at `0.7rem`, 4 PulseView chart axis labels)
- `BottomNav`: replaced `0.45rem` chevron glyph with a 3px CSS dot indicator (`no-tiny-text`)
- `HomeContent`: use `Array.toSorted()` instead of spread+sort — avoids unnecessary array allocation (`js-tosorted-immutable`)
- `IssuePageClient` dropdown: lower `zIndex` from 100 → 50 — deliberate scale value (`no-z-index-9999`)
- `IssuePageClient` props pane: simplify transition from `max-width/min-width` to `width` (`no-layout-transition-inline`)
- `CreateTaskModal` overlay: add `onKeyDown` Escape handler (`click-events-have-key-events`)
- `CreateTaskModal` modal div: add `role="dialog"` + `aria-modal` + `onKeyDown` stop-propagation (`click-events-have-key-events`, `no-static-element-interactions`)

---

## 2026-05-12 (dep cleanup)

### Dependencies
- Removed unused `zod` dependency
- Upgraded `react-markdown` 9 → 10
- Upgraded `bcryptjs` 2 → 3

---

## 2026-05-12 (patch)

### Bug fixes
- Comment area on mobile now stacks correctly — textarea full width, hint and Send button below it
- Send button is full width on mobile with a taller tap target; compact and right-aligned on desktop
- `⌘/Ctrl+Enter` hint hidden on small screens where it doesn't apply

### Code quality
- BottomNav z-index values replaced with a deliberate scale (nav 10, backdrop 20, sheet 21) — no visual change, CreateTaskModal still layers correctly above
- Removed unused `Select` export from `Input.tsx`
- Removed `outline: none` from comment textareas — `focus-visible` ring handles keyboard focus

---

## 2026-05-12

### Bug fixes
- Empty-state CTA on projects with no issues now reads **Create Issue** instead of Create Agent
- Agent delete button in Settings → Agents is now always enabled regardless of probe status — broken agents can be cleaned up without needing API/DB workarounds
- Backlog status chip on the issue page now renders with the correct color (was showing white/empty)
- Closing the issue page no longer leaves Status or Priority dropdowns open in the background
- Human assignee on an in-progress task no longer locks the UI, hides the Cancel button, or disables property fields — that behaviour is now agent-only
- Keyboard shortcuts on the issue page (S, P, A, T, J) now close all other open dropdowns before opening the target one — previously multiple dropdowns could be open simultaneously, making Enter unpredictable
- Opening a ChipSelect dropdown via keyboard no longer steals focus back to the Status/Priority button when switching shortcuts
- Project picker keyboard navigation now opens with the highlight on the currently assigned project, making it intuitive to navigate to adjacent options or clear the project with ArrowUp → Enter

### UX improvements
- **T** keyboard shortcut opens the Tags dropdown on the issue page; **Esc** closes it; hover hint shown in the Properties pane (consistent with S, P, A, J)
- **⌘/Ctrl+Enter** hint added below comment textareas on both mobile and desktop layouts

### Dependencies
- **React 18 → 19** — migrated `forwardRef` to ref-as-prop in `Button`, `Input`, `TopBar`, `ChipSelect`; `useContext` replaced with `use()` in `ThemeProvider`
- **Next.js 14 → 15** — async params pattern applied across all dynamic API routes
- **TypeScript 5.9 → 6.0** — added `globals.css.d.ts` shim for TS6's stricter side-effect import enforcement
- **uuid 9 → 14**, **better-sqlite3 12.9 → 12.10**, **ws 8.20.0 → 8.20.1**, **postcss 8.5.12 → 8.5.14** (patch bumps, no code changes required)

### Code quality
- All `<img>` elements replaced with `next/image` across the codebase
- Page `<title>` and `<meta description>` added for home, issue, and settings pages
- Miscellaneous React Doctor improvements: `searchParams.get` binding, typographic punctuation, handler naming, unused exports removed

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
