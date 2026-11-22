/**
 * LVUSD Student Art Collection — AUTHENTICATED STAFF ENDPOINT
 * This must be a DIFFERENT Apps Script project from the read-only public gallery feed.
 * DEPLOY: DOMAIN access only, execute as the deploying authorized district account.
 * Every callable (non-underscore) function calls mustBeAllowed_() before touching data.
 * Do NOT deploy to production without Workspace-admin review of identity/group resolution.
 * No production IDs, group emails, credentials, or personal data are in this file.
 */
const SUBMISSION_TAB = 'StaffSubmissions';
const PUBLIC_TAB_DEFAULT = 'Sheet1';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_THUMBNAIL_BATCH = 40;
const INLINE_THUMB_FALLBACK_BYTES = 1.5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SCHOOLS = [
  'Agoura High','Calabasas High','Lindero Canyon Middle School',
  'A.C. Stelle Middle School','A.E. Wright Middle School',
  'Bay Laurel Elementary','Buttercup Preschool','Chaparral Elementary',
  'Lupin Hill Elementary','Mariposa Elementary','Round Meadow Elementary',
  'Sumac Elementary','White Oak Elementary','Willow Elementary','Yerba Buena Elementary'
];
const STATUSES = ['Pending','Approved','Published','Needs Changes','Archived'];
const SUBMISSION_HEADERS = [
  'id','submittedAt','submittedBy','title','artist','school','gradeCreated',
  'schoolYearCreated','medium','style','driveFileId','status','consentConfirmed',
  'reviewedBy','reviewedAt','publishedAt','reviewNote'
];

/* ------------------------------------------------------------------ config & auth */

function config_() {
  const p = PropertiesService.getScriptProperties();
  const value = name => (p.getProperty(name) || '').trim();
  const cfg = {
    staffSheetId: value('STAFF_SUBMISSIONS_SHEET_ID'),
    publicSheetId: value('PUBLIC_GALLERY_SHEET_ID'),
    intakeFolderId: value('PRIVATE_INTAKE_FOLDER_ID'),
    publicTab: value('PUBLIC_GALLERY_TAB') || PUBLIC_TAB_DEFAULT,
    elementary: value('ELEMENTARY_TEACHERS_GROUP'),
    secondary: value('SECONDARY_VAPA_GROUP'),
    reviewers: value('GALLERY_REVIEWERS_GROUP'),
    admins: value('GALLERY_ADMINS_GROUP'),
    pilotOnly: value('PILOT_EMAIL_ONLY') === 'YES',
    pilotReviewers: value('PILOT_REVIEWER_EMAILS').toLowerCase().split(',').map(s => s.trim()).filter(Boolean),
    allowlist: value('PILOT_ALLOWED_EMAILS').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean),
    publicSharingApproved: value('DISTRICT_APPROVED_PUBLIC_SHARING') === 'YES'
  };
  if (!cfg.staffSheetId || !cfg.publicSheetId || !cfg.intakeFolderId) throw new Error('Staff gallery is not configured.');
  if (cfg.staffSheetId === cfg.publicSheetId) throw new Error('Private and public spreadsheet IDs must be different.');
  if (!cfg.pilotOnly && (!cfg.elementary || !cfg.secondary || !cfg.reviewers || !cfg.admins)) throw new Error('Workspace staff groups have not been configured.');
  return cfg;
}

function email_() {
  const email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email.endsWith('@lvusd.org')) throw new Error('An authenticated LVUSD Google Workspace account is required.');
  return email;
}

// Fails closed if Directory API permissions, domain identity, or group lookup is missing.
function isGroupMember_(groupEmail, userEmail) {
  if (!groupEmail) return false;
  try {
    const answer = AdminDirectory.Members.hasMember(groupEmail, userEmail);
    return answer.isMember === true;
  } catch (error) {
    throw new Error('Staff group verification unavailable. Contact the LVUSD administrator.');
  }
}

