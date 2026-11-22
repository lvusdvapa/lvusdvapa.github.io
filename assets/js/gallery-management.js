const STORAGE_KEY = 'lvusd-gallery-staff-prototype-v2';
const seedArtworks = [
  {id:1,title:'Anon',artist:'Student',school:'Agoura High',grade:'10',year:'2025–26',medium:'Paint',style:'Not specified',status:'Published',art:1},
  {id:2,title:'Anon',artist:'Student',school:'Agoura High',grade:'12',year:'2025–26',medium:'Oil paint',style:'Not specified',status:'Published',art:2},
  {id:3,title:'Skeleton Alien Cat',artist:'Student',school:'Agoura High',grade:'12',year:'2025–26',medium:'Oil paint',style:'Not specified',status:'Published',art:3}
];
let artworks = loadArtworks();
let selected = new Set();
let currentView = 'table';

const $ = (selector, scope=document) => scope.querySelector(selector);
const $$ = (selector, scope=document) => [...scope.querySelectorAll(selector)];
const escapeHTML = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const statusClass = status => status.toLowerCase().replaceAll(' ','-');

function loadArtworks(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(seedArtworks); }
  catch { return structuredClone(seedArtworks); }
}
function saveArtworks(){try{localStorage.setItem(STORAGE_KEY, JSON.stringify(artworks));}catch(error){toast('Browser storage is full. These demo changes may not persist after reloading.');}}
function filteredArtworks(){
  const query = $('#search').value.trim().toLowerCase();
  return artworks.filter(a => (!query || `${a.title} ${a.artist}`.toLowerCase().includes(query))
    && (!$('#school-filter').value || a.school === $('#school-filter').value)
    && (!$('#grade-filter').value || a.grade === $('#grade-filter').value)
    && (!$('#year-filter').value || a.year === $('#year-filter').value)
    && (!$('#status-filter').value || a.status === $('#status-filter').value));
}
function optionsFor(key){ return [...new Set(artworks.map(item => item[key]))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})); }
function fillFilter(id,key){
  const select=$(id), current=select.value, first=select.options[0].outerHTML;
  select.innerHTML=first+optionsFor(key).map(value=>`<option>${escapeHTML(value)}</option>`).join('');
  select.value=current;
}
function render(){
  fillFilter('#school-filter','school'); fillFilter('#grade-filter','grade'); fillFilter('#year-filter','year');
  const visible=filteredArtworks();
  $('#artwork-rows').innerHTML=visible.map(a=>`<tr>
    <td><input type="checkbox" data-select="${a.id}" aria-label="Select ${escapeHTML(a.title)}" ${selected.has(a.id)?'checked':''}></td>
    <td><div class="artwork-cell"><span class="art-thumb art-${a.art}" aria-hidden="true"${a.thumb&&a.thumb.startsWith('data:image/jpeg;base64,')?' style="background-image:url('+a.thumb+')"':''}></span><div><strong>${escapeHTML(a.title)}</strong><span>${escapeHTML(a.artist)}</span></div></div></td>
    <td class="muted-cell">${escapeHTML(a.school)}<span>Grade ${escapeHTML(a.grade)}</span></td><td class="muted-cell">${escapeHTML(a.year)}</td>
    <td class="muted-cell">${escapeHTML(a.medium)}<span>${escapeHTML(a.style)}</span></td><td><span class="status status-${statusClass(a.status)}">${escapeHTML(a.status)}</span></td>
    <td><div class="row-actions">${a.status==='Pending'?`<button class="approve-button" data-approve="${a.id}">Approve</button>`:''}<button data-edit="${a.id}">Edit</button></div></td></tr>`).join('');
  $('#grid-view').innerHTML=visible.map(a=>`<article class="art-card"><div class="art-thumb art-${a.art}" aria-hidden="true"${a.thumb&&a.thumb.startsWith('data:image/jpeg;base64,')?' style="background-image:url('+a.thumb+')"':''}></div><div class="art-card-body"><div class="art-card-head"><h3>${escapeHTML(a.title)}</h3><span class="status status-${statusClass(a.status)}">${escapeHTML(a.status)}</span></div><p>${escapeHTML(a.artist)} · ${escapeHTML(a.school)} · Grade ${escapeHTML(a.grade)} · ${escapeHTML(a.year)}</p><div class="art-card-actions">${a.status==='Pending'?`<button data-approve="${a.id}">Approve</button>`:''}<button data-edit="${a.id}">Edit details</button></div></div></article>`).join('');
  $('#result-count').textContent=`${visible.length} artwork${visible.length===1?'':'s'}`;
  $('#empty-state').hidden=visible.length>0; $('#table-view').hidden=currentView!=='table'||visible.length===0; $('#grid-view').hidden=currentView!=='grid'||visible.length===0;
  const counts={Draft:0,Pending:0,Approved:0,Published:0,'Needs changes':0}; artworks.forEach(a=>{ if(a.status in counts) counts[a.status]++; });
  $('#draft-count').textContent=counts.Draft+counts['Needs changes']; $('#pending-count').textContent=counts.Pending; $('#approved-count').textContent=counts.Approved; $('#published-count').textContent=counts.Published;
  updateSelection();
}
function updateSelection(){
  $('#selected-count').textContent=selected.size; $('#selection-bar').hidden=selected.size===0;
  const visible=filteredArtworks(); $('#select-all').checked=visible.length>0&&visible.every(a=>selected.has(a.id)); $('#select-all').indeterminate=visible.some(a=>selected.has(a.id))&&!$('#select-all').checked;
}
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2600); }
function setStatus(id,status){ const art=artworks.find(a=>a.id===Number(id)); if(!art)return; art.status=status; saveArtworks(); render(); toast(`${art.title} marked ${status.toLowerCase()}.`); }

