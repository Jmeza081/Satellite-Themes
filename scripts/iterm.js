'use strict';

/**
 * iTerm2 colour scheme export.
 *
 *   node ./scripts/iterm.js            build, report contrast, always exit 0
 *   node ./scripts/iterm.js --strict   exit non-zero if the contract fails
 *   node ./scripts/iterm.js --check    verify the checked-in files are current
 *
 * Projects each palette marked `iterm:` in themes.yml onto iTerm2's colour
 * slots, using the map in src/iterm.yml and the same resolver the VS Code build
 * uses. Writes, per theme:
 *
 *   iterm/<id>.itermcolors   the scheme, importable by double-clicking
 *   iterm/themes.json        every theme, slot by slot, with measured contrast
 *   iterm/README.md          install instructions, generated so the prose
 *                            cannot drift from the files
 *
 * The contrast contract lives in src/iterm.yml and its thresholds come from
 * src/a11y.yml, so a terminal scheme is held to the same definition of AA as
 * the editor it was derived from.
 */

const { readSource } = require('./yaml');
const { createResolver } = require('./resolve');
const { parseHex } = require('./color');
const {
    loadThresholds,
    entriesFor,
    measure,
    report,
    write,
    stale,
    readmeDrift,
    footnote,
    footnotes,
} = require('./export');

/** iTerm names the sixteen ANSI slots positionally. */
const ansiKey = (index) => `Ansi ${index} Color`;

/** Reads iterm.yml and fails loudly on anything malformed. */
function loadContract() {
    const map = readSource('iterm.yml');
    if (!map || typeof map !== 'object') throw new Error('src/iterm.yml is empty');

    const { space = 'sRGB', ansi = [], chrome = {}, contrast = [], advisory = [] } = map;

    if (!Array.isArray(ansi) || ansi.length !== 16) {
        throw new Error(
            `src/iterm.yml: "ansi" must list exactly 16 colours, found ${
                Array.isArray(ansi) ? ansi.length : 'none'
            } — iTerm reads the cube positionally`,
        );
    }
    for (const key of Object.keys(chrome)) {
        if (/^Ansi \d+ Color$/.test(key)) {
            throw new Error(
                `src/iterm.yml: "${key}" belongs in "ansi", not "chrome" — declaring it ` +
                    `twice would let the cube and the chrome disagree`,
            );
        }
    }

    return {
        space,
        ansi,
        chrome,
        contrast,
        advisory,
        thresholds: loadThresholds(['text', 'nonText', 'dim']),
    };
}

/** Resolves one palette onto every iTerm slot. */
function buildTheme(entry, contract) {
    const tokens = readSource(entry.tokens);
    if (!tokens) throw new Error(`Palette ${entry.tokens} is empty`);
    const resolver = createResolver(tokens);

    const colors = {};
    contract.ansi.forEach((expr, index) => {
        colors[ansiKey(index)] = resolver
            .resolve(expr, `iterm.yml → ansi[${index}]`)
            .toUpperCase();
    });
    for (const [key, expr] of Object.entries(contract.chrome)) {
        colors[key] = resolver.resolve(expr, `iterm.yml → chrome.${key}`).toUpperCase();
    }

    const sources = {};
    contract.ansi.forEach((expr, index) => {
        sources[ansiKey(index)] = expr;
    });
    Object.assign(sources, contract.chrome);

    return {
        id: entry.id,
        label: entry.label,
        output: entry.iterm,
        source: entry.tokens,
        colors,
        sources,
    };
}

// -------------------------------------------------------------------- plist

const escapeXML = (value) =>
    String(value).replace(
        /[&<>]/g,
        (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch],
    );

/**
 * Formats a component the way Apple's plist serialiser does.
 *
 * Whole numbers get a decimal point so the value is unambiguously a real; the
 * rest are written at full double precision. Rounding these to a few places
 * would quantise the palette on import, which is the one thing a colour scheme
 * file must not do to itself.
 */
const component = (value) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

/** One `<key>…</key><dict>…</dict>` pair, with components in Apple's order. */
function colorEntry(key, hex, space) {
    const { r, g, b, a } = parseHex(hex);
    return [
        `\t<key>${escapeXML(key)}</key>`,
        '\t<dict>',
        '\t\t<key>Alpha Component</key>',
        `\t\t<real>${component(a)}</real>`,
        '\t\t<key>Blue Component</key>',
        `\t\t<real>${component(b)}</real>`,
        '\t\t<key>Color Space</key>',
        `\t\t<string>${escapeXML(space)}</string>`,
        '\t\t<key>Green Component</key>',
        `\t\t<real>${component(g)}</real>`,
        '\t\t<key>Red Component</key>',
        `\t\t<real>${component(r)}</real>`,
        '\t</dict>',
    ].join('\n');
}

