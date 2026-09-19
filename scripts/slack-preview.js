'use strict';

/**
 * Slack sidebar preview artwork.
 *
 *   node ./scripts/slack-preview.js
 *
 * Renders a mock of Slack's left column for every theme in slack/themes.json
 * and writes it to assets/slack-<id>.png, for the README and for anyone
 * deciding whether to paste the string.
 *
 * The mock is built out of the eight theme colours and nothing else. That
 * constraint is the point: if a state in the preview needs a ninth colour to
 * look right, it is a state Slack cannot draw either, and the preview would be
 * lying about what the reader will get.
 *
 * Two behaviours are Slack's, not the theme's, and are reproduced here because
 * leaving them out would make the preview flattering rather than accurate:
 *
 *   · read channels are drawn below the declared Text Color, and unread ones
 *     at full strength in bold. This is why textColor is mapped to text.muted
 *     rather than text.default — see src/slack.yml.
 *   · the mention badge's count is always white, whatever the theme says.
 *
 * Rendering goes through the same headless Chromium as the editor screenshots.
 */

const fs = require('fs');
const path = require('path');
const { requireChromium, shoot } = require('./chromium');

const ROOT = path.join(__dirname, '..');
const SCALE = 2; // the PNGs are retina; the layout below is authored at 1x
const WIDTH = 300;
const HEIGHT = 452;

/** The rows in the mock, in the order Slack would stack them. */
const SECTIONS = [
    {
        rows: [
            { icon: '≡', label: 'Threads', state: 'read' },
            { icon: '✦', label: 'Activity', state: 'unread', badge: '3' },
            { icon: '⌂', label: 'Later', state: 'read' },
        ],
    },
    {
        title: 'Channels',
        rows: [
            { icon: '#', label: 'general', state: 'read' },
            { icon: '#', label: 'design-review', state: 'active' },
            { icon: '#', label: 'releases', state: 'unread' },
            { icon: '#', label: 'incidents', state: 'unread', badge: '12' },
            { icon: '#', label: 'random', state: 'hover' },
            { icon: '#', label: 'watercooler', state: 'read' },
        ],
    },
    {
        title: 'Direct messages',
        rows: [
            { label: 'Ada Lovelace', state: 'unread', presence: true, badge: '2' },
            { label: 'Grace Hopper', state: 'read', presence: true },
            { label: 'Katherine Johnson', state: 'read', presence: false },
        ],
    },
];

const escape = (value) =>
    String(value).replace(
        /[&<>"]/g,
        (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
    );

function renderRow(row) {
    const classes = ['row', row.state];
    // A DM row is one that declares `presence` at all — including `false`, which
    // is the offline ring rather than no dot.
    const icon =
        'presence' in row
            ? `<span class="presence${row.presence ? ' on' : ''}"></span>`
            : `<span class="icon">${escape(row.icon || '')}</span>`;
    const badge = row.badge ? `<span class="badge">${escape(row.badge)}</span>` : '';
    return `      <div class="${classes.join(' ')}">${icon}<span class="label">${escape(
        row.label,
    )}</span>${badge}</div>`;
}

function renderPage(theme) {
    const c = theme.colors;
    const sections = SECTIONS.map((section) => {
        const title = section.title
            ? `      <div class="section">${escape(section.title)}</div>\n`
            : '';
        return `${title}${section.rows.map(renderRow).join('\n')}`;
    }).join('\n      <div class="gap"></div>\n');

    return `<!doctype html>
<meta charset="utf-8">
<title>${escape(theme.label)} — Slack</title>
<style>
  /* The eight slots, and nothing else. */
  :root {
    --column-bg: ${c.columnBg};
    --menu-bg-hover: ${c.menuBgHover};
    --active-item: ${c.activeItem};
    --active-item-text: ${c.activeItemText};
    --hover-item: ${c.hoverItem};
    --text-color: ${c.textColor};
    --active-presence: ${c.activePresence};
    --mention-badge: ${c.mentionBadge};
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    zoom: ${SCALE};
    background: var(--column-bg);
    color: var(--text-color);
    font: 13px/1 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .workspace {
    display: flex; align-items: center; gap: 8px;
    padding: 14px 12px 12px;
  }
  .workspace .name { font-size: 15px; font-weight: 900; color: var(--text-color); }
  .workspace .compose {
    margin-left: auto; width: 22px; height: 22px; border-radius: 50%;
    background: var(--menu-bg-hover); color: var(--text-color);
    display: flex; align-items: center; justify-content: center; font-size: 11px;
  }

  /* Slack fills the search field with Menu BG Hover. */
  .search {
    margin: 0 12px 12px; padding: 6px 10px; border-radius: 6px;
    background: var(--menu-bg-hover); color: var(--text-color);
    font-size: 12px; opacity: 0.95;
  }

  .section {
    padding: 12px 12px 5px; font-size: 12px; font-weight: 700;
    color: var(--text-color); opacity: 0.62;
  }
  .gap { height: 4px; }

  .row {
    display: flex; align-items: center; gap: 8px;
    margin: 0 8px; padding: 5px 8px; border-radius: 6px;
    font-size: 13px; color: var(--text-color);
  }
  .row .icon { width: 13px; text-align: center; opacity: 0.85; font-size: 13px; }
  .row .label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Read channels sit below the declared Text Color; unread sit at it, in bold.
     Slack does this itself and it cannot be turned off. */
  .row.read { opacity: 0.72; }
  .row.unread { font-weight: 900; }
  .row.hover { background: var(--hover-item); }
  .row.active {
    background: var(--active-item);
    color: var(--active-item-text);
    font-weight: 700;
  }
  .row.active .icon { opacity: 1; }

  /* Offline is an outlined ring, online a filled dot. Only the filled state
     gets Active Presence; the ring is Text Color, as Slack draws it. */
  .presence {
    width: 9px; height: 9px; border-radius: 50%; flex: none;
    border: 1.5px solid var(--text-color); opacity: 0.85;
  }
  .presence.on {
    background: var(--active-presence);
    border-color: var(--active-presence);
    opacity: 1;
  }

  /* The count is white on every theme — Slack offers no slot for it. */
  .badge {
    background: var(--mention-badge); color: #FFFFFF;
    font-size: 11px; font-weight: 700; line-height: 1;
    padding: 3px 6px; border-radius: 9px;
  }
</style>
<body>
  <div class="workspace">
    <span class="name">Satellite</span>
    <span class="compose">✎</span>
  </div>
  <div class="search">Search Satellite</div>
${sections}
</body>
`;
}

function main() {
    const manifestPath = path.join(ROOT, 'slack', 'themes.json');
    if (!fs.existsSync(manifestPath)) {
        process.stderr.write(
            'slack/themes.json is missing — run `npm run slack` first.\n',
        );
        process.exit(1);
    }

    const chromium = requireChromium();
    const { themes } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'slack-preview-'));

    for (const theme of themes) {
        const page = path.join(tmp, `${theme.id}.html`);
        fs.writeFileSync(page, renderPage(theme));

        const out = path.join(ROOT, 'assets', `slack-${theme.id}.png`);
        const result = shoot(chromium, page, out, WIDTH * SCALE, HEIGHT * SCALE);
        process.stdout.write(
            `  assets/slack-${theme.id}.png`.padEnd(40) +
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
