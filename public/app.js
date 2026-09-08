import { renderMarkdown, countWords } from './markdown.js';
import {
  detectProvider, providerMeta, providerIconHtml, estimateTokens, FALLBACK_MODELS,
} from './models.js';

const $ = (id) => document.getElementById(id);

const PAPER_PRESETS = {
  A4: [21, 29.7],
  Letter: [21.59, 27.94],
  Legal: [21.59, 35.56],
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DEFAULT_MARKDOWN = `## 📊 Rekap Lead Masuk — Contoh Periode

*Sales: (nama sales)*

### Ringkasan

Total **lead/customer inquiry** yang masuk dalam rentang tanggal ini: **12 kontak** (data contoh, silakan ganti dengan data asli Anda).

| No | Nama | Sumber | Kebutuhan | Kategori |
|----|------|--------|-----------|----------|
| 1 | Contoh A | Inbound WA | Tanya pricelist | 🔥 Hot |
| 2 | Contoh B | Website | Minta demo | 🔥 Hot |
| 3 | Contoh C | Referral | Tanya sistem | 🟡 Warm |
| 4 | Contoh D | Bio/Ads | Tertarik produk | ❄️ Cold |

**Distribusi Kategori**

- 🔥 Hot: 2 lead — kebutuhan spesifik, siap lanjut
- 🟡 Warm: 1 lead — minat ada, perlu follow-up
- ❄️ Cold: 1 lead — sinyal lemah

---

### ⚠️ Catatan

Halaman terdeteksi otomatis dari panjang konten — tambahkan teks di bawah ini untuk melihat halaman ke-2 muncul di panel Layout & Paper.

Edit teks ini langsung di panel kiri — semua perubahan tampil realtime di sini.`;

const state = {
  title: 'Demo Auto Audit - Devina - Sales',
  generatedAt: new Date(),
  modelId: null,
  dateStart: new Date(),
  dateEnd: new Date(Date.now() + 7 * 86400000),
  type: 'Private',
  markdown: DEFAULT_MARKDOWN,
  fontFamily: "'Inter', Arial, sans-serif",
  fontSizePt: 10.5,
  paperSize: 'A4',
  paperW: 21,
  paperH: 29.7,
  orientation: 'portrait',
  marginTop: 1.5,
  marginRight: 1.5,
  marginBottom: 1.5,
  marginLeft: 1.5,
  marginLinked: true,
  pageOverrides: {},
};

let modelGroups = {}; // providerKey -> [{id,name}]
let allModelsFlat = [];

// ---------- utils ----------

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(str, fallback) {
  if (!str) return fallback;
  const d = new Date(str);
  return isNaN(d.getTime()) ? fallback : d;
}

function formatShort(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatShortWithYear(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatGenerated(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())} ${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function slugify(str) {
  return (str || 'document')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document';
}

function paperDims(sizeKey, w, h, orientation) {
  // Custom sizes are the user's exact numbers — never silently swapped.
  if (sizeKey === 'Custom') return [Number(w) || 21, Number(h) || 29.7];
  const base = PAPER_PRESETS[sizeKey] || PAPER_PRESETS.A4;
  const long = Math.max(base[0], base[1]);
  const short = Math.min(base[0], base[1]);
  return orientation === 'landscape' ? [long, short] : [short, long];
}

const CM_TO_PX = 37.7952755905512; // 96dpi reference, matches how the on-screen `cm`-unit preview itself is sized

function effectiveSettingsForPage(idx) {
  const base = {
    paperSize: state.paperSize, paperW: state.paperW, paperH: state.paperH,
    orientation: state.orientation,
    marginTop: state.marginTop, marginRight: state.marginRight,
    marginBottom: state.marginBottom, marginLeft: state.marginLeft,
  };
  const ov = state.pageOverrides[idx];
  if (ov && ov.enabled) return { ...base, ...ov };
  return base;
}

// ---------- automatic pagination ----------
// Pages are detected from real rendered content height (like a document
// editor), not from manual markers. Each page's available height can differ
// (per-page overrides), so packing is sequential: page 0 fills up first,
// then whatever's left flows onto page 1 with *its own* budget, and so on.

function pageBudgetPx(idx, headerHpx, footerHpx) {
  const eff = effectiveSettingsForPage(idx);
  const [, ph] = paperDims(eff.paperSize, eff.paperW, eff.paperH, eff.orientation);
  const contentHcm = ph - eff.marginTop - eff.marginBottom;
  const contentHpx = contentHcm * CM_TO_PX;
  // Footer height is conservatively reserved on every page (we don't know
  // which page will end up last until packing finishes), trading a little
  // unused space for a guarantee the footer never gets clipped.
  return contentHpx - (idx === 0 ? headerHpx : 0) - footerHpx;
}

function paginateContent(markdown, headerHTML, footerHTML) {
  const fontStyle = `font-family:${state.fontFamily}; font-size:${state.fontSizePt}pt;`;
  const bodyHtml = renderMarkdown(markdown);

  const eff0 = effectiveSettingsForPage(0);
  const [pw0] = paperDims(eff0.paperSize, eff0.paperW, eff0.paperH, eff0.orientation);
  const contentWidthCm = pw0 - eff0.marginLeft - eff0.marginRight;

  const measureRoot = document.createElement('div');
  measureRoot.className = 'doc-body measure-root';
  measureRoot.style.cssText = `${fontStyle} position:absolute; left:-99999px; top:0; visibility:hidden; width:${contentWidthCm}cm;`;
  document.body.appendChild(measureRoot);

  measureRoot.innerHTML = headerHTML;
  const headerHpx = measureRoot.scrollHeight;
  measureRoot.innerHTML = footerHTML;
  const footerHpx = measureRoot.scrollHeight;

  measureRoot.innerHTML = bodyHtml;
  const blocks = Array.from(measureRoot.children);
  const n = blocks.length;
  const offsetTops = blocks.map((b) => b.offsetTop);
  const totalScrollHeight = measureRoot.scrollHeight;
  const blockHeights = blocks.map((b, i) => (i + 1 < n ? offsetTops[i + 1] : totalScrollHeight) - offsetTops[i]);
  const blockHtmls = blocks.map((b) => b.outerHTML);

  document.body.removeChild(measureRoot);

  const chunks = [];
  let pageIdx = 0;
  let current = [];
  let usedPx = 0;
  let budget = pageBudgetPx(0, headerHpx, footerHpx);

  for (let i = 0; i < n; i++) {
    const h = blockHeights[i];
    if (current.length > 0 && usedPx + h > budget) {
      chunks.push(current);
      pageIdx++;
      current = [];
      usedPx = 0;
      budget = pageBudgetPx(pageIdx, headerHpx, footerHpx);
    }
    current.push(blockHtmls[i]);
    usedPx += h;
  }
  chunks.push(current);

  return chunks.map((blockList, idx) => {
    const eff = effectiveSettingsForPage(idx);
    const [pw, ph] = paperDims(eff.paperSize, eff.paperW, eff.paperH, eff.orientation);
    const isFirst = idx === 0;
    const isLast = idx === chunks.length - 1;
    const html = (isFirst ? headerHTML : '') + blockList.join('\n') + (isLast ? footerHTML : '');
    return {
      html, widthCm: pw, heightCm: ph,
      marginTop: eff.marginTop, marginRight: eff.marginRight, marginBottom: eff.marginBottom, marginLeft: eff.marginLeft,
    };
  });
}

// ---------- header/infobar/footer templates ----------

function tokenIconSvg() {
  return `<img src="/vendor/icons/token-coin.png" width="15" height="15" alt="">`;
}

function headerHtml() {
  return `<div class="doc-header">
    <div class="doc-logo"><img src="/assets/logo-auto-audit.png" width="88" height="36" alt="auto audit"></div>
    <div class="doc-title-block">
      <p class="doc-title">${escapeText(state.title)}</p>
      <div class="doc-generated">Generated on: ${formatGenerated(state.generatedAt)}</div>
    </div>
  </div>`;
}

function escapeText(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function infoBarHtml(tokens) {
  const modelLabel = allModelsFlat.find((m) => m.id === state.modelId)?.name || state.modelId || '—';
  const providerKey = detectProvider(state.modelId || '', modelLabel);
  const icon = state.modelId ? providerIconHtml(providerKey) : '';
  const dateRange = `${formatShort(state.dateStart)} - ${formatShortWithYear(state.dateEnd)}`;
  return `<div class="doc-infobar">
    <div><div class="doc-info-label">Model Used</div><div class="doc-info-value">${icon}<span>${escapeText(modelLabel)}</span></div></div>
    <div><div class="doc-info-label">Tokens</div><div class="doc-info-value tokens">${tokenIconSvg()}${tokens.toLocaleString('en-US')}</div></div>
    <div><div class="doc-info-label">Tanggal</div><div class="doc-info-value">${dateRange}</div></div>
    <div><div class="doc-info-label">Type</div><div class="doc-info-value">${escapeText(state.type)}</div></div>
  </div>`;
}

function footerHtml() {
  return `<div class="doc-footer">Laporan ini dibuat oleh Auto Audit AI &copy;${state.generatedAt.getFullYear()}</div>`;
}

// ---------- render ----------

function render() {
  const words = countWords(state.markdown);
  const tokens = state.modelId ? estimateTokens(words, state.modelId) : 0;

  const header = headerHtml() + infoBarHtml(tokens);
  const footer = footerHtml();
  const fontStyle = `font-family:${state.fontFamily}; font-size:${state.fontSizePt}pt;`;

  const pages = paginateContent(state.markdown, header, footer);

  // Drop stale override state for pages that no longer exist (content shrank).
  Object.keys(state.pageOverrides).map(Number).forEach((k) => {
    if (k >= pages.length) delete state.pageOverrides[k];
  });

  const container = $('pages');
  container.innerHTML = '';

  pages.forEach((p) => {
    const sheet = document.createElement('div');
    sheet.className = 'page-sheet';
    sheet.style.width = p.widthCm + 'cm';
    sheet.style.height = p.heightCm + 'cm';
    sheet.style.padding = `${p.marginTop}cm ${p.marginRight}cm ${p.marginBottom}cm ${p.marginLeft}cm`;
    sheet.style.overflow = 'hidden';
    const inner = document.createElement('div');
    inner.className = 'doc-body';
    inner.style.cssText = fontStyle;
    inner.innerHTML = p.html;
    sheet.appendChild(inner);
    container.appendChild(sheet);
  });

  renderPerPageOverridesUI(pages.length);
}

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 200);
}

// ---------- per-page override UI ----------

function renderPerPageOverridesUI(pageCount) {
  const list = $('per-page-list');
  list.innerHTML = '';

  for (let i = 0; i < pageCount; i++) {
    if (!state.pageOverrides[i]) {
      state.pageOverrides[i] = {
        enabled: false, paperSize: state.paperSize, paperW: state.paperW, paperH: state.paperH,
        orientation: state.orientation, marginTop: state.marginTop, marginRight: state.marginRight,
        marginBottom: state.marginBottom, marginLeft: state.marginLeft,
      };
    }
    const ov = state.pageOverrides[i];
    const row = document.createElement('div');
    row.className = 'page-override-row';
    row.innerHTML = `
      <div class="page-override-row-title">Halaman ${i + 1}</div>
      <label class="checkbox-field">
        <input type="checkbox" data-idx="${i}" class="ov-enabled" ${ov.enabled ? 'checked' : ''}>
        <span>Override ukuran halaman ini (default: ukuran global)</span>
      </label>
      <div class="ov-fields" ${ov.enabled ? '' : 'hidden'}>
        <div class="field-row">
          <label class="field"><span>Preset</span>
            <select data-idx="${i}" class="ov-size">
              <option value="A4">A4</option><option value="Letter">Letter</option>
              <option value="Legal">Legal</option><option value="Custom">Custom</option>
            </select>
          </label>
          <label class="field"><span>Orientasi</span>
            <select data-idx="${i}" class="ov-orientation">
              <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
            </select>
          </label>
        </div>
        <div class="field-row ov-custom-row" ${ov.paperSize === 'Custom' ? '' : 'hidden'}>
          <label class="field"><span>Lebar (cm)</span><input type="number" step="0.1" data-idx="${i}" class="ov-w" value="${ov.paperW}"></label>
          <label class="field"><span>Tinggi (cm)</span><input type="number" step="0.1" data-idx="${i}" class="ov-h" value="${ov.paperH}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Margin T/B (cm)</span>
            <input type="number" step="0.1" data-idx="${i}" class="ov-mtb" value="${ov.marginTop}"></label>
          <label class="field"><span>Margin K/K (cm)</span>
            <input type="number" step="0.1" data-idx="${i}" class="ov-mlr" value="${ov.marginLeft}"></label>
        </div>
      </div>`;
    row.querySelector('.ov-size').value = ov.paperSize;
    row.querySelector('.ov-orientation').value = ov.orientation;
    list.appendChild(row);
  }

  list.querySelectorAll('.ov-enabled').forEach((el) => el.addEventListener('change', (e) => {
    const idx = Number(e.target.dataset.idx);
    state.pageOverrides[idx].enabled = e.target.checked;
    renderPerPageOverridesUI(pageCount);
    scheduleRender();
  }));
  list.querySelectorAll('.ov-size').forEach((el) => el.addEventListener('change', (e) => {
    const idx = Number(e.target.dataset.idx);
    state.pageOverrides[idx].paperSize = e.target.value;
    renderPerPageOverridesUI(pageCount);
    scheduleRender();
  }));
  list.querySelectorAll('.ov-orientation').forEach((el) => el.addEventListener('change', (e) => {
    state.pageOverrides[Number(e.target.dataset.idx)].orientation = e.target.value;
    scheduleRender();
  }));
  list.querySelectorAll('.ov-w').forEach((el) => el.addEventListener('input', (e) => {
    state.pageOverrides[Number(e.target.dataset.idx)].paperW = Number(e.target.value) || 0;
    scheduleRender();
  }));
  list.querySelectorAll('.ov-h').forEach((el) => el.addEventListener('input', (e) => {
    state.pageOverrides[Number(e.target.dataset.idx)].paperH = Number(e.target.value) || 0;
    scheduleRender();
  }));
  list.querySelectorAll('.ov-mtb').forEach((el) => el.addEventListener('input', (e) => {
    const ov = state.pageOverrides[Number(e.target.dataset.idx)];
    ov.marginTop = ov.marginBottom = Number(e.target.value) || 0;
    scheduleRender();
  }));
  list.querySelectorAll('.ov-mlr').forEach((el) => el.addEventListener('input', (e) => {
    const ov = state.pageOverrides[Number(e.target.dataset.idx)];
    ov.marginLeft = ov.marginRight = Number(e.target.value) || 0;
    scheduleRender();
  }));
}

// ---------- model picker ----------

async function loadModels() {
  const statusEl = $('model-status');
  statusEl.textContent = 'Memuat model dari OpenRouter...';
  let list = [];
  try {
    const res = await fetch('/api/models');
    if (!res.ok) throw new Error('bad status');
    const json = await res.json();
    list = (json.data || []).map((m) => ({ id: m.id, name: m.name || m.id }));
    if (!list.length) throw new Error('empty');
    statusEl.textContent = `${list.length} model dimuat dari OpenRouter.`;
  } catch (e) {
    list = FALLBACK_MODELS;
    statusEl.textContent = 'Gagal memuat OpenRouter — memakai daftar model bawaan (offline).';
  }

  modelGroups = {};
  list.forEach((m) => {
    const key = detectProvider(m.id, m.name) || 'other';
    if (!modelGroups[key]) modelGroups[key] = [];
    modelGroups[key].push(m);
  });
  allModelsFlat = list;

  if (!state.modelId && list.length) {
    state.modelId = list[0].id;
  }
  renderModelList('');
  updateModelPickerButton();
  scheduleRender();
}

function updateModelPickerButton() {
  const model = allModelsFlat.find((m) => m.id === state.modelId);
  const key = detectProvider(state.modelId || '', model?.name);
  $('model-picker-icon').innerHTML = state.modelId ? providerIconHtml(key) : '';
  $('model-picker-label').textContent = model ? model.name : 'Pilih model...';
}

function renderModelList(filter) {
  const listEl = $('model-list');
  listEl.innerHTML = '';
  const f = filter.trim().toLowerCase();

  Object.keys(modelGroups).forEach((key) => {
    const items = modelGroups[key].filter((m) => !f || m.name.toLowerCase().includes(f) || m.id.toLowerCase().includes(f));
    if (!items.length) return;
    const groupLabel = document.createElement('div');
    groupLabel.className = 'model-group-label';
    groupLabel.textContent = providerMeta(key === 'other' ? null : key).label;
    listEl.appendChild(groupLabel);
    items.slice(0, 50).forEach((m) => {
      const row = document.createElement('div');
      row.className = 'model-row' + (m.id === state.modelId ? ' selected' : '');
      row.innerHTML = `<span class="model-row-icon">${providerIconHtml(key)}</span><span>${escapeText(m.name)}</span>`;
      row.addEventListener('click', () => {
        state.modelId = m.id;
        updateModelPickerButton();
        renderModelList($('model-search').value);
        $('model-picker-panel').hidden = true;
        scheduleRender();
      });
      listEl.appendChild(row);
    });
  });
}

// ---------- wiring ----------

function bind() {
  $('f-title').value = state.title;
  $('f-generated').value = toLocalInputValue(state.generatedAt);
  $('f-date-start').value = toLocalInputValue(state.dateStart);
  $('f-date-end').value = toLocalInputValue(state.dateEnd);
  $('f-markdown').value = state.markdown;
  $('f-font').value = state.fontFamily;
  $('f-font-size').value = state.fontSizePt;
  $('f-paper-size').value = state.paperSize;
  $('f-paper-w').value = state.paperW;
  $('f-paper-h').value = state.paperH;
  $('f-margin-top').value = state.marginTop;
  $('f-margin-right').value = state.marginRight;
  $('f-margin-bottom').value = state.marginBottom;
  $('f-margin-left').value = state.marginLeft;

  $('f-title').addEventListener('input', (e) => { state.title = e.target.value; scheduleRender(); });
  $('f-generated').addEventListener('input', (e) => { state.generatedAt = fromLocalInputValue(e.target.value, state.generatedAt); scheduleRender(); });
  $('f-date-start').addEventListener('input', (e) => { state.dateStart = fromLocalInputValue(e.target.value, state.dateStart); scheduleRender(); });
  $('f-date-end').addEventListener('input', (e) => { state.dateEnd = fromLocalInputValue(e.target.value, state.dateEnd); scheduleRender(); });

  $('f-type').addEventListener('change', (e) => {
    const custom = $('f-type-custom');
    if (e.target.value === '__custom') {
      custom.hidden = false;
      state.type = custom.value || '';
    } else {
      custom.hidden = true;
      state.type = e.target.value;
    }
    scheduleRender();
  });
  $('f-type-custom').addEventListener('input', (e) => { state.type = e.target.value; scheduleRender(); });

  $('f-markdown').addEventListener('input', (e) => { state.markdown = e.target.value; scheduleRender(); });

  $('f-font').addEventListener('change', (e) => { state.fontFamily = e.target.value; scheduleRender(); });
  $('f-font-size').addEventListener('input', (e) => { state.fontSizePt = Number(e.target.value) || 10.5; scheduleRender(); });

  $('f-paper-size').addEventListener('change', (e) => {
    state.paperSize = e.target.value;
    $('custom-size-row').hidden = e.target.value !== 'Custom';
    scheduleRender();
  });
  $('f-paper-w').addEventListener('input', (e) => { state.paperW = Number(e.target.value) || 21; scheduleRender(); });
  $('f-paper-h').addEventListener('input', (e) => { state.paperH = Number(e.target.value) || 29.7; scheduleRender(); });

  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.orientation = btn.dataset.orientation;
      scheduleRender();
    });
  });

  const marginIds = ['f-margin-top', 'f-margin-right', 'f-margin-bottom', 'f-margin-left'];
  const marginKeys = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'];
  marginIds.forEach((id, i) => {
    $(id).addEventListener('input', (e) => {
      const val = Number(e.target.value) || 0;
      if (state.marginLinked) {
        marginKeys.forEach((k) => { state[k] = val; });
        marginIds.forEach((mid) => { $(mid).value = val; });
      } else {
        state[marginKeys[i]] = val;
      }
      scheduleRender();
    });
  });
  $('f-margin-link').addEventListener('change', (e) => { state.marginLinked = e.target.checked; });

  $('btn-refresh').addEventListener('click', () => { clearTimeout(renderTimer); render(); });
  $('btn-save-pdf').addEventListener('click', exportPdf);

  $('model-picker-btn').addEventListener('click', () => {
    const panel = $('model-picker-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) $('model-search').focus();
  });
  $('model-search').addEventListener('input', (e) => renderModelList(e.target.value));
  document.addEventListener('click', (e) => {
    const panel = $('model-picker-panel');
    if (!panel.hidden && !panel.contains(e.target) && e.target !== $('model-picker-btn') && !$('model-picker-btn').contains(e.target)) {
      panel.hidden = true;
    }
  });
}

