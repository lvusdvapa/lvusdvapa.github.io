// UI integration test: real Staff.html in jsdom, google.script.run bridged to real Code.gs on mocked Google services.
// Requires: npm i jsdom   (run with NODE_PATH pointing at its node_modules if installed elsewhere)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createEnv, JPEG } = require('./mock-gas.cjs');

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 3000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await tick(10); } throw new Error('Timed out: ' + label); }
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };

function boot(env) {
  const raw = fs.readFileSync(path.join(__dirname, '../Staff.html'), 'utf8')
    .replace('<?= staffRole ?>', env.call('getStaffBootstrap').role).replace('<?= staffEmail ?>', env.user);
  assert.ok(!/<\?/.test(raw), 'only the two known template tags are used');
  const dom = new JSDOM(raw, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { if (!this.open) return; this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.CSS = { escape: s => String(s).replace(/"/g, '\\"') };
  w.URL.createObjectURL = () => 'blob:mock'; w.URL.revokeObjectURL = () => {};
  w.calls = [];
  const runner = (success, failure) => new Proxy({}, {
    get(_, name) {
      if (name === 'withSuccessHandler') return fn => runner(fn, failure);
      if (name === 'withFailureHandler') return fn => runner(success, fn);
      return (...args) => { w.calls.push(name); setTimeout(() => { try { success && success(env.call(name, ...args)); } catch (e) { failure && failure({ message: e.message }); } }, 1); };
    }
  });
  w.google = { script: { get run() { return runner(null, null); } } };
  w.eval(raw.match(/<script>([\s\S]*)<\/script>/)[1]);
  return w;
}
const $ = (w, s) => w.document.querySelector(s);
const $$ = (w, s) => [...w.document.querySelectorAll(s)];
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const setVal = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const rowFor = (w, title) => $$(w, '#artwork-rows tr').find(tr => tr.textContent.includes(title));
async function confirm(w, note) { await until(() => $(w, '#confirm-dialog').open, 'confirm'); if (note) $(w, '#confirm-form').elements.note.value = note; $(w, '#confirm-form').requestSubmit(); }

(async () => {
  const env = createEnv();
  // ------------------------------------------------ teacher uploads two images
  env.user = 'teacher@lvusd.org';
  let w = boot(env);
  await until(() => $(w, '#load-state').hidden, 'initial load');
  ok($(w, '#empty-state').hidden === false && $(w, '#selection-bar').hidden, 'empty collection, no reviewer tools');
  ok($(w, '#role-badge').textContent === 'teacher' && $(w, '#avatar').textContent === 'TE', 'identity shown');
  click(w, $(w, '[data-open-upload]'));
  ok($(w, '#upload-dialog').open && !$(w, '#upload-step-files').hidden, 'step 1 files');
  const bytes = Buffer.from(JPEG, 'base64');
  const files = [new w.File([bytes], 'vase.jpg', { type: 'image/jpeg' }), new w.File([bytes], 'bird.jpg', { type: 'image/jpeg' })];
  const drop = new w.Event('drop', { bubbles: true, cancelable: true }); drop.dataTransfer = { files };
  $(w, '#drop-zone').dispatchEvent(drop);
  ok(!$(w, '#continue-upload').disabled && /2 images selected/.test($(w, '#upload-file-status').textContent), 'files accepted');
  const big = new w.File([new Uint8Array(9 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
  const drop2 = new w.Event('drop', { bubbles: true, cancelable: true }); drop2.dataTransfer = { files: [big] };
  $(w, '#drop-zone').dispatchEvent(drop2);
  ok(/under 8 MB/.test($(w, '#toast').textContent) && /2 images/.test($(w, '#upload-file-status').textContent), 'oversize rejected client-side');
  $(w, '#upload-dialog').dispatchEvent(new w.Event('cancel', { cancelable: true }));
  await until(() => $(w, '#confirm-dialog').open, 'discard confirmation');
  ok($(w, '#upload-dialog').open, 'Escape does not silently discard selected files');
  click(w, $(w, '[data-close-confirm]'));
  ok($(w, '#upload-dialog').open && !$(w, '#continue-upload').disabled, 'files kept after declining discard');
  click(w, $(w, '#continue-upload'));
  ok(!$(w, '#upload-step-details').hidden, 'step 2 details');
  click(w, $(w, '#to-review'));
  ok($(w, '#upload-step-review').hidden, 'cannot skip required details');
  const f = $(w, '#upload-form').elements;
  setVal(w, f.title, 'Still Life'); setVal(w, f.artist, 'Student A.'); setVal(w, f.school, 'Agoura High'); setVal(w, f.grade, '10');
  setVal(w, f.year, f.year.options[1].value); setVal(w, f.medium, 'Oil'); setVal(w, f.style, 'Observational');
  click(w, $(w, '#to-review'));
  ok($(w, '#upload-step-review').hidden, 'consent required');
  f.consent.checked = true; click(w, $(w, '#to-review'));
  ok(!$(w, '#upload-step-review').hidden && $$(w, '#upload-review-list li').length === 2, 'step 3 review lists each image');
  const titles = $$(w, '#upload-review-list input');
  ok(titles[0].value === 'Still Life 1' && titles[1].value === 'Still Life 2', 'per-image titles');
  setVal(w, titles[1], 'Bird Study');
  $(w, '#upload-form').requestSubmit();
  await until(() => !$(w, '#upload-dialog').open, 'upload finished');
  await until(() => $$(w, '#artwork-rows tr').length === 2, 'rows after upload');
  ok(env.privateRows().length === 2 && env.privateRows().every(r => r[11] === 'Pending'), 'two private Pending rows in sheet');
  ok([...env.files.values()].every(x => x.access === 'PRIVATE'), 'Drive files private');
  ok(rowFor(w, 'Bird Study') && $(w, '#pending-count').textContent === '2', 'table + metrics updated');
  ok(!w.calls.includes('reviewArtwork') && !$$(w, '[data-act="approve"]').length, 'teacher has no approve buttons');
  await until(() => $$(w, '#artwork-rows .art-thumb.has-image').length === 2, 'Drive thumbnails rendered');

  // ------------------------------------------------ preview (full resolution) + teacher edit
  click(w, rowFor(w, 'Still Life 1').querySelector('[data-view-image]'));
  await until(() => $(w, '#lightbox-img').src.startsWith('data:image/jpeg;base64,'), 'lightbox full-res');
  ok($(w, '#lightbox-img').src === env.call('getArtworkImage', env.call('getStaffBootstrap').items.find(i => i.title === 'Still Life 1').id).dataUrl, 'lightbox shows the exact Drive original');
  click(w, $(w, '#lightbox-close'));
  click(w, rowFor(w, 'Still Life 1').querySelector('[data-edit]'));
  ok($(w, '#edit-dialog').open && !$(w, '#save-edit').hidden && !$$(w, '#edit-workflow button').length, 'teacher edit panel, no workflow buttons');
  await until(() => /url\("data:image\/jpeg/.test($(w, '#edit-preview').style.backgroundImage), 'edit preview full-res');
  setVal(w, $(w, '#edit-form').elements.title, 'Still Life with Pears');
  $(w, '#edit-form').requestSubmit();
  await until(() => rowFor(w, 'Still Life with Pears'), 'edit saved');
  ok(env.privateRows().some(r => r[3] === 'Still Life with Pears'), 'edit persisted to sheet');

  // ------------------------------------------------ reviewer: approve → publish → public feed → edit → unpublish
  env.user = 'reviewer@lvusd.org';
  w = boot(env);
  await until(() => $$(w, '#artwork-rows tr').length === 2, 'reviewer load');
  ok(!!rowFor(w, 'Bird Study').querySelector('[data-select]'), 'reviewer has selection checkboxes');
  setVal(w, $(w, '#search'), 'pears');
  ok($$(w, '#artwork-rows tr').length === 1, 'search filter');
  setVal(w, $(w, '#search'), '');
  setVal(w, $(w, '#status-filter'), 'Published');
  ok($$(w, '#artwork-rows tr').length === 0 && !$(w, '#empty-state').hidden, 'status filter');
  click(w, $(w, '#clear-filters'));
  click(w, $(w, '[data-view="grid"]'));
  ok(!$(w, '#grid-view').hidden && $$(w, '#grid-view .art-card').length === 2 && $(w, '#table-view').hidden, 'grid view');
  click(w, $(w, '[data-view="table"]'));

  click(w, rowFor(w, 'Still Life with Pears').querySelector('[data-act="approve"]'));
  await confirm(w);
  await until(() => rowFor(w, 'Still Life with Pears').querySelector('[data-act="publish"]'), 'approved → publish button');
  ok($(w, '#approved-count').textContent === '1', 'metrics approved');
  click(w, rowFor(w, 'Still Life with Pears').querySelector('[data-act="publish"]'));
  await confirm(w);
  await until(() => rowFor(w, 'Still Life with Pears').querySelector('[data-act="unpublish"]'), 'published');
  ok(env.publicRows().length === 1 && env.publicRows()[0][0] === 'Still Life with Pears', 'public sheet row');
  click(w, $(w, '#load-public'));
  await until(() => $$(w, '#public-grid figure').length === 1, 'public feed preview');
  ok($(w, '#public-grid img').src.startsWith('https://lh3.googleusercontent.com/d/'), 'public image uses public Drive link');

  click(w, rowFor(w, 'Still Life with Pears').querySelector('[data-edit]'));
  ok($$(w, '#edit-workflow button').map(b => b.textContent).join() === 'Unpublish', 'published record shows Unpublish');
  setVal(w, $(w, '#edit-form').elements.medium, 'Oil on canvas');
  $(w, '#edit-form').requestSubmit();
  await until(() => env.publicRows()[0][6] === 'Oil on canvas', 'public row synced after edit');
  await until(() => $(w, '#public-grid figcaption').textContent.includes('Oil on canvas'), 'public preview refreshed');
  ok(true, 'published edit synced');

  click(w, rowFor(w, 'Still Life with Pears').querySelector('[data-act="unpublish"]'));
  await confirm(w);
  await until(() => rowFor(w, 'Still Life with Pears').querySelector('[data-act="publish"]'), 'unpublished');
  ok(env.publicRows().length === 0 && [...env.files.values()].every(x => x.access === 'PRIVATE'), 'removed from public, image private');

  // ------------------------------------------------ bulk request changes with note
  rowFor(w, 'Bird Study').querySelector('[data-select]').click();
  ok(!$(w, '#selection-bar').hidden && $(w, '#selected-count').textContent === '1', 'selection bar');
  click(w, $(w, '[data-bulk="changes"]'));
  await confirm(w, 'Please retake without glare');
  await until(() => rowFor(w, 'Bird Study').textContent.includes('Needs Changes'), 'bulk changes');
  ok($(w, '#changes-count').textContent === '1' && env.privateRows().some(r => r[16] === 'Please retake without glare'), 'note saved');

  // ------------------------------------------------ server enforcement even if UI is bypassed
  env.user = 'teacher@lvusd.org';
  w = boot(env);
  await until(() => $$(w, '#artwork-rows tr').length === 2, 'teacher reload');
  const id = env.call('getStaffBootstrap').items[0].id;
  let err = null;
  w.google.script.run.withSuccessHandler(r => { err = 'UNEXPECTED SUCCESS ' + JSON.stringify(r); }).withFailureHandler(e => { err = e.message; }).reviewArtwork(id, 'publish', '');
  await until(() => err, 'forged call rejected');
  ok(/Reviewer permission/.test(err), 'forged publish rejected by server');

  console.log(`PASS: ${count} UI integration assertions (upload → preview → edit → approve → publish → public feed → unpublish)`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
