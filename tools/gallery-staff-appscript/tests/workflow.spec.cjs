// Backend workflow tests for the dashboard features (mocked Google services).
const assert = require('node:assert/strict');
const { createEnv, artwork } = require('./mock-gas.cjs');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const throws = (fn, re) => { assert.throws(fn, re); count++; };

const env = createEnv();
const as = u => { env.user = u; };

// --- upload (teacher) ---
as('teacher@lvusd.org');
const a = env.call('submitArtwork', artwork({ title: 'Blue Vase' }));
const b = env.call('submitArtwork', artwork({ title: 'Red Bird', gradeCreated: 'K' }));
ok(a.status === 'Pending' && a.hasImage, 'upload pending with image');
ok(!('driveFileId' in a), 'drive id is not exposed to the browser');
ok(env.fileOf(a.id).access === 'PRIVATE', 'intake file is private');
ok(env.publicRows().length === 0, 'nothing public after upload');

// --- preview: full-resolution original + thumbnails ---
const img = env.call('getArtworkImage', a.id);
ok(img.dataUrl.startsWith('data:image/jpeg;base64,') && img.bytes === 12, 'full-res original returned as data URL');
ok(env.call('getArtworkPreview', a.id) === img.dataUrl, 'legacy preview alias works');
const thumbs = env.call('getArtworkThumbnails', [a.id, b.id, 'nope']);
ok(thumbs[a.id].startsWith('data:image/png') && thumbs.nope === null, 'thumbnails batch');
env.thumbnails = false;
ok(env.call('getArtworkThumbnails', [a.id])[a.id].startsWith('data:image/jpeg'), 'falls back to original when Drive has no thumbnail');
env.thumbnails = true;
as('secondary@lvusd.org');
throws(() => env.call('getArtworkImage', a.id), /Not your submission/);
ok(env.call('getArtworkThumbnails', [a.id])[a.id] === null, 'other teacher gets no thumbnail');
throws(() => env.call('updateArtwork', a.id, artwork()), /Not your artwork/);
throws(() => env.call('publicSheet_'), /Script function not found/);

// --- edit (teacher, own pending) ---
as('teacher@lvusd.org');
let e = env.call('updateArtwork', a.id, artwork({ title: 'Blue Vase (final)', school: 'Calabasas High' }));
ok(e.title === 'Blue Vase (final)' && e.school === 'Calabasas High' && e.status === 'Pending', 'teacher edits own pending');
throws(() => env.call('updateArtwork', a.id, artwork({ school: 'Hogwarts' })), /Invalid school/);
throws(() => env.call('updateArtwork', a.id, artwork({ title: '=IMPORTXML("x")' })), /formula/);
throws(() => env.call('reviewArtwork', a.id, 'approve', ''), /Reviewer permission/);
throws(() => env.call('reviewArtworks', [a.id], 'approve', ''), /Reviewer permission/);

// --- request changes → teacher resubmits ---
as('reviewer@lvusd.org');
throws(() => env.call('reviewArtwork', b.id, 'changes', ''), /missing or too long/);
let c = env.call('reviewArtwork', b.id, 'changes', 'Please crop the frame');
ok(c.status === 'Needs Changes' && c.reviewNote === 'Please crop the frame', 'changes requested');
as('teacher@lvusd.org');
c = env.call('updateArtwork', b.id, artwork({ title: 'Red Bird cropped', gradeCreated: 'K' }));
ok(c.status === 'Pending' && c.reviewNote === '', 'resubmission returns to pending');