function mustBeAllowed_(needsReview) {
  const cfg = config_();
  const email = email_();
  if (cfg.pilotOnly) {
    if (!cfg.allowlist.includes(email)) throw new Error('This account is not authorized for gallery submissions.');
    const reviewer = cfg.pilotReviewers.includes(email);
    if (needsReview && !reviewer) throw new Error('Reviewer permission is required.');
    return { email, role: reviewer ? 'reviewer' : 'teacher', cfg };
  }
  const admin = isGroupMember_(cfg.admins, email);
  const reviewer = admin || isGroupMember_(cfg.reviewers, email);
  const submitter = reviewer || isGroupMember_(cfg.elementary, email) ||
    isGroupMember_(cfg.secondary, email) || cfg.allowlist.includes(email);
  if (!submitter) throw new Error('This account is not authorized for gallery submissions.');
  if (needsReview && !reviewer) throw new Error('Reviewer permission is required.');
  return { email, role: admin ? 'admin' : reviewer ? 'reviewer' : 'teacher', cfg };
}

function isReviewer_(user) { return user.role === 'reviewer' || user.role === 'admin'; }

/** Teachers may only touch their own submissions; reviewers/admins may touch any. */
function canSee_(user, rec) { return isReviewer_(user) || rec.submittedBy === user.email; }

/* ------------------------------------------------------------------ web app */

function doGet() {
  const user = mustBeAllowed_(false);
  const html = HtmlService.createTemplateFromFile('Staff');
  html.staffEmail = user.email;
  html.staffRole = user.role;
  return html.evaluate()
    .setTitle('Art Gallery Management | LVUSD VAPA')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getStaffBootstrap() {
  const u = mustBeAllowed_(false);
  const items = rows_().filter(x => canSee_(u, x));
  return {
    email: u.email, role: u.role, canReview: isReviewer_(u),
    publicSharingApproved: u.cfg.publicSharingApproved,
    schools: SCHOOLS.slice(), statuses: STATUSES.slice(),
    maxImageBytes: MAX_IMAGE_BYTES,
    items: items.map(publicStaffFields_)
  };
}

function publicStaffFields_(x) {
  const {id,title,artist,school,gradeCreated,schoolYearCreated,medium,style,status,submittedAt,
    submittedBy,reviewNote,consentConfirmed,reviewedBy,reviewedAt,publishedAt} = x;
  return {id,title,artist,school,gradeCreated:String(gradeCreated),schoolYearCreated,medium,style,status,
    submittedAt,submittedBy,reviewNote,consentConfirmed:consentConfirmed===true||String(consentConfirmed).toLowerCase()==='true',
    reviewedBy,reviewedAt,publishedAt,hasImage:!!x.driveFileId};
}

/* ------------------------------------------------------------------ validation */

function validSchool_(school) {
  if (!SCHOOLS.includes(school)) throw new Error('Invalid school.');
  return school;
}

function clean_(value, max) {
  const str=String(value == null ? '' : value).trim().replace(/[<>\u0000-\u001F]/g,'');
  if (!str || str.length > max) throw new Error('A required artwork field is missing or too long.');
  if (/^[=+@\-]/.test(str)) throw new Error('Artwork text cannot begin with spreadsheet formula characters.');
  return str;
}
function metadata_(data) {
  data = data || {};
  const grade=clean_(data.gradeCreated,2);
  if (!/^(K|[1-9]|1[0-2])$/.test(grade)) throw new Error('Invalid grade created.');
  const year=clean_(data.schoolYearCreated,9);
  if (!/^20\d{2}[–-](20)?\d{2}$/.test(year)) throw new Error('Invalid school year.');
  return {
    title:clean_(data.title,120), artist:clean_(data.artist,90),
    school:validSchool_(data.school), gradeCreated:grade,schoolYearCreated:year,
    medium:clean_(data.medium,60),style:clean_(data.style,60)
  };
}

function mimeFromBytes_(bytes) {
  const b = Array.prototype.slice.call(bytes, 0, 16).map(n=>n & 255);
  if (b.length >= 3 && b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF) return 'image/jpeg';
  if (b.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0,4))==='RIFF' && String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
  throw new Error('Only genuine JPG, PNG, and WebP artwork images are accepted.');
}

/* ------------------------------------------------------------------ private sheet */

