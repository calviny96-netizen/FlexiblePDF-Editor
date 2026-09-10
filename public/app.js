import { paginateHTML, installColumnResizers } from './pagination.js';
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

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 0, 0); return x; }

const state = {
  title: 'Demo Auto Audit - Devina - Sales',
  generatedAt: new Date(),
  modelId: null,
  dateStart: startOfDay(new Date(Date.now() - 6 * 86400000)),
  dateEnd: endOfDay(new Date()),
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
  columnWidths: {},
  tokenOverride: null,
  footerEnabled: false,
  logoUrl: null,
  logoSize: [88, 36],
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

// Numeric fields (paper size, margins, font size) commit on blur/Enter
// rather than on every keystroke — otherwise editing "29.7" into "32.5" by
// deleting and retyping digits re-renders (and briefly falls back to a
// default) after every single character, before the user is done typing.
function commitOnEnter(el) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.blur();
  });
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

function paginateContent(markdown, headerHTML, footerHTML) {
  return paginateHTML(renderMarkdown(markdown), headerHTML, footerHTML, idx => {
    const eff = effectiveSettingsForPage(idx);
    const [widthCm, heightCm] = paperDims(eff.paperSize, eff.paperW, eff.paperH, eff.orientation);
    return { ...eff, widthCm, heightCm };
  }, `font-family:${state.fontFamily};font-size:${state.fontSizePt}pt;`, state.columnWidths);
}

// ---------- header/infobar/footer templates ----------

function tokenIconSvg() {
  return `<img src="/vendor/icons/token-coin.png" width="15" height="15" alt="">`;
}

