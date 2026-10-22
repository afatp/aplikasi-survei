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
            <h4>⚡ Proyeksi Realtime 24 Jam (Meteorologi Diurnal)</h4>
            <p>AI memproyeksikan fluktuasi alami 24 jam secara ilmiah (suhu dingin di subuh & puncak panas di siang hari, pasang surut tekanan udara, laju alir stabil, dan siklus kelembaban).</p>
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
    });
  });

  // Modal open/close
  function openModal() {
    modal.classList.add('is-open');
    checkConnectionStatus();
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

  // Direct 24-Hour Diurnal Projection
  async function directProject24h(apiKey, body) {
    const { startTime = '08:00', startTemp, dominantWind = 'Timur', location = 'Indonesia' } = body;
    const systemPrompt = `Anda adalah pakar meteorologi dan pengukuran kualitas udara ambien lingkungan (Standar SNI & FSOP-10.3.3).
Tugas Anda adalah memproyeksikan data pencatatan 24 jam secara ilmiah, akurat, dan realistis untuk survei udara ambien di Indonesia.

Pola diurnal fisika atmosfer yang WAJIB ditaati:
1. Waktu: 24 jam berurutan dengan interval 1 jam, dimulai dari waktu ${startTime}.
2. Suhu Udara (°C): Siang (11:00-14:00) puncak (31-34.5°C), sore menurun (29-27°C), malam sejuk stabil (26-25°C), subuh (03:00-05:00) terendah (23.5-25°C), pagi naik (26-29.5°C).
3. Kelembaban (%RH): Korelasi terbalik dengan suhu. Siang (55-68%), malam & subuh (80-93%).
4. Tekanan (mmHg): Pasang surut atmosfer (752-759 mmHg).
5. Laju Alir (L/menit): Stabil sesuai alat sampling (misal 1.19 s/d 1.21).
6. Kecepatan Angin (m/s): Siang lebih aktif (1.2-3.2 m/s), malam tenang (0.4-1.5 m/s).
7. Arah Angin: Konsisten dengan arah dominan (${dominantWind}).
8. Cuaca: Alami (Cerah, Cerah Berawan, Berawan).

Output WAJIB JSON persis:
{
  "rows": [
    {
      "hour": 1,
      "waktu": "08:00",
      "tekanan": "756.2",
      "suhu": "29.4",
      "laju": "1.20",
      "kelembaban": "68",
      "kecepatan_angin": "1.5",
      "arah_angin": "${dominantWind}",
      "cuaca": "Cerah Berawan"
    }
    ... sampai jam 24
  ]
}`;

    const prompt = `Buatkan proyeksi 24 jam lengkap dari jam 1 sampai jam 24.
Waktu mulai: ${startTime}, Suhu awal: ${startTemp || 'otomatis'}, Arah angin: ${dominantWind}, Lokasi: ${location}.
Kembalikan tepat 24 baris data dalam format JSON.`;

    const txt = await directCallGemini(apiKey, systemPrompt, prompt, { jsonMode: true, temperature: 0.2 });
    try {
      return JSON.parse(txt);
    } catch (e) {
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Gagal membaca format JSON dari Gemini');
    }
  }

  // Direct Smart Form Completion
  async function directCompleteForm(apiKey, body) {
    const { formType, emptyFields = [], filledFields = {}, userInstruction = '' } = body;
    const systemPrompt = `Anda adalah asisten cerdas pengisian formulir survei laboratorium lingkungan PT LABORATORINDO ALAM BESTARI (Standar KAN, SNI & FSOP).
Jenis Formulir: ${formType === 'air' ? 'Survei Sampel Air (FSOP-10.3.1)' : 'Survei Udara Ambien (FSOP-10.3.3)'}.

Tugas: Lengkapi kolom formulir yang masih KOSONG berdasarkan konteks yang ada dan standar teknis.
Format output WAJIB JSON:
{
  "explanation": "Penjelasan singkat data yang dilengkapi",
  "fieldsToFill": {
    "nama_kolom": "nilai"
  }
}`;

    const prompt = `Kolom yang sudah diisi: ${JSON.stringify(filledFields)}
Kolom yang masih kosong: ${JSON.stringify(emptyFields)}
Instruksi pengguna: ${userInstruction || 'Lengkapi kolom kosong yang penting secara realistis dan konsisten.'}`;

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
        location: 'Indonesia'
      });

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
      alert(err.message);
      if (err.message.includes('Pengaturan')) {
        modal.querySelector('[data-tab="tab-settings"]').click();
      }
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
      if (setField(k, v)) count++;
    });

    window.updateMobileMirrors?.();
    window.saveData?.();
    showToast(`✓ Berhasil mengisi ${count} kolom formulir`);
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