function spreadsheet_() { return SpreadsheetApp.openById(config_().staffSheetId); }
function submissions_() {
  const ss=spreadsheet_();
  let sh=ss.getSheetByName(SUBMISSION_TAB);
  if (!sh){sh=ss.insertSheet(SUBMISSION_TAB);sh.appendRow(SUBMISSION_HEADERS);sh.setFrozenRows(1);}
  const headers=sh.getRange(1,1,1,SUBMISSION_HEADERS.length).getValues()[0];
  if (JSON.stringify(headers)!==JSON.stringify(SUBMISSION_HEADERS)) throw new Error('StaffSubmissions sheet schema mismatch.');
  return sh;
}
function rows_(){
  const sh=submissions_();
  if(sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,SUBMISSION_HEADERS.length).getValues().map((r,i)=>{
    const x={rowIndex:i+2};SUBMISSION_HEADERS.forEach((h,j)=>x[h]=r[j] instanceof Date ? r[j].toISOString() : r[j]);return x;
  }).filter(x=>x.id);
}
function lock_(fn){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw new Error('Gallery is busy. Try again.');
  try{return fn();}finally{lock.releaseLock();}
}
function rowById_(id){const x=rows_().find(x=>x.id===id);if(!x)throw new Error('Artwork submission not found.');return x;}
function updateRow_(x, fields){
  const sh=submissions_();
  const updated=Object.assign({},x,fields);
  sh.getRange(x.rowIndex,1,1,SUBMISSION_HEADERS.length).setValues([SUBMISSION_HEADERS.map(k=>updated[k]??'')]);
  return updated;
}

/* ------------------------------------------------------------------ upload */

/** Upload one piece at a time; browser calls this repeatedly for multi-image batches. */
function submitArtwork(request) {
  const user=mustBeAllowed_(false);
  if(request?.consentConfirmed!==true)throw new Error('Publication permission confirmation is required.');
  const md=metadata_(request);
  const b64=String(request.base64||'');
  if(!b64||b64.length>MAX_IMAGE_BYTES*1.37+100)throw new Error('Image exceeds the 8 MB submission limit.');
  let bytes;
  try{bytes=Utilities.base64Decode(b64);}catch(e){throw new Error('Invalid image encoding.');}
  if(!bytes.length)throw new Error('The selected image is empty.');
  if(bytes.length>MAX_IMAGE_BYTES)throw new Error('Image exceeds the 8 MB submission limit.');
  const mime=mimeFromBytes_(bytes);
  if (!ALLOWED_TYPES.includes(mime))throw new Error('Unsupported image format.');
  // All files begin private, regardless of the teacher's submission status.
  const ext=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
  const name='gallery-intake-'+Utilities.getUuid()+'.'+ext;
  const blob=Utilities.newBlob(bytes,mime,name);
  const file=DriveApp.getFolderById(user.cfg.intakeFolderId).createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
  // Verify Google Drive saved the complete image before recording it.
  let savedLength=-1;
  try{savedLength=DriveApp.getFileById(file.getId()).getBlob().getBytes().length;}catch(e){savedLength=-1;}
  if(savedLength!==bytes.length||savedLength===0){
    file.setTrashed(true);
    throw new Error('Image upload failed verification. The file was not saved correctly in Google Drive.');
  }
  const now=new Date().toISOString();
  const rec={id:Utilities.getUuid(),submittedAt:now,submittedBy:user.email,...md,
    driveFileId:file.getId(),status:'Pending',consentConfirmed:true,reviewedBy:'',reviewedAt:'',publishedAt:'',reviewNote:''};
  try {
    lock_(()=>submissions_().appendRow(SUBMISSION_HEADERS.map(h=>rec[h]??'')));
  } catch(error){file.setTrashed(true);throw error;}
  return publicStaffFields_(rec);
}

/* ------------------------------------------------------------------ images */

function imageBlob_(user, id) {
  const rec=rowById_(String(id));
  if(!canSee_(user, rec))throw new Error('Not your submission.');
  if(!rec.driveFileId)throw new Error('This record has no stored image.');
  let file;
  try{file=DriveApp.getFileById(rec.driveFileId);}catch(e){throw new Error('The stored image could not be found in Drive.');}
  return {rec, file};
}

/** Full-resolution original from Drive, returned as a data URL (never made public). */
function getArtworkImage(id){
  const user=mustBeAllowed_(false);
  const {file}=imageBlob_(user,id);
  const blob=file.getBlob();
  const bytes=blob.getBytes();
  if(!bytes.length)throw new Error('The stored image file is empty or damaged.');
  if(bytes.length>MAX_IMAGE_BYTES)throw new Error('Image too large to preview.');
  const mime=mimeFromBytes_(bytes);
  return {id:String(id), mimeType:mime, bytes:bytes.length, name:file.getName(),
    dataUrl:'data:'+mime+';base64,'+Utilities.base64Encode(bytes)};
}

/** Backwards-compatible name used by the previous Staff.html. */
function getArtworkPreview(id){ return getArtworkImage(id).dataUrl; }