function headerHtml() {
  return `<div class="doc-header">
    <div class="doc-logo"><img src="${state.logoUrl || '/assets/logo-auto-audit.png'}" width="${state.logoSize[0]}" height="${state.logoSize[1]}" style="width:${state.logoSize[0]}px;height:${state.logoSize[1]}px" alt="Logo dokumen"></div>
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
  if (!state.footerEnabled) return '';
  return `<div class="doc-footer">Laporan ini dibuat oleh Auto Audit AI &copy;${state.generatedAt.getFullYear()}</div>`;
}

// ---------- render ----------

function render() {
  const words = countWords(state.markdown);
  const automaticTokens = state.modelId ? estimateTokens(words, state.modelId) : 0;
  const tokens = state.tokenOverride ?? automaticTokens;
  if (document.activeElement !== $('f-tokens')) $('f-tokens').value = tokens;
  $('token-mode').textContent = state.tokenOverride === null ? 'Otomatis dari isi dan model' : `Manual · estimasi otomatis: ${automaticTokens.toLocaleString('en-US')}`;
  $('btn-auto-tokens').disabled = state.tokenOverride === null;

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

  installColumnResizers(container, state.columnWidths, scheduleColumnRender);
  renderPerPageOverridesUI(pages.length);
}

let columnRenderFrame = null;
function scheduleColumnRender() {
  if (columnRenderFrame !== null) return;
  columnRenderFrame = requestAnimationFrame(() => {
    columnRenderFrame = null;
    render();
  });
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
  list.querySelectorAll('.ov-w').forEach((el) => { commitOnEnter(el); el.addEventListener('change', (e) => {
    state.pageOverrides[Number(e.target.dataset.idx)].paperW = Number(e.target.value) || 0;
    scheduleRender();
  }); });
  list.querySelectorAll('.ov-h').forEach((el) => { commitOnEnter(el); el.addEventListener('change', (e) => {
    state.pageOverrides[Number(e.target.dataset.idx)].paperH = Number(e.target.value) || 0;
    scheduleRender();
  }); });
  list.querySelectorAll('.ov-mtb').forEach((el) => { commitOnEnter(el); el.addEventListener('change', (e) => {
    const ov = state.pageOverrides[Number(e.target.dataset.idx)];
    ov.marginTop = ov.marginBottom = Number(e.target.value) || 0;
    scheduleRender();
  }); });
  list.querySelectorAll('.ov-mlr').forEach((el) => { commitOnEnter(el); el.addEventListener('change', (e) => {
    const ov = state.pageOverrides[Number(e.target.dataset.idx)];
    ov.marginLeft = ov.marginRight = Number(e.target.value) || 0;
    scheduleRender();
  }); });
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

// ---------- date range picker ----------

let dateRangePicker = null;

function applyDateRange(start, end) {
  state.dateStart = startOfDay(start);
  state.dateEnd = endOfDay(end);
  if (dateRangePicker) dateRangePicker.setDateRange(state.dateStart, state.dateEnd, true);
  document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
  scheduleRender();
}

function initDateRangePicker() {
  dateRangePicker = new window.Litepicker({
    element: $('f-date-range'),
    singleMode: false,
    numberOfMonths: 2,
    numberOfColumns: 2,
    format: 'DD MMM YYYY',
    startDate: state.dateStart,
    endDate: state.dateEnd,
    setup: (picker) => {
      picker.on('selected', (date1, date2) => {
        document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
        state.dateStart = startOfDay(date1.dateInstance);
        state.dateEnd = endOfDay(date2.dateInstance);
        scheduleRender();
      });
    },
  });

  const today = () => new Date();
  const presets = {
    today: () => { const t = today(); return [t, t]; },
    yesterday: () => { const y = new Date(Date.now() - 86400000); return [y, y]; },
    last7: () => [new Date(Date.now() - 6 * 86400000), today()],
    last30: () => [new Date(Date.now() - 29 * 86400000), today()],
    thisMonth: () => {
      const t = today();
      return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
    },
    lastMonth: () => {
      const t = today();
      return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
    },
  };

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [start, end] = presets[btn.dataset.preset]();
      applyDateRange(start, end);
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ---------- wiring ----------

function bind() {
  let logoUpload = 0;
  $('f-footer-enabled').addEventListener('change', e => {
    state.footerEnabled = e.target.checked;
    render();
  });
  $('f-logo').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const version = ++logoUpload;
    const url = URL.createObjectURL(file);
    $('logo-status').textContent = 'Memuat logo...';
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      // Normalize uploads to a local PNG for reliable preview/PDF rendering.
      const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/png');
      if (version !== logoUpload) return;
      state.logoUrl = data;
      const fit = Math.min(88 / canvas.width, 52 / canvas.height);
      state.logoSize = [canvas.width * fit, canvas.height * fit];
      $('logo-status').textContent = file.name;
      $('btn-reset-logo').disabled = false;
      render();
    } catch {
      if (version === logoUpload) $('logo-status').textContent = 'Gambar tidak dapat dibaca. Pilih file gambar lain.';
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  $('btn-reset-logo').addEventListener('click', () => {
    logoUpload++;
    state.logoUrl = null;
    state.logoSize = [88, 36];
    $('f-logo').value = '';
    $('logo-status').textContent = 'Logo bawaan · proporsi gambar tetap';
    $('btn-reset-logo').disabled = true;
    render();
  });
  commitOnEnter($('f-tokens'));
  $('f-tokens').addEventListener('input', e => {
    if (e.target.value === '') state.tokenOverride = null;
    else if (e.target.validity.valid) state.tokenOverride = Number(e.target.value);
    else return;
    scheduleRender();
  });
  $('f-tokens').addEventListener('blur', scheduleRender);
  $('btn-auto-tokens').addEventListener('click', () => {
    state.tokenOverride = null;
    render();
  });
  $('f-title').value = state.title;
  $('f-generated').value = toLocalInputValue(state.generatedAt);
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

  initDateRangePicker();

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

  $('f-markdown').addEventListener('input', (e) => { state.markdown = e.target.value; state.columnWidths = {}; scheduleRender(); });

  $('f-font').addEventListener('change', (e) => { state.fontFamily = e.target.value; scheduleRender(); });
  commitOnEnter($('f-font-size'));
  $('f-font-size').addEventListener('change', (e) => { state.fontSizePt = Number(e.target.value) || 10.5; scheduleRender(); });

  $('f-paper-size').addEventListener('change', (e) => {
    state.paperSize = e.target.value;
    $('custom-size-row').hidden = e.target.value !== 'Custom';
    scheduleRender();
  });
  commitOnEnter($('f-paper-w'));
  commitOnEnter($('f-paper-h'));
  $('f-paper-w').addEventListener('change', (e) => { state.paperW = Number(e.target.value) || 21; scheduleRender(); });
  $('f-paper-h').addEventListener('change', (e) => { state.paperH = Number(e.target.value) || 29.7; scheduleRender(); });

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
    commitOnEnter($(id));
    $(id).addEventListener('change', (e) => {
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
    clearTimeout(renderTimer);
    await document.fonts.ready;
    render();
    const { jsPDF } = window.jspdf;
    const sheets = Array.from(document.querySelectorAll('.page-sheet'));
    const filename = slugify(state.title) + '.pdf';

    let doc = null;
    for (let i = 0; i < sheets.length; i++) {
      status.textContent = `Merender halaman ${i + 1} / ${sheets.length}...`;
      const eff = effectiveSettingsForPage(i);
      const [pw, ph] = paperDims(eff.paperSize, eff.paperW, eff.paperH, eff.orientation);
      const orientationParam = pw > ph ? 'l' : 'p';
      // scale 1.5 (not 2) + JPEG (not PNG): PNG at scale 2 was producing
      // enormous files once multiplied across many pages (the reported
      // "hundreds of MB" bug) — 1.5 is 44% fewer pixels than 2 while still
      // sharp for a document page, and JPEG compresses gradient/chart
      // content far better than lossless PNG.
      const canvas = await window.html2canvas(sheets[i], { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
      const img = canvas.toDataURL('image/jpeg', 0.85);
      if (!doc) {
        doc = new jsPDF({ unit: 'cm', format: [pw, ph], orientation: orientationParam, compress: true });
      } else {
        doc.addPage([pw, ph], orientationParam);
      }
      doc.addImage(img, 'JPEG', 0, 0, pw, ph, undefined, 'MEDIUM');
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
document.fonts.ready.then(scheduleRender);
loadModels();
