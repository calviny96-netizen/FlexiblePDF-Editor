// Parse complete pasted HTML separately from the editor document. Styles are
// scoped to report content so body/:root/table rules cannot resize the app.
function selectors(text) {
  const parts = []; let depth = 0, start = 0, quote = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) { if (char === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (char === '"' || char === "'") quote = char;
    else if ('(['.includes(char)) depth++;
    else if (')]'.includes(char)) depth--;
    else if (char === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}
function scopeCSS(css, scope) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  function rules(items) {
    return Array.from(items, rule => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const scoped = selectors(rule.selectorText).map(selector => {
          selector = selector.trim().replace(/\bhtml\b\s+\bbody\b/g, 'body')
            .replace(/(^|[\s>+~])(:root|html|body)(?=$|[\s>+~.#:[\]])/g, `$1.${scope}`);
          return selector.startsWith(`.${scope}`) ? selector : `:where(.${scope}) ${selector}`;
        }).join(',');
        return `${scoped}{${rule.style.cssText}}`;
      }
      if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
        return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${rules(rule.cssRules)}}`;
      }
      return ''; // Do not load a pasted document's global imports or page rules.
    }).join('\n');
  }
  return rules(sheet.cssRules);
}
export function prepareContent(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const rawCSS = Array.from(parsed.querySelectorAll('style'), style => style.textContent).join('\n');
  let hash = 2166136261;
  for (let i = 0; i < rawCSS.length; i++) hash = Math.imul(hash ^ rawCSS.charCodeAt(i), 16777619);
  const scope = `report-style-${hash >>> 0}`;
  const css = scopeCSS(rawCSS, scope);
  parsed.querySelectorAll('style,script,link,meta,title,base').forEach(el => el.remove());
  const source = document.createElement('div');
  if (css || /<!doctype\s+html|<html\b|<body\b/i.test(html)) {
    const report = document.createElement('div');
    report.className = `report-import ${scope} ${parsed.body.className}`;
    report.style.cssText = parsed.body.style.cssText;
    report.innerHTML = parsed.body.innerHTML;
    source.append(report);
  } else source.innerHTML = parsed.body.innerHTML;
  return { source, css };
}

export function tableColumnCount(table) {
  let max = 0;
  const occupied = [];
  for (const row of table.rows) {
    let column = 0;
    for (const cell of row.cells) {
      while (occupied[column] > 0) column++;
      const span = cell.rowSpan || row.parentElement.rows.length - row.sectionRowIndex;
      for (let i = 0; i < cell.colSpan; i++) occupied[column + i] = span;
      column += cell.colSpan;
    }
    max = Math.max(max, column, occupied.length);
    for (let i = 0; i < occupied.length; i++) occupied[i] = Math.max(0, (occupied[i] || 0) - 1);
  }
  return max;
}
export function maxTableColumns(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Math.max(0, ...Array.from(doc.querySelectorAll('table'), tableColumnCount));
}
