// Measure the exact DOM that will be displayed, including styles, columns,
// repeated table headers, margins and the destination page's width.
export function paginateHTML(html, header, footer, settings, fontStyle, columnWidths) {
  const source = document.createElement('div');
  source.innerHTML = html;
  source.querySelectorAll('table').forEach((table, id) => {
    table.dataset.tableId = id;
    const count = Math.max(0, ...Array.from(table.rows, row =>
      Array.from(row.cells).reduce((n, cell) => n + cell.colSpan, 0)));
    if (!count) return;
    const existing = Array.from(table.querySelectorAll(':scope > colgroup > col'));
    let weights = columnWidths[id];
    if (!weights || weights.length !== count) {
      const explicit = existing.flatMap(col => Array(col.span).fill(parseFloat(col.style.width || col.width)));
      weights = explicit.length === count && explicit.every(n => n > 0) ? explicit :
        Array.from({ length: count }, (_, i) => {
          const lengths = Array.from(table.rows).map(row => (row.cells[i]?.textContent || '').trim().length);
          return Math.sqrt(8 + lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length));
        });
    }
    const sum = weights.reduce((a, b) => a + b, 0);
    table.querySelectorAll(':scope > colgroup').forEach(group => group.remove());
    const group = document.createElement('colgroup');
    weights.forEach(weight => {
      const col = document.createElement('col');
      col.style.width = `${100 * weight / sum}%`;
      group.append(col);
    });
    table.insertBefore(group, table.tHead || table.tBodies[0] || table.firstChild);
    table.style.width = '100%';
    table.style.tableLayout = 'fixed';
  });

  const root = document.createElement('div');
  root.className = 'doc-body measure-root';
  root.style.cssText = `${fontStyle}position:absolute;left:-99999px;top:0;visibility:hidden;`;
  document.body.append(root);
  const pages = [];
  let content, tail, spec, hasContent;
  function startPage() {
    spec = settings(pages.length);
    root.style.width = `${spec.widthCm - spec.marginLeft - spec.marginRight}cm`;
    root.innerHTML = pages.length === 0 ? header : '';
    content = document.createElement('div');
    content.className = 'page-content';
    tail = document.createElement('div');
    tail.innerHTML = footer;
    root.append(content, tail);
    hasContent = false;
  }
  function fits() {
    return root.getBoundingClientRect().height <=
      (spec.heightCm - spec.marginTop - spec.marginBottom) * 96 / 2.54 - 2;
  }
  function finishPage() {
    tail.remove();
    pages.push({ ...spec, html: root.innerHTML });
    startPage();
  }
  // An indivisible block (e.g. one unusually tall row or an SVG) must still
  // remain visible. Fit it proportionally only when it exceeds an empty page.
  function fitOversized(node) {
    const wrapper = document.createElement('div');
    wrapper.className = 'oversized-content';
    node.replaceWith(wrapper);
    wrapper.append(node);
    const width = content.getBoundingClientRect().width;
    node.style.width = `${width}px`;
    const height = node.getBoundingClientRect().height;
    const available = (spec.heightCm - spec.marginTop - spec.marginBottom) * 96 / 2.54
      - root.getBoundingClientRect().height + height - 4;
    const scale = Math.min(1, Math.max(1, available) / Math.max(1, height));
    wrapper.style.height = `${height * scale}px`;
    node.style.transformOrigin = 'top left';
    node.style.transform = `scale(${scale})`;
  }
  function appendBlock(node) {
    content.append(node);
    if (!fits() && (hasContent || pages.length === 0)) {
      node.remove();
      finishPage();
      content.append(node);
    }
    if (!fits()) fitOversized(node);
    hasContent = true;
  }
  try {
    startPage();
    for (const block of Array.from(source.children)) {
      const rows = block.tagName === 'TABLE' ? Array.from(block.tBodies).flatMap(body => Array.from(body.rows)) : [];
      if (!rows.length) { appendBlock(block.cloneNode(true)); continue; }
      let fragment = null, body = null;
      function openTable() {
        fragment = block.cloneNode(false);
        for (const child of block.children) {
          if (['COLGROUP', 'THEAD', 'CAPTION'].includes(child.tagName)) fragment.append(child.cloneNode(true));
        }
        content.append(fragment);
      }
      for (let i = 0; i < rows.length;) {
        // Keep rows linked by rowspan together; never break a spanning cell.
        let end = i + 1;
        for (let j = i; j < end && j < rows.length; j++) {
          for (const cell of rows[j].cells) {
            const span = cell.rowSpan || rows[j].parentElement.rows.length - rows[j].sectionRowIndex;
            end = Math.max(end, Math.min(rows.length, j + span));
          }
        }
        const group = rows.slice(i, end);
        if (!fragment) openTable();
        body = group[0].parentElement.cloneNode(false);
        group.forEach(row => body.append(row.cloneNode(true)));
        fragment.append(body);
        if (!fits()) {
          body.remove();
          if (!fragment.querySelector('tbody')) fragment.remove();
          if (hasContent || pages.length === 0) finishPage();
          openTable();
          fragment.append(body);
          if (!fits()) { fitOversized(fragment); fragment = null; }
        }
        hasContent = true;
        i = end;
      }
      if (block.tFoot) appendBlock((() => {
        const table = block.cloneNode(false);
        table.append(block.querySelector('colgroup').cloneNode(true), block.tFoot.cloneNode(true));
        return table;
      })());
    }
    pages.push({ ...spec, html: root.innerHTML });
    return pages;
  } finally { root.remove(); }
}

