// Minimal, dependency-free Markdown -> HTML renderer.
// Supports exactly the subset used by the reference report template:
// headings (#, ##, ###), bold **x**, italic *x*/_x_, inline code `x`,
// links [text](url), unordered/ordered lists, GFM pipe tables, horizontal
// rules (---), paragraphs, and — like CommonMark/GFM — raw HTML passthrough
// (inline tags such as <span>/<a>, and block-level embeds such as <svg>).

// Block-level tags whose content spans multiple lines and must be captured
// as one raw chunk (not chopped into "paragraph" lines and escaped).
const HTML_BLOCK_TAGS = /^(div|svg|table|ul|ol|dl|blockquote|section|article|header|footer|nav|aside|figure|form|pre|iframe|video|picture|style|details|summary)$/i;

function renderInline(raw) {
  // Raw HTML (e.g. <span style="...">, <a href="...">, <tspan>) is passed
  // through untouched, same as real Markdown does — it is not something
  // this app generates, so escaping it would just break the author's intent.
  let text = raw;

  // Inline code first so its contents are never re-processed.
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const safeUrl = /^(https?:)?\/\//i.test(url) ? url : '#';
    return `<a href="${safeUrl}" target="_blank" rel="noopener">${label}</a>`;
  });

  // Bold: **x** or __x__
  text = text.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>');

  // Italic: *x* or _x_ (single, not immediately adjacent to another * from bold which is already consumed)
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

  return text;
}

function isTableSeparatorRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('-') || !trimmed.includes('|')) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(trimmed);
}

function splitTableRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function renderTable(headerLine, sepLine, bodyLines) {
  const headers = splitTableRow(headerLine);
  const aligns = splitTableRow(sepLine).map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    if (l && r) return 'center';
    if (r) return 'right';
    if (l) return 'left';
    return '';
  });

  let html = '<table class="md-table"><thead><tr>';
  headers.forEach((h, i) => {
    const align = aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
    html += `<th${align}>${renderInline(h)}</th>`;
  });
  html += '</tr></thead><tbody>';

  bodyLines.forEach((line) => {
    const cells = splitTableRow(line);
    html += '<tr>';
    headers.forEach((_, i) => {
      const align = aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
      html += `<td${align}>${renderInline(cells[i] || '')}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

export function renderMarkdown(source) {
  // A pasted full document already has HTML structure; treating its head and
  // body as Markdown paragraphs corrupts both CSS and the page wrapper.
  if (/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(source || '')) return source;
  const lines = (source || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    // Horizontal rule (no pipes involved, so it won't collide with table separators)
    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Table: current line has a pipe, next line is a valid separator row
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
      const headerLine = line;
      const sepLine = lines[i + 1];
      let j = i + 2;
      const bodyLines = [];
      while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
        bodyLines.push(lines[j]);
        j++;
      }
      out.push(renderTable(headerLine, sepLine, bodyLines));
      i = j;
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      out.push('<ul>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push('<ol>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ol>');
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderInline(items.join(' '))}</blockquote>`);
      continue;
    }

    // Raw HTML block (e.g. a hand-authored <svg> chart): capture verbatim,
    // tracking this specific tag's open/close balance so nested elements
    // inside it (rect, g, tspan, ...) don't confuse the boundary.
    const htmlBlockMatch = /^<([a-zA-Z][a-zA-Z0-9]*)\b/.exec(trimmed);
    if (htmlBlockMatch && HTML_BLOCK_TAGS.test(htmlBlockMatch[1])) {
      const tag = htmlBlockMatch[1];
      const openRe = new RegExp(`<${tag}\\b`, 'gi');
      const closeRe = new RegExp(`</${tag}>`, 'gi');
      const htmlLines = [line];
      let depth = (trimmed.match(openRe) || []).length - (trimmed.match(closeRe) || []).length;
      let j = i + 1;
      while (depth > 0 && j < lines.length) {
        htmlLines.push(lines[j]);
        depth += (lines[j].match(openRe) || []).length - (lines[j].match(closeRe) || []).length;
        j++;
      }
      out.push(htmlLines.join('\n'));
      i = j;
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6})\s+/.test(lines[i].trim()) &&
      !/^(---+|\*\*\*+|___+)$/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${renderInline(paraLines.join(' '))}</p>`);
    } else {
      i++;
    }
  }

  return out.join('\n');
}

export function countWords(source) {
  const plain = (source || '')
    .replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ') // strip raw HTML/SVG tags (and their attributes) before counting
    .replace(/[#*_`>|-]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}
