# Changelog

All notable changes to Satellite are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Satellite for Slack.** The two dark palettes now also build to Slack
  sidebar themes, committed to `slack/` as paste strings. Same
  `src/tokens-*.yml`, same resolver, same rule that nothing outside a palette
  file may hold a literal hex — so the Slack column and the VS Code side bar
  are the same colour to the byte, and a palette change moves both products at
  once. Only the dark variants export: a Slack custom theme colours the sidebar
  while the message pane follows Slack's own Appearance setting, so a light or
  high-contrast column could be paired with either pane and could not be held
  to the contrast contract.

    The slot map is [`src/slack.yml`](./src/slack.yml), with the reasoning
    written next to each value. Two slots depart from the editor mapping. The
    active channel takes `accent.base` rather than the `surface.overlay` VS Code
    uses for a selected row — Slack draws no focus outline, so the colour carries
    the whole affordance, and the raised surface measures 1.5:1 against the
    column where the accent measures 7:1. The mention badge takes `accent.solid`
    rather than `status.error`, because Slack always draws the count in white and
    the error red holds white at only 3.2:1.

    The contrast contract is declared alongside the map and reads its thresholds
    from `src/a11y.yml`, so Slack and VS Code are held to one definition of AA.
    `yarn slack:strict` measures every declared pair and fails the build;
    `yarn test` now runs it. One shortfall is reported rather than exempted: the
    badge fill sits at 2.7:1 against the column, under the 3:1 non-text floor,
    because it is the one fill dark enough to hold Slack's white count at AA —
    the numeral carries the meaning and clears 15:1.

- `yarn slack`, `yarn slack:check` and `yarn slack:preview`. The first rebuilds
  `slack/` and reports contrast, the second asserts the committed files match
  `src/`, and the third re-renders the sidebar mock-ups in `assets/`. The mocks
  are drawn from the eight theme colours and nothing else, and reproduce the
  two behaviours Slack imposes on any theme — read channels dimmed below the
  declared text colour, and a mention count that is always white.

- `slack/README.md`, generated on every build so the paste strings in the prose
  cannot drift from the ones in the files.

- **Satellite for iTerm2.** All five palettes now also build to
  `.itermcolors` colour schemes, committed to `iterm/`. Unlike the Slack export
  this is close to a direct port: the palettes have carried a full ANSI ramp
  since the 2019 audit found ANSI black printing at 1.08:1, and `src/a11y.yml`
  has held every one of those sixteen to a floor against the terminal ground
  ever since. The values are the ones `src/ui.yml` gives VS Code's integrated
  terminal, so a shell prints identically in both.

    All five export, where only the dark two go to Slack. A terminal scheme sets
    its own ground, so it cannot be paired with a surface it was not graded
    against — the constraint that ruled out a light Slack column does not apply.

    The work is in the chrome slots iTerm has and VS Code does not, mapped in
    [`src/iterm.yml`](./src/iterm.yml). Three are worth noting. Bold text takes
    the body colour rather than the bright-white corner of the cube, which would
    make bold render _paler_ than body text on the light palettes. The badge is
    opaque: iTerm's own is translucent and the first draft followed it, measuring
    between 2.4:1 and 4.5:1 across the palettes, and since badge glyphs cover the
    same area either way the alpha was buying nothing. `Tab Color` is left unset,
    because iTerm only honours it when a profile opts in and a scheme that
    repaints the tab bar on import is one people have to undo by hand.

    `yarn iterm:strict` runs 23 contrast checks per scheme and fails the build;
    `yarn test` now runs it. Selection is measured over the composited wash
    rather than the raw translucent value, which is what a reader actually sees.
    Components are written in sRGB rather than the Calibrated space older schemes
    in the wild use, because the same numbers render differently in the two and a
    scheme graded in one is not the scheme that was verified.

- `scripts/export.js`, holding what the Slack and iTerm exports share: reading
  thresholds out of `a11y.yml`, measuring a declared pair list, and refusing to
  let a generated file or a hand-quoted README value drift from `src/`. Both
  contracts now use the same `{ fg, bg, level, as }` shape `a11y.yml` already
  used, so the three read alike. An exporter that measures contrast its own way
  is one that will eventually disagree with the others about what AA means.

- `yarn iterm`, `yarn iterm:check` and `yarn iterm:preview`, mirroring the
  Slack commands. The previews render a mock session rather than a colour grid,
  so the block cursor, a selection with text inside it, and a link are all
  visible — and the ANSI ramp along the bottom includes the corner nearest the
  ground, which is the one that cannot reach AA and therefore the one a preview
  should not quietly leave out.

## [2.19.0] — 2026-08-13

The theme was rebuilt for publication: re-graded against WCAG 2.2 and
colour-vision simulation, extended across the web stack, and given the light and
high-contrast companions it never had. The dark theme keeps the name
`Satellite`, so an existing `workbench.colorTheme` setting continues to work.

### Added