['#search','#school-filter','#grade-filter','#year-filter','#status-filter'].forEach(id=>$(id).addEventListener(id==='#search'?'input':'change',render));
$('#clear-filters').addEventListener('click',()=>{ $('#search').value=''; ['#school-filter','#grade-filter','#year-filter','#status-filter'].forEach(id=>$(id).value=''); render(); });
$('.notice-close').addEventListener('click',()=>$('.notice').remove());
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>{ currentView=button.dataset.view; $$('[data-view]').forEach(b=>{b.classList.toggle('active',b===button); b.setAttribute('aria-pressed',String(b===button));}); render(); }));
document.addEventListener('change',event=>{ if(event.target.matches('[data-select]')){ const id=Number(event.target.dataset.select); event.target.checked?selected.add(id):selected.delete(id); updateSelection(); }});
document.addEventListener('click',event=>{ const approve=event.target.closest('[data-approve]'), edit=event.target.closest('[data-edit]'); if(approve)setStatus(approve.dataset.approve,'Approved'); if(edit)openEdit(Number(edit.dataset.edit)); });
$('#select-all').addEventListener('change',event=>{ filteredArtworks().forEach(a=>event.target.checked?selected.add(a.id):selected.delete(a.id)); render(); });
$$('[data-bulk]').forEach(button=>button.addEventListener('click',()=>{ const action=button.dataset.bulk; if(action==='archive'){ artworks=artworks.filter(a=>!selected.has(a.id)); } else { const next=action==='approve'?'Approved':'Needs changes'; artworks.forEach(a=>{if(selected.has(a.id))a.status=next;}); } const count=selected.size; selected.clear(); saveArtworks(); render(); toast(`${count} artwork${count===1?'':'s'} updated.`); }));
$('#reset-data').addEventListener('click',()=>{ artworks=structuredClone(seedArtworks); selected.clear(); saveArtworks(); render(); toast('Prototype data reset.'); });

