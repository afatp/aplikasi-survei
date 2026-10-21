/**
 * ========================================================
 * PWA INSTALL HELPER & SERVICE WORKER LOADER
 * Mendukung Android Chrome, iOS Safari, dan In-App Browser
 * ========================================================
 */

(function () {
  'use strict';

  let deferredPrompt = null;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isInApp = /FBAN|FBAV|Instagram|Line|WhatsApp|BytedanceWebview/i.test(navigator.userAgent);

  // 1. Reliable Service Worker Registration
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.update();
      }).catch((err) => {
        console.warn('SW register failed:', err);
      });
    }
  }

  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker);
  }

  // 2. Capture BeforeInstallPrompt (Chrome, Edge, Samsung Internet)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallUI();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallUI();
    if (typeof window.CloudSync?.showToast === 'function') {
      window.CloudSync.showToast('🎉 Aplikasi Survei berhasil terpasang di HP!', 'success', 5000);
    }
  });

  function showInstallUI() {
    if (isStandalone) return;
    document.querySelectorAll('.pwa-install-banner').forEach(el => el.style.display = 'flex');
    document.querySelectorAll('.pwa-install-badge-btn').forEach(el => el.style.display = 'inline-flex');
  }

  function hideInstallUI() {
    document.querySelectorAll('.pwa-install-banner').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.pwa-install-badge-btn').forEach(el => el.style.display = 'none');
  }

  // 3. Trigger Installation
  async function promptInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        deferredPrompt = null;
        hideInstallUI();
      }
      return;
    }
    // If not supported by browser (e.g. iOS Safari, or In-App browser, or already prompt used), open Guide Modal
    openGuideModal();
  }

  // 4. Guide Modal for iOS / In-App / Manual install
  function openGuideModal() {
    let overlay = document.getElementById('pwaGuideModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pwaGuideModalOverlay';
      overlay.className = 'pwa-modal-overlay';
      overlay.innerHTML = `
        <div class="pwa-modal-card">
          <div class="pwa-modal-header">
            <h3>📲 Cara Pasang Aplikasi di HP</h3>
            <button type="button" class="pwa-modal-close" id="pwaModalCloseBtn">&times;</button>
          </div>
          <div class="pwa-modal-body">
            ${isInApp ? `
              <div class="pwa-alert-inapp">
                ⚠️ <b>Anda membuka link di dalam browser chat (WhatsApp/dll).</b><br>
                Fitur pasang aplikasi dinonaktifkan oleh WhatsApp. Ketuk ikon titik tiga <b>(⋮)</b> di pojok kanan atas browser ➔ pilih <b>"Buka di Chrome"</b> (atau Safari).
              </div>
            ` : ''}

            ${isIOS ? `
              <div class="pwa-steps-box">
                <div class="pwa-steps-title">🍎 Untuk iPhone / iPad (Safari)</div>
                <ol>
                  <li>Buka website ini menggunakan browser <b>Safari</b>.</li>
                  <li>Ketuk tombol <b>Bagikan (Share)</b> <span style="font-size:16px;">⎋</span> (ikon kotak panah ke atas di bilah menu bawah).</li>
                  <li>Gulir ke bawah, lalu pilih <b>"Tambah ke Layar Utama"</b> (<i>Add to Home Screen</i>).</li>
                  <li>Ketuk <b>"Tambah"</b> di pojok kanan atas. Ikon aplikasi akan langsung muncul di layar utama iPhone Anda.</li>
                </ol>
              </div>
            ` : `
              <div class="pwa-steps-box">
                <div class="pwa-steps-title">🤖 Untuk Android (Google Chrome / Edge)</div>
                <ol>
                  <li>Ketuk ikon menu titik tiga <b>(⋮)</b> di pojok kanan atas browser Chrome.</li>
                  <li>Cari dan pilih menu <b>"Instal aplikasi"</b> atau <b>"Tambahkan ke Layar Utama"</b> (<i>Add to Home Screen</i>).</li>
                  <li>Ketuk <b>"Instal"</b> pada jendela konfirmasi.</li>
                  <li>Aplikasi Survei akan terpasang di HP seperti aplikasi resmi dan bisa dibuka tanpa browser bar!</li>
                </ol>
              </div>
            `}

            <div style="text-align:center;margin-top:10px;">
              <button type="button" class="cloud-btn cloud-btn-primary" id="pwaModalDoneBtn" style="width:100%;padding:10px;">
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = () => overlay.classList.remove('is-active');
      overlay.querySelector('#pwaModalCloseBtn').addEventListener('click', close);
      overlay.querySelector('#pwaModalDoneBtn').addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    }

    overlay.classList.add('is-active');
  }

  // Auto-show banner on page load if not standalone
  document.addEventListener('DOMContentLoaded', () => {
    if (!isStandalone) {
      showInstallUI();
    }
  });

  window.PwaInstall = {
    promptInstall,
    openGuideModal,
    isStandalone
  };

})();