/**
 * Renders the .itermcolors plist.
 *
 * Keys are sorted lexicographically, which is what Apple's serialiser emits and
 * therefore what iTerm writes when someone exports a scheme from the UI. That
 * puts "Ansi 10 Color" between "Ansi 1 Color" and "Ansi 2 Color", which looks
 * wrong and is correct: matching it means a scheme re-exported from iTerm
 * diffs cleanly against the one committed here.
 */
function renderPlist(theme, contract) {
    const keys = Object.keys(theme.colors).sort();
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        '<dict>',
        ...keys.map((key) => colorEntry(key, theme.colors[key], contract.space)),
        '</dict>',
        '</plist>',
        '',
    ].join('\n');
}

// ------------------------------------------------------------------ checking

function checkTheme(theme, contract) {
    const { thresholds, contrast, advisory } = contract;
    return report([
        ...measure(contrast, theme.colors, thresholds, { where: 'iterm.yml → contrast' }),
        ...measure(advisory, theme.colors, thresholds, {
            advisory: true,
            where: 'iterm.yml → advisory',
        }),
    ]);
}

// ------------------------------------------------------------ generated docs

function chromeTable(theme, contract) {
    const lines = ['| Slot | Colour | Token |', '| ---- | ------ | ----- |'];
    for (const key of Object.keys(contract.chrome)) {
        lines.push(`| ${key} | \`${theme.colors[key]}\` | \`${contract.chrome[key]}\` |`);
    }
    return lines.join('\n');
}

function ansiTable(theme, contract) {
    const lines = ['| | Normal | | Bright | |', '| - | ------ | - | ------ | - |'];
    const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
    names.forEach((name, index) => {
        const lo = theme.colors[ansiKey(index)];
        const hi = theme.colors[ansiKey(index + 8)];
        lines.push(`| ${name} | \`${lo}\` | ${index} | \`${hi}\` | ${index + 8} |`);
    });
    return lines.join('\n');
}

function contrastTable(report) {
    const lines = ['| Pair | Ratio | Required | |', '| ---- | ----- | -------- | - |'];
    const notes = [];

    for (const row of report.rows) {
        const label = `${row.label}${footnote(notes, row.because)}`;
        const required = row.advisory
            ? `${row.threshold.toFixed(1)} (advisory)`
            : row.threshold.toFixed(1);
        const mark = row.ok ? '✓' : row.advisory ? '—' : '✗';
        lines.push(`| ${label} | ${row.ratio.toFixed(2)}:1 | ${required} | ${mark} |`);
    }

    return lines.join('\n') + footnotes(notes);
}

function renderReadme(built, contract) {
    const sections = built
        .map(
            ({ theme, report }) => `## ${theme.label}

[\`${theme.output.split('/').pop()}\`](./${theme.output.split('/').pop()}) — built from \`src/${theme.source}\`

<img src="../assets/iterm-${theme.id}.png" alt="${theme.label} in iTerm2" width="640">

${ansiTable(theme, contract)}

${chromeTable(theme, contract)}

<details>
<summary>Contrast</summary>

${contrastTable(report)}

</details>
`,
        )
        .join('\n');

    return `# Satellite for iTerm2

<!-- Generated by scripts/iterm.js. Edit src/iterm.yml, not this file. -->

All five Satellite palettes as iTerm2 colour schemes. The sixteen ANSI colours
are the same values \`src/ui.yml\` gives to VS Code's integrated terminal, so a
shell prints identically in both.

<p align="center">
  <img src="../assets/iterm-satellite-nebula.png" alt="Satellite Nebula in iTerm2" width="760">
</p>

## Installing

1. Download the \`.itermcolors\` file you want, or clone this repository.
2. Double-click it. iTerm2 imports it as a colour preset — nothing changes yet.
3. Open **Settings → Profiles → Colors**, then pick the scheme from the
   **Color Presets…** menu at the bottom right.

Presets apply per profile, not globally, so a profile you use for something
else keeps its own colours. To make it the default, apply it to the profile
marked *Default* in the profile list.

Importing does not overwrite a preset of the same name from a previous
version — iTerm keeps both and appends a number. Delete the old one from
**Color Presets… → Delete Preset** if you are updating.

## Sharing

The \`.itermcolors\` file is the whole scheme; send it as a file and the
recipient double-clicks it. There is nothing to install and no preferences are
read or written until they pick the preset.

${sections}
## Notes on the map

The reasoning for each slot is in \`src/iterm.yml\`, next to the value. Three
are worth repeating:

- **Bold text takes the body colour, not a brighter one.** The obvious value is
  the bright-white corner of the cube, which lifts bold on a dark ground — and
  on the light palettes makes bold render *paler* than body text. Bold is
  carried by weight.

- **Selection is translucent**, as it is in the editor, so text under it stays
  legible instead of being replaced by a solid band. The contract measures the
  selected text over the composited result rather than over the raw wash.

- **\`Tab Color\` is deliberately unset.** iTerm only honours it when a profile
  ticks *Use tab color*, and a scheme that silently repaints the tab bar on
  import is one people have to undo by hand.

One shortfall is reported on every build rather than exempted: the corner of
the ANSI cube nearest the ground — black on the dark palettes, bright white on
the light ones — sits below AA at the documented \`dim\` floor in
\`src/a11y.yml\`. It cannot reach 4.5:1 without ceasing to be the colour it
names, and the 2019 palette this replaced had ANSI black at 1.08:1, where
anything printing in black printed nothing.

## Rebuilding

\`\`\`sh
npm run iterm           # rebuild and report contrast
npm run iterm:strict    # rebuild and fail the build on a contract failure
npm run iterm:check     # assert the checked-in files match src/
\`\`\`
`;
}