const uploadDialog=$('#upload-dialog'), uploadForm=$('#upload-form'), fileInput=$('#file-input'), dropZone=$('#drop-zone');
let pendingFiles=[];
let uploadStep=1;
let previewURLs=[];
function releasePreviews(){previewURLs.forEach(URL.revokeObjectURL);previewURLs=[];}
function showUploadStep(step){
  uploadStep=step;
  $('#upload-step-files').hidden=step!==1;
  $('#upload-step-details').hidden=step!==2;
  $$('.steps span').forEach((el,index)=>el.classList.toggle('active',index<step));
}
function resetUpload(){
  uploadForm.reset();
  fileInput.value='';
  pendingFiles=[];
  releasePreviews();
  $('#upload-image-previews').replaceChildren();
  $('#upload-file-status').textContent='No files selected';
  $('#continue-upload').disabled=true;
  showUploadStep(1);
}
function closeUpload(){uploadDialog.close();resetUpload();}
$$('[data-open-upload]').forEach(button=>button.addEventListener('click',()=>{resetUpload();uploadDialog.showModal();}));
$$('[data-close-upload]').forEach(button=>button.addEventListener('click',closeUpload));
uploadDialog.addEventListener('cancel',event=>{event.preventDefault();closeUpload();});
$('#choose-files').addEventListener('click',()=>fileInput.click());
function handleFiles(fileList){
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  const invalid=files.find(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024);
  if(invalid){toast('Please select JPG, PNG, or WebP files smaller than 15 MB.');return;}
  pendingFiles=files;
  releasePreviews();
  const previews=$('#upload-image-previews');previews.replaceChildren();
  files.slice(0,8).forEach(file=>{
    const url=URL.createObjectURL(file),img=document.createElement('img');
    previewURLs.push(url);img.src=url;img.alt=file.name;previews.appendChild(img);
  });
  const total=files.reduce((sum,file)=>sum+file.size,0);
  $('#upload-file-status').textContent=files.length+' image'+(files.length===1?'':'s')+' selected · '+(total/1048576).toFixed(1)+' MB';
  $('#file-summary-name').textContent=files.length===1?files[0].name:files.length+' artwork images';
  $('#file-summary-size').textContent=(total/1048576).toFixed(1)+' MB selected · local prototype only';
  $('#continue-upload').disabled=false;
}
fileInput.addEventListener('change',()=>handleFiles(fileInput.files));
['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,event=>{event.preventDefault();dropZone.classList.add('dragover');}));
['dragleave','drop'].forEach(type=>dropZone.addEventListener(type,event=>{event.preventDefault();dropZone.classList.remove('dragover');}));
dropZone.addEventListener('drop',event=>{event.preventDefault();dropZone.classList.remove('dragover');if(event.dataTransfer?.files?.length)handleFiles(event.dataTransfer.files);});
$('#continue-upload').addEventListener('click',()=>{if(!pendingFiles.length){toast('Choose artwork images first.');return;}showUploadStep(2);});
$('#change-files').addEventListener('click',()=>showUploadStep(1));
$('#back-upload').addEventListener('click',()=>showUploadStep(1));
function makeThumbnail(file){
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      try{
        const max=260, scale=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',.55));
      }catch{resolve('');}
      URL.revokeObjectURL(url);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);resolve('');};
    img.src=url;
  });
}
uploadForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(uploadStep!==2||!pendingFiles.length){toast('Choose artwork images first.');return;}
  if(!uploadForm.reportValidity())return;
  const data=new FormData(uploadForm),files=[...pendingFiles];
  const submit=uploadForm.querySelector('button[type="submit"]');
  submit.disabled=true;
  try{
    const thumbnails=await Promise.all(files.map(makeThumbnail));
    files.forEach((file,i)=>artworks.unshift({
      id:Date.now()*100+i,
      title:String(data.get('title'))+(files.length>1?' '+(i+1):''),
      artist:String(data.get('artist')),
      school:String(data.get('school')),
      grade:String(data.get('grade')),
      year:String(data.get('year')),
      medium:String(data.get('medium')),
      style:String(data.get('style')),
      status:'Pending',
      art:7,
      thumb:thumbnails[i]
    }));
    saveArtworks();render();closeUpload();
    toast(files.length+' artwork'+(files.length===1?'':'s')+' added to the local review queue.');
  }finally{submit.disabled=false;}
});

const editDialog=$('#edit-dialog'), editForm=$('#edit-form');
function openEdit(id){ const art=artworks.find(a=>a.id===id); if(!art)return; Object.entries(art).forEach(([key,value])=>{ if(editForm.elements[key])editForm.elements[key].value=value; }); const preview=$('#edit-preview');preview.className=`edit-preview art-thumb art-${art.art}`;preview.style.backgroundImage=art.thumb&&art.thumb.startsWith('data:image/jpeg;base64,')?`url("${art.thumb}")`:'';editDialog.showModal(); }
$$('[data-close-edit]').forEach(button=>button.addEventListener('click',()=>editDialog.close()));
editForm.addEventListener('submit',event=>{ if(event.submitter?.value==='cancel')return; event.preventDefault(); if(!editForm.reportValidity())return; const data=Object.fromEntries(new FormData(editForm)); const art=artworks.find(a=>a.id===Number(data.id)); if(!art)return; ['title','artist','school','grade','year','medium','style','status'].forEach(key=>art[key]=data[key]); saveArtworks(); render(); editDialog.close(); toast('Artwork details saved.'); });

render();