export function installColumnResizers(container, widths, onChange) {
  container.querySelectorAll('table[data-table-id]').forEach(table => {
    const row = table.tHead?.rows[0] || table.rows[0];
    const cols = Array.from(table.querySelectorAll(':scope > colgroup > col'));
    if (!row || cols.length < 2) return;
    Array.from(table.rows).forEach(editRow => {
    let boundary = 0;
    Array.from(editRow.cells).forEach(cell => {
      boundary += cell.colSpan;
      const index = boundary - 1;
      if (boundary >= cols.length) return;
      const handle = document.createElement('span');
      handle.className = 'column-resizer' + (editRow === row ? ' column-resizer-header' : '');
      handle.dataset.html2canvasIgnore = 'true';
      handle.title = 'Geser untuk mengubah lebar kolom. Klik dua kali untuk otomatis.';
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-label', `Lebar kolom ${boundary}`);
      handle.tabIndex = editRow === row ? 0 : -1;
      const id = table.dataset.tableId;
      function update(initial, delta) {
        const next = [...initial];
        const min = Math.min(2, (initial[index] + initial[index + 1]) / 3);
        delta = Math.max(min - initial[index], Math.min(initial[index + 1] - min, delta));
        next[index] += delta;
        next[index + 1] -= delta;
        widths[id] = next;
        // Update widths in the pointer event itself so dragging stays visible
        // even before the next full pagination pass.
        container.querySelectorAll(`table[data-table-id="${id}"]`).forEach(fragment => {
          fragment.querySelectorAll(':scope > colgroup > col').forEach((col, i) => {
            col.style.width = `${next[i]}%`;
          });
        });
        onChange();
      }
      handle.addEventListener('pointerdown', event => {
        event.preventDefault();
        const start = event.clientX;
        const initial = cols.map(col => parseFloat(col.style.width));
        const width = table.getBoundingClientRect().width;
        const move = e => update(initial, (e.clientX - start) / width * 100);
        const stop = () => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', stop);
          document.removeEventListener('pointercancel', stop);
          document.body.classList.remove('resizing-columns');
        };
        document.body.classList.add('resizing-columns');
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', stop);
        document.addEventListener('pointercancel', stop);
      });
      handle.addEventListener('dblclick', () => { delete widths[id]; onChange(); });
      handle.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        update(cols.map(col => parseFloat(col.style.width)), event.key === 'ArrowRight' ? 1 : -1);
        container.querySelector(`table[data-table-id="${id}"] .column-resizer[aria-label="${handle.getAttribute('aria-label')}"]`)?.focus();
      });
      cell.append(handle);
    });
    });
  });
}