// --- approve → reviewer edit → publish ---
as('reviewer@lvusd.org');
const appr = env.call('reviewArtwork', a.id, 'approve', '');
ok(appr.status === 'Approved' && appr.reviewedBy === 'reviewer@lvusd.org', 'approved');
as('teacher@lvusd.org');
throws(() => env.call('updateArtwork', a.id, artwork()), /locked after approval/);
as('reviewer@lvusd.org');
ok(env.call('updateArtwork', a.id, artwork({ title: 'Blue Vase', school: 'Calabasas High' })).status === 'Approved', 'reviewer edit keeps status');
env.props.DISTRICT_APPROVED_PUBLIC_SHARING = 'NO';
throws(() => env.call('reviewArtwork', a.id, 'publish', ''), /sharing approval/);
ok(env.fileOf(a.id).access === 'PRIVATE' && env.publicRows().length === 0, 'blocked publish leaves nothing public');
env.props.DISTRICT_APPROVED_PUBLIC_SHARING = 'YES';
const pub = env.call('reviewArtwork', a.id, 'publish', '');
ok(pub.status === 'Published' && pub.publishedAt, 'published');
ok(env.fileOf(a.id).access === 'ANYONE_WITH_LINK', 'image shared by link on publish');
ok(env.publicRows().length === 1 && env.publicRows()[0][0] === 'Blue Vase' && env.publicRows()[0][7] === env.fileIdOf(a.id), 'public row written');

// --- public feed preview ---
as('teacher@lvusd.org');
const feed = env.call('getPublicGalleryPreview');
ok(feed.length === 1 && feed[0].image === 'https://lh3.googleusercontent.com/d/' + env.fileIdOf(a.id) && feed[0].school_year_created === '2025–26', 'public preview matches public sheet');

// --- edit published → public row synced ---
as('reviewer@lvusd.org');
env.call('updateArtwork', a.id, artwork({ title: 'Blue Vase No. 2', school: 'Calabasas High', medium: 'Ceramic' }));
ok(env.publicRows().length === 1 && env.publicRows()[0][0] === 'Blue Vase No. 2' && env.publicRows()[0][6] === 'Ceramic', 'public listing updated in place');
throws(() => env.call('reviewArtwork', a.id, 'archive', ''), /Unpublish artwork before archiving/);

// --- unpublish ---
const un = env.call('reviewArtwork', a.id, 'unpublish', '');
ok(un.status === 'Approved' && !un.publishedAt, 'unpublished back to approved');
ok(env.publicRows().length === 0 && env.fileOf(a.id).access === 'PRIVATE', 'public row removed and image private again');

// --- bulk + archive/restore ---
const d = (as('teacher@lvusd.org'), env.call('submitArtwork', artwork({ title: 'Collage' })));
as('admin@lvusd.org');
const res = env.call('reviewArtworks', [b.id, d.id, a.id], 'approve', '');
ok(res.filter(r => r.ok).length === 2 && res.find(r => r.id === a.id).ok === false, 'bulk approve validates each item');
const arch = env.call('reviewArtworks', [d.id], 'archive', '');
ok(arch[0].item.status === 'Archived', 'archived');
throws(() => env.call('updateArtwork', d.id, artwork()), /Restore archived/);
ok(env.call('reviewArtwork', d.id, 'restore', '').status === 'Pending', 'restored to pending');
throws(() => env.call('reviewArtwork', d.id, 'delete', ''), /Invalid review action/);

// --- visibility ---
as('teacher@lvusd.org'); ok(env.call('getStaffBootstrap').items.length === 3, 'teacher sees own 3');
as('secondary@lvusd.org'); ok(env.call('getStaffBootstrap').items.length === 0, 'other teacher sees none');
as('reviewer@lvusd.org'); const boot = env.call('getStaffBootstrap');
ok(boot.canReview && boot.items.length === 3 && boot.schools.length === 15, 'reviewer bootstrap');
as('someone@gmail.com'); throws(() => env.call('getStaffBootstrap'), /LVUSD Google Workspace/);
as('stranger@lvusd.org'); throws(() => env.call('getArtworkImage', a.id), /not authorized/);

// --- damaged file ---
as('teacher@lvusd.org');
env.fileOf(a.id).getBlob = () => ({ getBytes: () => [], getContentType: () => 'image/png', getName: () => 'x' });
throws(() => env.call('getArtworkImage', a.id), /empty or damaged/);

// --- pilot mode (email allowlist) still enforced ---
const pilot = createEnv({ props: { PILOT_EMAIL_ONLY: 'YES', PILOT_ALLOWED_EMAILS: 'cbloom@lvusd.org,t@lvusd.org', PILOT_REVIEWER_EMAILS: 'cbloom@lvusd.org',
  ELEMENTARY_TEACHERS_GROUP: '', SECONDARY_VAPA_GROUP: '', GALLERY_REVIEWERS_GROUP: '', GALLERY_ADMINS_GROUP: '' } });
