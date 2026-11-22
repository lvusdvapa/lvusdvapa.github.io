// In-memory mocks of the Google Apps Script services used by Code.gs.
// Nothing here contacts Google. Used by workflow.spec.cjs and ui.spec.cjs.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function sheet(name, rows = []) {
  return {
    name, rows,
    getLastRow() { return this.rows.length; },
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); },
    getRange(r, c, n = 1, m = 1) {
      return {
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => this.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
        setValues: values => values.forEach((line, i) => { if (!this.rows[r - 1 + i]) this.rows[r - 1 + i] = []; line.forEach((v, j) => this.rows[r - 1 + i][c - 1 + j] = v); })
      };
    },
    appendRow(line) { this.rows.push([...line]); }, setFrozenRows() {}, deleteRow(r) { this.rows.splice(r - 1, 1); }
  };
}

function createEnv(options = {}) {
  const env = {
    user: options.user || 'teacher@lvusd.org',
    lookupFails: false,
    thumbnails: options.thumbnails !== false,
    files: new Map(),
    submissions: { sheets: {} },
    publicGallery: { sheets: { Sheet1: sheet('Sheet1', [['Title', 'Artist', 'School', 'Grade', 'school_year_created', 'Style', 'Medium', 'file_id']]) } },
    groups: options.groups || {
      'elementary@lvusd.org': new Set(['teacher@lvusd.org']),
      'secondary@lvusd.org': new Set(['secondary@lvusd.org']),
      'review@lvusd.org': new Set(['reviewer@lvusd.org']),
      'admin@lvusd.org': new Set(['admin@lvusd.org'])
    },
    props: Object.assign({
      STAFF_SUBMISSIONS_SHEET_ID: 'private-id', PUBLIC_GALLERY_SHEET_ID: 'public-id', PRIVATE_INTAKE_FOLDER_ID: 'intake-id',
      PUBLIC_GALLERY_TAB: 'Sheet1', ELEMENTARY_TEACHERS_GROUP: 'elementary@lvusd.org',
      SECONDARY_VAPA_GROUP: 'secondary@lvusd.org', GALLERY_REVIEWERS_GROUP: 'review@lvusd.org',
      GALLERY_ADMINS_GROUP: 'admin@lvusd.org', DISTRICT_APPROVED_PUBLIC_SHARING: 'YES'
    }, options.props || {})
  };
  let n = 0;
  const blob = (bytes, type, name) => ({ getBytes: () => bytes, getContentType: () => type, getName: () => name });
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => env.props[k] }) },
    Session: { getActiveUser: () => ({ getEmail: () => env.user }) },
    AdminDirectory: { Members: { hasMember: (group, email) => { if (env.lookupFails) throw new Error('permission denied'); return { isMember: env.groups[group]?.has(email) || false }; } } },
    SpreadsheetApp: {
      openById: id => {
        const ss = id === 'private-id' ? env.submissions : id === 'public-id' ? env.publicGallery : null;
        if (!ss) throw Error('unknown spreadsheet');
        return { getSheetByName: k => ss.sheets[k] || null, insertSheet: k => (ss.sheets[k] = sheet(k)) };
      }
    },
    DriveApp: {
      Access: { PRIVATE: 'PRIVATE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      getFolderById: id => {
        if (id !== 'intake-id') throw Error('wrong folder ' + id);
        return {
          createFile: b => {
            const fid = 'file-' + (++n);
            const file = {
              id: fid, access: 'PRIVATE', blob: b, trashed: false, getId: () => fid, getName: () => b.getName(),
              getSize: () => b.getBytes().length,
              setSharing(access) { this.access = access; }, getBlob() { return b; }, setTrashed() { this.trashed = true; },
              getThumbnail: () => env.thumbnails ? blob([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1], 'image/png', 'thumb.png') : null
            };
            env.files.set(fid, file); return file;
          }
        };
      },
      getFileById: id => { if (!env.files.has(id)) throw Error('missing file'); return env.files.get(id); }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => `uuid-${++n}`,
      base64Decode: b => Array.from(Buffer.from(b, 'base64')).map(x => x > 127 ? x - 256 : x),
      base64Encode: bytes => Buffer.from(bytes.map(x => x & 255)).toString('base64'),
      newBlob: blob
    },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) }) },
    console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Code.gs'), 'utf8'), context);
  // Call a server function the way google.script.run does: by name, with JSON-cloned args/results.
  env.call = (name, ...args) => {
    if (name.endsWith('_') || typeof context[name] !== 'function') throw new Error('Script function not found: ' + name);
    context.__args = JSON.parse(JSON.stringify(args));
    const result = vm.runInContext(`${name}(...__args)`, context);
    return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
  };
  env.context = context;
  env.fileIdOf = recId => (env.privateRows().find(r => r[0] === recId) || [])[10];
  env.fileOf = recId => env.files.get(env.fileIdOf(recId));
  env.publicRows = () => env.publicGallery.sheets.Sheet1.rows.slice(1);
  env.privateRows = () => (env.submissions.sheets.StaffSubmissions?.rows || []).slice(1);
  return env;
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x01, 0x02]).toString('base64');
function artwork(over = {}) {
  return Object.assign({ title: 'Painted Flower', artist: 'Student', school: 'Agoura High', gradeCreated: '10', schoolYearCreated: '2025–26',
    medium: 'Painting', style: 'Contemporary', consentConfirmed: true, base64: JPEG }, over);
}
module.exports = { createEnv, artwork, JPEG };