// ---------------------------------------------------------------------- build

function buildAll() {
    const contract = loadContract();
    const built = entriesFor('iterm').map((entry) => {
        const theme = buildTheme(entry, contract);
        return { theme, report: checkTheme(theme, contract) };
    });

    const files = new Map();
    for (const { theme } of built) {
        files.set(theme.output, renderPlist(theme, contract));
    }

    files.set(
        'iterm/themes.json',
        JSON.stringify(
            {
                $comment:
                    'Generated by scripts/iterm.js — edit src/iterm.yml, not this file.',
                space: contract.space,
                themes: built.map(({ theme, report }) => ({
                    id: theme.id,
                    label: theme.label,
                    source: theme.source,
                    output: theme.output,
                    colors: theme.colors,
                    contrast: report.rows.map((row) => ({
                        foreground: row.fg,
                        background: row.bg,
                        over: row.on,
                        ratio: Number(row.ratio.toFixed(2)),
                        level: row.level,
                        threshold: row.threshold,
                        advisory: row.advisory,
                        passes: row.ok,
                    })),
                })),
            },
            null,
            4,
        ) + '\n',
    );

    files.set('iterm/README.md', renderReadme(built, contract));

    return { contract, built, files };
}

/**
 * What the root README must still quote for each theme.
 *
 * A terminal scheme has no paste string, so there is nothing to copy — but the
 * root README does quote each theme's ground, which is the value most likely to
 * be edited by hand and the one a reader compares against a screenshot.
 */
function snippets(built) {
    return built.map(({ theme }) => ({
        label: theme.label,
        snippet: theme.colors['Background Color'],
    }));
}

module.exports = { buildAll, buildTheme, checkTheme, loadContract, renderPlist };

// ----------------------------------------------------------------------- cli

if (require.main === module) {
    const argv = process.argv.slice(2);
    const strict = argv.includes('--strict');
    const check = argv.includes('--check');

    try {
        const { built, files } = buildAll();

        if (check) {
            const outdated = stale(files);
            const drifted = readmeDrift(snippets(built));
            if (outdated.length > 0) {
                process.stderr.write(
                    `\niTerm export is out of date — run \`npm run iterm\` and commit:\n` +
                        outdated.map((f) => `  ${f}\n`).join(''),
                );
            }
            if (drifted.length > 0) {
                process.stderr.write(
                    `\nREADME.md quotes a stale terminal ground — update it to:\n` +
                        drifted.map((d) => `  ${d.label}: ${d.snippet}\n`).join(''),
                );
            }
            if (outdated.length > 0 || drifted.length > 0) process.exit(1);
            process.stdout.write('  iTerm export is up to date\n');
            process.exit(0);
        }

        for (const relative of write(files)) {
            process.stdout.write(`  wrote ${relative}\n`);
        }

        let failures = 0;
        for (const { theme, report } of built) {
            failures += report.failures;
            const worst = report.rows
                .filter((row) => !row.advisory)
                .reduce((a, b) => (a.ratio <= b.ratio ? a : b));
            process.stdout.write(
                `\n  ${theme.label.padEnd(34)} ${theme.output}\n` +
                    `    ground ${theme.colors['Background Color']}   ` +
                    `${report.checks} checks, ` +
                    `worst ${worst.ratio.toFixed(2)}:1 (${worst.label})\n`,
            );
            for (const row of report.rows.filter((r) => !r.ok || r.advisory)) {
                const mark = row.ok ? 'pass' : row.advisory ? 'note' : 'FAIL';
                process.stdout.write(
                    `    ${mark}  ${String(row.ratio.toFixed(2)).padStart(6)}:1  ` +
                        `(needs ${row.threshold.toFixed(1)})  ${row.label}\n`,
                );
            }
        }

        const drifted = readmeDrift(snippets(built));
        for (const { label, snippet } of drifted) {
            process.stdout.write(
                `\n  README.md does not quote the current ${label} ground: ${snippet}\n`,
            );
        }

        if (failures > 0) {
            process.stdout.write(
                `\n  ${failures} contrast check${failures === 1 ? '' : 's'} failed\n`,
            );
        } else {
            process.stdout.write('\n  Every gated contrast check passed\n');
        }

        if (strict && (failures > 0 || drifted.length > 0)) process.exit(1);
    } catch (err) {
        process.stderr.write(`\niTerm export failed: ${err.message}\n`);
        process.exit(1);
    }
}
