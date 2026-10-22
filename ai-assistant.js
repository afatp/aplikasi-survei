/**
 * AI Assistant Frontend Module for Sistem Survei Lapangan
 * Connects to Cloudflare Worker Gemini AI Proxy
 */
(function () {
  'use strict';

  const STORAGE_KEY_WORKER = 'survei_ai_worker_url';
  const isAir = /air\.html/i.test(location.pathname) || !!document.querySelector('.water-sheet');
  const isUdara = /udara\.html/i.test(location.pathname) || (!isAir && !!document.querySelector('.sheet[data-page]'));
  const isIndex = !isAir && !isUdara;

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
            <p>Didukung Google Gemini AI via Cloud Proxy</p>
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
        <button type="button" class="ai-tab-btn" data-tab="tab-settings">⚙️ Cloud</button>
      </div>

      <div class="ai-modal-body">
        <!-- TAB 1: 24-HOUR PROJECTION (KHUSUS UDARA) -->
        ${isUdara ? `
        <div class="ai-tab-pane active" id="tab-24h">
          <div class="ai-card">
            <h4>⚡ Proyeksi Realtime 24 Jam (Meteorologi Diurnal)</h4>
            <p>AI akan memproyeksikan fluktuasi alami 24 jam secara ilmiah (suhu dingin di subuh & puncak panas di siang hari, pasang surut tekanan udara, dan siklus kelembaban).</p>
            <div class="ai-input-grid">
              <div class="ai-field-group">
                <label>Waktu Mulai Jam ke-1</label>
                <input type="time" id="ai24hStartTime" value="08:00">
              </div>
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
                <label>Suhu Awal (°C)</label>
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
            <button type="button" class="ai-btn-primary" id="aiGenerate24hBtn">⚡ Generate Proyeksi 24 Jam</button>
            <div id="ai24hResultArea" style="display:none;margin-top:12px;">
              <div class="ai-preview-table-wrap">
                <table class="ai-preview-table">
                  <thead><tr><th>Jam</th><th>Waktu</th><th>Suhu</th><th>Tekanan</th><th>Laju</th><th>RH%</th><th>Angin</th><th>Cuaca</th></tr></thead>
                  <tbody id="ai24hTableBody"></tbody>
                </table>
              </div>
              <button type="button" class="ai-btn-primary ai-btn-apply" id="aiApply24hBtn">✓ Terapkan Seluruh 24 Jam ke Formulir</button>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- TAB 2: SMART AUTOFILL FOR EMPTY FIELDS -->
        <div class="ai-tab-pane ${!isUdara ? 'active' : ''}" id="tab-autofill">
          <div class="ai-card">
            <h4>📋 Lengkapi Kolom Form yang Kosong</h4>
            <p>AI akan memindai formulir yang sedang aktif, mendeteksi isian yang belum lengkap, lalu melengkapinya secara logis dan ilmiah sesuai standar laboratorium.</p>
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
              Halo! Saya Asisten AI Laboratorindo Alam Bestari. Anda bisa bertanya tentang SOP sampling, metode pengawetan sampel, perhitungan debit, atau meminta saya mengisi bagian tertentu dari form. Ada yang bisa saya bantu?
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

        <!-- TAB 4: CLOUD CONFIGURATION -->
        <div class="ai-tab-pane" id="tab-settings">
          <div class="ai-card">
            <h4>⚙️ Pengaturan Koneksi Cloudflare Worker</h4>
            <p>Masukkan URL Cloudflare Worker yang telah di-deploy (contoh: <code>https://survei-ai.nama-akun.workers.dev</code>). URL ini disimpan otomatis di perangkat ini.</p>
            <div class="ai-field-group" style="margin-bottom:12px;">
              <label>Cloudflare Worker Proxy URL</label>
              <input type="url" id="aiWorkerUrlInput" placeholder="https://survei-ai.subdomain.workers.dev" />
            </div>
            <button type="button" class="ai-btn-primary" id="aiSaveWorkerUrlBtn">💾 Uji & Simpan Koneksi</button>
            <div id="aiTestResult" style="margin-top:10px;font-size:12px;"></div>
            <div style="margin-top:16px;padding:12px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;font-size:11.5px;color:#1e40af;line-height:1.5;">
              <b>Petunjuk Deploy Cloudflare Worker (100% Gratis):</b><br>
              1. Buka file panduan <code>cloudflare-worker/README.md</code> di folder aplikasi.<br>
              2. Buat Worker di Cloudflare Dashboard & tempel kode <code>worker.js</code>.<br>
              3. Tambahkan secret <code>GEMINI_API_KEY</code> di pengaturan Worker Cloudflare.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Cache pending AI data
  let pending24hData = null;
  let pendingAutofillData = null;

  // Tab switching
  modal.querySelectorAll('.ai-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.ai-tab-btn').forEach(b => b.classList.remove('active'));
      modal.querySelectorAll('.ai-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = modal.querySelector('#' + btn.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
      if (btn.dataset.tab === 'tab-autofill') updateEmptyCount();
    });
  });

  // Modal open/close
  function openModal() {
    modal.classList.add('is-open');
    checkWorkerStatus();
    updateEmptyCount();
  }
  function closeModal() {
    modal.classList.remove('is-open');
  }

  fab.addEventListener('click', openModal);
  modal.querySelector('#closeAiModalBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Check Worker Connection
  async function checkWorkerStatus() {
    const pill = modal.querySelector('#aiStatusPill');
    const text = modal.querySelector('#aiStatusText');
    const urlInput = modal.querySelector('#aiWorkerUrlInput');
    const workerUrl = getWorkerUrl();

    if (urlInput) urlInput.value = workerUrl;

    if (!workerUrl) {
      pill.className = 'ai-status-indicator offline';
      text.textContent = 'Cloud Belum Disetel';
      return false;
    }

    text.textContent = 'Menghubungkan...';
    try {
      const res = await fetch(workerUrl + '/', { method: 'GET', mode: 'cors' });
      if (res.ok) {
        pill.className = 'ai-status-indicator online';
        text.textContent = 'AI Online';
        return true;
      } else {
        pill.className = 'ai-status-indicator offline';
        text.textContent = 'Error ' + res.status;
        return false;
      }
    } catch (e) {
      pill.className = 'ai-status-indicator offline';
      text.textContent = 'Offline / Gagal Hubung';
      return false;
    }
  }

  // Save & Test Worker URL
  modal.querySelector('#aiSaveWorkerUrlBtn')?.addEventListener('click', async () => {
    const input = modal.querySelector('#aiWorkerUrlInput');
    const resultDiv = modal.querySelector('#aiTestResult');
    let val = input.value.trim().replace(/\/+$/, '');
    if (!val) {
      resultDiv.innerHTML = '<span style="color:#dc2626;">Silakan masukkan URL Cloudflare Worker yang valid.</span>';
      return;
    }
    // Auto-prepend https:// if missing
    if (!/^https?:\/\//i.test(val)) {
      val = 'https://' + val;
      input.value = val;
    }

    if (/\.pages\.dev$/i.test(new URL(val).hostname)) {
      resultDiv.innerHTML = '<span style="color:#b45309;font-weight:700;">⚠️ Peringatan: Anda memasukkan domain Cloudflare Pages (.pages.dev).<br>Skrip backend yang kita buat adalah <b>Cloudflare Worker (.workers.dev)</b>. Silakan buat Worker di tab "Workers" di dashboard Cloudflare Anda.</span>';
    } else {
      resultDiv.innerHTML = '<span style="color:#2563eb;">Menguji koneksi ke ' + val + '...</span>';
    }

    try {
      const res = await fetch(val + '/', { method: 'GET', mode: 'cors' });
      if (res.ok) {
        setWorkerUrl(val);
        resultDiv.innerHTML = '<span style="color:#16a34a;font-weight:700;">✓ Berhasil terhubung ke Cloudflare Worker! Status: Online</span>';
        checkWorkerStatus();
      } else {
        let extraTip = '';
        if (res.status === 404 && /\.pages\.dev$/i.test(new URL(val).hostname)) {
          extraTip = '<br><b>Solusi:</b> Di Cloudflare Dashboard, pilih tab <b>Workers</b> (bukan Pages), lalu buat Worker baru dan paste kode <code>worker.js</code>.';
        }
        resultDiv.innerHTML = `<span style="color:#dc2626;">Worker merespons status ${res.status}. ${extraTip}</span>`;
      }
    } catch (err) {
      resultDiv.innerHTML = '<span style="color:#dc2626;">Gagal menghubungi Worker: ' + err.message + '. Periksa URL dan koneksi internet Anda.</span>';
    }
  });

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

  // Handle 24-Hour Diurnal Projection
  modal.querySelector('#aiGenerate24hBtn')?.addEventListener('click', async () => {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      alert('URL Cloudflare Worker belum disetel. Silakan buka tab [⚙️ Cloud] terlebih dahulu.');
      modal.querySelector('[data-tab="tab-settings"]').click();
      return;
    }

    const btn = modal.querySelector('#aiGenerate24hBtn');
    const resultArea = modal.querySelector('#ai24hResultArea');
    const tbody = modal.querySelector('#ai24hTableBody');
    const startTime = modal.querySelector('#ai24hStartTime').value || '08:00';
    const startTemp = modal.querySelector('#ai24hStartTemp').value;
    const windDir = modal.querySelector('#ai24hWindDir').value;

    btn.disabled = true;
    btn.textContent = '⏳ Menghitung proyeksi meteorologi diurnal via Gemini AI...';

    try {
      const res = await fetch(workerUrl + '/api/project-24h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime,
          startTemp,
          dominantWind: windDir,
          location: 'Indonesia'
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error ' + res.status);
      }

      const data = await res.json();
      pending24hData = data.rows || [];

      tbody.innerHTML = pending24hData.map(r => `
        <tr>
          <td><b>${r.hour}</b></td>
          <td>${r.waktu}</td>
          <td>${r.suhu}°C</td>
          <td>${r.tekanan}</td>
          <td>${r.laju}</td>
          <td>${r.kelembaban}%</td>
          <td>${r.kecepatan_angin} m/s ${r.arah_angin}</td>
          <td>${r.cuaca}</td>
        </tr>
      `).join('');

      resultArea.style.display = 'block';
      showToast('✓ Proyeksi 24 jam berhasil digenerate');
    } catch (err) {
      alert('Gagal menghasilkan proyeksi: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Generate Proyeksi 24 Jam';
    }
  });

  // Apply 24h Projection to Actual Form
  modal.querySelector('#aiApply24hBtn')?.addEventListener('click', () => {
    if (!pending24hData || !pending24hData.length) return;
    const target = modal.querySelector('#ai24hTargetTable').value;
    const prefixes = target === 'all' ? ['tsp24', 'pm10', 'pm25'] : [target];

    prefixes.forEach(prefix => {
      pending24hData.forEach(r => {
        const h = r.hour;
        setField(`${prefix}_${h}_waktu`, r.waktu);
        setField(`${prefix}_${h}_tekanan`, r.tekanan);
        setField(`${prefix}_${h}_suhu`, r.suhu);
        setField(`${prefix}_${h}_laju`, r.laju);
        setField(`${prefix}_${h}_kelembaban`, r.kelembaban);
        setField(`${prefix}_${h}_kecepatan_angin`, r.kecepatan_angin);
        setField(`${prefix}_${h}_arah_angin`, r.arah_angin);
        setField(`${prefix}_${h}_cuaca`, r.cuaca);
      });
    });

    window.updateMobileMirrors?.();
    window.saveData?.();
    showToast('✓ Berhasil menerapkan 24 jam ke formulir');
    closeModal();
  });

  // Handle Smart Autofill for Empty Fields
  modal.querySelector('#aiRunAutofillBtn')?.addEventListener('click', async () => {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      alert('URL Cloudflare Worker belum disetel. Buka tab [⚙️ Cloud].');
      modal.querySelector('[data-tab="tab-settings"]').click();
      return;
    }

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
      const res = await fetch(workerUrl + '/api/complete-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType: isAir ? 'air' : 'udara',
          emptyFields: empty.slice(0, 45), // process up to 45 empty fields at a time
          filledFields: filled,
          userInstruction: instruction
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error ' + res.status);
      }

      const data = await res.json();
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
      alert('Gagal melengkapi data: ' + err.message);
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
      if (setField(k, v)) count++;
    });

    window.updateMobileMirrors?.();
    window.saveData?.();
    showToast(`✓ Berhasil mengisi ${count} kolom formulir`);
    closeModal();
  });

  // Handle General AI Chat
  modal.querySelector('#aiChatSendBtn')?.addEventListener('click', async () => {
    const input = modal.querySelector('#aiChatInput');
    const chatBox = modal.querySelector('#aiChatBox');
    const msg = input.value.trim();
    if (!msg) return;

    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      alert('URL Cloudflare Worker belum disetel. Buka tab [⚙️ Cloud].');
      modal.querySelector('[data-tab="tab-settings"]').click();
      return;
    }

    input.value = '';
    // Append user message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-msg user';
    userMsg.textContent = msg;
    chatBox.appendChild(userMsg);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Loading indicator
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'ai-msg assistant';
    loadingMsg.textContent = 'Sedang berpikir...';
    chatBox.appendChild(loadingMsg);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      const res = await fetch(workerUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: {
            formType: isAir ? 'air' : isUdara ? 'udara' : 'beranda'
          }
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error ' + res.status);
      }

      const data = await res.json();
      loadingMsg.innerHTML = formatAiMarkdown(data.reply);

      // If AI proposed form updates
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

  // Enter to send in chat input
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

  // Simple Markdown formatter for AI reply
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
})();