/** Small Drive-generated thumbnails for the table/grid; falls back to the original for small files. */
function getArtworkThumbnails(ids){
  const user=mustBeAllowed_(false);
  const list=Array.isArray(ids)?ids.slice(0,MAX_THUMBNAIL_BATCH).map(String):[];
  const all=rows_();
  const out={};
  list.forEach(id=>{
    const rec=all.find(x=>x.id===id);
    if(!rec||!canSee_(user,rec)||!rec.driveFileId){out[id]=null;return;}
    try{
      const file=DriveApp.getFileById(rec.driveFileId);
      let thumb=null;
      try{thumb=file.getThumbnail();}catch(e){thumb=null;}
      if(thumb&&thumb.getBytes().length){
        out[id]='data:'+(thumb.getContentType()||'image/png')+';base64,'+Utilities.base64Encode(thumb.getBytes());
        return;
      }
      if(file.getSize()>0&&file.getSize()<=INLINE_THUMB_FALLBACK_BYTES){
        const b=file.getBlob().getBytes();
        out[id]='data:'+mimeFromBytes_(b)+';base64,'+Utilities.base64Encode(b);
        return;
      }
      out[id]=null;
    }catch(e){out[id]=null;}
  });
  return out;
}

/* ------------------------------------------------------------------ public gallery sheet */

function publicSheet_(){
  const cfg=config_();
  if(cfg.staffSheetId===cfg.publicSheetId)throw new Error('Private submissions and public gallery must use separate spreadsheets.');
  const sh=SpreadsheetApp.openById(cfg.publicSheetId).getSheetByName(cfg.publicTab);
  if(!sh)throw new Error('Published gallery tab is missing.');
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(x=>String(x).trim().toLowerCase());
  const needed=['title','artist','school','grade','style','medium','file_id'];
  if(!needed.every(x=>headers.includes(x)))throw new Error('Published gallery headers are incompatible.');
  return {sh,headers};
}
function publicFields_(rec){
  return {title:rec.title,artist:rec.artist,school:rec.school,grade:rec.gradeCreated,
    school_year_created:rec.schoolYearCreated,style:rec.style,medium:rec.medium,file_id:rec.driveFileId};
}
function removePublicById_(fileId){
  const {sh,headers}=publicSheet_();const col=headers.indexOf('file_id')+1;
  if(sh.getLastRow()<2)return 0;
  const ids=sh.getRange(2,col,sh.getLastRow()-1,1).getValues();
  let removed=0;
  for(let i=ids.length-1;i>=0;i--){if(String(ids[i][0])===String(fileId)){sh.deleteRow(i+2);removed++;}}
  return removed;
}
function updatePublicRow_(rec){
  const {sh,headers}=publicSheet_();const col=headers.indexOf('file_id')+1;
  if(sh.getLastRow()<2)return 0;
  const ids=sh.getRange(2,col,sh.getLastRow()-1,1).getValues();
  const fields=publicFields_(rec);let n=0;
  ids.forEach((r,i)=>{
    if(String(r[0])!==String(rec.driveFileId))return;
    const range=sh.getRange(i+2,1,1,headers.length);
    const current=range.getValues()[0];
    range.setValues([headers.map((h,j)=>h in fields?fields[h]:current[j])]);n++;
  });
  return n;
}
function publish_(rec){
  const cfg=config_();
  if(!cfg.publicSharingApproved)throw new Error('District public-image sharing approval is required before publishing.');
  const {sh,headers}=publicSheet_();
  const file=DriveApp.getFileById(rec.driveFileId);
  // This option must be explicitly approved by LVUSD and tested against domain sharing policy.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  try{
    removePublicById_(rec.driveFileId); // Prevent duplicate listings.
    const fields=publicFields_(rec);
    sh.appendRow(headers.map(h=>fields[h]??''));
  }catch(error){
    try{file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);}catch(e){}
    throw error;
  }
}

/** Read-only view of exactly what the public feed sheet contains (for staff verification). */
function getPublicGalleryPreview(){
  mustBeAllowed_(false);
  const {sh,headers}=publicSheet_();
  if(sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,headers.length).getValues().map(r=>{
    const o={};headers.forEach((h,j)=>o[h]=r[j] instanceof Date?r[j].toISOString():String(r[j]));
    return o;
  }).filter(o=>o.file_id).map(o=>({title:o.title,artist:o.artist,school:o.school,grade:o.grade,
    school_year_created:o.school_year_created||'',style:o.style,medium:o.medium,file_id:o.file_id,
    image:'https://lh3.googleusercontent.com/d/'+encodeURIComponent(o.file_id)}));
}

