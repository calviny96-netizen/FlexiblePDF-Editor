// Run in the app's browser context (DevTools or the browser test tool).
// No report/customer data is stored in this regression suite.
(async () => {
  const { paginateHTML, installColumnResizers } = await import('/pagination.js');
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const defaults = { widthCm: 21, heightCm: 29.7, marginTop: 1.5, marginBottom: 1.5, marginLeft: 1.5, marginRight: 1.5 };
  const font = 'font-family:Arial;font-size:10.5pt;';
  function check(name, html, settings = () => defaults, widths = {}) {
    const pages = paginateHTML(html, '<div style="height:80px">Header</div>', '<div class="doc-footer">Footer</div>', settings, font, widths);
    const source = document.createElement('div'); source.innerHTML = html;
    const host = document.createElement('div'); document.body.append(host);
    try {
      pages.forEach(p => {
        const body = document.createElement('div'); body.className = 'doc-body';
        body.style.cssText = font + `width:${p.widthCm-p.marginLeft-p.marginRight}cm;`;
        body.innerHTML = p.html; host.append(body);
        const budget = (p.heightCm-p.marginTop-p.marginBottom)*96/2.54;
        assert(body.getBoundingClientRect().height <= budget, name + ': page overflow');
        for (const row of body.querySelectorAll('tr')) {
          assert(row.getBoundingClientRect().bottom <= body.getBoundingClientRect().top + budget, name + ': row clipped');
        }
      });
      const text = root => [...root.querySelectorAll('tbody tr')].map(row=>row.textContent);
      assert(JSON.stringify(text(host)) === JSON.stringify(text(source)), name + ': lost/duplicated/reordered rows');
      results.push({name, pages:pages.length, rows:text(host).length});
    } finally { host.remove(); }
  }
  const rows = Array.from({length:60}, (_,i)=>`<tr><td>${i}</td><td>${'Long content wraps across lines. '.repeat(6)}</td></tr>`).join('');
  const table = `<table style="font-size:9px;border-collapse:collapse"><colgroup><col style="width:15%"><col style="width:85%"></colgroup><thead><tr><th>ID</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
  check('long HTML table',table);
  check('mixed page widths',table,i=>({...defaults,widthCm:i%2?14:21,heightCm:i%2?18:29.7}));
  check('manual column widths',table,()=>defaults,{0:[70,30]});
  check('adjacent tables',table+table);
  check('oversized row','<table><tbody><tr><td><div style="height:1800px">Tall row end</div></td></tr></tbody></table>');
  check('rowspan','<table><tbody><tr><td rowspan="2">Shared</td><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  check('SVG block','<svg width="600" height="300"><rect width="600" height="300"/></svg>'+table);
  const { renderMarkdown } = await import('/markdown.js');
  check('pipe table automatic widths',renderMarkdown('| ID | Description |\n| --- | --- |\n'+Array.from({length:70},(_,i)=>`| ${i} | ${'Description '.repeat(10)} |`).join('\n')));
  const source = renderMarkdown(document.getElementById('f-markdown').value);
  check('current report',source);
  return results;
})()
