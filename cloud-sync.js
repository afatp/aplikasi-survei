/**
 * ========================================================
 * CLOUD SYNC GOOGLE DRIVE MODULE (Offline & Online)
 * Aplikasi Survei Lapangan (Air & Udara Ambien)
 * ========================================================
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    URL: 'survei_gdrive_url',
    AUTOSYNC: 'survei_gdrive_autosync',
    QUEUE: 'survei_gdrive_queue',
    LAST_SYNC: 'survei_gdrive_last_sync'
  };

  const SCRIPT_SOURCE_CODE = `// ========================================================
// SCRIPT SINKRONISASI OTOMATIS SURVEI LAPANGAN GOOGLE DRIVE
// ========================================================
const FOLDER_NAME = "Data Survei Lapangan";

function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function doPost(e) {
  try {
    const rawData = e.postData.contents;
    const payload = JSON.parse(rawData);
    const folder = getOrCreateFolder();
    const formType = payload.type || 'survei';
    const project = payload.project;
    if (!project || !project.id) return jsonResponse({ status: 'error', message: 'Data proyek tidak lengkap' });

    const fileName = formType + '_' + project.id + '.json';
    const fileContent = JSON.stringify(project, null, 2);

    const files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      files.next().setContent(fileContent);
    } else {
      folder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
    }

    return jsonResponse({
      status: 'success',
      message: 'Tersimpan di Google Drive',
      projectId: project.id,
      fileName: fileName,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function doGet(e) {
  try {
    const folder = getOrCreateFolder();
    const files = folder.getFiles();
    const projects = [];

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().endsWith('.json')) {
        try {
          const content = JSON.parse(file.getBlob().getDataAsString());
          projects.push({
            fileName: file.getName(),
            fileId: file.getId(),
            lastModified: file.getLastUpdated().toISOString(),
            data: content
          });
        } catch (e) {}
      }
    }

    return jsonResponse({
      status: 'success',
      count: projects.length,
      projects: projects
    });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  let currentType = 'survei'; // 'air' | 'udara' | 'portal'
  let isFlushingQueue = false;

  // Default URL resmi: otomatis aktif di semua perangkat tanpa perlu memasukkan link lagi
  const DEFAULT_APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPmkeVZmjzXpjNRJ3olvuLP90b2X6GXgtPNazBM-KiB_IYJvqB0akt8Qdcv5ZKixEX/exec';

  // Auto-detect ?drive_url=... atau ?sync_url=... dari tautan berbagi
  try {
    const params = new URLSearchParams(window.location.search);
    const paramUrl = params.get('drive_url') || params.get('sync_url');
    if (paramUrl) {
      localStorage.setItem(STORAGE_KEYS.URL, decodeURIComponent(paramUrl).trim());
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch (e) {}

  // --- Helper Storage ---
  function getUrl() {
    return (localStorage.getItem(STORAGE_KEYS.URL) || DEFAULT_APP_SCRIPT_URL || '').trim();
  }

  function setUrl(url) {
    localStorage.setItem(STORAGE_KEYS.URL, (url || '').trim());
    updateBadges();
  }

  function isAutoSyncEnabled() {
    return localStorage.getItem(STORAGE_KEYS.AUTOSYNC) !== 'false';
  }

  function setAutoSyncEnabled(val) {
    localStorage.setItem(STORAGE_KEYS.AUTOSYNC, val ? 'true' : 'false');
  }

  function getQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUEUE);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveQueue(q) {
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(q));
    updateBadges();
  }

  function addToQueue(type, project) {
    const q = getQueue();
    const key = (type || 'survei') + '_' + project.id;
    // Replace existing if already in queue
    const filtered = q.filter(item => ((item.type || 'survei') + '_' + item.project.id) !== key);
    filtered.push({
      type,
      project,
      queuedAt: Date.now()
    });
    saveQueue(filtered);
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'success', duration = 3500) {
    let toast = document.getElementById('cloudSyncToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cloudSyncToast';
      toast.className = 'cloud-toast';
      document.body.appendChild(toast);
    }
    toast.className = `cloud-toast toast-${type} is-show`;
    toast.innerHTML = message;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('is-show');
    }, duration);
  }

  // --- Send Data to Google Apps Script Web App ---
  async function sendToDrive(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
    return await response.json();
  }

  // --- Fetch Data from Google Apps Script Web App ---
  async function fetchFromDrive(url) {
    const separator = url.includes('?') ? '&' : '?';
    const targetUrl = url + separator + 't=' + Date.now();
    const response = await fetch(targetUrl, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow'
    });
    return await response.json();
  }

  // --- Test Connection ---
  async function testConnection(url) {
    const targetUrl = url || getUrl();
    if (!targetUrl) throw new Error('URL Google Apps Script belum dimasukkan');
    const res = await fetchFromDrive(targetUrl);
    if (res && res.status === 'success') {
      localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      return res;
    }
    throw new Error(res.message || 'Respons tidak valid dari Google Apps Script');
  }

  // --- Push Single Project (Online or Queue) ---
  async function pushProject(type, project, options = {}) {
    if (!project || !project.id) return { status: 'ignored' };
    const url = getUrl();
    if (!url) {
      return { status: 'unconfigured' };
    }

    if (!navigator.onLine) {
      addToQueue(type, project);
      if (!options.silent) {
        showToast(`🟠 Offline: Disimpan lokal di HP (Antrean Drive: ${getQueue().length})`, 'warning');
      }
      return { status: 'queued' };
    }

    try {
      const payload = {
        action: 'save',
        type: type || currentType,
        project: project
      };
      const res = await sendToDrive(url, payload);
      if (res && res.status === 'success') {
        localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
        updateBadges();
        if (!options.silent) {
          showToast(`☁️ Tersinkron ke Google Drive (${new Date().toLocaleTimeString('id-ID')})`, 'success');
        }
        return res;
      } else {
        throw new Error(res.message || 'Gagal menyimpan ke Drive');
      }
    } catch (err) {
      console.warn('Gagal sync online, masuk antrean:', err);
      addToQueue(type, project);
      if (!options.silent) {
        showToast(`🟠 Jaringan lambat: Disimpan lokal di HP (Akan dicoba lagi)`, 'warning');
      }
      return { status: 'queued', error: err };
    }
  }

  // --- Flush Queue When Back Online ---
  async function flushQueue() {
    if (isFlushingQueue || !navigator.onLine) return;
    const url = getUrl();
    if (!url) return;
    const queue = getQueue();
    if (queue.length === 0) {
      updateBadges();
      return;
    }

    isFlushingQueue = true;
    updateBadges('syncing');

    let successCount = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        const payload = {
          action: 'save',
          type: item.type || currentType,
          project: item.project
        };
        const res = await sendToDrive(url, payload);
        if (res && res.status === 'success') {
          successCount++;
        } else {
          remaining.push(item);
        }
      } catch (e) {
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    isFlushingQueue = false;
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    updateBadges();

    if (successCount > 0) {
      showToast(`🟢 ${successCount} proyek berhasil disinkronkan ke Google Drive!`, 'success');
      window.dispatchEvent(new CustomEvent('cloud-sync-flushed', { detail: { count: successCount } }));
    }
  }

  // --- Pull Projects from Drive & Merge Locally ---
  async function pullAndMerge(type) {
    const url = getUrl();
    if (!url) {
      openModal();
      throw new Error('URL Google Apps Script belum diatur');
    }
    if (!navigator.onLine) {
      throw new Error('Perangkat sedang offline. Sambungkan ke internet untuk menarik data.');
    }

    showToast('⏳ Mengambil data dari Google Drive...', 'warning', 6000);
    const res = await fetchFromDrive(url);
    if (!res || res.status !== 'success' || !Array.isArray(res.projects)) {
      throw new Error(res?.message || 'Gagal mengambil data dari Google Drive');
    }

    const currentFormType = type || currentType;
    let mergedCount = 0;

    // Filter projects matching this form type (e.g. air_ or udara_)
    const relevantRemote = res.projects.filter(p => {
      const fn = p.fileName || '';
      return fn.startsWith(currentFormType + '_');
    });

    if (currentFormType === 'air' || currentFormType === 'udara') {
      const storageKey = currentFormType === 'air'
        ? 'survey_air_fsop_10_3_1_projects_v1'
        : 'survey_udara_ambien_projects_v1';

      let localData = { activeProjectId: null, projects: [] };
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) localData = JSON.parse(raw);
      } catch (e) {}

      relevantRemote.forEach(rem => {
        const rProj = rem.data;
        if (!rProj || !rProj.id) return;
        const existingIdx = localData.projects.findIndex(p => p.id === rProj.id);
        if (existingIdx >= 0) {
          // Merge / replace if remote has data
          localData.projects[existingIdx] = rProj;
        } else {
          localData.projects.push(rProj);
        }
        mergedCount++;
      });

      if (mergedCount > 0) {
        if (!localData.activeProjectId && localData.projects.length > 0) {
          localData.activeProjectId = localData.projects[0].id;
        }
        localStorage.setItem(storageKey, JSON.stringify(localData));
        // Trigger page re-render if function exists
        window.location.reload();
      }
    }

    showToast(`📥 Berhasil menarik ${mergedCount} data survei dari Google Drive!`, 'success');
    return { count: mergedCount, totalInDrive: res.projects.length };
  }

  // --- Update Realtime Online/Offline Web Status Indicators ---
  function updateRealtimeWebStatus(customState) {
    const isOnline = navigator.onLine;
    const pills = document.querySelectorAll('.web-status-pill, .mode-pill, header .pill');
    pills.forEach(pill => {
      pill.classList.remove('is-online', 'is-offline');
      if (isOnline) {
        pill.classList.add('is-online');
        pill.innerHTML = '<span class="status-pulse-dot"></span><span>Online</span>';
        pill.title = 'Terhubung ke internet. Sinkronisasi Google Drive aktif.';
      } else {
        pill.classList.add('is-offline');
        pill.innerHTML = '<span class="status-pulse-dot"></span><span>Offline</span>';
        pill.title = 'Perangkat offline. Semua data tersimpan aman di HP/laptop.';
      }
    });

    const statusEl = document.getElementById('status');
    if (statusEl && !customState) {
      const cur = (statusEl.textContent || '').trim();
      if (!cur || cur === 'Siap' || cur.includes('Online') || cur.includes('Offline')) {
        statusEl.textContent = isOnline ? 'Online · Siap' : 'Offline · Siap (Lokal)';
      }
    }
  }

  // --- Update Status Badges in DOM ---
  function updateBadges(customState) {
    const url = getUrl();
    const isOnline = navigator.onLine;
    const queue = getQueue();
    const badges = document.querySelectorAll('.cloud-sync-badge');

    badges.forEach(badge => {
      badge.classList.remove('status-connected', 'status-offline', 'status-unconfigured', 'status-error');

      if (!url) {
        badge.classList.add('status-unconfigured');
        badge.innerHTML = `<span class="cloud-pulse-dot"></span><span class="cloud-badge-label">☁️ Drive: Belum Diatur</span>`;
        badge.title = 'Klik untuk menghubungkan ke Google Drive';
      } else if (customState === 'syncing') {
        badge.classList.add('status-offline');
        badge.innerHTML = `<span class="cloud-pulse-dot"></span><span class="cloud-badge-label">🔄 Mengunggah...</span>`;
      } else if (!isOnline || queue.length > 0) {
        badge.classList.add('status-offline');
        const countTxt = queue.length > 0 ? ` (${queue.length} antrean)` : '';
        badge.innerHTML = `<span class="cloud-pulse-dot"></span><span class="cloud-badge-label">🟠 Drive: Offline${countTxt}</span>`;
        badge.title = queue.length > 0 ? `${queue.length} perubahan tersimpan di HP, akan dikirim ke Drive saat online.` : 'Offline';
      } else {
        badge.classList.add('status-connected');
        badge.innerHTML = `<span class="cloud-pulse-dot"></span><span class="cloud-badge-label">🟢 Drive: Terhubung</span>`;
        badge.title = 'Terhubung & tersinkronisasi dengan Google Drive';
      }
    });

    // Update realtime web status pill & status text
    updateRealtimeWebStatus(customState);

    // Update modal elements if open
    const modalStatus = document.getElementById('cloudModalStatusBanner');
    if (modalStatus) {
      if (!isOnline) {
        modalStatus.className = 'cloud-status-banner is-offline';
        modalStatus.innerHTML = `🟠 <b>Perangkat Offline:</b> Data tersimpan di HP/Laptop ini. Begitu terhubung internet, antrean (${queue.length}) otomatis diunggah ke Google Drive.`;
      } else if (url) {
        modalStatus.className = 'cloud-status-banner is-online';
        modalStatus.innerHTML = `🟢 <b>Perangkat Online:</b> Terhubung ke Google Drive. Siap sinkronisasi otomatis.`;
      } else {
        modalStatus.className = 'cloud-status-banner is-offline';
        modalStatus.innerHTML = `⚙️ <b>Belum Diatur:</b> Masukkan URL Google Apps Script Anda di bawah agar data otomatis masuk ke Google Drive Anda.`;
      }
    }
  }

  // --- Render Modal UI ---
  function renderModal() {
    let overlay = document.getElementById('cloudSyncModalOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'cloudSyncModalOverlay';
    overlay.className = 'cloud-modal-overlay';
    overlay.innerHTML = `
      <div class="cloud-modal-card" role="dialog" aria-modal="true" aria-labelledby="cloudModalTitle">
        <div class="cloud-modal-header">
          <h3 id="cloudModalTitle">☁️ Sinkronisasi Google Drive (Online & Offline)</h3>
          <button type="button" class="cloud-modal-close" id="cloudModalCloseBtn" title="Tutup">&times;</button>
        </div>
        <div class="cloud-modal-body">
          <div id="cloudModalStatusBanner" class="cloud-status-banner is-online"></div>

          <!-- URL Setting -->
          <div class="cloud-section-box">
            <div class="cloud-input-group">
              <label for="cloudScriptUrlInput">🔗 URL Aplikasi Web Google Apps Script:</label>
              <input type="url" id="cloudScriptUrlInput" class="cloud-url-input" 
                placeholder="https://script.google.com/macros/s/AKfycb.../exec" spellcheck="false" autocomplete="off" />
              <div style="font-size:11px;color:#64748b;margin-top:2px;">
                URL ini didapat setelah men-deploy skrip di Google Drive Anda (Langkah 5 di panduan).
              </div>
            </div>

            <div class="cloud-actions-row" style="margin-top:12px;">
              <button type="button" class="cloud-btn cloud-btn-primary" id="cloudSaveTestBtn">
                🔗 Simpan & Tes Koneksi
              </button>
              <button type="button" class="cloud-btn cloud-btn-outline" id="cloudShareLinkBtn" title="Salin tautan yang sudah otomatis tersambung untuk dibuka di Laptop">
                📲 Salin Tautan untuk Laptop
              </button>
              <button type="button" class="cloud-btn cloud-btn-outline" id="cloudClearUrlBtn">
                Hapus URL
              </button>
            </div>
          </div>

          <!-- Sync Actions -->
          <div class="cloud-section-box">
            <div class="cloud-section-title">⚡ Tindakan Sinkronisasi</div>
            <div class="cloud-actions-row">
              <button type="button" class="cloud-btn cloud-btn-success" id="cloudPushCurrentBtn">
                📤 Kirim Data Saat Ini ke Drive
              </button>
              <button type="button" class="cloud-btn cloud-btn-outline" id="cloudPullAllBtn">
                📥 Tarik Data dari Drive ke Perangkat Ini
              </button>
            </div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="cloudAutoSyncCheckbox" style="cursor:pointer;" checked />
              <label for="cloudAutoSyncCheckbox" style="font-size:12px;cursor:pointer;font-weight:600;color:#334155;">
                Otomatis kirim ke Google Drive setiap kali data disimpan (saat online)
              </label>
            </div>
          </div>

          <!-- Quick Guide / Script Code Accordion -->
          <div class="cloud-accordion" id="cloudScriptGuideAccordion">
            <div class="cloud-accordion-header" id="cloudAccordionToggle">
              <span>📖 Panduan & Salin Kode Google Apps Script</span>
              <span id="cloudAccordionArrow">▼</span>
            </div>
            <div class="cloud-accordion-content">
              <ol>
                <li>Buka <b>script.google.com</b> lalu buat <b>Proyek Baru</b>.</li>
                <li>Hapus kode bawaan, lalu salin dan tempel kode script di bawah ini.</li>
                <li>Klik tombol <b>Terapkan (Deploy)</b> ➔ <b>Penerapan Baru (New Deployment)</b>.</li>
                <li>Pilih jenis <b>Aplikasi Web (Web App)</b>, atur <i>Akses</i>: <b>Siapa saja (Anyone)</b>.</li>
                <li>Berikan izin akses (Authorize), lalu salin URL yang dihasilkan dan tempelkan ke kolom URL di atas.</li>
              </ol>
              <button type="button" class="cloud-btn cloud-btn-outline" id="cloudCopyScriptBtn" style="width:100%;margin-bottom:6px;">
                📋 Salin Kode Google Apps Script
              </button>
              <div class="cloud-code-block" id="cloudCodeDisplay"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Populate code display
    const codeBlock = overlay.querySelector('#cloudCodeDisplay');
    if (codeBlock) codeBlock.textContent = SCRIPT_SOURCE_CODE;

    // Events
    overlay.querySelector('#cloudModalCloseBtn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const urlInput = overlay.querySelector('#cloudScriptUrlInput');
    urlInput.value = getUrl();

    const autoSyncCb = overlay.querySelector('#cloudAutoSyncCheckbox');
    autoSyncCb.checked = isAutoSyncEnabled();
    autoSyncCb.addEventListener('change', () => {
      setAutoSyncEnabled(autoSyncCb.checked);
    });

    // Save and Test
    overlay.querySelector('#cloudSaveTestBtn').addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) {
        alert('Masukkan URL Web App Google Apps Script Anda terlebih dahulu.');
        return;
      }
      setUrl(url);
      const btn = overlay.querySelector('#cloudSaveTestBtn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ Menghubungkan...';
      btn.disabled = true;

      try {
        const res = await testConnection(url);
        btn.innerHTML = '✅ Terhubung!';
        showToast('🟢 Berhasil terhubung ke Google Drive!', 'success');
        updateBadges();
        // Also flush any pending queue
        flushQueue();
      } catch (err) {
        btn.innerHTML = '❌ Gagal Terhubung';
        alert('Gagal terhubung ke Google Apps Script:\n' + err.message + '\n\nPastikan Anda sudah men-deploy sebagai Web App dengan Akses: "Siapa saja (Anyone)".');
      } finally {
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }, 2000);
      }
    });

    // Clear URL
    overlay.querySelector('#cloudClearUrlBtn').addEventListener('click', () => {
      if (confirm('Hapus URL Google Apps Script dari perangkat ini? (Data di Google Drive Anda tetap aman)')) {
        setUrl('');
        urlInput.value = '';
        updateBadges();
        showToast('URL Google Drive dihapus.', 'warning');
      }
    });

    // Salin Tautan Cepat untuk Laptop
    overlay.querySelector('#cloudShareLinkBtn')?.addEventListener('click', () => {
      const url = getUrl();
      if (!url) {
        alert('Masukkan dan simpan URL Web App terlebih dahulu.');
        return;
      }
      const shareUrl = window.location.origin + window.location.pathname + '?drive_url=' + encodeURIComponent(url);
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('🔗 Tautan khusus tersalin! Buka link ini di Laptop/HP lain untuk langsung tersambung otomatis.', 'success', 5000);
      }).catch(() => {
        prompt('Salin link ini untuk dibuka di laptop:', shareUrl);
      });
    });

    // Push Current
    overlay.querySelector('#cloudPushCurrentBtn').addEventListener('click', async () => {
      if (typeof window.saveAllProjects === 'function') {
        window.saveAllProjects();
      }
      if (typeof window.getActiveProject === 'function') {
        const proj = window.getActiveProject();
        if (proj) {
          showToast('Mengunggah proyek saat ini ke Drive...', 'warning');
          const res = await pushProject(currentType, proj);
          if (res && res.status === 'success') {
            showToast('✅ Berhasil diunggah ke Google Drive!', 'success');
          }
        }
      } else {
        alert('Fitur ini dapat digunakan di dalam halaman formulir survei.');
      }
    });

    // Pull All
    overlay.querySelector('#cloudPullAllBtn').addEventListener('click', async () => {
      if (confirm('Tarik data dari Google Drive ke perangkat ini? Data survei di Drive akan dimasukkan ke daftar proyek Anda.')) {
        try {
          await pullAndMerge(currentType);
        } catch (e) {
          alert('Gagal menarik data: ' + e.message);
        }
      }
    });

    // Accordion Toggle
    const acc = overlay.querySelector('#cloudScriptGuideAccordion');
    overlay.querySelector('#cloudAccordionToggle').addEventListener('click', () => {
      acc.classList.toggle('is-open');
      const arrow = overlay.querySelector('#cloudAccordionArrow');
      if (arrow) arrow.textContent = acc.classList.contains('is-open') ? '▲' : '▼';
    });

    // Copy Script Button
    overlay.querySelector('#cloudCopyScriptBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(SCRIPT_SOURCE_CODE).then(() => {
        showToast('📋 Kode script disalin ke clipboard!', 'success');
      }).catch(() => {
        alert('Gagal menyalin otomatis. Silakan salin teks di dalam kotak secara manual.');
      });
    });

    return overlay;
  }

  function openModal() {
    const modal = renderModal();
    const urlInput = modal.querySelector('#cloudScriptUrlInput');
    if (urlInput) urlInput.value = getUrl();
    updateBadges();
    modal.classList.add('is-active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const modal = document.getElementById('cloudSyncModalOverlay');
    if (modal) {
      modal.classList.remove('is-active');
      document.body.style.overflow = '';
    }
  }

  // --- Network Event Listeners ---
  window.addEventListener('online', () => {
    updateBadges();
    showToast('🟢 Terhubung kembali ke internet. Menyinkronkan antrean...', 'success', 3000);
    flushQueue();
  });

  window.addEventListener('offline', () => {
    updateBadges();
    showToast('🟠 Mode Offline aktif. Data akan disimpan lokal di perangkat.', 'warning', 3000);
  });

  // Check queue periodically every 45s
  setInterval(() => {
    if (navigator.onLine && getQueue().length > 0) {
      flushQueue();
    }
  }, 45000);

  // --- Initialize CloudSync on Page ---
  function init(options = {}) {
    if (options.type) currentType = options.type;

    // Render modal in background so it's ready
    renderModal();
    updateBadges();

    // Check pending queue immediately if online
    if (navigator.onLine && getQueue().length > 0) {
      setTimeout(flushQueue, 2000);
    }
  }

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  // Expose Global CloudSync Object
  window.CloudSync = {
    init,
    getUrl,
    setUrl,
    isAutoSyncEnabled,
    setAutoSyncEnabled,
    pushProject,
    flushQueue,
    pullAndMerge,
    testConnection,
    openModal,
    closeModal,
    showToast,
    getQueue,
    updateBadges
  };

})();
