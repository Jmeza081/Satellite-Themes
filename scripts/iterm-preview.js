'use strict';

/**
 * iTerm2 preview artwork.
 *
 *   node ./scripts/iterm-preview.js
 *
 * Renders a mock terminal session for every scheme in iterm/themes.json and
 * writes it to assets/iterm-<id>.png, for the README and for anyone deciding
 * whether to import the file.
 *
 * The mock is built out of the scheme's own colours and nothing else — the same
 * constraint the Slack preview works under, for the same reason. A preview that
 * reaches for a colour the scheme does not define is a preview of something the
 * reader will never see.
 *
 * The session is chosen to exercise the slots a plain colour grid would not:
 * the block cursor and its text, a selection with text inside it, a link, and
 * the ANSI colours in the roles shells actually print them in. The ramp along
 * the bottom is there to show all sixteen, including the corner nearest the
 * ground — which on every palette is the one that cannot reach AA, and which a
 * preview should therefore not quietly leave out.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireChromium, shoot } = require('./chromium');

const ROOT = path.join(__dirname, '..');
const SCALE = 2;
const WIDTH = 440;
const HEIGHT = 258;

/** ANSI slot → the role a shell most often prints it in. */
const RAMP = [
    ['0', 'black'],
    ['1', 'red'],
    ['2', 'green'],
    ['3', 'yellow'],
    ['4', 'blue'],
    ['5', 'magenta'],
    ['6', 'cyan'],
    ['7', 'white'],
];

const escape = (value) =>
    String(value).replace(
        /[&<>]/g,
        (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch],
    );

function renderPage(theme) {
    const c = theme.colors;
    const ansi = (n) => c[`Ansi ${n} Color`];

    const ramp = RAMP.map(
        ([n, name]) => `      <div class="swatch">
        <span class="chip" style="background:${ansi(n)}"></span>
        <span class="chip" style="background:${ansi(Number(n) + 8)}"></span>
        <span class="chip-label">${escape(name)}</span>
      </div>`,
    ).join('\n');

    return `<!doctype html>
<meta charset="utf-8">
<title>${escape(theme.label)} — iTerm2</title>
<style>
  :root {
    --bg: ${c['Background Color']};
    --fg: ${c['Foreground Color']};
    --bold: ${c['Bold Color']};
    --cursor: ${c['Cursor Color']};
    --cursor-text: ${c['Cursor Text Color']};
    --selection: ${c['Selection Color']};
    --selected-text: ${c['Selected Text Color']};
    --link: ${c['Link Color']};
    --underline: ${c['Underline Color']};
    --badge: ${c['Badge Color']};
    --red: ${ansi(1)};
    --green: ${ansi(2)};
    --yellow: ${ansi(3)};
    --blue: ${ansi(4)};
    --magenta: ${ansi(5)};
    --cyan: ${ansi(6)};
    --bright-black: ${ansi(8)};
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    zoom: ${SCALE};
    background: var(--bg);
    color: var(--fg);
    font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, "DejaVu Sans Mono", monospace;
    -webkit-font-smoothing: antialiased;
    padding: 12px 14px;
    position: relative;
  }

  .badge {
    position: absolute; top: 10px; right: 14px;
    color: var(--badge); font-size: 13px; font-weight: 700;
    letter-spacing: 0.04em; text-align: right; line-height: 1.25;
  }
  .badge small { display: block; font-size: 9px; font-weight: 400; opacity: 0.9; }

  .line { white-space: pre; }
  .spacer { height: 7px; }

  .path { color: var(--cyan); }
  .branch { color: var(--magenta); }
  .prompt { color: var(--green); font-weight: 700; }
  .mod { color: var(--yellow); }
  .new { color: var(--red); }
  .ok { color: var(--green); }
  .dim { color: var(--bright-black); }
  .bold { color: var(--bold); font-weight: 700; }
  .num { color: var(--blue); }

  a, .link {
    color: var(--link);
    text-decoration: underline;
    text-decoration-color: var(--underline);
    text-underline-offset: 2px;
  }

  /* A real selection, drawn with the scheme's own two slots. */
  .sel { background: var(--selection); color: var(--selected-text); }

  /* The block cursor inverts what is under it. */
  .cursor {
    background: var(--cursor); color: var(--cursor-text);
    padding: 0 0.5px;
  }

  .ramp {
    /* Wraps rather than clipping: eight labelled swatches is a tight fit at
       this width, and a ramp missing its last colour is the one thing this
       panel exists to not do. */
    display: flex; flex-wrap: wrap; gap: 4px 9px; margin-top: 10px;
    padding-top: 9px; border-top: 1px solid var(--selection);
  }
  .swatch { display: flex; align-items: center; gap: 3px; }
  .chip { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
  .chip-label { color: var(--bright-black); font-size: 8px; margin-left: 1px; }
</style>
<body>
  <div class="badge">${escape(theme.label.replace(/^Satellite ?/, '') || 'Satellite')}<small>satellite</small></div>

  <div class="line"><span class="path">~/Satellite</span> <span class="dim">on</span> <span class="branch">⎇ main</span></div>
  <div class="line"><span class="prompt">❯</span> git status --short</div>
  <div class="line"><span class="mod"> M</span> src/tokens-nebula.yml</div>
  <div class="line"><span class="new">??</span> src/iterm.yml</div>

  <div class="spacer"></div>

  <div class="line"><span class="path">~/Satellite</span> <span class="dim">on</span> <span class="branch">⎇ main</span></div>
  <div class="line"><span class="prompt">❯</span> npm run iterm -- --strict</div>
  <div class="line"><span class="dim">  ground</span> <span class="bold">${escape(c['Background Color'])}</span>  <span class="num">23</span> checks</div>
  <div class="line"><span class="ok">  ✓ every gated contrast check passed</span></div>
  <div class="line"><span class="dim">  docs</span> <span class="link">github.com/Jmeza081/Satellite</span></div>

  <div class="spacer"></div>

  <div class="line"><span class="prompt">❯</span> <span class="sel">grep -rn "accent.base" src/</span><span class="cursor">&nbsp;</span></div>

  <div class="ramp">
${ramp}
  </div>
</body>
`;
}

function main() {
    const manifest = path.join(ROOT, 'iterm', 'themes.json');
    if (!fs.existsSync(manifest)) {
        process.stderr.write(
            'iterm/themes.json is missing — run `npm run iterm` first.\n',
        );
        process.exit(1);
    }

    const chromium = requireChromium();
    const { themes } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iterm-preview-'));

    for (const theme of themes) {
        const page = path.join(tmp, `${theme.id}.html`);
        fs.writeFileSync(page, renderPage(theme));

        const out = path.join(ROOT, 'assets', `iterm-${theme.id}.png`);
        const result = shoot(chromium, page, out, WIDTH * SCALE, HEIGHT * SCALE);
        process.stdout.write(
            `  assets/iterm-${theme.id}.png`.padEnd(46) +
                `${result.width}×${result.height}  ${(result.bytes / 1024).toFixed(1)} kB\n`,
        );
    }

    fs.rmSync(tmp, { recursive: true, force: true });
}

module.exports = { renderPage };

if (require.main === module) {
    try {
        main();
    } catch (err) {
        process.stderr.write(`\nPreview render failed: ${err.message}\n`);
        process.exit(1);
    }
}
