// ========================================================
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
}
