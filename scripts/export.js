'use strict';

/**
 * Shared machinery for the non-VS Code exports.
 *
 * Satellite builds for three products from one set of palettes: the VS Code
 * themes, the Slack sidebar themes, and the iTerm2 colour schemes. The last two
 * are the same shape of problem — project a palette onto a fixed set of slots
 * some other application defines, measure the result against the accessibility
 * contract, and write files that must not drift from `src/`.
 *
 * That common part lives here, for the reason compose.js gives for the VS Code
 * build: an exporter that measures contrast its own way is an exporter that
 * will eventually disagree with the others about what AA means.
 */

const fs = require('fs');
const path = require('path');
const { readSource } = require('./yaml');
const { contrastRatio, composite } = require('./color');

const ROOT = path.join(__dirname, '..');

/**
 * The thresholds from src/a11y.yml.
 *
 * Read rather than redeclared so every product is held to one definition of AA.
 * `dim` is the documented sub-AA floor for the corner of the ANSI cube nearest
 * the terminal ground; the reasoning is in a11y.yml and must not be reused to
 * excuse ordinary failures.
 */
function loadThresholds(required = ['text', 'nonText']) {
    const a11y = readSource('a11y.yml');
    const thresholds = (a11y && a11y.thresholds) || {};
    for (const name of required) {
        if (typeof thresholds[name] !== 'number') {
            throw new Error(`src/a11y.yml: thresholds.${name} is missing`);
        }
    }
    return thresholds;
}

/** themes.yml entries that declare the given export field. */
function entriesFor(field) {
    const themes = readSource('themes.yml');
    if (!Array.isArray(themes)) throw new Error('src/themes.yml must be a list');
    const entries = themes.filter((entry) => entry && entry[field]);
    if (entries.length === 0) {
        throw new Error(`src/themes.yml: no entry declares a "${field}" output`);
    }
    return entries;
}

/** Resolves a contrast reference: a slot name, or a literal hex the app imposes. */
function refColor(ref, colors, where) {
    if (typeof ref === 'string' && ref.startsWith('#')) return ref.toUpperCase();
    if (ref in colors) return colors[ref];
    throw new Error(`${where}: "${ref}" is neither a slot nor a hex colour`);
}

/**
 * Measures a list of declared pairs against a built colour set.
 *
 * Pairs follow the shape a11y.yml already uses — `{ fg, bg, level, as }` — so
 * the three contracts read the same way. Two additions:
 *
 *   `on`       composite `bg` over this colour first. Needed wherever the
 *              *background* is translucent: a selection wash measured against
 *              nothing is a meaningless number, and the reader sees it over the
 *              ground. A translucent *foreground* needs nothing — contrastRatio
 *              already flattens it against whatever background it is given.
 *   `because`  required on advisory pairs, which are measured and reported but
 *              not gated. An advisory without a reason is a hidden failure.
 *
 * @param {Array} pairs declared pairs
 * @param {object} colors slot name → hex
 * @param {object} thresholds from loadThresholds()
 * @param {object} options `{ advisory, where }`
 */
function measure(
    pairs,
    colors,
    thresholds,
    { advisory = false, where = 'contrast' } = {},
) {
    return (pairs || []).map((pair, index) => {
        const at = `${where}[${index}]`;

        if (!pair.level) throw new Error(`${at}: "level" is required`);
        const threshold = thresholds[pair.level];
        if (typeof threshold !== 'number') {
            throw new Error(`${at}: unknown level "${pair.level}"`);
        }
        if (advisory && !pair.because) {
            throw new Error(
                `${at}: an advisory pair needs "because" — an unexplained advisory is a hidden failure`,
            );
        }

        const fg = refColor(pair.fg, colors, at);
        let bg = refColor(pair.bg, colors, at);
        if (pair.on) bg = composite(bg, refColor(pair.on, colors, at));

        const ratio = contrastRatio(fg, bg);
        return {
            advisory,
            fg: pair.fg,
            bg: pair.bg,
            on: pair.on || null,
            fgHex: fg,
            bgHex: bg,
            level: pair.level,
            ratio,
            threshold,
            ok: ratio >= threshold,
            label: pair.as || `${pair.fg} on ${pair.bg}`,
            because: pair.because || '',
        };
    });
}

/** Splits a measured set into a report, counting only gated rows as failures. */
function report(rows) {
    const gated = rows.filter((row) => !row.advisory);
    return {
        rows,
        checks: gated.length,
        failures: gated.filter((row) => !row.ok).length,
    };
}

/** Writes generated files, returning those whose contents actually moved. */
function write(files) {
    const changed = [];
    for (const [relative, contents] of files) {
        const target = path.join(ROOT, relative);
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        if (current !== contents) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, contents);
            changed.push(relative);
        }
    }
    return changed;
}

/** Generated files whose checked-in contents differ from what src/ produces. */
function stale(files) {
    const out = [];
    for (const [relative, contents] of files) {
        const target = path.join(ROOT, relative);
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        if (current !== contents) out.push(relative);
    }
    return out;
}

/**
 * Snippets quoted in the root README that no longer match the build.
 *
 * Each product's own README is generated and cannot drift. The root README
 * quotes from them by hand — it is the page most people read, so it is the one
 * that matters most and the one nothing else was checking.
 *
 * @param {Array<{label: string, snippet: string}>} expected
 */
function readmeDrift(expected) {
    const readme = path.join(ROOT, 'README.md');
    if (!fs.existsSync(readme)) return [];
    const text = fs.readFileSync(readme, 'utf8');
    return expected.filter(({ snippet }) => !text.includes(snippet));
}

/** Registers a footnote in `notes` and returns its superscript marker. */
function footnote(notes, text) {
    if (!text) return '';
    notes.push(String(text).trim().replace(/\s+/g, ' '));
    return ` <sup>${notes.length}</sup>`;
}

/** Renders footnotes as a blockquote, or nothing when there are none. */
function footnotes(notes) {
    if (notes.length === 0) return '';
    return `\n\n${notes.map((note, i) => `> **${i + 1}.** ${note}`).join('\n>\n')}`;
}

module.exports = {
    ROOT,
    loadThresholds,
    entriesFor,
    refColor,
    measure,
    report,
    write,
    stale,
    readmeDrift,
    footnote,
    footnotes,
};
