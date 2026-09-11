import { prepareContent, tableColumnCount } from './content.js';

// Measure the exact DOM that will be displayed, including styles, columns,
// repeated table headers, margins and the destination page's width.
export function paginateHTML(html, header, footer, settings, fontStyle, columnWidths) {
  const { source, css } = prepareContent(html);
  source.querySelectorAll('table').forEach((table, id) => {
    table.dataset.tableId = id;
    const count = tableColumnCount(table);
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
  let content, tail, spec, hasContent, parents, pendingHeading;
  function startPage() {
    spec = settings(pages.length);
    root.style.width = `${spec.widthCm - spec.marginLeft - spec.marginRight}cm`;
    root.innerHTML = pages.length === 0 ? header : '';
    if (css) { const style = document.createElement('style'); style.textContent = css; root.prepend(style); }
    parents = new Map();
    content = document.createElement('div');
    content.className = 'page-content';
    tail = document.createElement('div');
    tail.innerHTML = footer;
    root.append(content, tail);
    hasContent = false;
    pendingHeading = null;
  }
  function fits() {
    return root.getBoundingClientRect().height <=
      (spec.heightCm - spec.marginTop - spec.marginBottom) * 96 / 2.54 - 2;
  }
  function finishPage() {
    const carry = pendingHeading?.node.isConnected ? pendingHeading : null;
    if (carry) carry.node.remove();
    removeEmptyParents();
    tail.remove();
    pages.push({ ...spec, html: root.innerHTML });
    startPage();
    if (carry) {
      parentFor(carry.path).append(carry.node);
      hasContent = true;
    }
  }
  function parentFor(path) {
    let parent = content;
    for (const original of path) {
      let clone = parents.get(original);
      if (!clone || !clone.isConnected) {
        clone = original.cloneNode(false);
        clone.dataset.flowContainer = '';
        // A document's screen-only max-width/height/overflow must not box an
        // entire report into one printed page.
        clone.style.setProperty('width', '100%', 'important');
        clone.style.setProperty('max-width', '100%', 'important');
        clone.style.setProperty('min-width', '0', 'important');
        clone.style.setProperty('height', 'auto', 'important');
        clone.style.setProperty('max-height', 'none', 'important');
        clone.style.setProperty('overflow', 'visible', 'important');
        parent.append(clone);
        parents.set(original, clone);
      }
      parent = clone;
    }
    return parent;
  }
  function removeEmptyParents() {
    for (const clone of [...parents.values()].reverse()) {
      if (!clone.textContent.trim() && !clone.querySelector('svg,img,table,hr')) clone.remove();
    }
  }
  // Truly indivisible content continues as full-width vertical slices. Never
  // shrink a whole report to fit the remaining height of a single page.
  let sliceId = 0;
  function continueOversized(node, path) {
    const width = node.getBoundingClientRect().width;
    node.style.width = `${width}px`;
    node.style.maxWidth = 'none';
    node.style.margin = '0';
    const height = node.getBoundingClientRect().height;
    node.remove();
    let offset = 0, index = 0;
    const id = sliceId++;
    while (offset < height - .1) {
      const parent = parentFor(path);
      const wrapper = document.createElement('div');
      wrapper.className = 'overflow-slice';
      wrapper.dataset.sliceId = id;
      wrapper.dataset.sliceIndex = index++;
      wrapper.style.cssText = 'position:relative;overflow:hidden;width:100%;height:0;';
      parent.append(wrapper);
      const scale = Math.min(1, parent.getBoundingClientRect().width / Math.max(1, width));
      const available = Math.max(1, (spec.heightCm - spec.marginTop - spec.marginBottom) * 96 / 2.54
        - root.getBoundingClientRect().height - 4);
      const sliceHeight = Math.min(height - offset, available / scale);
      wrapper.style.height = `${sliceHeight * scale}px`;
      wrapper.dataset.sliceStart = offset;
      wrapper.dataset.sliceEnd = offset + sliceHeight;
      const copy = node.cloneNode(true);
      copy.style.position = 'absolute';
      copy.style.top = `${-offset * scale}px`;
      copy.style.left = '0';
      copy.style.transformOrigin = 'top left';
      if (scale < 1) copy.style.transform = `scale(${scale})`;
      wrapper.append(copy);
      offset += sliceHeight;
      hasContent = true;
      if (offset < height - .1) finishPage();
    }
  }
  function appendBlock(original, path = []) {
    if (original.nodeType === Node.COMMENT_NODE || !original.textContent.trim() && original.nodeType === Node.TEXT_NODE) return;
    const node = original.cloneNode(true);
    parentFor(path).append(node);
    if (node.nodeType !== Node.ELEMENT_NODE) { hasContent = true; return; }
    const display = getComputedStyle(node).display;
    const flow = /^(DIV|MAIN|ARTICLE|SECTION|ASIDE|HEADER|FOOTER|UL|OL|BLOCKQUOTE)$/.test(node.tagName)
      && !/flex|grid/.test(display) && node.children.length;
    // Descend through report wrappers. Tables inside them must reach the row
    // paginator, even when the wrapper itself fits on the current page.
    const emptyPageHeight = (spec.heightCm - spec.marginTop - spec.marginBottom) * 96 / 2.54
      - tail.getBoundingClientRect().height - 4;
    if (flow && (node.querySelector('table') || node.getBoundingClientRect().height > emptyPageHeight)) {
      node.remove();
      for (const child of original.childNodes) process(child, [...path, original]);
      return;
    }
    if (!fits() && (hasContent || pages.length === 0)) {
      node.remove();
      removeEmptyParents();
      finishPage();
      parentFor(path).append(node);
    }
    if (!fits() && flow) {
      node.remove();
      for (const child of original.childNodes) process(child, [...path, original]);
      return;
    }
    pendingHeading = /^H[1-6]$/.test(node.tagName) ? { node, path } : null;
    if (!fits()) continueOversized(node, path);
    hasContent = true;
  }
  function appendTable(block, path) {
    const rows = Array.from(block.tBodies).flatMap(body => Array.from(body.rows));
    if (!rows.length) { appendBlock(block, path); return; }
    let fragment = null;
    function openTable() {
      fragment = block.cloneNode(false);
      for (const child of block.children) {
        if (['COLGROUP', 'THEAD', 'CAPTION'].includes(child.tagName)) fragment.append(child.cloneNode(true));
      }
      parentFor(path).append(fragment);
    }
    for (let i = 0; i < rows.length;) {
      let end = i + 1;
      for (let j = i; j < end && j < rows.length; j++) {
        for (const cell of rows[j].cells) {
          const span = cell.rowSpan || rows[j].parentElement.rows.length - rows[j].sectionRowIndex;
          end = Math.max(end, Math.min(rows.length, j + span));
        }
      }
      const group = rows.slice(i, end);
      if (!fragment) openTable();
      let body = fragment.lastElementChild;
      if (body?.tagName !== 'TBODY' || body.dataset.sourceBody !== String(Array.from(block.tBodies).indexOf(group[0].parentElement))) {
        body = group[0].parentElement.cloneNode(false);
        body.dataset.sourceBody = Array.from(block.tBodies).indexOf(group[0].parentElement);
        fragment.append(body);
      }
      const clones = group.map(row => row.cloneNode(true));
      body.append(...clones);
      if (!fits()) {
        clones.forEach(row => row.remove());
        if (!body.children.length) body.remove();
        if (!fragment.querySelector('tbody')) fragment.remove();
        if (hasContent || pages.length === 0) { removeEmptyParents(); finishPage(); }
        openTable();
        body = group[0].parentElement.cloneNode(false);
        body.dataset.sourceBody = Array.from(block.tBodies).indexOf(group[0].parentElement);
        body.append(...clones);
        fragment.append(body);
        if (!fits()) { continueOversized(fragment, path); fragment = null; }
      }
      hasContent = true;
      pendingHeading = null;
      i = end;
    }
    if (block.tFoot) {
      const table = block.cloneNode(false);
      table.append(block.querySelector('colgroup').cloneNode(true), block.tFoot.cloneNode(true));
      appendBlock(table, path);
    }
  }
  function process(block, path = []) {
    if (block.nodeName === 'TABLE') appendTable(block, path);
    else appendBlock(block, path);
  }
  try {
    startPage();
    for (const block of source.childNodes) process(block);
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
