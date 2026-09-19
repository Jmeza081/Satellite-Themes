'use strict';

/**
 * Slack sidebar theme export.
 *
 *   node ./scripts/slack.js            build, report contrast, always exit 0
 *   node ./scripts/slack.js --strict   exit non-zero if the contract fails
 *   node ./scripts/slack.js --check    verify the checked-in files are current
 *
 * Projects each palette marked `slack:` in themes.yml onto the eight slots of
 * a Slack custom theme, using the map in src/slack.yml and the same resolver
 * the VS Code build uses. Writes, per theme:
 *
 *   slack/<id>.txt     the paste string, on its own line
 *   slack/themes.json  every theme, slot by slot, with the measured contrast
 *   slack/README.md    install and share instructions, generated so the
 *                      strings in the prose cannot drift from the build
 *
 * The contrast contract lives in src/slack.yml and its thresholds come from
 * src/a11y.yml, so a Slack theme is held to the same definition of AA as the
 * editor it was derived from.
 */

const { readSource } = require('./yaml');
const { createResolver } = require('./resolve');
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

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Reads slack.yml, and fails loudly on anything malformed. */
function loadContract() {
    const map = readSource('slack.yml');
    if (!map || typeof map !== 'object') throw new Error('src/slack.yml is empty');

    const { order, labels = {}, slots = {}, contrast = [], advisory = [] } = map;

    if (!Array.isArray(order) || order.length !== 8) {
        throw new Error(
            `src/slack.yml: "order" must list exactly 8 slots, found ${
                Array.isArray(order) ? order.length : 'none'
            } — Slack reads the paste string positionally`,
        );
    }
    for (const slot of order) {
        if (!(slot in slots))
            throw new Error(`src/slack.yml: slot "${slot}" has no colour`);
        if (!(slot in labels))
            throw new Error(`src/slack.yml: slot "${slot}" has no label`);
    }
    for (const slot of Object.keys(slots)) {
        if (!order.includes(slot)) {
            throw new Error(
                `src/slack.yml: slot "${slot}" is defined but not in "order", so it would never be written`,
            );
        }
    }

    return { order, labels, slots, contrast, advisory, thresholds: loadThresholds() };
}

/**
 * Resolves one palette onto the eight slots.
 *
 * Slack's parser takes plain #RRGGBB. Alpha would be accepted into the field
 * and then dropped, which is worse than refusing it, so an eight-digit colour
 * is a build error rather than something to trim silently.
 */
function buildTheme(entry, contract) {
    const tokens = readSource(entry.tokens);
    if (!tokens) throw new Error(`Palette ${entry.tokens} is empty`);
    const resolver = createResolver(tokens);

    const colors = {};
    for (const slot of contract.order) {
        const expr = contract.slots[slot];
        const value = resolver.resolve(expr, `slack.yml → slots.${slot}`);
        if (!HEX.test(value)) {
            throw new Error(
                `slack.yml → slots.${slot}: resolved to ${value}, but Slack only accepts ` +
                    `opaque #RRGGBB — drop the alpha() wrapper`,
            );
        }
        colors[slot] = value.toUpperCase();
    }

    return {
        id: entry.id,
        label: entry.label,
        output: entry.slack,
        source: entry.tokens,
        colors,
        string: contract.order.map((slot) => colors[slot]).join(','),
    };
}

/** Runs the declared contrast checks against one built theme. */
function checkTheme(theme, contract) {
    const { thresholds, contrast, advisory } = contract;
    return report([
        ...measure(contrast, theme.colors, thresholds, { where: 'slack.yml → contrast' }),
        ...measure(advisory, theme.colors, thresholds, {
            advisory: true,
            where: 'slack.yml → advisory',
        }),
    ]);
}

// ---------------------------------------------------------------- generated docs

function slotTable(theme, contract) {
    const lines = ['| # | Slot | Colour | Token |', '| - | ---- | ------ | ----- |'];
    contract.order.forEach((slot, index) => {
        lines.push(
            `| ${index + 1} | ${contract.labels[slot]} | \`${theme.colors[slot]}\` | ` +
                `\`${contract.slots[slot]}\` |`,
        );
    });
    return lines.join('\n');
}

/**
 * The contrast table, with advisory reasoning moved out to footnotes.
 *
 * An advisory note is a paragraph — it has to justify itself — and a paragraph
 * inside a table cell makes the whole table unreadable. The measurement stays
 * in the row; the argument moves below it.
 */
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

<img src="../assets/slack-${theme.id}.png" alt="${theme.label} as a Slack sidebar" width="270" align="right">

