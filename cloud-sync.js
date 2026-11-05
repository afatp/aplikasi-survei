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
let requestStartedAt = Date.now();

function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function clearListCache() {
  try { CacheService.getScriptCache().remove('survey-list-v3'); } catch (_) {}
}

function doPost(e) {
  requestStartedAt = Date.now();
  try {
    const rawData = e.postData.contents;
    const payload = JSON.parse(rawData);
    // ----- DELETE ACTION -----
    if (payload.action === 'delete') {
      try {
        if (payload.fileId) {
          const file = DriveApp.getFileById(payload.fileId);
          file.setTrashed(true);
          clearListCache();
          return jsonResponse({ status: 'success', message: 'File dihapus' });
        } else if (payload.fileName) {
          const files = getOrCreateFolder().getFilesByName(payload.fileName);
          let count = 0;
          while (files.hasNext()) {
            files.next().setTrashed(true);
            clearListCache();
            count++;
          }
          return jsonResponse({ status: 'success', message: count > 0 ? 'File dihapus' : 'File tidak ditemukan' });
        }
        return jsonResponse({ status: 'error', message: 'fileId atau fileName tidak disertakan' });
      } catch (e) {
        return jsonResponse({ status: 'error', message: 'File tidak ditemukan atau tidak dapat dihapus: ' + e.toString() });
      }
    }

    // ----- SAVE ACTION -----
    const formType = payload.type || 'survei';
    const project = payload.project;
    if (!project || !project.id) return jsonResponse({ status: 'error', message: 'Data proyek tidak lengkap' });

    const fileName = formType + '_' + project.id + '.json';
    const fileContent = JSON.stringify(project, null, 2);

    const files = getOrCreateFolder().getFilesByName(fileName);
    let savedFile;
    if (files.hasNext()) {
      savedFile = files.next();
      savedFile.setContent(fileContent);
    } else {
      savedFile = getOrCreateFolder().createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
    }
    // Metadata ringkas: daftar tidak perlu membaca isi formulir/sketsa.
    savedFile.setDescription(JSON.stringify({ surveyIndex: 1, id: project.id, name: project.name || project.id }));
    clearListCache();

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
  requestStartedAt = Date.now();
  try {
    const params = (e && e.parameter) || {};
    if (params.action === 'ping') {
      return jsonResponse({ status: 'success', apiVersion: 3 });
    }
    // Cache singkat mempercepat daftar, termasuk berkas lama tanpa indeks.
    const cacheable = params.action === 'list' && !params.type;
    if (cacheable && params.refresh !== '1') {
      try {
        const cached = CacheService.getScriptCache().get('survey-list-v3');
        if (cached) return jsonResponse(JSON.parse(cached));
      } catch (_) {}
    }
    const folder = getOrCreateFolder();
    // Cari langsung berkas yang dipilih, bukan membaca semua proyek.
    const files = params.action === 'get'
      ? folder.getFilesByName(params.type + '_' + params.projectId + '.json')
      : folder.getFiles();
    const projects = [];

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().endsWith('.json')) {
        if (params.type && !file.getName().startsWith(params.type + '_')) continue;
        try {
          let content;
          if (params.action === 'list') {
            let index;
            try { index = JSON.parse(file.getDescription()); } catch (_) {}
            if (index && index.surveyIndex === 1 && index.id) {
              content = { id: index.id, name: index.name };
            } else {
              // Berkas lama tetap kompatibel tanpa mengubah data Drive saat GET.
              const project = JSON.parse(file.getBlob().getDataAsString());
              content = { id: project.id, name: project.name };
            }
          } else {
            content = JSON.parse(file.getBlob().getDataAsString());
          }
          projects.push({
            fileName: file.getName(),
            fileId: file.getId(),
            lastModified: file.getLastUpdated().toISOString(),
            data: content
          });
        } catch (e) {}
      }
    }

    const result = { status: 'success', apiVersion: 3, count: projects.length, projects: projects };
    if (cacheable) {
      try {
        const encoded = JSON.stringify(result);
        // Batas CacheService 100 KB; lewati cache jika ringkasan terlalu besar.
        if (Utilities.newBlob(encoded).getBytes().length < 90000) {
          CacheService.getScriptCache().put('survey-list-v3', encoded, 60);
        }
      } catch (_) {}
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function jsonResponse(data) {
  data.serverMs = Date.now() - requestStartedAt;
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
  let lastDriveTiming = null;
  async function measuredDriveRequest(url, options, action) {
    const started = Date.now();
    const response = await fetch(url, options);
    if (!response.ok && response.status) throw new Error('Google Drive HTTP ' + response.status);
    const result = await response.json();
    lastDriveTiming = { action, totalMs: Date.now() - started, serverMs: Number.isFinite(result.serverMs) ? result.serverMs : null };
    console.info('Durasi Drive', lastDriveTiming);
    return result;
  }

  async function sendToDrive(url, payload) {
    return measuredDriveRequest(url, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    }, payload.action || 'save');
  }

  // --- Fetch Data from Google Apps Script Web App ---
  // Gabungkan permintaan identik yang masih berjalan (tanpa cache data lama).
  const pendingReads = new Map();
  async function fetchFromDrive(url, params = {}) {
    const query = new URLSearchParams(params);
    const key = url + '|' + query.toString();
    if (pendingReads.has(key)) return pendingReads.get(key);
    const request = readFromDrive(url, query);
    pendingReads.set(key, request);
    try { return await request; }
    finally { pendingReads.delete(key); }
  }

  async function readFromDrive(url, query) {
    query.set('t', Date.now());
    const separator = url.includes('?') ? '&' : '?';
    const targetUrl = url + separator + query.toString();
    return measuredDriveRequest(targetUrl, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow'
    }, query.get('action') || 'pull-all');
  }

  // --- Test Connection ---
  async function testConnection(url) {
    const targetUrl = url || getUrl();
    if (!targetUrl) throw new Error('URL Google Apps Script belum dimasukkan');
    const res = await fetchFromDrive(targetUrl, { action: 'ping' });
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
        invalidateRemoteList();
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
          invalidateRemoteList();
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
    const currentFormType = type || currentType;
    const res = await fetchFromDrive(url, { type: currentFormType });
    if (!res || res.status !== 'success' || !Array.isArray(res.projects)) {
      throw new Error(res?.message || 'Gagal mengambil data dari Google Drive');
    }
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

  // -----------------------------------------------------------------
  //  NEW: List semua proyek yang ada di Drive
  // -----------------------------------------------------------------
  let remoteListCache = null;
  function invalidateRemoteList() { remoteListCache = null; }

  async function listRemoteProjects(options = {}) {
    const url = getUrl();
    if (!url) throw new Error('URL Google Apps Script belum diatur');
    if (!navigator.onLine) throw new Error('Perangkat sedang offline');
    if (!options.force && remoteListCache && remoteListCache.url === url && Date.now() - remoteListCache.time < 30000) {
      return remoteListCache.projects;
    }
    showToast('⏳ Mengambil daftar proyek dari Drive...', 'warning', 6000);
    const res = await fetchFromDrive(url, options.force ? { action: 'list', refresh: '1' } : { action: 'list' });
    if (!res || res.status !== 'success' || !Array.isArray(res.projects))
      throw new Error(res?.message || 'Gagal mendapatkan daftar proyek dari Drive');
    remoteListCache = { url, time: Date.now(), projects: res.projects, apiVersion: res.apiVersion || 0 };
    return res.projects;
  }

  // -----------------------------------------------------------------
  //  NEW: Hapus proyek dari Drive (menggunakan fileId & fileName)
  // -----------------------------------------------------------------
  async function deleteRemoteProject(fileId, fileName) {
    const url = getUrl();
    if (!url) throw new Error('URL Google Apps Script belum diatur');
    if (!navigator.onLine) throw new Error('Perangkat sedang offline');
    const payload = { action: 'delete', fileId: fileId, fileName: fileName };
    const res = await sendToDrive(url, payload);
    if (!res || res.status !== 'success') {
      const msg = res?.message || '';
      if (msg.toLowerCase().includes('data proyek tidak lengkap')) {
        throw new Error('Google Apps Script Anda masih versi lama (belum ada fitur delete). Silakan buka menu ☁️ Sinkron Google Drive > "Panduan & Salin Kode", salin skrip terbaru ke script.google.com, lalu klik Deploy > Manage Deployments > Edit > Version: New Version > Deploy.');
      }
      throw new Error(msg || 'Gagal menghapus proyek dari Drive');
    }
    invalidateRemoteList();
    // Server sudah mengonfirmasi: tidak perlu mengunduh seluruh daftar lagi.
    _cachedRemoteProjects = _cachedRemoteProjects.filter(p =>
      fileId ? p.fileId !== fileId : p.fileName !== fileName);
    showToast('🗑️ Proyek berhasil dihapus dari Google Drive', 'success');
    return res;
  }

  // -----------------------------------------------------------------
  //  NEW: Tarik satu proyek berdasarkan projectId dengan cek duplikat
  // -----------------------------------------------------------------
  async function pullProject(projectId, formType) {
    const url = getUrl();
    if (!url) throw new Error('URL Google Apps Script belum diatur');
    if (!navigator.onLine) throw new Error('Perangkat sedang offline');

    showToast('⏳ Mengambil proyek dari Drive...', 'warning', 6000);
    const res = await fetchFromDrive(url, { action: 'get', type: formType || currentType, projectId });
    if (!res || res.status !== 'success' || !Array.isArray(res.projects))
      throw new Error(res?.message || 'Gagal mengambil data dari Drive');

    const target = res.projects.find(p => p.data && p.data.id === projectId);
    if (!target) throw new Error('Proyek tidak ditemukan di Drive');

    const ft = formType || currentType;
    const storageKey = ft === 'air'
      ? 'survey_air_fsop_10_3_1_projects_v1'
      : 'survey_udara_ambien_projects_v1';

    let local = { activeProjectId: null, projects: [] };
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) local = JSON.parse(raw);
      if (!local.projects) local.projects = [];
    } catch (_) {
      local = { activeProjectId: null, projects: [] };
    }

    const existingIdx = local.projects.findIndex(p => p.id === target.data.id);
    if (existingIdx >= 0) {
      if (!confirm('Proyek "' + (target.data.name || target.data.id) + '" sudah ada secara lokal. Timpa data lokal dengan data dari Drive?')) {
        showToast('⚠️ Penarikan dibatalkan, data lokal tetap aman', 'warning');
        return { status: 'skipped' };
      }
      local.projects[existingIdx] = target.data;
    } else {
      local.projects.push(target.data);
    }

    if (!local.activeProjectId) local.activeProjectId = target.data.id;
    localStorage.setItem(storageKey, JSON.stringify(local));
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    showToast('📥 Proyek "' + (target.data.name || target.data.id) + '" berhasil ditarik dari Drive!', 'success');
    return { status: 'ok' };
  }

  // -----------------------------------------------------------------
  //  NEW: Hapus proyek dari lokal
  // -----------------------------------------------------------------
  function deleteLocalProject(projectId, formType) {
    const ft = formType || currentType;
    const storageKey = ft === 'air'
      ? 'survey_air_fsop_10_3_1_projects_v1'
      : 'survey_udara_ambien_projects_v1';

    let local = { activeProjectId: null, projects: [] };
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) local = JSON.parse(raw);
      if (!local.projects) local.projects = [];
    } catch (_) {
      local = { activeProjectId: null, projects: [] };
    }

    local.projects = local.projects.filter(p => p.id !== projectId);
    if (local.activeProjectId === projectId) {
      local.activeProjectId = local.projects.length > 0 ? local.projects[0].id : null;
    }
    localStorage.setItem(storageKey, JSON.stringify(local));
  }

  // -----------------------------------------------------------------
  //  NEW: Buka modal daftar proyek Google Drive
  // -----------------------------------------------------------------
  function openProjectModal() {
    // Buat modal jika belum ada
    let modalEl = document.getElementById('driveProjectModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'driveProjectModal';
      modalEl.className = 'cloud-modal-overlay';
      modalEl.innerHTML = `
        <div class="cloud-modal-card" role="dialog" aria-modal="true" style="max-width:760px;width:95%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.35);">
          <div class="cloud-modal-header" style="flex-shrink:0;">
            <h3>📂 Daftar Proyek di Google Drive</h3>
            <button type="button" class="cloud-modal-close" id="driveProjectModalCloseBtn" title="Tutup">&times;</button>
          </div>
          <div class="cloud-modal-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:16px 20px;gap:10px;">
            <div id="driveProjectStatusBanner" class="cloud-status-banner is-online" style="margin-bottom:0;flex-shrink:0;"></div>

            <div class="cloud-section-box" style="margin-bottom:0;flex-shrink:0;padding:10px 14px;">
              <div class="cloud-section-title" style="margin-bottom:6px;">🔍 Filter Proyek</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <select id="driveProjectFilterType" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;background:#fff;">
                  <option value="all">Semua Tipe</option>
                  <option value="air">💧 Form Air</option>
                  <option value="udara">🌫️ Form Udara</option>
                </select>
                <input type="text" id="driveProjectFilterName" placeholder="Cari nama atau ID proyek..." 
                  style="flex:1;min-width:160px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;background:#fff;" />
                <button type="button" class="cloud-btn cloud-btn-outline" id="driveProjectRefreshBtn">🔄 Refresh</button>
              </div>
            </div>

            <div id="driveProjectListContainer" style="flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:220px;max-height:55vh;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:4px;">
              <div style="text-align:center;padding:30px;color:#94a3b8;">Memuat daftar proyek...</div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);

      // Event: Tutup modal
      modalEl.querySelector('#driveProjectModalCloseBtn').addEventListener('click', closeProjectModal);
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeProjectModal();
      });

      // Mencegah scroll tembus ke lembar kerja saat user scroll di dalam modal
      modalEl.addEventListener('wheel', (e) => {
        const listEl = document.getElementById('driveProjectListContainer');
        if (listEl && listEl.contains(e.target)) {
          return; // Biarkan scroll pada daftar proyek
        }
        e.preventDefault();
      }, { passive: false });

      // Event: Filter
      modalEl.querySelector('#driveProjectFilterType').addEventListener('change', () => renderProjectList());
      modalEl.querySelector('#driveProjectFilterName').addEventListener('input', () => renderProjectList());
      modalEl.querySelector('#driveProjectRefreshBtn').addEventListener('click', () => loadProjectList(true));
    }

    // Tampilkan modal dan kunci scroll latar belakang
    modalEl.classList.add('is-active');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // Set default filter sesuai currentType
    const filterType = modalEl.querySelector('#driveProjectFilterType');
    if (filterType && (currentType === 'air' || currentType === 'udara')) {
      filterType.value = currentType;
    }

    // Muat daftar proyek
    loadProjectList();
  }

  let _cachedRemoteProjects = [];

  async function loadProjectList(force = false) {
    const container = document.getElementById('driveProjectListContainer');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;">⏳ Mengambil data dari Google Drive...</div>';

    try {
      _cachedRemoteProjects = await listRemoteProjects({ force });
      const banner = document.getElementById('driveProjectStatusBanner');
      if (banner) {
        banner.textContent = remoteListCache && remoteListCache.apiVersion >= 3
          ? 'Daftar dapat tersimpan sementara hingga 60 detik. Tekan Refresh untuk mengambil perubahan terbaru.'
          : 'Apps Script belum versi terbaru. Perbarui deployment Google melalui Panduan & Salin Kode agar pemuatan lebih cepat. Publish lingkungan cloud tidak memperbarui Apps Script.';
      }
      renderProjectList();
      if (lastDriveTiming && lastDriveTiming.action === 'list') showDriveTiming();
    } catch (err) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;">❌ ' + err.message + '</div>';
    }
  }

  function renderProjectList() {
    const container = document.getElementById('driveProjectListContainer');
    if (!container) return;

    const filterType = (document.getElementById('driveProjectFilterType')?.value || 'all').toLowerCase();
    const filterName = (document.getElementById('driveProjectFilterName')?.value || '').toLowerCase().trim();

    let filtered = _cachedRemoteProjects;

    // Filter berdasarkan tipe form
    if (filterType !== 'all') {
      filtered = filtered.filter(p => {
        const fn = (p.fileName || '').toLowerCase();
        return fn.startsWith(filterType + '_');
      });
    }

    // Filter berdasarkan nama
    if (filterName) {
      filtered = filtered.filter(p => {
        const name = (p.data?.name || p.fileName || '').toLowerCase();
        const id = (p.data?.id || '').toLowerCase();
        return name.includes(filterName) || id.includes(filterName);
      });
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">Tidak ada proyek yang ditemukan di Google Drive.</div>';
      return;
    }

    // Bangun tabel dengan sticky header
    let html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="position:sticky;top:0;z-index:2;background:#f1f5f9;border-bottom:2px solid #cbd5e1;box-shadow:0 1px 2px rgba(0,0,0,0.05);">';
    html += '<th style="text-align:left;padding:9px 8px;">Nama Proyek</th>';
    html += '<th style="text-align:left;padding:9px 8px;">Tipe</th>';
    html += '<th style="text-align:left;padding:9px 8px;">Terakhir Diubah</th>';
    html += '<th style="text-align:center;padding:9px 8px;min-width:130px;">Aksi</th>';
    html += '</tr></thead><tbody>';

    filtered.forEach((p, idx) => {
      const projName = p.data?.name || p.data?.id || p.fileName || '-';
      const fn = p.fileName || '';
      const tipe = fn.startsWith('air_') ? '💧 Air' : fn.startsWith('udara_') ? '🌫️ Udara' : '📄 Lainnya';
      const lastMod = p.lastModified ? new Date(p.lastModified).toLocaleString('id-ID') : '-';
      const bgColor = idx % 2 === 0 ? '#fff' : '#f8fafc';
      const projId = p.data?.id || '';
      const fileId = p.fileId || '';

      html += '<tr style="border-bottom:1px solid #e2e8f0;background:' + bgColor + ';">';
      html += '<td style="padding:9px 8px;font-weight:600;">' + escapeHtml(projName) + '</td>';
      html += '<td style="padding:9px 8px;">' + tipe + '</td>';
      html += '<td style="padding:9px 8px;color:#64748b;font-size:12px;">' + lastMod + '</td>';
      html += '<td style="padding:9px 8px;text-align:center;white-space:nowrap;">';
      html += '<button class="cloud-btn cloud-btn-outline" style="font-size:11px;padding:4px 8px;margin:2px;" onclick="window.CloudSync._handlePull(\'' + projId + '\',\'' + fn + '\')">📥 Tarik</button>';
      html += '<button class="cloud-btn cloud-btn-outline" style="font-size:11px;padding:4px 8px;margin:2px;color:#dc2626;border-color:#fca5a5;" onclick="window.CloudSync._handleDelete(\'' + fileId + '\',\'' + projName.replace(/'/g, "\\\\'") + '\',\'' + fn + '\')">🗑️ Hapus</button>';
      html += '</td></tr>';
    });

    html += '</tbody></table>';
    html += '<div style="margin-top:8px;padding:4px 6px;font-size:11px;color:#94a3b8;">Total: ' + filtered.length + ' proyek ditemukan di Google Drive</div>';
    container.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showDriveTiming() {
    const banner = document.getElementById('driveProjectStatusBanner');
    if (!banner || !lastDriveTiming) return;
    const t = lastDriveTiming;
    banner.textContent = banner.textContent.split('\n')[0] + '\nPermintaan Drive: ' + (t.totalMs / 1000).toFixed(1) + ' detik total'
      + (t.serverMs === null ? '. Durasi server belum tersedia pada deployment ini.'
        : '; proses server: ' + (t.serverMs / 1000).toFixed(1) + ' detik.');
  }

  // Handler untuk tombol Tarik di modal
  async function _handlePull(projectId, fileName) {
    const ft = fileName.startsWith('air_') ? 'air' : fileName.startsWith('udara_') ? 'udara' : currentType;
    try {
      const result = await pullProject(projectId, ft);
      showDriveTiming();
      if (result.status === 'ok') {
        if (confirm('Proyek berhasil ditarik! Muat ulang halaman untuk menampilkan data terbaru?')) {
          window.location.reload();
        }
      }
    } catch (err) {
      alert('Gagal menarik proyek: ' + err.message);
    }
  }

  // Handler untuk tombol Hapus di modal
  async function _handleDelete(fileId, projName, fileName) {
    if (!fileId && !fileName) {
      alert('❗️ Tidak dapat menghapus: ID berkas tidak ditemukan.');
      return;
    }
    if (!confirm('Hapus proyek "' + projName + '" dari Google Drive?\n\nData lokal di perangkat ini TIDAK akan dihapus.')) return;
    try {
      await deleteRemoteProject(fileId, fileName);
      renderProjectList();
      showDriveTiming();
    } catch (err) {
      alert('Gagal menghapus: ' + (err.message || err));
    }
  }

  function closeProjectModal() {
    const modalEl = document.getElementById('driveProjectModal');
    if (modalEl) {
      modalEl.classList.remove('is-active');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
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
                <li>Untuk memperbarui koneksi yang sudah ada, buka proyek di <b>script.google.com</b> yang digunakan URL saat ini. Ganti kode, lalu pilih <b>Deploy → Manage deployments → Edit → New version → Deploy</b>. URL tetap sama. Pembaruan ini mempercepat tes koneksi, daftar, dan penarikan proyek serta mendukung hapus.</li>
                <li>Untuk koneksi baru, buka <b>script.google.com</b> lalu buat <b>Proyek Baru</b>.</li>
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
        if (!res.apiVersion || res.apiVersion < 3) {
          showToast('Terhubung. Apps Script belum versi terbaru; perbarui deployment Google untuk mempercepat pemuatan.', 'warning', 12000);
        } else {
          showToast('🟢 Terhubung ke Google Drive (versi cepat aktif)', 'success');
        }
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

    // Pull All — sekarang buka modal daftar proyek
    overlay.querySelector('#cloudPullAllBtn').addEventListener('click', async () => {
      openProjectModal();
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
    // NEW: Fungsi manajemen proyek Drive
    listRemoteProjects,
    deleteRemoteProject,
    pullProject,
    deleteLocalProject,
    openProjectModal,
    closeProjectModal,
    // Internal handlers untuk tombol di modal
    _handlePull,
    _handleDelete,
    testConnection,
    openModal,
    closeModal,
    showToast,
    getQueue,
    updateBadges
  };

})();
