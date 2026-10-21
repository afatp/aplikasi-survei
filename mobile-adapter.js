/* Progressive mobile interface for original FSOP forms. No form labels, names or print structure changed. */
(function () {
  'use strict';
  const metaVp = document.querySelector('meta[name="viewport"]');
  if (metaVp) {
    metaVp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
  }
  // Prevent browser viewport zoom on system UI
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1 && !e.target.closest('.wrapper')) {
      e.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 && !e.target.closest('.wrapper')) {
      e.preventDefault();
    }
  }, { passive: false });
  const isAir = !!document.querySelector('.water-sheet') || /air\.html(?:$|[?#])/i.test(location.pathname);
  const labels = isAir ? ['Data Umum & Parameter', 'Insitu & Sketsa'] : ['Data Umum', 'TSP / Debu', 'PM10', 'PM2,5', 'Sketsa & Pengesahan'];
  const sheets = [...document.querySelectorAll('.sheet[data-page]')];
  if (!sheets.length) return;
  sheets.forEach(sheet => {
    let frame = sheet.parentElement;
    if (!frame || !frame.classList.contains('sheet-frame')) {
      frame = document.createElement('div');
      frame.className = 'sheet-frame';
      sheet.parentNode.insertBefore(frame, sheet);
      frame.appendChild(sheet);
    }
  });
  const originals = [...document.querySelectorAll('.sheet input, .sheet textarea, .sheet select')];
  const refs = new Map(originals.map((el, i) => [el, i]));
  const mirrors = new Map();
  let currentPage = 1;
  let drawKind = 'sketch';
  let drawBrush = 'pen';
  let drawSource = null;
  let mobileDrawing = false;
  let drawLast = null;
  const ownHistory = { sketch: [], signature: [] };
  const root = document.createElement('div');
  root.id = 'mobileApp'; root.className = 'mobile-app';
  root.innerHTML = `
    <div class="mobile-hero">
      <span class="mobile-eyebrow">SISTEM SURVEI LAPANGAN · ${isAir ? 'FSOP-10.3.1' : 'FSOP-10.3.3'}</span>
      <h1>Survei ${isAir ? 'Sampel Air' : 'Udara Ambien'}</h1>
      <p>Isi setiap kolom dengan mudah melalui HP. Formulir asli dan format cetak A4 tetap tersedia.</p>
      <div class="mobile-progress"><div class="mobile-progress-track"><span id="mobileProgressBar"></span></div><strong id="mobileProgressText">0% terisi</strong></div>
    </div>
    <div class="mobile-mode-switch"><button id="mobileEasyBtn" type="button" aria-pressed="true">✎ Isi lewat HP</button><button id="mobileA4Btn" type="button" aria-pressed="false">▤ Lihat Form A4</button></div>
    <nav id="mobilePageNav" class="mobile-page-nav" aria-label="Navigasi halaman form"></nav>
    <div class="mobile-paper-zoom-bar" id="mobilePaperZoomBar" role="toolbar" aria-label="Pengatur Ukuran Zoom Form A4">
      <div class="zoom-bar-row1">
        <button type="button" class="zoom-btn-back" id="mobileZoomBackToEasy">✎ Isi lewat HP</button>
        <div class="zoom-page-tabs" id="mobileZoomPageTabs"></div>
      </div>
      <div class="zoom-bar-row2">
        <button type="button" class="zoom-btn-fit" id="mobileZoomFitPage" title="Tampilkan seluruh 1 halaman A4 penuh di layar HP">🔍 1 Hal Full</button>
        <button type="button" class="zoom-btn-sign" id="mobileZoomOut" aria-label="Perkecil Zoom Form A4" title="Perkecil">−</button>
        <button type="button" class="zoom-badge-btn" id="mobileZoomBadge" title="Ketuk untuk beralih mode zoom">100%</button>
        <button type="button" class="zoom-btn-sign" id="mobileZoomIn" aria-label="Perbesar Zoom Form A4" title="Perbesar">+</button>
        <button type="button" class="zoom-btn-fit-w" id="mobileZoomFitWidth" title="Sesuaikan selebar layar HP">↔ Lebar</button>
        <button type="button" class="zoom-btn-reset" id="mobileZoomReset" title="Ukuran Asli 100%">100%</button>
      </div>
    </div>
    <div class="mobile-paper-tip">🔍 <b>Mode Form A4 Aktif</b>: Gunakan tombol <b>[−]</b> dan <b>[+]</b> atau <b>[🔍 1 Hal Full]</b> di atas untuk menyesuaikan ukuran kertas A4.</div>
    <div class="mobile-form-content">
      <div class="mobile-switch-banner">
        <button type="button" id="mobileGoToA4Btn">📄 Tampilkan Form Kertas Asli A4 (Bisa Zoom − / +) →</button>
      </div>
      <div class="mobile-action-bar"><button type="button" id="mobileSave" class="is-primary">Simpan data</button><button type="button" id="mobilePrint">Cetak PDF</button>${!isAir ? '<button type="button" id="mobileSync">Sinkronkan</button>' : ''}</div>
      <div id="mobileFields"></div>
      <p class="mobile-footer-help">Isian langsung terhubung ke formulir resmi dan tersimpan otomatis pada perangkat ini. Gunakan Ekspor JSON untuk cadangan.</p>
    </div>
    <div class="mobile-bottom-actions"><button id="mobileHome">⌂ Beranda</button><button id="mobileNext" class="primary">Lanjut →</button></div>
  `;
  const main = document.querySelector('.workspace-main');
  main.insertBefore(root, main.firstChild);
  const editor = document.getElementById('mobileFields');
  const nav = document.getElementById('mobilePageNav');
  const modal = document.createElement('section');
  modal.className = 'mobile-draw-overlay'; modal.id = 'mobileDrawOverlay';
  modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label','Editor sketsa dan tanda tangan');
  modal.innerHTML = `
    <div class="mobile-draw-head"><strong id="mobileDrawTitle">Editor Sketsa</strong><button type="button" id="mobileCloseDraw">Selesai ✓</button></div>
    <div class="mobile-draw-tools" id="mobileDrawTools"></div>
    <div class="mobile-draw-stage"><canvas id="mobileDrawingCanvas" aria-label="Area menggambar dengan sentuhan"></canvas></div>
    <p class="mobile-draw-note" id="mobileDrawNote">Gambar dengan jari. Hasil langsung disimpan ke formulir dan terlihat saat dicetak.</p>
    <div class="mobile-draw-foot"><button type="button" id="mobileDrawUndo">↶ Undo</button><button type="button" id="mobileDrawClear">Hapus Coretan</button><button type="button" class="primary" id="mobileDrawDone">Selesai</button></div>
  `;
  document.body.appendChild(modal);
  const c = document.getElementById('mobileDrawingCanvas');
  const mCtx = c.getContext('2d');

  const specificLabels = {
    nama_pelanggan:'Nama Pelanggan/Perusahaan', alamat_lengkap:'Alamat Lengkap', personel_penghubung:'Nama Personel Penghubung', kontak:'No. Telepon/Faks/E-mail', ketua_pengambil:'Nama Ketua Pengambil Contoh',
    anggota_1:'Nama Anggota Pengambil Contoh 1',anggota_2:'Nama Anggota Pengambil Contoh 2',nomor_sampel:'Nomor Sampel',tanggal_sampling:'Tanggal Pengambilan Sampel',jam_mulai:'Waktu Mulai',jam_selesai:'Waktu Selesai',lokasi_sampling:'Nama Lokasi Pengambilan Sampel',
    parameter_lainnya:'Parameter Uji Lainnya', jenis_sampel_lainnya:'Jenis Sampel Lainnya', jenis_badan_air_lainnya:'Jenis Badan Air Lainnya',cara_pengambilan_lainnya:'Cara Pengambilan Lainnya',
    kedalaman_kanan:'Kedalaman Kanan (m)',kedalaman_tengah:'Kedalaman Tengah (m)',kedalaman_kiri:'Kedalaman Kiri (m)',kecepatan_arus_v1:'Kecepatan Arus V₁ (m/s)',kecepatan_arus_v2:'Kecepatan Arus V₂ (m/s)',kecepatan_arus_v3:'Kecepatan Arus V₃ (m/s)',lebar_sungai:'Lebar Sungai (m)',debit:'Debit (m³/s)',
    kode_sampel:'Kode Sampel',koordinat_sn_deg:'Koordinat S/N - Derajat',koordinat_sn_min:'Koordinat S/N - Menit',koordinat_sn_sec:'Koordinat S/N - Detik',koordinat_sn_dir:'Koordinat S/N - Arah',koordinat_e_deg:'Koordinat E - Derajat',koordinat_e_min:'Koordinat E - Menit',koordinat_e_sec:'Koordinat E - Detik',ttd_nama:'Nama Petugas Pengambilan Contoh',ttd_tanggal:'Tanggal Tanda Tangan',
    insitu_kecerahan:'Kecerahan (meter)',insitu_kebauan:'Kebauan',insitu_rasa:'Rasa',insitu_sampah:'Sampah, Benda Terapung, Buih, Busa',insitu_lapisan_minyak:'Lapisan Minyak',
    metode:'Acuan Metode Pengambilan/Pengujian',pengawetan:'Pengawetan Sampel',jenis_sampel:'Jenis Sampel',jenis_badan_air:'Jenis Badan Air',cara_pengambilan:'Cara Pengambilan Sampel',parameter_uji:'Parameter Uji',parameter_fisika:'Parameter Fisika',parameter_kimia:'Parameter Kimia',parameter_biologi_dan_mikrobiologi:'Parameter Biologi dan Mikrobiologi'
  };
  const hourHeaders = ['Waktu','Tekanan Udara (mmHg)','Suhu Udara (°C)','Laju Alir (L/menit)','Kelembaban (%RH)','Kecepatan Angin (m/s)','Arah Angin Dari','Keadaan Cuaca'];
  function makeNode(tag, cls, txt) {const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=txt;return node;}
  function niceName(str){return (str||'Isian').replace(/_/g,' ').replace(/\b\w/g,t=>t.toUpperCase()).replace(/\bPh\b/,'pH').replace(/\bDo\b/,'DO').replace(/\bDhl\b/,'DHL').replace(/\bTsp\b/,'TSP').replace(/\bCo\b/,'CO').replace(/\bBod\b/,'BOD').replace(/\bCod\b/,'COD');}
  function fieldLabel(el) {
    if (el.type === 'checkbox') {const p=el.closest('label');return p ? p.textContent.replace(/\s+/g,' ').trim() : (el.value||'Pilihan');}
    const name=el.name||'';
    if(specificLabels[name])return specificLabels[name];
    if(/^insitu_/.test(name)){
      const p=name.replace(/^insitu_/,'').replace(/_(simplo|duplo)$/,'');let t=niceName(p); t=t.replace('Suhu Air','Suhu Air (°C)').replace('Suhu Udara','Suhu Udara (°C)').replace('Salinitas','Salinitas (ppt)').replace('Kekeruhan','Kekeruhan (NTU)');return t+' — '+(/_duplo$/.test(name)?'Duplo':'Simplo');
    }
    if(/^(so2|no2|o3|nh3|h2s)_/.test(name)){const pieces=name.split('_');return pieces[0].toUpperCase()+' · '+({t1:'Suhu T₁',t2:'Suhu T₂',p1:'Tekanan P₁',p2:'Tekanan P₂',f1:'Laju F₁',f2:'Laju F₂',f3:'Laju F₃',f4:'Laju F₄'}[pieces[1]]||pieces[1]);}
    const nearby=el.closest('td')?.querySelector('.boxlabel'); if(nearby&&nearby.textContent.trim() && !/^(.*pengambilan)/i.test(name))return nearby.textContent.trim().replace(/:$/,'');
    return niceName(name);
  }
  function groupFor(el, pg) {
    const n=el.name||'';
    if(!isAir){
      if(pg===1){if(['metode','parameter_uji','parameter_lainnya'].includes(n))return 'Metode dan Parameter Uji';if(/^(so2|no2|o3|nh3|h2s)_/.test(n)||/^(tsp_w|kelembaban_|kecepatan_angin_|arah_angin_|keadaan_cuaca_)/.test(n))return 'Hasil Pengukuran Kimia & Fisika';return 'Identitas, Petugas & Waktu';}
      return 'Koordinat dan Pengesahan';
    }
    if(pg===1){if(n.startsWith('parameter_')||n==='kode_sampel')return 'Parameter Uji';if(['metode','jenis_sampel','jenis_sampel_lainnya','jenis_badan_air','jenis_badan_air_lainnya','cara_pengambilan','cara_pengambilan_lainnya'].includes(n))return 'Metode dan Jenis Sampel';if(/^kedalaman_|^kecepatan_arus_|^lebar_sungai$|^debit$/.test(n))return 'Kondisi Badan Air dan Sungai';return 'Identitas, Petugas & Waktu';}
    if(n.startsWith('koordinat_')||n.startsWith('ttd_'))return 'Koordinat dan Pengesahan';return 'Data Hasil Pengukuran Insitu';
  }
  function makeControl(el, idx, label) {
    if (el.type === 'checkbox') {
      const box=makeNode('label','mobile-check');const input=document.createElement('input');input.type='checkbox';input.dataset.sourceIdx=idx;
      const span=makeNode('span',null,label);box.append(input,span);mirrors.set(idx,input);return box;
    }
    const box=makeNode('div','mobile-field');const heading=makeNode('label',null,label);const id='mobile-input-'+idx;heading.htmlFor=id;
    let input;if(el.tagName==='TEXTAREA'){input=document.createElement('textarea');input.rows=2;}
    else if(el.tagName==='SELECT'){input=document.createElement('select');for(const opt of el.options){const clone=document.createElement('option');clone.value=opt.value;clone.textContent=opt.textContent;input.appendChild(clone);}}
    else {input=document.createElement('input'); input.type=['date','time','number','email','tel'].includes(el.type)?el.type:'text';if(input.type==='text'&&/(tekanan|suhu|laju|kelembaban|kecepatan|kedalaman|debit|lebar|salinitas|ph_|_t1$|_t2$|_p1$|_p2$|_f\d$|_duplo$|_simplo$|koordinat_)/i.test(el.name||''))input.inputMode='decimal';}
    input.id=id;input.dataset.sourceIdx=idx;input.placeholder=(el.placeholder&&el.placeholder.startsWith('cth'))?el.placeholder:'Isi '+label.toLowerCase();
    box.append(heading,input);mirrors.set(idx,input);return box;
  }
  function getFields(page){return originals.filter(el=>el.closest('.sheet')?.dataset.page===String(page)&&!el.disabled&&el.type!=='hidden'&&el.type!=='file'&&el.name);}
  function headingCard(title, text){const card=makeNode('section','mobile-card');card.appendChild(makeNode('h2','',title));if(text)card.appendChild(makeNode('p','',text));return card;}
  function mobilePreviewSketsa(card){
    const panel=makeNode('div','mobile-sketch-call');const btn=makeNode('button','', '✎ Buka Editor Sketsa (Sentuh)');btn.type='button';btn.addEventListener('click',()=>openDraw('sketch'));
    const sbtn=makeNode('button','alt','✍ Buka Tanda Tangan Digital');sbtn.type='button';sbtn.addEventListener('click',()=>openDraw('signature'));
    const paperBtn=makeNode('button','alt','▤ Atur Objek pada Denah A4');paperBtn.type='button';paperBtn.addEventListener('click',()=>{setPreview(true);const target=sheets[sheets.length-1];target.scrollIntoView({behavior:'instant',block:'start'});});
    panel.append(btn,sbtn,paperBtn,makeNode('p',null,'Gambar sketsa dan tanda tangan dengan jari. Hasil tersimpan pada kanvas asli dan ikut tercetak dalam PDF. Untuk memutar atau menggeser objek secara detail, buka denah A4.'));card.append(panel);
  }
  function renderNormal(page){
    editor.replaceChildren();const groups=new Map();for(const el of getFields(page)){
      const g=groupFor(el,page);if(!groups.has(g))groups.set(g,[]);groups.get(g).push(el);
    }
    for(const [title,items] of groups){
      const card=headingCard(title);editor.append(card);
      const textFields=makeNode('div','mobile-fields');const checkGroups=new Map();
      for(const el of items){const idx=refs.get(el);if(el.type==='checkbox'){const name=el.name||'opsi';if(!checkGroups.has(name))checkGroups.set(name,[]);checkGroups.get(name).push(el);}else{textFields.appendChild(makeControl(el,idx,fieldLabel(el)));}}
      if(textFields.childElementCount)card.appendChild(textFields);
      for(const [name,els] of checkGroups){const sub=makeNode('div','',undefined);sub.style.marginTop='16px';const h=makeNode('h3','',specificLabels[name]||niceName(name));h.style.cssText='font-size:12px;color:#507092;margin:0 0 9px;';sub.append(h);const grid=makeNode('div','mobile-check-grid');for(const el of els)grid.append(makeControl(el,refs.get(el),fieldLabel(el)));sub.append(grid);card.append(sub);}
      if(title==='Koordinat dan Pengesahan')mobilePreviewSketsa(card);
    }
    // If a form's final page lacks editable text entirely, display the sketch tool directly.
    if(!groups.has('Koordinat dan Pengesahan') && page===labels.length){const card=headingCard('Sketsa dan Tanda Tangan');editor.append(card);mobilePreviewSketsa(card);}
    updateMirrors();
  }
  function renderHours(page){
    editor.replaceChildren();const prefix=page===2?'tsp24':page===3?'pm10':'pm25';
    const card=headingCard('Pencatatan 24 Jam', 'Setiap jam memiliki 8 kolom sesuai tabel asli. Ketuk nomor jam untuk membuka atau menutup pengisiannya.');editor.append(card);
    for(let i=1;i<=24;i++){
      const details=makeNode('details','mobile-hourly-details');if(i===1)details.open=true;
      const summ=makeNode('summary');summ.append(makeNode('span',null,'Jam ke-'+String(i).padStart(2,'0')),makeNode('span','hour-value',''),makeNode('span','arrow','›'));details.append(summ);
      const fields=makeNode('div','mobile-fields');for(let col=0;col<8;col++){
        const name=prefix+'_'+i+'_'+['waktu','tekanan','suhu','laju','kelembaban','kecepatan_angin','arah_angin','cuaca'][col];
        const el=originals.find(el=>el.name===name);if(el)fields.append(makeControl(el,refs.get(el),hourHeaders[col]));
      }
      details.append(fields);card.append(details);
      const source=originals.find(el=>el.name===prefix+'_'+i+'_waktu');if(source){const summaryValue=summ.querySelector('.hour-value');summaryValue.dataset.hourName=source.name;}
    }
    updateMirrors();
  }
  function updateMirrors(){
    for(const [idx,mirror] of mirrors){const el=originals[idx];if(!el)continue;if(document.activeElement===mirror)continue;
      if(el.type==='checkbox')mirror.checked=el.checked;else if(mirror.value!==el.value)mirror.value=el.value;
    }
    document.querySelectorAll('.hour-value[data-hour-name]').forEach(span=>{const el=originals.find(e=>e.name===span.dataset.hourName);if(el)span.textContent=el.value||'Belum diisi';});
    refreshProgress();
  }
  function refreshProgress(){
    const sources=originals.filter(e=>!e.disabled&&e.name&&e.type!=='hidden'&&e.type!=='file');const n=sources.length;let completed=0;
    for(const el of sources){if(el.type==='checkbox'?el.checked:!!String(el.value).trim())completed++;}
    const pct=n?Math.round(100*completed/n):0;
    const bar=document.getElementById('mobileProgressBar');if(bar)bar.style.width=pct+'%';const val=document.getElementById('mobileProgressText');if(val)val.textContent=pct+'% terisi';
  }
  function renderPage(page){currentPage=Math.max(1,Math.min(labels.length,page));mirrors.clear();
    [...nav.children].forEach((btn,i)=>{btn.setAttribute('aria-current', i+1===currentPage?'page':'false');if(i+1===currentPage)btn.scrollIntoView({block:'nearest',inline:'nearest'});});
    const zoomTabs = document.getElementById('mobileZoomPageTabs');
    if(zoomTabs){
      [...zoomTabs.children].forEach((btn,i)=>btn.classList.toggle('active', i+1===currentPage));
    }
    if(!isAir && currentPage>=2 && currentPage<=4)renderHours(currentPage);else renderNormal(currentPage);
    document.getElementById('mobileNext').textContent=currentPage===labels.length?'Cetak / PDF': 'Lanjut →';
  }
  for(let i=0;i<labels.length;i++){const b=makeNode('button','',(i+1)+'. '+labels[i]);b.type='button';b.addEventListener('click',()=>{renderPage(i+1);if(document.body.classList.contains('mobile-preview-on'))sheets[i].scrollIntoView({behavior:'instant',block:'start'});else window.scrollTo({top:110,behavior:'instant'});});nav.append(b);}
  /* Paper Form Zoom & Scale Engine for Mobile */
  let currentZoom = 1.0;
  let activeFitMode = 'page';
  let hasUserAdjustedZoom = false;
  const wrapper = document.querySelector('.wrapper');

  const zoomPageTabs = document.getElementById('mobileZoomPageTabs');
  if(zoomPageTabs){
    zoomPageTabs.replaceChildren();
    for(let i=0;i<labels.length;i++){
      const b=makeNode('button','zoom-page-btn'+(i===0?' active':''),'Hal '+(i+1));
      b.type='button';
      b.title=labels[i];
      b.addEventListener('click',()=>{
        renderPage(i+1);
        const sheet=sheets[i];
        if(sheet){
          const sheetTop=sheet.offsetTop;
          window.scrollTo({top:Math.max(0,sheetTop-200),behavior:'smooth'});
        }
      });
      zoomPageTabs.append(b);
    }
  }
  document.getElementById('mobileZoomBackToEasy')?.addEventListener('click',()=>setPreview(false));

  function getFitPageZoom() {
    const availW = Math.max(200, window.innerWidth - 12);
    // Fixed headers: toolbar (66) + strip (50) + zoom bar (76) + bottom actions (70)
    const topReserved = 265;
    const availH = Math.max(200, window.innerHeight - topReserved);
    const fitW = availW / 794;
    const fitH = availH / 1123;
    const target = Math.min(fitW, fitH);
    return Math.min(1.0, Math.max(0.15, Math.round(target * 100) / 100));
  }

  function getFitWidthZoom() {
    const availW = Math.max(200, window.innerWidth - 12);
    return Math.min(1.5, Math.max(0.15, Math.round((availW / 794) * 100) / 100));
  }

  function applyZoom(zoom, mode = 'custom') {
    currentZoom = Math.min(2.0, Math.max(0.15, Math.round(zoom * 100) / 100));
    activeFitMode = mode;
    if (wrapper) {
      wrapper.style.setProperty('--sheet-zoom', currentZoom);
    }
    const badge = document.getElementById('mobileZoomBadge');
    if (badge) {
      badge.textContent = Math.round(currentZoom * 100) + '%';
    }
    const fitPageBtn = document.getElementById('mobileZoomFitPage');
    if (fitPageBtn) {
      fitPageBtn.classList.toggle('active', mode === 'page');
    }
    const fitWidthBtn = document.getElementById('mobileZoomFitWidth');
    if (fitWidthBtn) {
      fitWidthBtn.classList.toggle('active', mode === 'width');
    }
  }

  function setFitPageZoom() {
    applyZoom(getFitPageZoom(), 'page');
  }

  function setFitWidthZoom() {
    applyZoom(getFitWidthZoom(), 'width');
  }

  function zoomStep(delta) {
    hasUserAdjustedZoom = true;
    applyZoom(currentZoom + delta, 'custom');
  }

  document.getElementById('mobileZoomFitPage')?.addEventListener('click', () => {
    hasUserAdjustedZoom = false;
    setFitPageZoom();
    showToast('1 Halaman A4 tampil penuh (' + Math.round(currentZoom * 100) + '%)');
  });

  document.getElementById('mobileZoomFitWidth')?.addEventListener('click', () => {
    hasUserAdjustedZoom = true;
    setFitWidthZoom();
    showToast('Ukuran disesuaikan selebar layar (' + Math.round(currentZoom * 100) + '%)');
  });

  document.getElementById('mobileZoomOut')?.addEventListener('click', () => {
    zoomStep(-0.06);
  });

  document.getElementById('mobileZoomIn')?.addEventListener('click', () => {
    zoomStep(0.06);
  });

  document.getElementById('mobileZoomReset')?.addEventListener('click', () => {
    hasUserAdjustedZoom = true;
    applyZoom(1.0, '100');
    showToast('Ukuran form direset ke 100% (asli)');
  });

  document.getElementById('mobileZoomBadge')?.addEventListener('click', () => {
    if (activeFitMode === 'page') {
      hasUserAdjustedZoom = true;
      setFitWidthZoom();
    } else if (activeFitMode === 'width') {
      hasUserAdjustedZoom = true;
      applyZoom(1.0, '100');
    } else {
      hasUserAdjustedZoom = false;
      setFitPageZoom();
    }
  });

  document.getElementById('mobileGoToA4Btn')?.addEventListener('click', () => {
    setPreview(true);
    showToast('Mode Form Kertas A4 aktif');
  });

  if (wrapper) {
    let pinchStartDist = 0;
    let pinchStartZoom = 1.0;

    wrapper.addEventListener('touchstart', (e) => {
      if (document.body.classList.contains('mobile-preview-on') && e.touches.length === 2) {
        e.preventDefault();
        pinchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartZoom = currentZoom;
        document.body.classList.add('is-pinching');
      }
    }, { passive: false });

    wrapper.addEventListener('touchmove', (e) => {
      if (document.body.classList.contains('mobile-preview-on') && e.touches.length === 2 && pinchStartDist > 0) {
        e.preventDefault();
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        hasUserAdjustedZoom = true;
        applyZoom(pinchStartZoom * (currentDist / pinchStartDist), 'custom');
      }
    }, { passive: false });

    function endPinch(e) {
      if (e.touches.length < 2) {
        pinchStartDist = 0;
        document.body.classList.remove('is-pinching');
      }
    }
    wrapper.addEventListener('touchend', endPinch, { passive: true });
    wrapper.addEventListener('touchcancel', endPinch, { passive: true });
  }

  function setPreview(on){
    document.body.classList.toggle('mobile-preview-on',on);
    document.getElementById('mobileEasyBtn').setAttribute('aria-pressed',String(!on));
    document.getElementById('mobileA4Btn').setAttribute('aria-pressed',String(on));
    try {
      localStorage.setItem('survei_mobile_mode', on ? 'a4' : 'easy');
    } catch (e) {}
    document.getElementById('mobileNext').textContent=currentPage===labels.length?'Cetak / PDF':'Lanjut →';
    if(on){
      updateMirrors();
      if(window.innerWidth<=1100 && !hasUserAdjustedZoom){
        setFitPageZoom();
      }
      window.scrollTo({top:0,behavior:'instant'});
    }else{
      updateMirrors();
      window.scrollTo({top:110,behavior:'instant'});
    }
  }
  document.getElementById('mobileEasyBtn').addEventListener('click',()=>setPreview(false));
  document.getElementById('mobileA4Btn').addEventListener('click',()=>setPreview(true));
  document.getElementById('mobileSave').addEventListener('click',()=>{window.saveData?.();showToast('Data disimpan pada perangkat ini')});
  document.getElementById('mobilePrint').addEventListener('click',()=>{window.saveData?.();window.print()});
  document.getElementById('mobileSync')?.addEventListener('click',()=>window.openSyncModal?.());
  document.getElementById('mobileHome').addEventListener('click',()=>{window.saveData?.();location.href='index.html';});
  document.getElementById('mobileNext').addEventListener('click',()=>{if(currentPage===labels.length){window.saveData?.();window.print();}else{renderPage(currentPage+1);window.scrollTo({top:110,behavior:'instant'});}});
  root.addEventListener('input',(e)=>updateOrig(e));root.addEventListener('change',(e)=>updateOrig(e));
  let editTimer;
  function updateOrig(e){const mirror=e.target;if(!mirror.dataset.sourceIdx)return;const source=originals[Number(mirror.dataset.sourceIdx)];if(!source)return;
    if(source.type==='checkbox')source.checked=mirror.checked;else source.value=mirror.value;
    source.dispatchEvent(new Event(source.type==='checkbox'?'change':'input',{bubbles:true}));
    if(e.type==='change' && source.type!=='checkbox')source.dispatchEvent(new Event('change',{bubbles:true}));
    refreshProgress();clearTimeout(editTimer);editTimer=setTimeout(updateMirrors,90);
  }
  document.querySelector('.project-bar')?.addEventListener('click',()=>{setTimeout(updateMirrors,120);setTimeout(refreshProgress,220)});
  // Reconcile values after import, a new project, or origin events caused by automatic time/condition population.
  document.addEventListener('change',(e)=>{if(e.target.closest('.sheet'))setTimeout(updateMirrors,100);});
  document.addEventListener('input',(e)=>{if(e.target.closest('.sheet'))setTimeout(updateMirrors,100);});
  const tabWatcher=new MutationObserver(()=>setTimeout(updateMirrors,40));const projbar=document.querySelector('.project-bar');if(projbar)tabWatcher.observe(projbar,{childList:true,subtree:true});
  function showToast(text){let t=document.getElementById('mobileToast');if(!t){t=makeNode('div');t.id='mobileToast';t.style.cssText='position:fixed;z-index:10005;left:50%;bottom:85px;transform:translateX(-50%);background:#1f3655;color:#fff;padding:10px 15px;border-radius:10px;font-size:12px;box-shadow:0 5px 22px #1a365b4a;pointer-events:none;';document.body.append(t)}t.textContent=text;t.hidden=false;setTimeout(()=>{t.hidden=true},1700)}
  function canvasSource(){return document.getElementById(drawKind)}
  function openDraw(kind){
    drawKind=kind;drawBrush='pen';drawSource=canvasSource();if(!drawSource)return;modal.classList.add('is-open');document.body.style.overflow='hidden';
    document.getElementById('mobileDrawTitle').textContent=kind==='sketch'?'Sketsa/Denah Lokasi':'Tanda Tangan Petugas';
    const toolbar=document.getElementById('mobileDrawTools');toolbar.replaceChildren();
    if(kind==='sketch'){
      for(const [title,type] of [['✎ Pensil','pen'],['≈ Kuas Sungai','river']]){const b=makeNode('button',type===drawBrush?'active':'',title);b.type='button';b.addEventListener('click',()=>{drawBrush=type;[...toolbar.children].forEach(x=>x.classList.toggle('active',x===b))});toolbar.append(b);}
      for(const [title,type] of [['+ Titik','sampling_point'],['+ Teks','text'],['+ Gedung','building_rect'],['+ Jalan','road'],['+ Sungai','river'],['+ Hutan','forest']]){
        const b=makeNode('button','',title);b.type='button';b.addEventListener('click',()=>{if(typeof window.addSketchElement==='function'){window.addSketchElement(type);redrawEditor()} });toolbar.append(b);
      }
      document.getElementById('mobileDrawNote').textContent='Gambar dengan jari atau tambahkan objek sketsa. Untuk menggeser, memutar, dan mengganti label objek, pilih Atur Objek pada Denah A4.';
    }else{document.getElementById('mobileDrawNote').textContent='Tanda tangani dengan jari, lalu ketuk Selesai. Hasil masuk ke kolom tanda tangan formulir resmi.';}
    requestAnimationFrame(()=>{setupMiniCanvas();redrawEditor()});
  }
  function setupMiniCanvas(){
    const source=drawSource;if(!source)return;const width=source.width||700,height=source.height||400;
    const maxW=Math.min(window.innerWidth-28,700),maxH=Math.max(150,window.innerHeight-255);
    let cssW=Math.min(maxW,maxH*width/height),cssH=cssW*height/width;
    if(drawKind==='signature'){cssW=Math.min(maxW,420);cssH=Math.max(155,Math.min(230,cssW*.65));}
    c.style.width=cssW+'px';c.style.height=cssH+'px';const dpr=Math.min(2,window.devicePixelRatio||1);c.width=Math.floor(cssW*dpr);c.height=Math.floor(cssH*dpr);
    mCtx.setTransform(dpr,0,0,dpr,0,0);
  }
  function redrawEditor(){
    if(!drawSource)return;const rect=c.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    mCtx.clearRect(0,0,rect.width,rect.height);mCtx.fillStyle='#fff';mCtx.fillRect(0,0,rect.width,rect.height);mCtx.drawImage(drawSource,0,0,rect.width,rect.height);
    if(drawKind==='sketch'&&typeof window.getSketchElementsData==='function'){
      const data=window.getSketchElementsData()||[];const zone=document.getElementById('sketchZone');const zx=zone?.clientWidth||700,zy=zone?.clientHeight||550;
      const sx=rect.width/zx,sy=rect.height/zy;
      for(const it of data){const x=(it.x||0)*sx,y=(it.y||0)*sy,w=(it.w||120)*sx,h=(it.h||40)*sy;
        mCtx.save();mCtx.lineWidth=1.4;mCtx.font='bold 10px Arial';
        if(it.type==='sampling_point'){
          const px=(it.px??it.x+90)*sx,py=(it.py??it.y+60)*sy;mCtx.strokeStyle='#ca2828';mCtx.beginPath();mCtx.moveTo(x+30,y+9);mCtx.lineTo(px,py);mCtx.stroke();mCtx.fillStyle='#d12f38';mCtx.beginPath();mCtx.arc(px,py,5,0,Math.PI*2);mCtx.fill();
          mCtx.fillStyle='#ca292b';mCtx.fillRect(x,y,Math.max(55,w),19);mCtx.fillStyle='#fff';mCtx.fillText(String(it.text||'Titik Sampling').slice(0,28),x+4,y+13);
        } else {
          mCtx.fillStyle=it.type==='road'?'#334155':it.type==='river'?'#d5f1ff':'#eef5ff';mCtx.strokeStyle='#5d7290';
          if(it.type!=='text'){mCtx.fillRect(x,y,w,h);mCtx.strokeRect(x,y,w,h)}mCtx.fillStyle=it.type==='road'?'white':'#1f324b';mCtx.fillText(String(it.text||it.type).slice(0,27),x+4,y+Math.min(h-4,15));
        }mCtx.restore();
      }
    }
  }
  function drawPos(e){const rect=c.getBoundingClientRect();const src=drawSource;const dpr=window.devicePixelRatio||1;
    const x=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y=Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
    return{x:x*(src.width/dpr),y:y*(src.height/dpr)};
  }
  function paintLine(from,to){const src=drawSource;let scale=window.devicePixelRatio||1;const x=src.width/scale,y=src.height/scale;const ctx=src.getContext('2d');
    ctx.save();ctx.beginPath();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=drawKind==='sketch'&&drawBrush==='river'?14:drawKind==='signature'?2.4:1.8;
    ctx.strokeStyle=drawKind==='sketch'&&drawBrush==='river'?'#0284c7':'#111111';ctx.globalAlpha=drawKind==='sketch'&&drawBrush==='river'?.85:1;
    ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.restore();
    redrawEditor();
  }
  c.addEventListener('pointerdown',e=>{if(!drawSource)return;e.preventDefault();c.setPointerCapture?.(e.pointerId);mobileDrawing=true;drawLast=drawPos(e);const stack=ownHistory[drawKind];stack.push(drawSource.toDataURL('image/png'));if(stack.length>25)stack.shift();paintLine(drawLast,{x:drawLast.x+.15,y:drawLast.y+.15});});
  c.addEventListener('pointermove',e=>{if(!mobileDrawing||!drawSource)return;e.preventDefault();const p=drawPos(e);paintLine(drawLast,p);drawLast=p;});
  function finishDraw(){if(mobileDrawing){mobileDrawing=false;drawLast=null;window.saveData?.();}}
  c.addEventListener('pointerup',finishDraw);c.addEventListener('pointercancel',finishDraw);
  function replaceImage(uri){if(!drawSource)return;const ctx=drawSource.getContext('2d');const dpr=window.devicePixelRatio||1;const cw=drawSource.width/dpr,ch=drawSource.height/dpr;
    ctx.save();ctx.clearRect(0,0,cw,ch);ctx.restore();if(uri){const image=new Image();image.onload=()=>{ctx.drawImage(image,0,0,cw,ch);redrawEditor();window.saveData?.()};image.src=uri;}else{redrawEditor();window.saveData?.()}
  }
  document.getElementById('mobileDrawUndo').addEventListener('click',()=>{const prev=ownHistory[drawKind].pop();if(prev)replaceImage(prev);});
  document.getElementById('mobileDrawClear').addEventListener('click',()=>{if(confirm('Hapus coretan '+(drawKind==='sketch'?'sketsa':'tanda tangan')+'?')){ownHistory[drawKind].push(drawSource.toDataURL());replaceImage(null)}});
  function closeDraw(){finishDraw();modal.classList.remove('is-open');document.body.style.overflow='';window.saveData?.();updateMirrors();}
  document.getElementById('mobileCloseDraw').addEventListener('click',closeDraw);
  document.getElementById('mobileDrawDone').addEventListener('click',closeDraw);
  window.addEventListener('resize',()=>{if(document.body.classList.contains('mobile-preview-on')&&!hasUserAdjustedZoom){setFitPageZoom();}if(modal.classList.contains('is-open')){setupMiniCanvas();redrawEditor();}});
  if('serviceWorker'in navigator&&location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.update();
      }).catch(()=>{});
    });
  }
  renderPage(1);
  try {
    if (localStorage.getItem('survei_mobile_mode') === 'a4') {
      setPreview(true);
    }
  } catch (e) {}
})();
