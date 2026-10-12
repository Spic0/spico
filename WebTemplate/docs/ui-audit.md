# Spico — UI/UX Audit & Enterprise Polish Program (Phase 1)

Status: **audit complete, no implementation started** (per the program brief: no fixes until
the audit is done). This document is the source of truth for the 12-phase enterprise-polish
program. Every fix below must reuse the existing Bootstrap 5 + SCSS design language — never
introduce Tailwind/Material/shadcn/Radix/Ant, never a second design language, never generic
AI-generated UI. The `intellect-ai-dashboard-template` in `styles/` is the visual source of
truth; Spico's additions live in `styles/spico.scss`.

## 1. Method & scope

Audited the live design system substrate (`styles/default/_variables.scss`,
`styles/elements/*`, `styles/spico.scss`), the five layout components
(`components/layout/*`), and a cross-section of the ~60 app routes. Findings below are
grounded in concrete file references and counts, not impressions.

## 2. Design-system foundation — what already exists (reuse, don't reinvent)

**Tokens present** (`styles/default/_variables.scss`): `--color-primary` (#3F3EED),
`--color-primary-2`, `--color-secondary`, `--color-body` (#497696), `--color-heading-1`
(#083A5E), `--color-white`, semantic notify colors (`--color-success` #3EB75E,
`--color-danger` #FF0003, `--color-warning` #FF8F3C, `--color-info` #1BA2DB), a full
font-weight scale, `--transition: 0.3s`, and heading-size tokens.

**Primitives present and reusable:**
- Buttons (`styles/elements/_buttons.scss`): `.rts-btn` base + `.btn-primary`, `.btn-blur`,
  `.btn-lonly` (text/link), `.btn-border-p` (outline). A `.btn-secondary` exists but only
  inside the `.index-three` marketing context.
- **CSS-only tooltip** (`styles/elements/_tooltip.scss`): `.openuptip[tooltip][flow=up|down|left|right]`
  — attribute-driven, animated, themed to `--color-primary`. **Directly reusable for Phase 4
  collapsed-sidebar tooltips.**
- Theme plumbing (`components/layout/ThemeProvider.tsx`): light/dark via
  `document.documentElement[data-theme]` + `localStorage`, plus a `sidebarCollapsed` flag.
- In-page tabs (`components/layout/TabNav.tsx` → `.spico-tab-nav`).

**Spico component classes** (`styles/spico.scss`): `.spico-panel`, `.spico-callout`,
`.spico-kpi-card`/`.spico-kpi-row`, `.spico-table`, `.spico-badge`/`.spico-badge-active`,
`.spico-completion-bar`, `.spico-plain-list`, `.spico-settings-form`, `.spico-thread`,
`.spico-plan-grid`, `.spico-faq`, `.spico-key-reveal`.

## 3. Root-cause findings (systemic — fix these and most symptoms disappear)

### RC-1 — Hardcoded light-mode hex instead of theme tokens (CRITICAL)
`styles/spico.scss` hardcodes `#fff`, `#E5E4FF` (borders), `#F7F7FF`/`#FBFBFF`/`#F1F0FF`
(surfaces), `#497696`, `#1F1F25` throughout — **19 occurrences of `#E5E4FF` alone**. These
are not tokens, so they cannot adapt to dark mode and drift from the template palette. This is
the single highest-leverage defect: it is simultaneously the cause of the dark-mode breakage
(RC-2) and the blocker to component consistency.

### RC-2 — Dark mode is per-selector patching of dead selectors (CRITICAL)
`styles/elements/_dark-version.scss` is ~300 lines of hardcoded, `!important`-laden overrides
targeting the **original template's demo pages** (chatbot, image generator, audio player,
pricing) — most of which no longer exist in Spico. Meanwhile **not one** Spico class
(`.spico-panel`, `.spico-kpi-card`, `.spico-table`, `.spico-callout`, `.spico-badge*`,
`.spico-thread`, `.spico-plan-card`) has any `[data-theme="dark"]` rule. Result: in dark mode
every Spico surface stays white with dark text on a dark page — the reported "dark mode is
broken." The brief's instruction is correct: **do not patch bugs; introduce a semantic token
layer** and delete the dead overrides.

### RC-3 — One button variant for every semantic (HIGH)
**93 occurrences of `rts-btn btn-primary` across 55 files; essentially 100% are `btn-primary`.**
Destructive actions (`revokeMemberAction` "Revoke", "Remove test data", cancel/no-show),
secondary actions ("Update", "Assign"), and true primary CTAs are all the same blue button.
No danger/secondary/ghost differentiation exists in usage. This is a usability and safety
problem (a destructive action must not look like a primary one), not just cosmetic.

### RC-4 — Ad-hoc inline styling (MEDIUM)
**43 inline `style={{…}}` blocks across 25 files** — status colors
(`admin/system-health` `StatusBadge`, `hotel.status` `textTransform: capitalize`), spacing,
icon sizing. Each is a one-off that should collapse into a shared class/token.

## 4. Findings by the brief's 15 inconsistency categories

| # | Category | Finding | Severity |
|---|---|---|---|
| 1 | Duplicated icons | Font Awesome used consistently, but weight is mixed: `fa-solid` in nav/pages vs `fa-light` in `TopBar` profile menu. Pick one weight per role. | Low |
| 2 | Duplicated button styles | RC-3: single `btn-primary` for all semantics. No danger/secondary/ghost/icon/loading button. | High |
| 3 | Duplicated cards | Three overlapping card idioms: `.spico-panel`, `.spico-kpi-card`, `.spico-callout` + `.spico-plan-card`. Overlapping padding/radius/border, no shared base. | Medium |
| 4 | Inconsistent spacing | Mix of template `mt--20/30` utilities, bespoke `.mt--10/.mb--10` in spico.scss, and inline margins. No single spacing scale applied. | Medium |
| 5 | Inconsistent typography | Pages use raw `<h4 className="title">`/`<h5>` with `.spico-muted` for body; heading hierarchy per page is ad-hoc. | Medium |
| 6 | Inconsistent modals | **No modal/drawer primitive at all** (react-bootstrap JS was removed in M1). Confirmations are inline checkboxes (`test-data`) or plain buttons. Brief's Phase 3 wizard + Phase 2 drawer/side-panel need a native primitive. | High |
| 7 | Inconsistent forms | Two idioms: `.spico-settings-form > .input-wrapper` (labelled, spaced) vs bare `.input-wrapper`/inline inputs (team invite, filters). No helper-text/error/success/counter pattern. | High |
| 8 | Inconsistent tables | `.spico-table` is actually consistent — the one bright spot. Empty-row handling differs (colSpan counts hand-computed). | Low |
| 9 | Inconsistent dropdowns | Native `<select>` everywhere (fine, keep native) but unstyled beyond browser default; TopBar profile menu is a bespoke show/hide `div`. | Medium |
| 10 | Inconsistent badges | `.spico-badge` (grey pill) vs `.spico-badge-active` (primary pill) reused as a generic status chip in unrelated places (settings status, system-health). No success/warning/danger/info chip variants. | High |
| 11 | Inconsistent status colors | Status is mostly **plain text** (`membership.status`, reservation `status`, call `disposition`) with occasional inline color (`system-health`). No shared status→color mapping. | High |
| 12 | Inconsistent empty states | **~40 empty states, all bare text** ("No X yet." in `<td colSpan>` or `<p>`). Zero illustration/title/description/CTA. Highest-volume consistency gap. | High |
| 13 | Inconsistent loading | **No loading/skeleton anywhere.** Server components render fully-formed; there are no `loading.tsx` files and no skeleton primitives. Phase 9 is greenfield. | Medium |
| 14 | Inconsistent hover/animation | `.rts-btn` has `transition .3s`; `.spico-tab-nav-item`/sidebar have hover states; most Spico cards/rows have none. Inconsistent presence, not conflicting values. | Low |
| 15 | Inconsistent focus/a11y | Buttons rely on browser focus ring; custom interactive `div`s (TopBar menu) lack full keyboard handling; collapsed sidebar has no accessible label/tooltip. | Medium |

## 5. Target component standard (Phase 2 spec — to build, all token-driven & theme-aware)

Introduce a **semantic token layer** first (the substrate for everything else):

```
--surface-1 / --surface-2 / --surface-raised   (page, card, popover backgrounds)
--border-subtle / --border-strong
--text-strong / --text-body / --text-muted
--status-success/-warning/-danger/-info/-neutral  (bg + fg pairs)
--radius-sm/-md/-lg, --shadow-sm/-md/-lg, --space-1..6
```
Each flips under `[data-theme="dark"]`. `spico.scss` is refactored to consume these (removing
every hardcoded hex from RC-1), and the dead `_dark-version.scss` overrides are deleted.

Then standardize, each with consistent padding/radius/border/shadow/hover/focus/active/disabled/animation:
- **Buttons**: `.btn-primary` (keep) + add `.btn-secondary` (outline, promote from index-three),
  `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-warning`, icon-button, `is-loading`
  (spinner), `:disabled`. All on the existing `.rts-btn` base.
- **Card**: one `.spico-card` base; `.spico-panel`/`.spico-kpi-card`/`.spico-callout` become
  modifiers of it.
- **Status chip**: `.spico-chip` + `--status-*` modifiers, with a single TS `statusChip(status)`
  mapper so reservation/call/membership/hotel statuses colour consistently everywhere.
- **Form field**: one `.spico-field` (label + description + control + helper/error/success +
  optional counter). Absorbs `.spico-settings-form`.
- **Empty state**: `.spico-empty` (icon + title + description + primary/secondary CTA) — one
  React component, replacing all ~40 bare-text cases.
- **Skeleton**: `.spico-skeleton` shimmer + `loading.tsx` per heavy route.
- **Tooltip**: reuse `.openuptip[tooltip][flow]` — no new primitive.
- **Tabs/Badges/Alerts/Pagination/Breadcrumbs/Drawer/Accordion**: build on the token layer;
  Accordion reuses the native `<details>` `.spico-faq` pattern.

## 6. Recommended implementation sequencing (by dependency, not brief order)

The brief's phase numbers are a checklist, not a build order. Dependency-correct sequence:

1. **Foundation — token layer + dark-mode refactor** (brief Phases 5 + 2-substrate). Highest
   leverage: fixes RC-1 + RC-2 at the root and unblocks everything else. Delete dead
   `_dark-version.scss` overrides; add system/light/dark (currently only light/dark toggle).
2. **Component standardization** (Phase 2): buttons (RC-3), cards, chips/status colors, forms.
   Mechanical, high-visibility, touches the 55 button files.
3. **Empty states + loading/skeletons** (Phases 8 + 9): ~40 sites, one component each.
4. **Sidebar + tooltips + micro-interactions + a11y** (Phases 4 + 10 + 11): reuse existing
   tooltip primitive; fix collapsed-mode + focus.
5. **Notification system** (Phase 6): new client primitive (queue/history/undo), token-driven.
6. **Wizard framework** (Phase 3): the largest new build; depends on forms + buttons + modal.
   Reusable engine, then migrate create/import flows onto it.
7. **AI experience patterns** (Phase 12): AI status/thinking/confidence/agent cards on the
   token layer.

Each step ships independently, keeps `build`/`tsc`/`lint` green, and changes no behaviour,
routing, RBAC, or data — purely presentational.

## 7. Guardrails (apply to every step)

- Reuse existing tokens/primitives before adding anything; no second design language.
- No new dependencies (no UI kit). Native `<details>`, native `<select>`, CSS tooltip stay.
- Preserve the M1 decision to avoid react-bootstrap JS — wizard/drawer/notifications are
  React 19 + CSS, not a component library.
- No visual regression to the existing light theme; dark theme reaches parity.
- Keep changes presentational: no server-action, RLS, or route changes.