/* ------------------------------------------------------------------ review workflow */

/**
 * Allowed transitions (reviewer/admin only):
 *   Pending -> Approved | Needs Changes | Archived
 *   Needs Changes -> Archived
 *   Approved -> Published | Needs Changes | Archived
 *   Published -> Approved (unpublish)
 *   Archived -> Pending (restore)
 */
function review_(reviewer, id, action, note){
  const rec=rowById_(String(id));
  if(action==='approve' && rec.status!=='Pending')throw new Error('Only pending artwork can be approved.');
  if(action==='publish' && rec.status!=='Approved')throw new Error('Only approved artwork can be published.');
  if(action==='unpublish' && rec.status!=='Published')throw new Error('Only published artwork can be unpublished.');
  if(action==='changes' && !['Pending','Approved'].includes(rec.status))throw new Error('Cannot request changes in this state.');
  if(action==='archive' && !['Pending','Approved','Needs Changes'].includes(rec.status))throw new Error('Unpublish artwork before archiving it.');
  if(action==='restore' && rec.status!=='Archived')throw new Error('Only archived artwork can be restored.');
  const now=new Date().toISOString();
  if(action==='publish'){
    if(rec.consentConfirmed!==true && String(rec.consentConfirmed).toLowerCase()!=='true')throw new Error('Missing publication permission.');
    publish_(rec);
  }
  if(action==='unpublish'){
    removePublicById_(rec.driveFileId);
    DriveApp.getFileById(rec.driveFileId).setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
  }
  const state={approve:'Approved',publish:'Published',changes:'Needs Changes',unpublish:'Approved',archive:'Archived',restore:'Pending'}[action];
  const updated=updateRow_(rec,{status:state,reviewedBy:reviewer.email,reviewedAt:now,
    publishedAt:action==='publish'?now:action==='unpublish'?'':rec.publishedAt,
    reviewNote:action==='changes'?clean_(note,500):rec.reviewNote});
  return publicStaffFields_(updated);
}

const REVIEW_ACTIONS=['approve','publish','changes','unpublish','archive','restore'];

function reviewArtwork(id, decision, note){
  const reviewer=mustBeAllowed_(true);
  const action=String(decision||'');
  if(!REVIEW_ACTIONS.includes(action))throw new Error('Invalid review action.');
  return lock_(()=>review_(reviewer,id,action,note));
}

/** Bulk review: each item is validated independently; returns per-item outcome. */
function reviewArtworks(ids, decision, note){
  const reviewer=mustBeAllowed_(true);
  const action=String(decision||'');
  if(!REVIEW_ACTIONS.includes(action))throw new Error('Invalid review action.');
  if(!Array.isArray(ids)||!ids.length)throw new Error('Select at least one artwork.');
  if(ids.length>100)throw new Error('Select 100 or fewer artworks at a time.');
  if(action==='changes')clean_(note,500);
  return lock_(()=>ids.map(id=>{
    try{return {id:String(id),ok:true,item:review_(reviewer,id,action,note)};}
    catch(e){return {id:String(id),ok:false,error:e.message};}
  }));
}

/**
 * Edit artwork details.
 *  - Teachers: only their own Pending / Needs Changes work; saving re-queues it as Pending.
 *  - Reviewers/admins: any non-archived record. Status is unchanged; if the artwork is
 *    Published, the matching public gallery row is updated in the same lock.
 */
function updateArtwork(id, values){
  const u=mustBeAllowed_(false);const md=metadata_(values);
  return lock_(()=>{
    const rec=rowById_(String(id));
    if(!canSee_(u,rec))throw new Error('Not your artwork.');
    if(isReviewer_(u)){
      if(rec.status==='Archived')throw new Error('Restore archived artwork before editing it.');
      const updated=updateRow_(rec,{...md});
      if(rec.status==='Published')updatePublicRow_(updated);
      return publicStaffFields_(updated);
    }
    if(!['Pending','Needs Changes'].includes(rec.status))throw new Error('Artwork is locked after approval.');
    return publicStaffFields_(updateRow_(rec,{...md,status:'Pending',reviewNote:''}));
  });
}

/** Backwards-compatible name used by the previous Staff.html. */
function reviseArtwork(id, values){ return updateArtwork(id, values); }