// ---------- export ----------

async function exportPdf() {
  const btn = $('btn-save-pdf');
  const status = $('export-status');
  btn.disabled = true;
  status.classList.remove('error');
  status.textContent = 'Menyiapkan PDF...';

  try {
    const { jsPDF } = window.jspdf;
    const sheets = Array.from(document.querySelectorAll('.page-sheet'));
    const filename = slugify(state.title) + '.pdf';

    let doc = null;
    for (let i = 0; i < sheets.length; i++) {
      status.textContent = `Merender halaman ${i + 1} / ${sheets.length}...`;
      const eff = effectiveSettingsForPage(i);
      const [pw, ph] = paperDims(eff.paperSize, eff.paperW, eff.paperH, eff.orientation);
      const orientationParam = pw > ph ? 'l' : 'p';
      const canvas = await window.html2canvas(sheets[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const img = canvas.toDataURL('image/png');
      if (!doc) {
        doc = new jsPDF({ unit: 'cm', format: [pw, ph], orientation: orientationParam });
      } else {
        doc.addPage([pw, ph], orientationParam);
      }
      doc.addImage(img, 'PNG', 0, 0, pw, ph);
    }
    doc.save(filename);
    status.textContent = 'PDF tersimpan: ' + filename;
  } catch (err) {
    status.classList.add('error');
    status.textContent = 'Gagal membuat PDF: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

// ---------- init ----------

bind();
render();
loadModels();
