// Run in the app browser context. Restores the current report and paper controls.
(async () => {
  const { renderMarkdown } = await import('/markdown.js');
  const { paginateHTML } = await import('/pagination.js');
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const defaults = { widthCm:21, heightCm:29.7, marginTop:1.5, marginBottom:1.5, marginLeft:1.5, marginRight:1.5 };
  const cards = Array.from({length:8}, (_,i) => `<h2>Chart ${i}</h2><div class="chart-card"><p>Caption ${i}</p><svg viewBox="0 0 600 300"><rect width="600" height="300" fill="blue"/></svg></div>`).join('');
  const html = `<!DOCTYPE html><html><head><title>Metadata only</title><style>:root{--color:rgb(20,30,40)}body{padding:99px;color:var(--color)}.page{max-width:900px;overflow:hidden}.content{padding:20px}.chart-card{padding:12px;border:1px solid black}svg{width:100%;height:auto}</style></head><body><div class="page"><div class="content">${cards}</div></div></body></html>`;
  const pages = paginateHTML(renderMarkdown(html), '', '', () => defaults, 'font-family:Arial;font-size:14px;', {});
  const host = document.createElement('div');
  document.body.append(host);
  try {
    assert(pages.length > 1, 'whole report packed into one page');
    for (const page of pages) {
      const body = document.createElement('div');body.className='doc-body';body.style.width='18cm';body.innerHTML=page.html;host.append(body);
      assert(body.getBoundingClientRect().height <= 26.7*96/2.54, 'height overflow');
    }
    assert(host.querySelectorAll('svg').length===8, 'lost/duplicated chart');
    assert(host.querySelectorAll('.chart-card').length===8, 'chart cards split');
    assert(host.querySelectorAll('[style*="scale("]').length===0, 'report shrunk');
    assert(!host.textContent.includes('Metadata only'), 'document head rendered');
    for (const svg of host.querySelectorAll('svg')) assert(svg.getBoundingClientRect().width>550, 'chart not full width');
    for (const container of host.querySelectorAll('.content')) assert(container.lastElementChild.tagName!=='H2', 'heading orphaned');
    assert(getComputedStyle(host.querySelector('.report-import')).color==='rgb(20, 30, 40)', 'root CSS variables lost');
  } finally { host.remove(); }
  const field = document.getElementById('f-markdown');
  const checkbox = document.getElementById('f-auto-orientation');
  const saved = { text:field.value, auto:checkbox.checked };
  const controls = ['f-paper-size','f-paper-w','f-paper-h'].map(id=>[id,document.getElementById(id).value]);
  const change = (id, value) => { const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change')); };
  const render = () => document.getElementById('btn-refresh').click();
  const results=[];
  try {
    checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));
    change('f-paper-size','A4');
    for(const columns of [11,12,17]) {
      const line='|'+Array(columns).fill('Column').join('|')+'|';
      field.value=line+'\n|'+Array(columns).fill('---').join('|')+'|\n'+line;
      field.dispatchEvent(new Event('input'));render();
      const sheet=document.querySelector('.page-sheet');
      assert((parseFloat(sheet.style.width)>parseFloat(sheet.style.height))===(columns>=12), 'orientation threshold '+columns);
      results.push({columns,width:sheet.style.width,height:sheet.style.height});
    }
    change('f-paper-size','Custom');change('f-paper-w',21);change('f-paper-h',40);render();
    assert(document.querySelector('.page-sheet').style.width==='40cm', 'custom auto orientation');
    checkbox.checked=false;checkbox.dispatchEvent(new Event('change'));
    assert(document.querySelector('.page-sheet').style.width==='21cm', 'manual custom size restore');
  } finally {
    field.value=saved.text;field.dispatchEvent(new Event('input'));
    checkbox.checked=saved.auto;checkbox.dispatchEvent(new Event('change'));
    controls.forEach(([id,value])=>change(id,value));render();
  }
  return {fullHTMLPages:pages.length, charts:8,thresholds:results,customSizePassed:true};
})()
