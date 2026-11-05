const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../cloud-sync.js'), 'utf8');
const embeddedScript = source.match(/const SCRIPT_SOURCE_CODE = `([\s\S]*?)`;/)[1];
const script = fs.readFileSync(require('node:path').join(__dirname, '../google-apps-script/Code.gs'), 'utf8').trimEnd();
assert.equal(script, embeddedScript, 'Code.gs harus sama dengan kode pada menu Salin Kode');
function server(files = []) {
  let reads = 0;
  const cache = new Map();
  const iterator = values => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };
  const folder = {
    getFiles: () => iterator(files),
    getFilesByName: name => iterator(files.filter(f => f.getName() === name))
  };
  const context = vm.createContext({
    DriveApp: { getFoldersByName: () => { reads++; return iterator([folder]); } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value, seconds) => { assert.equal(seconds, 60); cache.set(key, value); }, remove: key => cache.delete(key) }) },
    Utilities: { newBlob: value => ({ getBytes: () => Buffer.from(value) }) },
    MimeType: { PLAIN_TEXT: 'text' }
  });
  vm.runInContext(script, context);
  return { context, get: parameter => context.doGet({ parameter }), reads: () => reads };
}
function file(type, id, indexed = true) {
  const data = { id, name: 'Proyek ' + id, sketch: 'x'.repeat(100000) };
  let blobs = 0, description = indexed ? JSON.stringify({ surveyIndex: 1, id, name: data.name }) : '';
  return {
    getName: () => `${type}_${id}.json`, getId: () => id, getLastUpdated: () => new Date(0),
    getDescription: () => description, setDescription: v => { description = v; },
    getBlob: () => { blobs++; return { getDataAsString: () => JSON.stringify(data) }; },
    setContent: () => {}, blobs: () => blobs
  };
}
test('ping avoids Drive reads; indexed listing excludes large form data', () => {
  const f = file('air', 'a'); const s = server([f]);
  assert.equal(s.get({ action: 'ping' }).status, 'success'); assert.equal(s.reads(), 0);
  const result = s.get({ action: 'list' });
  assert.equal(result.projects[0].data.name, 'Proyek a');
  assert.equal(result.projects[0].data.sketch, undefined); assert.equal(f.blobs(), 0);
});
test('single pull and type pull read only matching files; old GET stays compatible', () => {
  const a = file('air', 'a'), b = file('udara', 'b'); const s = server([a, b]);
  assert.equal(s.get({ action: 'get', type: 'air', projectId: 'a' }).projects.length, 1);
  assert.equal(a.blobs(), 1); assert.equal(b.blobs(), 0);
  assert.equal(s.get({ type: 'udara' }).projects.length, 1);
  assert.equal(s.get({}).projects.length, 2);
  assert.equal(s.get({ action: 'get', type: 'air', projectId: 'missing' }).projects.length, 0);
});
test('legacy files remain listed and save adds lightweight metadata', () => {
  const f = file('air', 'a', false); const s = server([f]);
  assert.equal(s.get({ action: 'list' }).projects[0].data.id, 'a'); assert.equal(f.blobs(), 1);
  const result = s.context.doPost({ postData: { contents: JSON.stringify({ type: 'air', project: { id: 'a', name: 'Renamed' } }) } });
  assert.equal(result.status, 'success');
  assert.equal(s.get({ action: 'list' }).projects[0].data.name, 'Renamed'); assert.equal(f.blobs(), 1);
});
function client(legacy = false) {
  const calls = [], stored = new Map();
  const context = vm.createContext({
    URLSearchParams, Map, Date, console,
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    window: { location: { search: '' } }, navigator: { onLine: true }, confirm: () => true,
    fetch: async url => {
      calls.push(new URL(url));
      await new Promise(resolve => setTimeout(resolve, 5));
      const params = new URL(url).searchParams;
      return { json: async () => ({ status: 'success', projects: [
        { fileName: 'air_a.json', data: params.get('action') === 'list' && !legacy ? { id: 'a', name: 'A' } : { id: 'a', name: 'A', sketch: 'full' } }
      ] }) };
    }
  });
  const prefix = source.slice(0, source.indexOf('  // --- Network Event Listeners ---'));
  vm.runInContext(prefix + '\nshowToast = () => {}; window.api = {testConnection, listRemoteProjects, pullProject, deleteRemoteProject, getCached: () => _cachedRemoteProjects, setCached: value => { _cachedRemoteProjects = value; }}; })();', context);
  return { api: context.window.api, calls, stored };
}
test('client uses ping, coalesces simultaneous lists, and pulls full project separately', async () => {
  const c = client(); await c.api.testConnection('https://example.com/exec?existing=1');
  assert.equal(c.calls[0].searchParams.get('action'), 'ping'); assert.equal(c.calls[0].searchParams.get('existing'), '1');
  await Promise.all([c.api.listRemoteProjects(), c.api.listRemoteProjects()]);
  assert.equal(c.calls.length, 2); assert.equal(c.calls[1].searchParams.get('action'), 'list');
  await c.api.pullProject('a', 'air');
  assert.equal(c.calls[2].searchParams.get('projectId'), 'a');
  const local = JSON.parse(c.stored.get('survey_air_fsop_10_3_1_projects_v1'));
  assert.equal(local.projects[0].sketch, 'full');
  await c.api.listRemoteProjects(); assert.equal(c.calls.length, 3); // reuse recent summary only
  await c.api.listRemoteProjects({ force: true }); assert.equal(c.calls.length, 4);
  assert.equal(c.calls[3].searchParams.get('refresh'), '1');
  c.stored.set('survei_gdrive_url', 'https://another.example/exec');
  await c.api.listRemoteProjects(); assert.equal(c.calls.length, 5);
  assert.equal(c.calls[4].hostname, 'another.example');
});
test('client accepts old servers that ignore query parameters', async () => {
  const c = client(true); await c.api.testConnection('https://example.com/exec');
  await c.api.listRemoteProjects(); await c.api.pullProject('a', 'air');
  assert.equal(JSON.parse(c.stored.get('survey_air_fsop_10_3_1_projects_v1')).projects[0].sketch, 'full');
});

