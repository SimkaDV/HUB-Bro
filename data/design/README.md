# Shared design tokens

One design for two apps: **HUB BRO** (web, React + CSS Modules) and the bot's **manager app** (Flet, Python).
The look is HUB BRO's (see `hub-bro/docs/DESIGN.md`); the manager app is generated from the same values.

| File | What |
|------|------|
| `tokens.json` | The single source: colours, typography, radii, spacing, motion, status tones. |
| `build.mjs` | Generator (Node, no dependencies). |
| `logo.png` | HUB BRO logo (copy of `hub-bro/web/public/logo.png`, same file as `hub-bro/docs/brand/logo-reference.png`). The bot keeps its own `assets/icon.ico`. |

## Changing a colour (or any token)

1. Edit `tokens.json` (names = the CSS variables without `--`, e.g. `color.status.danger-bg`).
2. Run from the `avito` folder: `node data/design/build.mjs`
3. Both outputs are rewritten. `node data/design/build.mjs --check` only reports whether they are up to date (exit 1 if not).

Never edit the outputs by hand; they carry a "generated — do not edit" header.

## What is in tokens.json

- `color.surface` — `bg`, `card`, `overlay`, `paper`
- `color.text` — `text`, `text-secondary`
- `color.accent` — `button`, `on-button` (the hub's "accent" is black; no coloured accent)
- `color.border` — empty on purpose: the hub has no borders or shadows on cards
- `color.status` — `danger|success|warning|neutral` × `-bg|-text`
- `color.stock` — `stock-zero|low|mid|ok`, plus `stockLevels` (≤5 low, ≤10 mid)
- `statusTone` — which tone each order / unit status uses (reference copy of `hub-bro/web/src/shared/orders/statuses.ts` and `shared/stock/stock.ts`; the hub code stays the source of truth for that mapping)
- `typography` — Onest + fallbacks, the Google Fonts CSS URL the hub uses, the TTF URL Flet uses, sizes by role (12–30px), weights 400/500/600, `tabular-nums`; `mono` (Consolas) is manager-app only
- `radius` (`radius-card` 20, `radius-button` 12), `radiusExtra` (pill 999, small 8 — not CSS variables), `size` (`control-height` 44, `sidebar-width` 240), `space` (`space-1…8`), `motion` (`motion-expand`)
- `shadow` — none; `dark` — `null`: the hub is light only, so the manager app runs `ThemeMode.LIGHT`

## What each app gets

**HUB BRO** → `hub-bro/web/src/shared/styles/tokens.css`: the same 32 CSS custom properties with the same values as before the generator existed. Onest still comes from the Google Fonts `<link>` in `hub-bro/web/index.html`.

**Manager app** → `bot/manager-app/ui_theme.py`. Public API kept: `SANS`, `MONO`, `RADIUS` (20), `RADIUS_SMALL` (12), `LIGHT` (old keys, hub values), `DARK` (alias of `LIGHT`), `apply(page)`, `eyebrow(text)`, `page_title(text, label=…)`, `hint(text, **kw)`. New: `SANS_URL`, `RADIUS_PILL`, `CONTROL_HEIGHT`, `SPACE`, `STATUS`, `STOCK`, `STOCK_LOW/MID`, `ORDER_STATUS_TONE`, `UNIT_STATUS_TONE`, `stock_color(n)`.

Material role mapping (app code uses roles, never raw colours):

| Role | Token |
|------|-------|
| `PRIMARY` / `ON_PRIMARY` | `button` / `on-button` (black / white) |
| `SECONDARY`, `TERTIARY`, `ERROR` | `warning-text`, `success-text`, `danger-text` |
| `TERTIARY_CONTAINER`, `ERROR_CONTAINER` (+ `ON_…`) | `success-bg`, `danger-bg` (+ their `-text`) |
| `SECONDARY_CONTAINER` / `ON_…` | `button` / `on-button` — Material uses it for selection (nav-rail indicator), black like the hub's active items |
| `SURFACE`, scaffold | `bg` |
| `SURFACE_CONTAINER_LOWEST/LOW/…` | `card` |
| `SURFACE_CONTAINER_HIGH` | `bg` (a box or field on a card, like the hub's inputs) |
| `SURFACE_CONTAINER_HIGHEST` | `neutral-bg` |
| `ON_SURFACE`, `ON_SURFACE_VARIANT` | `text`, `text-secondary` |
| `OUTLINE`, `OUTLINE_VARIANT` | `text-secondary`, `card` (so card borders in app.py blend in — the hub has none) |

Buttons: `FilledButton` = hub primary (black, white text), `Button` = hub secondary (on `neutral-bg`, so it shows on both the page and a card), 12px radius, 16px text, 44px tall.

## Known differences between web and Flet

- **Font loading.** The hub loads a Google Fonts CSS URL; Flet's `page.fonts` needs a font file, so the app loads Onest as the variable TTF from the google/fonts GitHub repo (`typography.font.fletFontUrl`) at start. That URL was not fetched while setting this up (no downloads allowed), so check it once; offline or on failure Flutter falls back to the system font. With a variable font, older Flutter versions may ignore `FontWeight` (everything at the default weight).
- **Fallbacks.** Flet takes one font family; `system-ui, sans-serif` fallbacks are not expressible (Flutter uses the OS fallback for missing glyphs).
- **Tabular numbers** (`font-variant-numeric: tabular-nums`) are not applied globally in Flet.
- **Mono.** The hub has no monospace font; the manager app keeps Consolas (`MONO`) for the template editor and size grid.
- **Exact sizes.** Flet has no control-height token: buttons get 44px through padding (12px vertical + 16px text line), not a fixed height. Cards in `app.py` keep their own padding (20px) and an `OUTLINE_VARIANT` border, which is mapped to the card colour so it is invisible.
- **Overlay / motion.** `--overlay` and `--motion-expand` are web only; Flet uses its own dialog barrier and animations.
- **Status semantics.** Material has three accent roles; warning/success/danger map to secondary/tertiary/error. The neutral tone has no role — use `ui.STATUS["neutral"]` directly.
- `app.py` still says "light/dark follows Windows" in a comment at `ui.apply(page)`; the theme is now light only.
