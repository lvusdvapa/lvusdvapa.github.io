const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../Code.gs'),'utf8');
const SUBMISSION_HEADERS=['id','submittedAt','submittedBy','title','artist','school','gradeCreated','schoolYearCreated','medium','style','driveFileId','status','consentConfirmed','reviewedBy','reviewedAt','publishedAt','reviewNote'];
function sheet(name,rows=[]){
 return {
  name,rows,
  getLastRow(){return this.rows.length;},getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));},
  getRange(r,c,n=1,m=1){return {
   getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>this.rows[r-1+i]?.[c-1+j]??'')),
   setValues:values=>values.forEach((line,i)=>{if(!this.rows[r-1+i])this.rows[r-1+i]=[];line.forEach((v,j)=>this.rows[r-1+i][c-1+j]=v);})
  };},
  appendRow(line){this.rows.push([...line]);},setFrozenRows(){},deleteRow(r){this.rows.splice(r-1,1);}
 };
}
const submissions={sheets:{}};
const publicGallery={sheets:{Sheet1:sheet('Sheet1',[['Title','Artist','School','Grade','school_year_created','Style','Medium','file_id']])}};
const files=new Map();const groups={
 'elementary@lvusd.org':new Set(['teacher@lvusd.org']),
 'secondary@lvusd.org':new Set(['secondary@lvusd.org']),
 'review@lvusd.org':new Set(['reviewer@lvusd.org']),
 'admin@lvusd.org':new Set(['admin@lvusd.org'])
};
const props={
 STAFF_SUBMISSIONS_SHEET_ID:'private-id',PUBLIC_GALLERY_SHEET_ID:'public-id',PRIVATE_INTAKE_FOLDER_ID:'intake-id',
 PUBLIC_GALLERY_TAB:'Sheet1',ELEMENTARY_TEACHERS_GROUP:'elementary@lvusd.org',
 SECONDARY_VAPA_GROUP:'secondary@lvusd.org',GALLERY_REVIEWERS_GROUP:'review@lvusd.org',
 GALLERY_ADMINS_GROUP:'admin@lvusd.org',DISTRICT_APPROVED_PUBLIC_SHARING:'NO'
};
let user='teacher@lvusd.org',n=0,lookupFails=false;
const context={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
 Session:{getActiveUser:()=>({getEmail:()=>user})},
 AdminDirectory:{Members:{hasMember:(group,email)=>{if(lookupFails)throw new Error('permission denied');return {isMember:groups[group]?.has(email)||false}}}},
 SpreadsheetApp:{openById:(id)=>{
   const ss=id==='private-id'?submissions:id==='public-id'?publicGallery:null;
   if(!ss)throw Error('unknown spreadsheet');
   return {getSheetByName:k=>ss.sheets[k]||null, insertSheet:k=>(ss.sheets[k]=sheet(k))};
 }},
 DriveApp:{
   Access:{PRIVATE:'PRIVATE',ANYONE_WITH_LINK:'ANYONE_WITH_LINK'},Permission:{VIEW:'VIEW'},
   getFolderById:(id)=>{assert.equal(id,'intake-id');return {createFile:blob=>{
      const id='file-'+(++n);const file={id,access:'PRIVATE',blob,getId:()=>id,setSharing(access){this.access=access;},getBlob(){return blob;},setTrashed(){this.trashed=true;}};
      files.set(id,file);return file;
   }}},
   getFileById:id=>{if(!files.has(id))throw Error('missing file');return files.get(id);}
 },
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 Utilities:{
   getUuid:()=>`uuid-${++n}`,
   base64Decode:b=>Array.from(Buffer.from(b,'base64')).map(x=>x>127?x-256:x),
   base64Encode:bytes=>Buffer.from(bytes.map(x=>x&255)).toString('base64'),
   newBlob:(bytes,type,name)=>({getBytes:()=>bytes,getContentType:()=>type,getName:()=>name})
 },
 HtmlService:{createTemplateFromFile:()=>({evaluate:()=>({setTitle(){return this},addMetaTag(){return this}})})},
 console
};
vm.createContext(context);vm.runInContext(code,context);
const run=(expr)=>vm.runInContext(expr,context);
function expectError(fn,pattern){assert.throws(fn,pattern);}
function item(title='Painted Flower'){
 return {title,artist:'Student',school:'Agoura High',gradeCreated:'10',schoolYearCreated:'2025–26',medium:'Painting',style:'Contemporary',consentConfirmed:true,
 base64:Buffer.from([0xff,0xd8,0xff,0xe0,0x01,0x02]).toString('base64')};
}
// baseline staff SSO and group authorization
user='outside@gmail.com';expectError(()=>run('getStaffBootstrap()'),/LVUSD Google Workspace/);
user='unlisted@lvusd.org';expectError(()=>run('getStaffBootstrap()'),/not authorized/);
user='teacher@lvusd.org';
let payload=item();context.payload=payload;
const created=run('submitArtwork(payload)');assert.equal(created.status,'Pending');
assert.equal(publicGallery.sheets.Sheet1.rows.length,1,'unreviewed work must never be on public sheet');
assert.equal(submissions.sheets.StaffSubmissions.rows.length,2);
expectError(()=>{context.id=created.id;run('reviewArtwork(id,"approve","")')},/Reviewer permission/);
expectError(()=>{context.id=created.id;run('reviewArtwork(id,"publish","")')},/Reviewer permission/);
user='secondary@lvusd.org';assert.equal(run('getStaffBootstrap()').items.length,0,'teachers see only own submissions');
user='reviewer@lvusd.org';context.id=created.id;
expectError(()=>run('reviewArtwork(id,"publish","")'),/Only approved/);
let approved=run('reviewArtwork(id,"approve","")');assert.equal(approved.status,'Approved');
expectError(()=>run('reviewArtwork(id,"publish","")'),/public-image sharing approval/);
assert.equal(publicGallery.sheets.Sheet1.rows.length,1);
props.DISTRICT_APPROVED_PUBLIC_SHARING='YES';
let published=run('reviewArtwork(id,"publish","")');assert.equal(published.status,'Published');
assert.equal(publicGallery.sheets.Sheet1.rows.length,2);
assert.equal(publicGallery.sheets.Sheet1.rows[1][4],'2025–26');
let file=files.values().next().value;assert.equal(file.access,'ANYONE_WITH_LINK');
expectError(()=>run('reviewArtwork(id,"publish","")'),/Only approved/);
let unpublished=run('reviewArtwork(id,"unpublish","")');assert.equal(unpublished.status,'Approved');
assert.equal(publicGallery.sheets.Sheet1.rows.length,1);assert.equal(file.access,'PRIVATE');
user='teacher@lvusd.org';context.payload={...item(),base64:Buffer.from([1,2,3]).toString('base64')};
expectError(()=>run('submitArtwork(payload)'),/genuine JPG/);
context.payload={...item(),gradeCreated:'17'};
expectError(()=>run('submitArtwork(payload)'),/Invalid grade/);
context.payload={...item(),consentConfirmed:false};
expectError(()=>run('submitArtwork(payload)'),/permission confirmation/);
user='reviewer@lvusd.org';lookupFails=true;expectError(()=>run('getStaffBootstrap()'),/Staff group verification unavailable/);lookupFails=false;
props.PUBLIC_GALLERY_SHEET_ID='private-id';expectError(()=>run('getStaffBootstrap()'),/must be different/);
console.log('PASS: 16 staff security, private queue, submission, approval, publication and unpublish assertions');