- **Satellite Nebula**, a second dark theme: neon on a violet ground, lit by
  blood orange and gold. Every surface sits on the same short 285°–302° arc and
  is separated by lightness rather than hue, and the ground runs darker than the
  other dark variants — neon is a contrast effect before it is a saturation one,
  and the darker ground is what lets the syntax roles sit at the sRGB gamut edge
  and still clear AA. Held to the same AA floor and the same adjacency contract
  as the rest; nothing is exempted for it. Saturation costs separation rather
  than earning it, so three roles are deliberately held off the gamut edge —
  comments, punctuation and tags — while the rest run as saturated as their hue
  allows. Identifiers are lilac, on the ground's own hue rather than in the warm
  or the cool camp; the warm band carries three roles and no more, because
  orange and gold collapse toward the same yellow without the red or green
  channel.
- **Satellite Daybreak**, a light theme. Not an inversion — hues are held from
  the dark theme, but chroma rises and lightness drops, because a colour needs
  more saturation to read as itself against white.
- **Satellite High Contrast** and **Satellite Daybreak High Contrast**, held to
  WCAG AAA with the decorative exemptions withdrawn, so indent guides and rulers
  must meet 3:1 like any other boundary.
- **Semantic highlighting.** The 24 standard token types and their modifiers are
  mapped to the palette, so TypeScript, JavaScript, Go, Rust, C#, Java and Python
  are coloured by what the language server resolved rather than what the grammar
  guessed. Deprecated symbols are struck through rather than recoloured, so the
  signal does not depend on colour perception.
- **Bracket pair colourisation**, six stops spread across hue and lightness.
- Coverage for Vue, Svelte, Astro, Prisma, Tailwind, TOML, Rust lifetimes and
  macros, and Python decorators.
- Post-2019 UI surface: sticky scroll, inlay hints, ghost text and inline edits,
  the command centre, notebooks, testing and coverage, the merge and multi-diff
  editors, chat and inline chat, keybinding labels, banners, profile badges, the
  source-control graph and terminal decorations. 184 colour keys became 821.
- A build that can prove all of the above: `yarn verify` runs 419 contrast and
  colour-vision checks, and `yarn fixtures` resolves 101 language scope stacks
  against the theme's own rules. Both fail the build on regression.
- Generated brand artwork and README captures. `yarn brand` draws the icon and
  banner from the palette and `yarn screenshots` captures one editor per theme,
  so neither can drift out of step with the colours the way hand-drawn artwork
  and hand-taken screenshots silently do.

### Changed

- **Comments** lifted from 2.39:1 to 4.68:1. They were below the point of
  invisibility for many readers.
- **Activity bar icons** lifted from 1.92:1 to 7.03:1. The primary navigation was
  effectively unreadable.
- **Status bar text** lifted from 3.57:1 to 5.34:1, by splitting the sea green
  into a light stop that can be read as text and a deep stop that can hold text
  as a fill. The 2019 palette had one stop that could do neither.
- **Variables and constants** were 1.1 ΔE apart under tritanopia — effectively
  one colour, because they sat at near-identical lightness. Six other pairs
  collapsed similarly. Every adjacency is now separated by lightness.
- **JSON keys** moved off the type colour onto the identifier colour, in every
  theme. A JSON key is an object property, and object properties already used
  that role, so the same concept was one colour in a `.ts` file and another in a
  `.json` file — and in a document that is nothing but keys and values, keys and
  string values sat on neighbouring hues. CSS and SCSS property names share the
  scope but are genuinely built-ins, so the rule is scoped to `source.json` and
  they are unchanged.
- **The status bar** now resolves through a per-theme `chrome.statusBar` token
  rather than the accent. Only Nebula changes, where the accent as a permanent
  band along the window read as an alarm that never clears; the four other
  themes set the token to their existing accent and are unchanged. Every state
  that signals — debugging, errors, warnings, offline — keeps its own key.
- **Punctuation** moved off the keyword gold onto a neutral slate. Gold now
  means keyword.
- **Attribute names** moved off the string green, so `class="btn"` no longer
  renders the name and its value identically.
- **Types** split from functions and keep italic as a second, non-colour cue.
- **Body text** changed from `#FFFFFF` to `#E8EEF1` — still 13.2:1, with less
  halation against the low-chroma ground.
- **Terminal colours** are Satellite's own rather than Dracula's. ANSI black was
  1.08:1 against the terminal background, so anything printing in black printed
  nothing.
- Italics narrowed to types, parameters, prose markup and error indicators.

### Fixed

- 55 colour keys were declared with no value and emitted as `null` into the
  theme JSON.
- 12 keys had not existed in VS Code for years, including the entire singular
  `notification.*` namespace. Notifications are restyled on the current keys.
- `support.constant` was matching CSS, painting every keyword value such as
  `flex` or `none` the tag colour. The rule is PowerShell-specific and is now
  scoped to it.
- Component tags in Svelte and Astro are scoped `support.class.component`, not
  `entity.name.tag`, so a component and a plain element were different colours.
- Vue's `:`, `@` and `#` attribute shorthands matched no rule at all and fell
  back to plain text, splitting `:class` into two colours.
- Astro expression delimiters, Python decorators, Rust macros and Rust lifetimes
  each disagreed with their equivalent in another language.
- The workaround for [microsoft/vscode#4795](https://github.com/microsoft/vscode/issues/4795)
  is retired; that issue closed years ago and quotes inherit the string colour.

### Removed

- Per-dialect `variable.other.constant.{js,ts,tsx}` overrides, which existed to
  work around the grammar guessing "constant" from ALL_CAPS naming. The
  TypeScript server reports this correctly and semantic highlighting now handles it.