test('server caches legacy summaries, refresh bypasses cache, save invalidates it', () => {
  const f = file('air', 'a', false), s = server([f]);
  s.get({ action: 'list' }); assert.equal(f.blobs(), 1);
  s.get({ action: 'list' }); assert.equal(f.blobs(), 1);
  s.get({ action: 'list', refresh: '1' }); assert.equal(f.blobs(), 2);
  s.context.doPost({ postData: { contents: JSON.stringify({ type: 'air', project: { id: 'a', name: 'Updated' } }) } });
  assert.equal(s.get({ action: 'list' }).projects[0].data.name, 'Updated');
});

test('delete by file ID avoids folder scan and reports server timing', () => {
  const s = server(); let trashed = false;
  s.context.DriveApp.getFileById = id => { assert.equal(id, 'target'); return { setTrashed: value => { trashed = value; } }; };
  const result = s.context.doPost({ postData: { contents: JSON.stringify({ action: 'delete', fileId: 'target' }) } });
  assert.equal(result.status, 'success'); assert.equal(trashed, true);
  assert.equal(s.reads(), 0); assert.equal(typeof result.serverMs, 'number');
});
test('confirmed delete removes only selected row without fetching the list again', async () => {
  const c = client();
  c.api.setCached([{fileId: 'a', fileName: 'air_a.json'}, {fileId: 'b', fileName: 'air_b.json'}]);
  await c.api.deleteRemoteProject('a', 'air_a.json');
  assert.equal(c.calls.length, 1);
  assert.equal(c.api.getCached().length, 1); assert.equal(c.api.getCached()[0].fileId, 'b');
});
