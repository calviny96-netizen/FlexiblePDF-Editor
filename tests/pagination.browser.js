// Run in the app's browser context (DevTools or the browser test tool).
// No report/customer data is stored in this regression suite.
(async () => {
  const { paginateHTML } = await import('/pagination.js');
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
          if (row.closest('.overflow-slice')) continue;
          assert(row.getBoundingClientRect().bottom <= body.getBoundingClientRect().top + budget, name + ': row clipped');
        }
      });
      const text = root => [...root.querySelectorAll('tbody tr')]
        .filter(row => !row.closest('.overflow-slice') || row.closest('.overflow-slice').dataset.sliceIndex === '0')
        .map(row=>row.textContent);
      const slices = [...host.querySelectorAll('.overflow-slice')];
      for (let i = 1; i < slices.length; i++) {
        if (slices[i].dataset.sliceId === slices[i-1].dataset.sliceId) {
          assert(slices[i].dataset.sliceStart === slices[i-1].dataset.sliceEnd, name + ': slice gap/overlap');
        }
      }
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
  const { maxTableColumns } = await import('/content.js');
  for (const count of [11, 12, 17]) {
    const cells = '<td>Cell</td>'.repeat(count);
    assert(maxTableColumns(`<div><table><tbody><tr>${cells}</tr></tbody></table></div>`) === count, 'column threshold ' + count);
  }
  assert(maxTableColumns('<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td colspan="11">C</td></tr></table>') === 12, 'rowspan/colspan count');
  check('nested document wrapper', `<div class="page"><div class="content">${table}</div></div>`);
  const fullHTML = '<!DOCTYPE html><html><head><style>:root{--test-color:rgb(12, 34, 56)}body{padding:99px}.page{max-width:900px;overflow:hidden}.content{padding:20px}h2{color:var(--test-color)}</style></head><body><div class="page"><div class="content"><h2>Report</h2>' + table + '</div></div></body></html>';
  const bodyPadding = getComputedStyle(document.body).padding;
  check('complete HTML document', renderMarkdown(fullHTML));
  assert(getComputedStyle(document.body).padding === bodyPadding, 'pasted CSS escaped report scope');
  const source = renderMarkdown(document.getElementById('f-markdown').value);
  check('current report',source);
  return results;
})()