pilot.user = 't@lvusd.org'; const p = pilot.call('submitArtwork', artwork());
throws(() => pilot.call('reviewArtwork', p.id, 'approve', ''), /Reviewer permission/);
pilot.user = 'cbloom@lvusd.org'; ok(pilot.call('reviewArtwork', p.id, 'approve', '').status === 'Approved', 'pilot reviewer approves');
pilot.user = 'x@lvusd.org'; throws(() => pilot.call('getStaffBootstrap'), /not authorized/);

// --- legacy import of hand-entered public rows (HEIC originals) ---
{
  const lg = createEnv({ props: { PILOT_EMAIL_ONLY: 'YES', PILOT_ALLOWED_EMAILS: 'cbloom@lvusd.org,t@lvusd.org', PILOT_REVIEWER_EMAILS: 'cbloom@lvusd.org',
    ELEMENTARY_TEACHERS_GROUP: '', SECONDARY_VAPA_GROUP: '', GALLERY_REVIEWERS_GROUP: '', GALLERY_ADMINS_GROUP: '' } });
  const heic = [0,0,0,0x18,0x66,0x74,0x79,0x70,0x68,0x65,0x69,0x63,1,2,3];
  ['legacy-a','legacy-b'].forEach(id => lg.files.set(id, { id, access: 'ANYONE_WITH_LINK', getId: () => id, getName: () => 'Flower_Real Name.jpeg', getSize: () => heic.length,
    getBlob: () => ({ getBytes: () => heic, getContentType: () => 'image/heif' }), setSharing(a) { this.access = a; },
    getThumbnail: () => ({ getBytes: () => [0x89,0x50,0x4e,0x47], getContentType: () => 'image/png' }) }));
  lg.publicGallery.sheets.Sheet1.rows.push(['Anon','Student','Agoura High',10,'','Contemporary','Paint','legacy-a'],
    ['=HYPERLINK("x")','Student','Agoura High',12,'','Contemporary','Oil Paint','legacy-b'], ['Gone','Student','Agoura High',12,'','X','Y','missing-file']);
  lg.user = 't@lvusd.org'; throws(() => lg.call('importPublishedGalleryRows'), /Reviewer permission/);
  lg.user = 'cbloom@lvusd.org';
  const r1 = lg.call('importPublishedGalleryRows');
  ok(r1.imported === 2 && r1.missing.length === 1 && r1.skipped === 0, 'imports existing public rows, reports missing files');
  ok(lg.call('importPublishedGalleryRows').imported === 0, 'import is idempotent');
  ok(lg.publicRows().length === 3, 'public sheet untouched by import');
  const items = lg.call('getStaffBootstrap').items;
  ok(items.length === 2 && items.every(i => i.status === 'Published'), 'imported as Published');
  ok(!items.some(i => /^[=+@-]/.test(i.title)), 'formula text neutralized on import');
  lg.user = 't@lvusd.org'; ok(lg.call('getStaffBootstrap').items.length === 0, 'teachers do not see imported rows');
  lg.user = 'cbloom@lvusd.org';
  const a1 = items.find(i => i.title === 'Anon');
  const im = lg.call('getArtworkImage', a1.id);
  ok(im.browserSafe === false && im.publicUrl === 'https://lh3.googleusercontent.com/d/legacy-a' && im.dataUrl.startsWith('data:image/png') && !('name' in im), 'HEIC preview fallback without exposing filename');
  const un = lg.call('reviewArtwork', a1.id, 'unpublish', '');
  ok(un.status === 'Approved' && lg.files.get('legacy-a').access === 'PRIVATE' && !lg.publicRows().some(r => r[7] === 'legacy-a'), 'imported artwork can be unpublished');
  ok(lg.call('getArtworkImage', a1.id).publicUrl === '', 'no public URL once unpublished');
  throws(() => lg.call('updateArtwork', a1.id, { title: 'Anon', artist: 'Student', school: 'Agoura High', gradeCreated: '10', schoolYearCreated: '', medium: 'Paint', style: 'C' }), /missing/);
}

console.log(`PASS: ${count} dashboard workflow assertions (upload, preview, edit, approve, publish, public feed, unpublish, bulk, archive, auth)`);