\`\`\`
${theme.string}
\`\`\`

${slotTable(theme, contract)}

${contrastTable(report)}

<br clear="right">
`,
        )
        .join('\n');

    return `# Satellite for Slack

<!-- Generated by scripts/slack.js. Edit src/slack.yml, not this file. -->

Two of the Satellite palettes, projected onto Slack's eight sidebar colours.
The values come from the same \`src/tokens-*.yml\` the VS Code themes are built
from, resolved through the same code — so the Slack column and the editor side
bar are the same colour to the byte, and a palette change moves both.

## Installing

1. Open Slack → **Preferences** → **Themes**.
2. Set **Appearance** to **Dark**. This step is not optional and it is not part
   of the theme string: a custom theme colours the sidebar only, and the message
   pane follows this setting. Skipping it leaves a dark column beside a white
   pane, which is the usual reason a dark Slack theme looks broken.
3. Scroll to the bottom of the theme list and open **Create a custom theme**.
4. Paste the string for the theme you want into the box beneath the swatches.

Preferences are per-account, so this is applied once per workspace you are
signed in to. On iOS and Android the same box lives under
**You → Preferences → Dark Mode / Themes**.

## Sharing

Paste the string into any Slack channel or DM and send it. Slack recognises the
format, renders the eight swatches inline, and offers everyone who can see the
message a **Switch sidebar theme** button. Nothing is installed and no app is
authorised — the recipient's click writes the colours into their own
preferences, and they can revert from the same screen.

${sections}
## Notes on the map

The reasoning for each slot is in \`src/slack.yml\`, next to the value. Two
decisions are worth repeating here, because both look like mistakes:

- **The active channel uses the accent, where the editor uses a raised
  surface.** VS Code draws a focus outline around the selected row and Slack
  does not, so the colour has to carry the whole affordance. \`surface.overlay\`
  measures 1.5:1 against the column; the accent measures 7:1.

- **The mention badge is the deep accent, not the error red.** Slack always
  draws the count in white and offers no way to change it. The error red holds
  white at 3.2:1, so the loud pill would carry an unreadable number.

## Rebuilding

\`\`\`sh
npm run slack           # rebuild and report contrast
npm run slack:strict    # rebuild and fail the build on a contract failure
npm run slack:check     # assert the checked-in files match src/
\`\`\`
`;
}

/** What the root README must still quote for each theme: its paste string. */
function snippets(built) {
    return built.map(({ theme }) => ({ label: theme.label, snippet: theme.string }));
}

// ---------------------------------------------------------------------- build

function buildAll() {
    const contract = loadContract();
    const entries = entriesFor('slack');

    const built = entries.map((entry) => {
        const theme = buildTheme(entry, contract);
        return { theme, report: checkTheme(theme, contract) };
    });

    const files = new Map();
    for (const { theme } of built) {
        files.set(theme.output, `${theme.string}\n`);
    }

    files.set(
        'slack/themes.json',
        JSON.stringify(
            {
                $comment:
                    'Generated by scripts/slack.js — edit src/slack.yml, not this file.',
                order: contract.order,
                labels: contract.labels,
                themes: built.map(({ theme, report }) => ({
                    id: theme.id,
                    label: theme.label,
                    source: theme.source,
                    string: theme.string,
                    colors: theme.colors,
                    contrast: report.rows.map((row) => ({
                        foreground: row.fg,
                        background: row.bg,
                        ratio: Number(row.ratio.toFixed(2)),
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

    files.set('slack/README.md', renderReadme(built, contract));

    return { contract, built, files };
}

module.exports = { buildAll, buildTheme, checkTheme, loadContract };

// ----------------------------------------------------------------------- cli

if (require.main === module) {
    const argv = process.argv.slice(2);
    const strict = argv.includes('--strict');
    const check = argv.includes('--check');

    try {
        const { contract, built, files } = buildAll();

        if (check) {
            const outdated = stale(files);
            const drifted = readmeDrift(snippets(built));
            if (outdated.length > 0) {
                process.stderr.write(
                    `\nSlack export is out of date — run \`npm run slack\` and commit:\n` +
                        outdated.map((f) => `  ${f}\n`).join(''),
                );
            }
            if (drifted.length > 0) {
                process.stderr.write(
                    `\nREADME.md quotes a stale paste string — update it to:\n` +
                        drifted.map((d) => `  ${d.label}: ${d.snippet}\n`).join(''),
                );
            }
            if (outdated.length > 0 || drifted.length > 0) process.exit(1);
            process.stdout.write('  Slack export is up to date\n');
            process.exit(0);
        }

        for (const relative of write(files)) {
            process.stdout.write(`  wrote ${relative}\n`);
        }

        let failures = 0;
        for (const { theme, report } of built) {
            failures += report.failures;
            process.stdout.write(`\n  ${theme.label}  →  ${theme.output}\n`);
            process.stdout.write(`  ${theme.string}\n\n`);

            for (const slot of contract.order) {
                process.stdout.write(
                    `    ${contract.labels[slot].padEnd(17)} ${theme.colors[slot]}  ` +
                        `${contract.slots[slot]}\n`,
                );
            }

            process.stdout.write('\n');
            for (const row of report.rows) {
                const mark = row.ok ? 'pass' : row.advisory ? 'note' : 'FAIL';
                const label = row.label;
                process.stdout.write(
                    `    ${mark}  ${String(row.ratio.toFixed(2)).padStart(6)}:1  ` +
                        `(needs ${row.threshold.toFixed(1)})  ${label}\n`,
                );
            }
        }

        const drifted = readmeDrift(snippets(built));
        for (const { label, snippet } of drifted) {
            process.stdout.write(
                `\n  README.md does not quote the current ${label} string:\n    ${snippet}\n`,
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
        process.stderr.write(`\nSlack export failed: ${err.message}\n`);
        process.exit(1);
    }
}
