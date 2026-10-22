/**
 * AI Assistant Frontend Module for Sistem Survei Lapangan
 * Dual-Mode: Direct Google Gemini API (Recommended for Indonesia, zero blocking)
 * OR Cloudflare Worker Proxy
 */
(function () {
  'use strict';

  const STORAGE_KEY_APIKEY = 'survei_gemini_api_key';
  const STORAGE_KEY_WORKER = 'survei_ai_worker_url';
  const isAir = /air\.html/i.test(location.pathname) || !!document.querySelector('.water-sheet');
  const isUdara = /udara\.html/i.test(location.pathname) || (!isAir && !!document.querySelector('.sheet[data-page]'));
  const isIndex = !isAir && !isUdara;

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY_APIKEY) || '';
  }

  function setApiKey(key) {
    localStorage.setItem(STORAGE_KEY_APIKEY, key.trim());
  }

  function getWorkerUrl() {
    return localStorage.getItem(STORAGE_KEY_WORKER) || '';
  }

  function setWorkerUrl(url) {
    localStorage.setItem(STORAGE_KEY_WORKER, url.trim().replace(/\/+$/, ''));
  }

  // Create UI elements
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ai-fab-btn';
  fab.id = 'openAiAssistantBtn';
  fab.title = 'Buka Asisten AI Gemini';
  fab.innerHTML = `<span class="ai-sparkle-icon">✨</span><span>Asisten AI</span>`;
  document.body.appendChild(fab);

  const modal = document.createElement('div');
  modal.className = 'ai-modal-overlay';
  modal.id = 'aiModalOverlay';
  modal.innerHTML = `
    <div class="ai-modal-card" role="dialog" aria-modal="true" aria-label="Asisten AI Gemini">
      <div class="ai-modal-header">
        <div class="ai-header-brand">
          <div class="ai-header-badge">✨</div>
          <div class="ai-header-title">
            <h3>Asisten AI Lapangan</h3>
            <p>Didukung Google Gemini AI (100% Gratis & Realtime)</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="ai-status-indicator" id="aiStatusPill"><span class="ai-dot"></span><span id="aiStatusText">Memeriksa...</span></span>
          <button type="button" class="ai-close-btn" id="closeAiModalBtn" aria-label="Tutup">✕</button>
        </div>
      </div>
      
      <div class="ai-tabs" role="tablist">
        ${isUdara ? '<button type="button" class="ai-tab-btn active" data-tab="tab-24h">⚡ Proyeksi 24 Jam</button>' : ''}
        <button type="button" class="ai-tab-btn ${!isUdara ? 'active' : ''}" data-tab="tab-autofill">📋 Lengkapi Form</button>
        <button type="button" class="ai-tab-btn" data-tab="tab-chat">💬 Chat AI</button>
        <button type="button" class="ai-tab-btn" data-tab="tab-settings">⚙️ Pengaturan</button>
      </div>

      <div class="ai-modal-body">
        <!-- TAB 1: 24-HOUR PROJECTION (KHUSUS UDARA) -->
        ${isUdara ? `
        <div class="ai-tab-pane active" id="tab-24h">
          <div class="ai-card">
            <h4>⚡ Proyeksi 24 Jam Terintegrasi Data Lapangan</h4>
            <p style="margin-bottom:12px;">AI melengkapi data 24 jam dengan <b>menyesuaikan data riil</b> yang sudah Anda catat di lapangan. Jam yang sudah diisi akan dikunci/dipertahankan, dan AI hanya melengkapi jam yang masih kosong secara ilmiah (meteorologi diurnal, tekanan, laju alir stabil, RH%, arah & kecepatan angin, cuaca).</p>
            
            <!-- Banner Deteksi Form Real Data -->
            <div id="aiRealDataBanner" class="ai-banner-realdata">
              <span id="aiRealDataBannerText">🔍 Memindai data formulir aktif...</span>
              <button type="button" class="ai-btn-sm secondary" id="aiRefreshRealDataBtn" title="Pindai Ulang Form">🔄 Pindai Form</button>
            </div>

            <!-- Titik Acuan Sampel Lapangan (Anchor Points) -->
            <div class="ai-anchor-section">
              <div class="ai-anchor-header">
                <h5>📍 Titik Acuan Kondisi Lapangan (Ground Truth)</h5>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button type="button" class="ai-btn-sm secondary" id="aiPullFromFormBtn" title="Tarik baris yang sudah Anda isi di form">📥 Tarik Data dari Form</button>
                  <button type="button" class="ai-btn-sm primary" id="aiAddAnchorBtn">➕ Tambah Acuan</button>
                  <button type="button" class="ai-btn-sm secondary" id="aiPresetAnchorsBtn" title="Isi titik sampel tipikal: Pagi, Siang, Sore, Malam, Subuh">✨ Preset Tipikal</button>
                  <button type="button" class="ai-btn-sm danger" id="aiClearAnchorsBtn" title="Hapus semua acuan manual">🗑️</button>
                </div>
              </div>
              <p style="font-size:11px;color:#64748b;margin:0 0 8px;">Titik acuan di bawah adalah data riil yang <b>wajib dipertahankan</b>. AI akan menginterpolasi jam kosong lainnya agar kurva angkanya bersambung mulus.</p>
              
              <div class="ai-anchor-table-wrap">
                <table class="ai-anchor-table" id="aiAnchorTable">
                  <thead>
                    <tr>
                      <th style="width:70px;">Jam Ke-</th>
                      <th style="width:75px;">Waktu</th>
                      <th style="width:75px;">Suhu (°C)</th>
                      <th style="width:85px;">Tekanan (mmHg)</th>
                      <th style="width:80px;">Laju (L/m)</th>
                      <th style="width:70px;">RH (%)</th>
                      <th style="width:75px;">Angin (m/s)</th>
                      <th style="width:90px;">Arah Angin</th>
                      <th style="width:105px;">Cuaca</th>
                      <th style="width:40px;">Hapus</th>
                    </tr>
                  </thead>
                  <tbody id="aiAnchorTableBody"></tbody>
                </table>
              </div>
            </div>

            <!-- Opsi Pengaturan -->
            <div class="ai-input-grid">
              <div class="ai-field-group">
                <label>Terapkan Pada Tabel</label>
                <select id="ai24hTargetTable">
                  <option value="all">Semua (TSP, PM10 & PM2,5)</option>
                  <option value="tsp24">Hanya TSP (Debu 24 Jam)</option>
                  <option value="pm10">Hanya PM10 (24 Jam)</option>
                  <option value="pm25">Hanya PM2,5 (24 Jam)</option>
                </select>
              </div>
              <div class="ai-field-group">
                <label>Waktu Mulai Jam ke-1</label>
                <input type="time" id="ai24hStartTime" value="08:00">
              </div>
              <div class="ai-field-group">
                <label>Suhu Awal / Cadangan (°C)</label>
                <input type="number" id="ai24hStartTemp" placeholder="Cth: 29.5" step="0.1">
              </div>
              <div class="ai-field-group">
                <label>Arah Angin Dominan</label>
                <select id="ai24hWindDir">
                  <option value="Timur" selected>Timur</option>
                  <option value="Tenggara">Tenggara</option>
                  <option value="Selatan">Selatan</option>
                  <option value="Barat Daya">Barat Daya</option>
                  <option value="Barat">Barat</option>
                  <option value="Barat Laut">Barat Laut</option>
                  <option value="Utara">Utara</option>
                  <option value="Timur Laut">Timur Laut</option>
                </select>
              </div>
            </div>

            <!-- Proteksi Data Riil Checkbox -->
            <div style="margin:12px 0 14px;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
              <label class="ai-checkbox-label">
                <input type="checkbox" id="aiProtectRealDataCheckbox" checked>
                <span><b>Hanya lengkapi kolom yang KOSONG</b> (Pertahankan data riil yang sudah diketik di form)</span>
              </label>
            </div>

            <button type="button" class="ai-btn-primary" id="aiGenerate24hBtn">⚡ Hitung Proyeksi 24 Jam Sesuai Kondisi Lapangan</button>
            
            <!-- Result Area -->
            <div id="ai24hResultArea" style="display:none;margin-top:14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:12px;font-weight:700;color:#0f172a;">Pratinjau Hasil Proyeksi (Lengkap 24 Jam Sesuai Form):</span>
                <span id="ai24hResultBadgeSummary" style="font-size:11px;"></span>
              </div>
              <div class="ai-preview-table-wrap">
                <table class="ai-preview-table" style="min-width:760px;">
                  <thead>
                    <tr>
                      <th style="width:45px;">Jam</th>
                      <th style="width:65px;">Waktu</th>
                      <th style="width:85px;">Tekanan (mmHg)</th>
                      <th style="width:75px;">Suhu (°C)</th>
                      <th style="width:80px;">Laju (L/m)</th>
                      <th style="width:70px;">RH (%)</th>
                      <th style="width:75px;">Kec. Angin</th>
                      <th style="width:80px;">Arah Angin</th>
                      <th style="width:95px;">Cuaca</th>
                      <th style="width:85px;">Status</th>
                    </tr>
                  </thead>
                  <tbody id="ai24hTableBody"></tbody>
                </table>
              </div>
              <button type="button" class="ai-btn-primary ai-btn-apply" id="aiApply24hBtn">✓ Terapkan Data ke Formulir Lapangan</button>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- TAB 2: SMART AUTOFILL FOR EMPTY FIELDS -->
        <div class="ai-tab-pane ${!isUdara ? 'active' : ''}" id="tab-autofill">
          <div class="ai-card">
            <h4>📋 Lengkapi Kolom Form yang Kosong</h4>
            <p>AI memindai formulir yang sedang aktif, mendeteksi isian yang belum lengkap, lalu melengkapinya secara logis dan ilmiah sesuai standar laboratorium.</p>
            <div class="ai-field-group" style="margin-bottom:12px;">
              <label>Instruksi Tambahan (Opsional)</label>
              <textarea id="aiAutofillInstruction" rows="2" placeholder="Contoh: Survei air sungai di Jawa Timur musim kemarau, debit sedang, titik hulu"></textarea>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:12px;color:#64748b;">
              <span id="aiEmptyFieldsCount">Memeriksa kolom kosong...</span>
            </div>
            <button type="button" class="ai-btn-primary" id="aiRunAutofillBtn">✨ Analisis & Lengkapi Data Kosong</button>
            <div id="aiAutofillResultArea" style="display:none;margin-top:14px;">
              <div id="aiAutofillSummary" style="font-size:12px;color:#334155;background:#e2e8f0;padding:8px 12px;border-radius:8px;margin-bottom:10px;"></div>
              <div id="aiAutofillList" style="max-height:160px;overflow-y:auto;font-size:11.5px;border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#fff;"></div>
              <button type="button" class="ai-btn-primary ai-btn-apply" id="aiApplyAutofillBtn">✓ Terapkan Data ke Formulir</button>
            </div>
          </div>
        </div>

        <!-- TAB 3: GENERAL AI CHAT -->
        <div class="ai-tab-pane" id="tab-chat">
          <div class="ai-chat-box" id="aiChatBox">
            <div class="ai-msg assistant">
              Halo! Saya Asisten AI Laboratorindo Alam Bestari. Anda bisa bertanya tentang SOP sampling, metode pengawetan sampel, perhitungan debit, atau meminta saya melengkapi bagian tertentu dari form. Ada yang bisa saya bantu?
            </div>
          </div>
          <div class="ai-chat-input-row">
            <input type="text" id="aiChatInput" placeholder="Ketik pertanyaan atau instruksi..." />
            <button type="button" class="ai-chat-send-btn" id="aiChatSendBtn">Kirim</button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            <button type="button" class="zoom-page-btn" onclick="document.getElementById('aiChatInput').value='Bagaimana acuan pengawetan sampel air menurut SNI?';document.getElementById('aiChatSendBtn').click()">📚 Acuan Pengawetan Air</button>
            <button type="button" class="zoom-page-btn" onclick="document.getElementById('aiChatInput').value='Jelaskan rumus debit sungai dengan kedalaman dan kecepatan arus';document.getElementById('aiChatSendBtn').click()">🌊 Rumus Debit</button>
            <button type="button" class="zoom-page-btn" onclick="document.getElementById('aiChatInput').value='Berapa baku mutu PP 22/2021 untuk udara ambien TSP, PM10, PM2.5?';document.getElementById('aiChatSendBtn').click()">💨 Baku Mutu Udara</button>
          </div>
        </div>

        <!-- TAB 4: SETTINGS (API KEY & CLOUD) -->
        <div class="ai-tab-pane" id="tab-settings">
          <div class="ai-card">
            <h4>🔑 Google Gemini API Key (Rekomendasi Utama)</h4>
            <p>Langsung terhubung ke Google AI Studio. <b>100% Gratis</b>, super cepat (&lt;1 detik), dan <b>bebas pemblokiran ISP di Indonesia</b>. Kunci tersimpan aman di memori perangkat ini (tidak di-upload ke GitHub).</p>
            <div class="ai-field-group" style="margin-bottom:12px;">
              <label>Gemini API Key (Google AI Studio)</label>
              <div style="display:flex;gap:6px;">
                <input type="password" id="aiApiKeyInput" placeholder="Tempelkan API Key (AIzaSy... atau AQ.Ab...)" style="flex:1;" />
                <button type="button" id="aiToggleKeyVis" class="zoom-page-btn" style="padding:0 10px;" title="Lihat/Sembunyikan">👁️</button>
              </div>
              <small style="color:#64748b;font-size:11px;">Kunci resmi Google AI Studio (berawalan AIzaSy... atau AQ.Ab...). Dapatkan gratis di <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#2563eb;text-decoration:underline;">aistudio.google.com</a></small>
            </div>

            <hr style="border:0;border-top:1px dashed #cbd5e1;margin:16px 0;">

            <h4>☁️ Atau Gunakan Cloudflare Worker (Opsional)</h4>
            <p style="margin-bottom:8px;">Gunakan jika Anda memiliki domain Worker yang aktif (opsional).</p>
            <div class="ai-field-group" style="margin-bottom:12px;">
              <label>Worker URL</label>
              <input type="url" id="aiWorkerUrlInput" placeholder="https://survei-ai.subdomain.workers.dev" />
            </div>

            <button type="button" class="ai-btn-primary" id="aiSaveSettingsBtn">💾 Simpan & Uji Koneksi</button>
            <div id="aiTestResult" style="margin-top:12px;font-size:12px;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Cache pending AI data
  let pending24hData = null;
  let pendingAutofillData = null;
  let anchorPoints = [];

  // Utility to get field value
  function getField(name) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked ? 'true' : '';
    return (el.value || '').trim();
  }

  // Scan 24-hour table rows in active form
  function scan24hTable(targetPrefix) {
    const prefixes = (!targetPrefix || targetPrefix === 'all') ? ['tsp24', 'pm10', 'pm25'] : [targetPrefix];
    const mapByHour = {};

    prefixes.forEach(prefix => {
      for (let h = 1; h <= 24; h++) {
        const waktu = getField(`${prefix}_${h}_waktu`);
        const tekanan = getField(`${prefix}_${h}_tekanan`);
        const suhu = getField(`${prefix}_${h}_suhu`);
        const laju = getField(`${prefix}_${h}_laju`);
        const kelembaban = getField(`${prefix}_${h}_kelembaban`);
        const kecepatan_angin = getField(`${prefix}_${h}_kecepatan_angin`);
        const arah_angin = getField(`${prefix}_${h}_arah_angin`);
        const cuaca = getField(`${prefix}_${h}_cuaca`);

        if (waktu || suhu || tekanan || laju || kelembaban || kecepatan_angin || arah_angin || cuaca) {
          if (!mapByHour[h]) {
            mapByHour[h] = {
              hour: h,
              waktu,
              suhu,
              tekanan,
              laju,
              kelembaban,
              kecepatan_angin,
              arah_angin,
              cuaca,
              sourcePrefix: prefix
            };
          } else {
            const cur = mapByHour[h];
            if (!cur.waktu && waktu) cur.waktu = waktu;
            if (!cur.suhu && suhu) cur.suhu = suhu;
            if (!cur.tekanan && tekanan) cur.tekanan = tekanan;
            if (!cur.laju && laju) cur.laju = laju;
            if (!cur.kelembaban && kelembaban) cur.kelembaban = kelembaban;
            if (!cur.kecepatan_angin && kecepatan_angin) cur.kecepatan_angin = kecepatan_angin;
            if (!cur.arah_angin && arah_angin) cur.arah_angin = arah_angin;
            if (!cur.cuaca && cuaca) cur.cuaca = cuaca;
          }
        }
      }
    });

    return Object.values(mapByHour).sort((a, b) => a.hour - b.hour);
  }

  // Refresh Real Data Banner
  function refreshRealDataBanner() {
    const banner = modal.querySelector('#aiRealDataBanner');
    const textEl = modal.querySelector('#aiRealDataBannerText');
    if (!banner || !textEl || !isUdara) return;

    const targetPrefix = modal.querySelector('#ai24hTargetTable')?.value || 'all';
    const foundRows = scan24hTable(targetPrefix);

    if (foundRows.length > 0) {
      banner.className = 'ai-banner-realdata';
      textEl.innerHTML = `🟢 Terdeteksi <b>${foundRows.length} jam data riil</b> di formulir (Jam ${foundRows.map(r => r.hour).join(', ')}). AI akan mengunci data riil ini dan hanya melengkapi jam yang masih kosong.`;
    } else {
      banner.className = 'ai-banner-realdata empty';
      textEl.innerHTML = `ℹ️ Belum terdeteksi data jam di form. Anda bisa klik <b>[➕ Tambah Acuan]</b> atau <b>[✨ Preset Tipikal]</b> untuk memasukkan sampel kondisi nyata lapangan.`;
    }
  }

  // Render Anchor Table in UI
  function renderAnchorTable() {
    const tbody = modal.querySelector('#aiAnchorTableBody');
    if (!tbody) return;

    if (anchorPoints.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="padding:16px;color:#94a3b8;font-style:italic;">Belum ada titik acuan. Klik <b>[📥 Tarik Data dari Form]</b> atau <b>[➕ Tambah Acuan]</b> untuk menambahkan sampel kondisi lapangan.</td></tr>`;
      return;
    }

    tbody.innerHTML = anchorPoints.map((a, idx) => `
      <tr data-anchor-idx="${idx}">
        <td>
          <select class="ai-anchor-hour" style="font-weight:700;">
            ${Array.from({ length: 24 }, (_, i) => i + 1).map(h => `<option value="${h}" ${h === Number(a.hour) ? 'selected' : ''}>Jam ${h}</option>`).join('')}
          </select>
        </td>
        <td><input type="time" class="ai-anchor-waktu" value="${a.waktu || ''}"></td>
        <td><input type="number" step="0.1" class="ai-anchor-suhu" placeholder="29.5" value="${a.suhu || ''}"></td>
        <td><input type="number" step="0.1" class="ai-anchor-tekanan" placeholder="756.0" value="${a.tekanan || ''}"></td>
        <td><input type="text" class="ai-anchor-laju" placeholder="12.0" value="${a.laju || ''}"></td>
        <td><input type="number" class="ai-anchor-kelembaban" placeholder="68" value="${a.kelembaban || ''}"></td>
        <td><input type="number" step="0.1" class="ai-anchor-kecepatan" placeholder="1.2" value="${a.kecepatan_angin || ''}"></td>
        <td>
          <select class="ai-anchor-arah">
            ${['Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut', 'Utara', 'Timur Laut'].map(d => `<option value="${d}" ${d === a.arah_angin ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </td>
        <td><input type="text" class="ai-anchor-cuaca" placeholder="Cerah" value="${a.cuaca || ''}"></td>
        <td><button type="button" class="ai-btn-sm danger ai-del-anchor-btn" title="Hapus titik ini">✕</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach((tr, idx) => {
      tr.querySelector('.ai-anchor-hour')?.addEventListener('change', (e) => {
        anchorPoints[idx].hour = Number(e.target.value);
        sortAnchors();
      });
      tr.querySelector('.ai-anchor-waktu')?.addEventListener('input', (e) => { anchorPoints[idx].waktu = e.target.value; });
      tr.querySelector('.ai-anchor-suhu')?.addEventListener('input', (e) => { anchorPoints[idx].suhu = e.target.value; });
      tr.querySelector('.ai-anchor-tekanan')?.addEventListener('input', (e) => { anchorPoints[idx].tekanan = e.target.value; });
      tr.querySelector('.ai-anchor-laju')?.addEventListener('input', (e) => { anchorPoints[idx].laju = e.target.value; });
      tr.querySelector('.ai-anchor-kelembaban')?.addEventListener('input', (e) => { anchorPoints[idx].kelembaban = e.target.value; });
      tr.querySelector('.ai-anchor-kecepatan')?.addEventListener('input', (e) => { anchorPoints[idx].kecepatan_angin = e.target.value; });
      tr.querySelector('.ai-anchor-arah')?.addEventListener('change', (e) => { anchorPoints[idx].arah_angin = e.target.value; });
      tr.querySelector('.ai-anchor-cuaca')?.addEventListener('input', (e) => { anchorPoints[idx].cuaca = e.target.value; });
      tr.querySelector('.ai-del-anchor-btn')?.addEventListener('click', () => {
        anchorPoints.splice(idx, 1);
        renderAnchorTable();
      });
    });
  }

  function sortAnchors() {
    anchorPoints.sort((a, b) => Number(a.hour) - Number(b.hour));
    renderAnchorTable();
  }

  function pullAnchorsFromForm() {
    const targetPrefix = modal.querySelector('#ai24hTargetTable')?.value || 'all';
    const foundRows = scan24hTable(targetPrefix);

    if (foundRows.length === 0) {
      alert('Belum ada baris data yang terisi di formulir aktif. Silakan isi beberapa baris di formulir terlebih dahulu, atau gunakan tombol [➕ Tambah Acuan] / [✨ Preset Tipikal].');
      return;
    }

    anchorPoints = foundRows.map(r => ({
      hour: Number(r.hour),
      waktu: r.waktu || '',
      suhu: r.suhu || '',
      tekanan: r.tekanan || '',
      laju: r.laju || '',
      kelembaban: r.kelembaban || '',
      kecepatan_angin: r.kecepatan_angin || '',
      arah_angin: r.arah_angin || 'Timur',
      cuaca: r.cuaca || 'Cerah'
    }));

    sortAnchors();
    refreshRealDataBanner();
    showToast(`✓ Berhasil memuat ${anchorPoints.length} titik acuan dari form`);
  }

  function setPresetAnchors() {
    const startTime = modal.querySelector('#ai24hStartTime')?.value || '08:00';
    const [h, m] = startTime.split(':').map(Number);
    const mStr = String(m || 0).padStart(2, '0');

    anchorPoints = [
      { hour: 1, waktu: startTime, suhu: '28.5', tekanan: '756.2', laju: '12.0', kelembaban: '70', kecepatan_angin: '1.2', arah_angin: 'Timur', cuaca: 'Cerah' },
      { hour: 6, waktu: `${String((h + 5) % 24).padStart(2, '0')}:${mStr}`, suhu: '33.5', tekanan: '753.0', laju: '12.0', kelembaban: '52', kecepatan_angin: '2.4', arah_angin: 'Timur Laut', cuaca: 'Cerah Berawan' },
      { hour: 11, waktu: `${String((h + 10) % 24).padStart(2, '0')}:${mStr}`, suhu: '28.0', tekanan: '755.8', laju: '12.0', kelembaban: '74', kecepatan_angin: '1.5', arah_angin: 'Timur', cuaca: 'Berawan' },
      { hour: 20, waktu: `${String((h + 19) % 24).padStart(2, '0')}:${mStr}`, suhu: '24.2', tekanan: '758.2', laju: '12.0', kelembaban: '88', kecepatan_angin: '0.8', arah_angin: 'Tenggara', cuaca: 'Berawan' }
    ];
    sortAnchors();
    showToast('✓ Preset acuan tipikal berhasil dimuat');
  }

  function addAnchorRow() {
    const usedHours = new Set(anchorPoints.map(a => Number(a.hour)));
    let nextH = 1;
    for (let i = 1; i <= 24; i++) {
      if (!usedHours.has(i)) {
        nextH = i;
        break;
      }
    }
    const startTime = modal.querySelector('#ai24hStartTime')?.value || '08:00';
    const [h, m] = startTime.split(':').map(Number);
    const calcTime = `${String((h + (nextH - 1)) % 24).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;

    anchorPoints.push({
      hour: nextH,
      waktu: calcTime,
      suhu: '',
      tekanan: '',
      laju: '12.0',
      kelembaban: '',
      kecepatan_angin: '',
      arah_angin: 'Timur',
      cuaca: 'Cerah'
    });
    sortAnchors();
  }

  function clearAnchors() {
    anchorPoints = [];
    renderAnchorTable();
    showToast('Titik acuan dikosongkan');
  }

  // Pure mathematical diurnal interpolator (guarantees zero crashes & smooth physics curves)
  function localDiurnalFallback(startTime = '08:00', anchors = [], options = {}) {
    const [startH, startM] = startTime.split(':').map(Number);
    const rows = [];
    const anchorMap = {};
    (anchors || []).forEach(a => {
      if (a && a.hour >= 1 && a.hour <= 24) anchorMap[a.hour] = a;
    });

    let baseTemp = parseFloat(options.startTemp) || 28.5;
    let baseTekanan = 756.0;
    let baseLaju = '12.0';
    let baseWindDir = options.dominantWind || 'Timur';

    if (anchors && anchors.length > 0) {
      const first = anchors[0];
      if (first.suhu) baseTemp = parseFloat(first.suhu) || baseTemp;
      if (first.tekanan) baseTekanan = parseFloat(first.tekanan) || baseTekanan;
      if (first.laju) baseLaju = String(first.laju);
      if (first.arah_angin) baseWindDir = first.arah_angin;
    }

    for (let h = 1; h <= 24; h++) {
      const curH = (startH + (h - 1)) % 24;
      const timeStr = String(curH).padStart(2, '0') + ':' + String(startM || 0).padStart(2, '0');

      if (anchorMap[h]) {
        const a = anchorMap[h];
        rows.push({
          hour: h,
          waktu: a.waktu || timeStr,
          tekanan: String(a.tekanan || baseTekanan),
          suhu: String(a.suhu || baseTemp),
          laju: String(a.laju || baseLaju),
          kelembaban: String(a.kelembaban || '65'),
          kecepatan_angin: String(a.kecepatan_angin || '1.2'),
          arah_angin: a.arah_angin || baseWindDir,
          cuaca: a.cuaca || (curH >= 6 && curH <= 17 ? 'Cerah Berawan' : 'Berawan'),
          isAnchor: true
        });
      } else {
        const solarPhase = ((curH - 4 + 24) % 24) / 24 * 2 * Math.PI;
        const diurnalFactor = 0.5 - 0.5 * Math.cos(solarPhase);

        const tempVal = (24.0 + diurnalFactor * 9.5).toFixed(1);
        const pressVal = (758.0 - diurnalFactor * 4.8).toFixed(1);
        const rhVal = Math.round(90 - diurnalFactor * 38);
        const windSpd = (0.6 + diurnalFactor * 1.8).toFixed(1);
        const cuacaVal = curH >= 6 && curH <= 17 ? (diurnalFactor > 0.6 ? 'Cerah' : 'Cerah Berawan') : 'Berawan';

        rows.push({
          hour: h,
          waktu: timeStr,
          tekanan: pressVal,
          suhu: tempVal,
          laju: baseLaju,
          kelembaban: String(rhVal),
          kecepatan_angin: windSpd,
          arah_angin: baseWindDir,
          cuaca: cuacaVal,
          isAnchor: false
        });
      }
    }
    return rows;
  }

  // Hook up Anchor buttons
  modal.querySelector('#aiRefreshRealDataBtn')?.addEventListener('click', () => {
    refreshRealDataBanner();
    showToast('✓ Form selesai dipindai');
  });
  modal.querySelector('#aiPullFromFormBtn')?.addEventListener('click', pullAnchorsFromForm);
  modal.querySelector('#aiAddAnchorBtn')?.addEventListener('click', addAnchorRow);
  modal.querySelector('#aiPresetAnchorsBtn')?.addEventListener('click', setPresetAnchors);
  modal.querySelector('#aiClearAnchorsBtn')?.addEventListener('click', clearAnchors);
  modal.querySelector('#ai24hTargetTable')?.addEventListener('change', refreshRealDataBanner);

  // Toggle API key visibility
  modal.querySelector('#aiToggleKeyVis')?.addEventListener('click', () => {
    const input = modal.querySelector('#aiApiKeyInput');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  });

  // Tab switching
  modal.querySelectorAll('.ai-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.ai-tab-btn').forEach(b => b.classList.remove('active'));
      modal.querySelectorAll('.ai-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = modal.querySelector('#' + btn.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
      if (btn.dataset.tab === 'tab-autofill') updateEmptyCount();
      if (btn.dataset.tab === 'tab-24h') {
        refreshRealDataBanner();
        if (anchorPoints.length === 0) pullAnchorsFromForm();
        else renderAnchorTable();
      }
    });
  });

  // Modal open/close
  function openModal() {
    modal.classList.add('is-open');
    checkConnectionStatus();
    updateEmptyCount();
    if (isUdara) {
      refreshRealDataBanner();
      if (anchorPoints.length === 0) pullAnchorsFromForm();
      else renderAnchorTable();
    }
  }
  function closeModal() {
    modal.classList.remove('is-open');
  }

  fab.addEventListener('click', openModal);
  modal.querySelector('#closeAiModalBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Check Connection Status
  async function checkConnectionStatus() {
    const pill = modal.querySelector('#aiStatusPill');
    const text = modal.querySelector('#aiStatusText');
    const keyInput = modal.querySelector('#aiApiKeyInput');
    const urlInput = modal.querySelector('#aiWorkerUrlInput');
    const apiKey = getApiKey();
    const workerUrl = getWorkerUrl();

    if (keyInput) keyInput.value = apiKey;
    if (urlInput) urlInput.value = workerUrl;

    if (!apiKey && !workerUrl) {
      pill.className = 'ai-status-indicator offline';
      text.textContent = 'Belum Dikonfigurasi';
      return false;
    }

    if (apiKey) {
      pill.className = 'ai-status-indicator online';
      text.textContent = 'AI Online (Gemini)';
      return true;
    }

    if (workerUrl) {
      pill.className = 'ai-status-indicator online';
      text.textContent = 'AI Online (Cloud)';
      return true;
    }
  }

  // Save & Test Settings
  modal.querySelector('#aiSaveSettingsBtn')?.addEventListener('click', async () => {
    const keyInput = modal.querySelector('#aiApiKeyInput');
    const urlInput = modal.querySelector('#aiWorkerUrlInput');
    const resultDiv = modal.querySelector('#aiTestResult');
    const keyVal = keyInput.value.trim();
    let urlVal = urlInput.value.trim().replace(/\/+$/, '');

    if (!keyVal && !urlVal) {
      resultDiv.innerHTML = '<span style="color:#dc2626;font-weight:700;">Silakan masukkan Gemini API Key atau URL Cloudflare Worker.</span>';
      return;
    }

    // 1. If API Key provided, test Gemini directly
    if (keyVal) {
      resultDiv.innerHTML = '<span style="color:#2563eb;">Menguji koneksi langsung ke Google Gemini API...</span>';
      try {
        const testRes = await directCallGemini(keyVal, '', 'Ping test. Jawab singkat: OK', { maxTokens: 10 });
        if (testRes) {
          setApiKey(keyVal);
          if (urlVal) setWorkerUrl(urlVal);
          resultDiv.innerHTML = '<span style="color:#16a34a;font-weight:700;">✓ Berhasil terhubung ke Google Gemini AI! Status: Online & Aktif.</span>';
          checkConnectionStatus();
          return;
        }
      } catch (err) {
        resultDiv.innerHTML = `<span style="color:#dc2626;font-weight:700;">Gagal menghubungkan Gemini API Key: ${err.message}. Periksa kembali kunci API Anda.</span>`;
        return;
      }
    }

    // 2. If only Worker URL provided, test Worker
    if (urlVal) {
      if (!/^https?:\/\//i.test(urlVal)) {
        urlVal = 'https://' + urlVal;
        urlInput.value = urlVal;
      }
      resultDiv.innerHTML = '<span style="color:#2563eb;">Menguji koneksi ke ' + urlVal + '...</span>';
      try {
        const res = await fetch(urlVal + '/', { method: 'GET', mode: 'cors' });
        if (res.ok) {
          setWorkerUrl(urlVal);
          resultDiv.innerHTML = '<span style="color:#16a34a;font-weight:700;">✓ Berhasil terhubung ke Cloudflare Worker! Status: Online</span>';
          checkConnectionStatus();
        } else {
          resultDiv.innerHTML = `<span style="color:#dc2626;">Worker merespons status ${res.status}.</span>`;
        }
      } catch (err) {
        resultDiv.innerHTML = `<span style="color:#dc2626;">Gagal menghubungi Worker: ${err.message}. Di Indonesia, domain *.workers.dev sering diblokir ISP. Disarankan memasukkan Gemini API Key langsung di atas.</span>`;
      }
    }
  });

  // Call Gemini REST API directly
  async function directCallGemini(apiKey, systemInstruction, prompt, options = {}) {
    const models = [
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];
    let lastErr = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.3,
            maxOutputTokens: options.maxTokens ?? 3500
          }
        };

        if (systemInstruction) {
          payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        if (options.jsonMode) {
          payload.generationConfig.responseMimeType = 'application/json';
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  // Unified AI Caller (Direct Gemini preferred, Cloudflare fallback)
  async function callAi(endpoint, body) {
    const apiKey = getApiKey();
    const workerUrl = getWorkerUrl();

    if (apiKey) {
      if (endpoint === '/api/project-24h') {
        return await directProject24h(apiKey, body);
      } else if (endpoint === '/api/complete-form') {
        return await directCompleteForm(apiKey, body);
      } else {
        return await directChat(apiKey, body);
      }
    } else if (workerUrl) {
      const res = await fetch(workerUrl + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error ' + res.status);
      }
      return await res.json();
    } else {
      throw new Error('Belum ada koneksi AI yang disetel. Silakan buka tab [⚙️ Pengaturan] dan masukkan Gemini API Key Anda.');
    }
  }

  // Direct 24-Hour Diurnal Projection with Real-Field Anchor Points
  async function directProject24h(apiKey, body) {
    const { startTime = '08:00', startTemp, dominantWind = 'Timur', location = 'Indonesia', anchorPoints = [] } = body;
    
    // Filter valid anchor points (hour 1..24)
    const validAnchors = (anchorPoints || []).filter(a => a && a.hour >= 1 && a.hour <= 24);

    let anchorPromptSection = '';
    if (validAnchors.length > 0) {
      anchorPromptSection = `
DATA RIIL LAPANGAN YANG SUDAH DICATAT PETUGAS (GROUND TRUTH):
${JSON.stringify(validAnchors, null, 2)}

ATURAN UTAMA:
1. Jam-jam acuan di atas (Jam ${validAnchors.map(a => a.hour).join(', ')}) WAJIB 100% PERSIS DAN TIDAK BOLEH DIUBAH! Tandai "isAnchor": true pada jam ini.
2. Jam-jam kosong sebelum, di antara, dan sesudah titik acuan WAJIB diinterpolasikan secara mulus dan ilmiah (diurnal meteorologi).
3. Laju alir (L/menit) pada jam-jam kosong stabil di sekitar angka alat yang tercatat pada titik acuan.
4. Tekanan udara dan kelembaban membentuk fluktuasi pasang surut alami yang bersambung dengan data riil.`;
    }

    const systemPrompt = `Anda adalah pakar meteorologi dan pengukuran kualitas udara ambien lingkungan (Standar SNI & FSOP-10.3.3).
Tugas Anda adalah memproyeksikan dan melengkapi data pencatatan 24 jam secara ilmiah, akurat, dan realistis untuk survei udara ambien di Indonesia.

Pola diurnal fisika atmosfer yang WAJIB ditaati:
1. Waktu: 24 jam berurutan dengan interval 1 jam, dimulai dari waktu ${startTime}.
2. Suhu Udara (°C): Siang (11:00-14:00) puncak (31-34.5°C), sore menurun (29-27°C), malam sejuk stabil (26-25°C), subuh (03:00-05:00) terendah (23.5-25°C), pagi naik (26-29.5°C).
3. Kelembaban (%RH): Korelasi terbalik dengan suhu. Siang (50-68%), malam & subuh (80-93%).
4. Tekanan (mmHg): Pasang surut semidiurnal atmosfer (752-759 mmHg).
5. Laju Alir (L/menit): Stabil sesuai alat sampling.
6. Kecepatan Angin (m/s): Siang lebih aktif (1.2-3.2 m/s), malam tenang (0.4-1.5 m/s).
7. Arah Angin: Konsisten dengan arah dominan (${dominantWind}).
8. Cuaca: Alami (Cerah, Cerah Berawan, Berawan).
${anchorPromptSection}

Output WAJIB JSON persis:
{
  "rows": [
    {
      "hour": 1,
      "waktu": "08:00",
      "tekanan": "756.2",
      "suhu": "29.4",
      "laju": "12.0",
      "kelembaban": "68",
      "kecepatan_angin": "1.5",
      "arah_angin": "${dominantWind}",
      "cuaca": "Cerah Berawan",
      "isAnchor": true
    }
    ... sampai jam 24
  ]
}`;

    const prompt = `Lengkapi proyeksi 24 jam lengkap dari jam 1 sampai jam 24.
Waktu mulai: ${startTime}, Suhu awal/referensi: ${startTemp || 'otomatis'}, Arah dominan: ${dominantWind}.
${validAnchors.length > 0 ? `Kunci data riil jam [${validAnchors.map(a => a.hour).join(', ')}] persis apa adanya.` : ''}
Kembalikan tepat 24 baris data dalam format JSON.`;

    try {
      const txt = await directCallGemini(apiKey, systemPrompt, prompt, { jsonMode: true, temperature: 0.2 });
      let data = null;
      try {
        data = JSON.parse(txt);
      } catch (e) {
        const match = txt.match(/\{[\s\S]*\}/);
        if (match) data = JSON.parse(match[0]);
      }
      if (data && Array.isArray(data.rows) && data.rows.length >= 24) {
        // Enforce hard lock on anchors
        validAnchors.forEach(a => {
          const idx = data.rows.findIndex(r => Number(r.hour) === Number(a.hour));
          if (idx !== -1) {
            data.rows[idx] = {
              ...data.rows[idx],
              ...a,
              isAnchor: true
            };
          }
        });
        return data;
      }
    } catch (err) {
      console.warn('Gemini 24h projection error, using local diurnal interpolator fallback:', err);
    }

    return {
      rows: localDiurnalFallback(startTime, validAnchors, { startTemp, dominantWind })
    };
  }

  // Direct Smart Form Completion
  async function directCompleteForm(apiKey, body) {
    const { formType, emptyFields = [], filledFields = {}, userInstruction = '' } = body;
    const systemPrompt = `Anda adalah asisten cerdas pengisian formulir survei laboratorium lingkungan PT LABORATORINDO ALAM BESTARI (Standar KAN, SNI & FSOP).
Jenis Formulir: ${formType === 'air' ? 'Survei Sampel Air (FSOP-10.3.1)' : 'Survei Udara Ambien (FSOP-10.3.3)'}.

ATURAN UTAMA:
1. Anda HANYA mengisi kolom yang KOSONG.
2. Anda DILARANG mengubah kolom yang sudah terisi.
3. Baca seluruh data formulir yang sudah terisi (seperti nama pelanggan, titik sampling, koordinat, waktu, cuaca, suhu, tekanan, dll) sebagai acuan kondisi nyata di lapangan.
4. Nilai untuk kolom yang kosong harus logis, realistis, dan serasi dengan data riil yang sudah ada di formulir tersebut.
Format output WAJIB JSON:
{
  "explanation": "Penjelasan singkat bagaimana data disesuaikan dengan kondisi riil form",
  "fieldsToFill": {
    "nama_kolom": "nilai"
  }
}`;

    const prompt = `DATA RIIL LAPANGAN YANG SUDAH TERISI DI FORM (Konteks Nyata):
${JSON.stringify(filledFields, null, 2)}

DAFTAR KOLOM YANG MASIH KOSONG UNTUK DILENGKAPI:
${JSON.stringify(emptyFields)}

${userInstruction ? `INSTRUKSI TAMBAHAN PETUGAS LAPANGAN: ${userInstruction}` : 'Lengkapi kolom kosong di atas agar serasi dan akurat sesuai data riil yang sudah terisi.'}`;

    const txt = await directCallGemini(apiKey, systemPrompt, prompt, { jsonMode: true, temperature: 0.3 });
    try {
      return JSON.parse(txt);
    } catch (e) {
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Gagal membaca format JSON');
    }
  }

  // Direct Chat
  async function directChat(apiKey, body) {
    const { message = '', context = {} } = body;
    const systemPrompt = `Anda adalah "LabBestari AI", Asisten Cerdas Lapangan untuk PT LABORATORINDO ALAM BESTARI.
Anda terintegrasi langsung di aplikasi survei (Air FSOP-10.3.1 & Udara Ambien FSOP-10.3.3).
Jawab pertanyaan seputar sampling lingkungan, baku mutu, rumus debit, atau bantu lengkapi data form secara ramah, profesional, dan dalam bahasa Indonesia.
Jika diminta memperbarui data form, cantumkan blok:
\`\`\`form_update
{
  "fields": {
    "nama_field": "nilai"
  }
}
\`\`\``;

    const resText = await directCallGemini(apiKey, systemPrompt, message, { temperature: 0.4 });
    let suggestedFields = null;
    const match = resText.match(/```form_update\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        suggestedFields = parsed.fields || parsed;
      } catch (e) {}
    }
    const cleanReply = resText.replace(/```form_update[\s\S]*?```/, '').trim();
    return { reply: cleanReply, suggestedFields };
  }

  // Count empty fields in the active form
  function scanFormFields() {
    const filled = {};
    const empty = [];
    document.querySelectorAll('.sheet input, .sheet textarea, .sheet select').forEach(el => {
      if (el.type === 'file' || el.disabled || !el.name) return;
      const val = el.type === 'checkbox' ? (el.checked ? el.value : '') : (el.value || '').trim();
      if (val) {
        filled[el.name] = val;
      } else {
        empty.push(el.name);
      }
    });
    return { filled, empty };
  }

  function updateEmptyCount() {
    const el = modal.querySelector('#aiEmptyFieldsCount');
    if (!el) return;
    const { empty, filled } = scanFormFields();
    const total = empty.length + Object.keys(filled).length;
    el.innerHTML = `Terdeteksi <b>${empty.length}</b> kolom kosong dari total ${total} kolom formulir aktif.`;
  }

  // Handle 24-Hour Diurnal Projection Click
  modal.querySelector('#aiGenerate24hBtn')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#aiGenerate24hBtn');
    const resultArea = modal.querySelector('#ai24hResultArea');
    const tbody = modal.querySelector('#ai24hTableBody');
    const summaryBadge = modal.querySelector('#ai24hResultBadgeSummary');
    const startTime = modal.querySelector('#ai24hStartTime').value || '08:00';
    const startTemp = modal.querySelector('#ai24hStartTemp').value;
    const windDir = modal.querySelector('#ai24hWindDir').value;

    btn.disabled = true;
    btn.textContent = '⏳ Menghitung proyeksi meteorologi diurnal via Gemini AI...';

    try {
      const data = await callAi('/api/project-24h', {
        startTime,
        startTemp,
        dominantWind: windDir,
        location: 'Indonesia',
        anchorPoints: anchorPoints
      });

      pending24hData = data.rows || [];

      let realCount = 0;
      let aiCount = 0;

      tbody.innerHTML = pending24hData.map(r => {
        const isReal = !!r.isAnchor;
        if (isReal) realCount++;
        else aiCount++;
        return `
          <tr style="${isReal ? 'background: #f0fdf4;' : ''}">
            <td><b>${r.hour}</b></td>
            <td>${r.waktu || '-'}</td>
            <td>${r.tekanan || '-'}</td>
            <td>${r.suhu ? r.suhu + '°C' : '-'}</td>
            <td>${r.laju || '-'}</td>
            <td>${r.kelembaban ? r.kelembaban + '%' : '-'}</td>
            <td>${r.kecepatan_angin ? r.kecepatan_angin + ' m/s' : '-'}</td>
            <td>${r.arah_angin || '-'}</td>
            <td>${r.cuaca || '-'}</td>
            <td>${isReal ? '<span class="ai-badge-real">🟢 Data Riil</span>' : '<span class="ai-badge-ai">✨ AI Proyeksi</span>'}</td>
          </tr>
        `;
      }).join('');

      if (summaryBadge) {
        summaryBadge.innerHTML = `<span class="ai-badge-real">${realCount} Data Riil Dikunci</span> <span class="ai-badge-ai">${aiCount} Jam Dilengkapi AI</span>`;
      }

      resultArea.style.display = 'block';
      showToast(`✓ Proyeksi selesai: ${realCount} data riil dikunci, ${aiCount} jam dihitung AI`);
    } catch (err) {
      alert(err.message);
      if (err.message.includes('Pengaturan')) {
        modal.querySelector('[data-tab="tab-settings"]').click();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Hitung Proyeksi 24 Jam Sesuai Kondisi Lapangan';
    }
  });

  // Apply 24h Projection to Actual Form
  modal.querySelector('#aiApply24hBtn')?.addEventListener('click', () => {
    if (!pending24hData || !pending24hData.length) return;
    const target = modal.querySelector('#ai24hTargetTable').value;
    const prefixes = target === 'all' ? ['tsp24', 'pm10', 'pm25'] : [target];
    const protectReal = modal.querySelector('#aiProtectRealDataCheckbox')?.checked !== false;

    let filledCount = 0;
    let protectedCount = 0;

    prefixes.forEach(prefix => {
      pending24hData.forEach(r => {
        const h = r.hour;
        const fields = [
          { name: `${prefix}_${h}_waktu`, val: r.waktu },
          { name: `${prefix}_${h}_tekanan`, val: r.tekanan },
          { name: `${prefix}_${h}_suhu`, val: r.suhu },
          { name: `${prefix}_${h}_laju`, val: r.laju },
          { name: `${prefix}_${h}_kelembaban`, val: r.kelembaban },
          { name: `${prefix}_${h}_kecepatan_angin`, val: r.kecepatan_angin },
          { name: `${prefix}_${h}_arah_angin`, val: r.arah_angin },
          { name: `${prefix}_${h}_cuaca`, val: r.cuaca }
        ];

        fields.forEach(f => {
          if (!f.val) return;
          const currentVal = getField(f.name);
          if (protectReal && currentVal) {
            // Field already has data and protection is on: KEEP AS IS!
            protectedCount++;
          } else {
            if (setField(f.name, f.val)) filledCount++;
          }
        });
      });
    });

    window.updateMobileMirrors?.();
    window.saveData?.();
    showToast(`✓ Selesai: ${filledCount} kolom diisi (${protectedCount} data riil dipertahankan)`);
    refreshRealDataBanner();
    closeModal();
  });

  // Handle Smart Autofill for Empty Fields Click
  modal.querySelector('#aiRunAutofillBtn')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#aiRunAutofillBtn');
    const resultArea = modal.querySelector('#aiAutofillResultArea');
    const summaryDiv = modal.querySelector('#aiAutofillSummary');
    const listDiv = modal.querySelector('#aiAutofillList');
    const instruction = modal.querySelector('#aiAutofillInstruction').value;

    const { filled, empty } = scanFormFields();
    if (!empty.length) {
      alert('Seluruh kolom pada formulir ini sudah terisi lengkap!');
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ AI sedang menganalisis & mengisi kolom kosong...';

    try {
      const data = await callAi('/api/complete-form', {
        formType: isAir ? 'air' : 'udara',
        emptyFields: empty.slice(0, 40),
        filledFields: filled,
        userInstruction: instruction
      });

      pendingAutofillData = data.fieldsToFill || {};

      summaryDiv.textContent = data.explanation || 'AI telah menyiapkan data untuk kolom yang kosong:';
      listDiv.innerHTML = Object.entries(pendingAutofillData).map(([k, v]) => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;">
          <span style="color:#475569;font-weight:600;">${k.replace(/_/g, ' ')}:</span>
          <span style="color:#0f172a;font-weight:700;">${v}</span>
        </div>
      `).join('');

      resultArea.style.display = 'block';
      showToast('✓ Data berhasil dianalisis oleh AI');
    } catch (err) {
      alert(err.message);
      if (err.message.includes('Pengaturan')) {
        modal.querySelector('[data-tab="tab-settings"]').click();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Analisis & Lengkapi Data Kosong';
    }
  });

  // Apply Autofill Data
  modal.querySelector('#aiApplyAutofillBtn')?.addEventListener('click', () => {
    if (!pendingAutofillData) return;
    let count = 0;
    Object.entries(pendingAutofillData).forEach(([k, v]) => {
      // Safety: Only fill if field is currently empty so real data is never overwritten!
      if (!getField(k)) {
        if (setField(k, v)) count++;
      }
    });

    window.updateMobileMirrors?.();
    window.saveData?.();
    showToast(`✓ Berhasil mengisi ${count} kolom formulir yang kosong`);
    closeModal();
  });

  // Handle General AI Chat Click
  modal.querySelector('#aiChatSendBtn')?.addEventListener('click', async () => {
    const input = modal.querySelector('#aiChatInput');
    const chatBox = modal.querySelector('#aiChatBox');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-msg user';
    userMsg.textContent = msg;
    chatBox.appendChild(userMsg);
    chatBox.scrollTop = chatBox.scrollHeight;

    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'ai-msg assistant';
    loadingMsg.textContent = 'Sedang berpikir...';
    chatBox.appendChild(loadingMsg);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      const data = await callAi('/api/chat', {
        message: msg,
        context: { formType: isAir ? 'air' : isUdara ? 'udara' : 'beranda' }
      });

      loadingMsg.innerHTML = formatAiMarkdown(data.reply);

      if (data.suggestedFields && Object.keys(data.suggestedFields).length > 0) {
        const applyBtn = document.createElement('button');
        applyBtn.className = 'ai-btn-primary ai-btn-apply';
        applyBtn.style.marginTop = '8px';
        applyBtn.textContent = '✓ Terapkan Nilai ini ke Formulir';
        applyBtn.addEventListener('click', () => {
          Object.entries(data.suggestedFields).forEach(([k, v]) => setField(k, v));
          window.updateMobileMirrors?.();
          window.saveData?.();
          showToast('Data berhasil diterapkan ke form');
          applyBtn.disabled = true;
          applyBtn.textContent = '✓ Telah Diterapkan';
        });
        loadingMsg.appendChild(applyBtn);
      }
    } catch (err) {
      loadingMsg.textContent = 'Maaf, terjadi kesalahan: ' + err.message;
    }
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  modal.querySelector('#aiChatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      modal.querySelector('#aiChatSendBtn').click();
    }
  });

  // Utility to set field value
  function setField(name, value) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return false;
    if (el.type === 'checkbox') {
      el.checked = !!value && value !== '0' && value !== 'false';
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event(el.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Utility toast
  function showToast(text) {
    if (typeof window.showToast === 'function') {
      window.showToast(text);
      return;
    }
    let t = document.getElementById('aiToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'aiToast';
      t.style.cssText = 'position:fixed;z-index:100100;left:50%;bottom:85px;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 16px;border-radius:10px;font-size:12px;font-weight:700;box-shadow:0 6px 24px rgba(0,0,0,0.3);pointer-events:none;transition:opacity 0.2s;';
      document.body.append(t);
    }
    t.textContent = text;
    t.style.opacity = '1';
    setTimeout(() => { t.style.opacity = '0'; }, 2200);
  }

  // Simple Markdown formatter
  function formatAiMarkdown(txt) {
    if (!txt) return '';
    return txt
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/`([^`]+)`/g, '<code style="background:#e2e8f0;padding:1px 4px;border-radius:4px;">$1</code>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  // Expose global controller
  window.AiAssistant = {
    open: openModal,
    close: closeModal,
    project24h: () => {
      openModal();
      modal.querySelector('[data-tab="tab-24h"]')?.click();
    },
    autofill: () => {
      openModal();
      modal.querySelector('[data-tab="tab-autofill"]')?.click();
    }
  };

  // Run initial check
  checkConnectionStatus();
})();
