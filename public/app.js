const $ = s => document.querySelector(s);
const state = { cards: JSON.parse(localStorage.getItem('pokescan.cards') || '[]'), chosen: null, stream: null, photo: null };
const langNames = {de:'Deutsch',en:'Englisch',fr:'Französisch',it:'Italienisch',es:'Spanisch',pt:'Portugiesisch',ja:'Japanisch'};

document.querySelectorAll('.tab').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('.tab,.screen').forEach(x => x.classList.remove('active'));
  btn.classList.add('active'); $('#' + btn.dataset.screen).classList.add('active'); renderInventory();
});

$('#cameraBtn').onclick = async () => {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    $('#video').srcObject = state.stream; await $('#video').play();
    $('#video').style.display='block'; $('#cameraEmpty').style.display='none'; $('#captureBtn').disabled=false;
  } catch { setStatus('Kamera nicht verfügbar. Die Suche funktioniert trotzdem.'); }
};
$('#captureBtn').onclick = () => {
  if(state.autoScanning&&!state.recognizing){recognizeCurrentCard();return}
  const v=$('#video'), c=$('#canvas'); c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
  state.photo=c.toDataURL('image/jpeg',.72); c.style.display='block'; v.style.display='none';
  setStatus('Foto aufgenommen. Ergänze Name oder Kartennummer für die Erkennung.');
  setTimeout(()=>{c.style.display='none';v.style.display='block'},700);
};

$('#searchBtn').onclick = search;
async function search(){
  const name=$('#name').value.trim(), number=$('#number').value.trim().split('/')[0], lang=$('#language').value==='auto'?'de':$('#language').value;
  if(!name && !number) return setStatus('Bitte Name oder Kartennummer eingeben.');
  setStatus('Kartendatenbank wird durchsucht …'); $('#results').innerHTML='';
  try{
    const params=new URLSearchParams(); if(name) params.set('name',name); if(number) params.set('localId',number);
    const res=await fetch(`https://api.tcgdex.net/v2/${lang}/cards?${params}`); if(!res.ok) throw new Error();
    let cards=await res.json(); cards=(Array.isArray(cards)?cards:[]).slice(0,12);
    if(!cards.length) return setStatus('Kein eindeutiger Treffer. Schreibweise oder Sprache prüfen.');
    const details=await Promise.all(cards.slice(0,8).map(async c=>{try{return await (await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${c.id}`)).json()}catch{return c}}));
    setStatus(`${details.length} mögliche Treffer – bitte Karte bestätigen.`); renderResults(details,lang);
  }catch{ setStatus('Kartendatenbank gerade nicht erreichbar. Bitte später erneut versuchen.'); }
}
function imageUrl(c){ return c.image ? `${c.image}/low.webp` : ''; }
function setName(c){ return c.set?.name || c.set?.id || 'Set unbekannt'; }
function marketPrice(c){
  const p=c.pricing?.cardmarket || c.cardmarket?.prices || {};
  return p.trendPrice ?? p.trend ?? p.averageSellPrice ?? p.avg ?? null;
}
function renderResults(cards,lang){ $('#results').innerHTML=cards.map((c,i)=>`<article class="result"><img src="${imageUrl(c)}" alt=""><div><strong>${esc(c.name||'Unbekannt')}</strong><div class="meta">${esc(setName(c))} · ${esc(c.localId||'–')} · ${langNames[lang]}</div>${marketPrice(c)!=null?`<div class="price">≈ ${Number(marketPrice(c)).toFixed(2)} €</div>`:''}</div><button class="add" data-i="${i}">+</button></article>`).join('');
  document.querySelectorAll('.add').forEach(b=>b.onclick=()=>openAdd(cards[+b.dataset.i],lang));
}
function openAdd(card,lang){
  state.chosen={card,lang}; $('#chosenCard').innerHTML=`<div class="chosen"><img src="${imageUrl(card)}"><div><span class="eyebrow">TREFFER BESTÄTIGEN</span><h2>${esc(card.name)}</h2><p>${esc(setName(card))} · ${esc(card.localId||'–')}</p></div></div>`; $('#addDialog').showModal();
}
$('#saveBtn').onclick = () => {
  if(!state.chosen)return; const {card,lang}=state.chosen; const qty=Math.max(1,+$('#quantity').value||1);
  state.cards.unshift({uid:crypto.randomUUID(),tcgdexId:card.id,name:card.name,set:setName(card),setId:card.set?.id||'',number:card.localId||'',language:lang,condition:$('#condition').value,variant:$('#variant').value,quantity:qty,price:$('#price').value?+$('#price').value:marketPrice(card),cardmarketId:card.variants?.find?.(v=>v.thirdParty?.cardmarket)?.thirdParty?.cardmarket || card.thirdParty?.cardmarket || '',image:imageUrl(card),photo:state.photo,addedAt:new Date().toISOString()});
  persist(); setStatus('Karte wurde lokal gespeichert.'); $('#quantity').value=1; $('#price').value='';
};
function persist(){localStorage.setItem('pokescan.cards',JSON.stringify(state.cards));renderInventory()}
function renderInventory(){
  const q=$('#filter').value.toLowerCase(), cond=$('#conditionFilter').value;
  const cards=state.cards.filter(c=>(!q||`${c.name} ${c.set} ${c.number}`.toLowerCase().includes(q))&&(!cond||c.condition===cond));
  $('#totalCount').textContent=state.cards.reduce((n,c)=>n+c.quantity,0);
  $('#inventory').innerHTML=cards.length?cards.map(c=>`<article class="inventory-item"><img src="${c.image}" alt=""><div><strong>${esc(c.name)}</strong><div class="meta">${esc(c.set)} · ${esc(c.number)} · ${langNames[c.language]||c.language}</div><div class="meta">${c.quantity}× ${c.condition} · ${c.variant}${c.price!=null?` · <span class="price">${Number(c.price).toFixed(2)} €</span>`:''}</div></div><button class="delete" data-id="${c.uid}" aria-label="Löschen">×</button></article>`).join(''):'<div class="empty">Noch keine Karten gespeichert.</div>';
  document.querySelectorAll('.delete').forEach(b=>b.onclick=()=>{state.cards=state.cards.filter(c=>c.uid!==b.dataset.id);persist()});
}
$('#filter').oninput=renderInventory; $('#conditionFilter').onchange=renderInventory;
$('#clearBtn').onclick=()=>{if(confirm('Lokale Sammlung wirklich leeren?')){state.cards=[];persist()}};
$('#csvBtn').onclick=()=>downloadCsv('pokescan-sammlung.csv',['Name','Set','SetCode','Kartennummer','Sprache','Zustand','Variante','Anzahl','Preis_EUR','Cardmarket_ID','TCGdex_ID','Erfasst_am'],state.cards.map(c=>[c.name,c.set,c.setId,c.number,langNames[c.language],c.condition,c.variant,c.quantity,c.price??'',c.cardmarketId,c.tcgdexId,c.addedAt]));
$('#cmBtn').onclick=()=>downloadCsv('cardmarket-vorbereitung.csv',['idProduct','Name','Expansion','CollectorNumber','Language','Condition','ReverseHolo','Price_EUR','Amount','Comments'],state.cards.map(c=>[c.cardmarketId,c.name,c.set,c.number,langNames[c.language],c.condition,c.variant==='Reverse Holo'?'Y':'N',c.price??'',c.quantity,'PokéScan MVP – vor Upload prüfen']));
function downloadCsv(filename,headers,rows){const cell=v=>`"${String(v??'').replaceAll('"','""')}"`;const text='\ufeff'+[headers,...rows].map(r=>r.map(cell).join(';')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=filename;a.click();URL.revokeObjectURL(a.href)}
function setStatus(t){$('#status').textContent=t} function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
renderInventory();

// Kostenloser Serienscanner: Bewegungserkennung -> OCR im Browser -> TCGdex-Abgleich -> Bestätigung.
Object.assign(state,{autoScanning:false,recognizing:false,lastSample:null,stableFrames:0,autoCandidates:[],autoChosen:null,scanTimer:null,batch:[]});
const sampleCanvas=document.createElement('canvas'); sampleCanvas.width=32; sampleCanvas.height=44;
const sampleCtx=sampleCanvas.getContext('2d',{willReadFrequently:true});
const ocrLanguages={auto:'deu+eng',de:'deu',en:'eng',fr:'fra',it:'ita',es:'spa',pt:'por',ja:'jpn'};

$('#autoBtn').onclick=async()=>{
  if(state.autoScanning){stopAutoScan();return}
  if(!state.stream){
    try{state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});$('#video').srcObject=state.stream;await $('#video').play();$('#video').style.display='block';$('#canvas').style.display='none';$('#cameraEmpty').style.display='none';$('#captureBtn').disabled=false}
    catch{return setStatus('Kamera konnte nicht geöffnet werden. Bitte die Kameraberechtigung erlauben.')}
  }
  state.autoScanning=true;state.lastSample=null;state.stableFrames=0;$('#autoBtn').textContent='Automatisches Scannen stoppen';setLive('on','Bereit – Karte einlegen');setStatus('Halte die Karte vollständig und ruhig in den gelben Rahmen.');
  state.scanTimer=setInterval(scanFrame,650);
};
function stopAutoScan(){state.autoScanning=false;clearInterval(state.scanTimer);state.scanTimer=null;$('#autoBtn').textContent='Automatisches Scannen starten';setLive('','Scanner aus');progress(0);if(state.batch.length)openBatchSummary()}
function setLive(mode,text){$('#liveBadge').className='live-badge '+mode;$('#liveBadge').textContent=text}
function progress(value){$('#scanStep').style.width=value+'%'}
function scanFrame(){
  const v=$('#video');if(!state.autoScanning||state.recognizing||v.readyState<2||$('#confirmDialog').open)return;
  sampleCtx.drawImage(v,v.videoWidth*.18,v.videoHeight*.08,v.videoWidth*.64,v.videoHeight*.84,0,0,32,44);
  const px=sampleCtx.getImageData(0,0,32,44).data, gray=new Uint8Array(32*44);let sum=0;
  for(let i=0,j=0;i<px.length;i+=4,j++){gray[j]=(px[i]*.3+px[i+1]*.59+px[i+2]*.11)|0;sum+=gray[j]}
  const mean=sum/gray.length;let variance=0,diff=999;
  for(const n of gray)variance+=(n-mean)**2;variance/=gray.length;
  if(state.lastSample){diff=0;for(let i=0;i<gray.length;i++)diff+=Math.abs(gray[i]-state.lastSample[i]);diff/=gray.length}
  if(state.waitingRemoval){let removalDiff=999;if(state.removalSample){removalDiff=0;for(let i=0;i<gray.length;i++)removalDiff+=Math.abs(gray[i]-state.removalSample[i]);removalDiff/=gray.length}if(removalDiff>20){state.waitingRemoval=false;state.lastSample=gray;state.stableFrames=0;setLive('on','Nächste Karte erkannt');setStatus('Neue Karte ruhig halten …')}return}
  state.lastSample=gray; state.stableFrames=(diff<14&&variance>140)?state.stableFrames+1:0;progress(Math.min(35,state.stableFrames*17));
  if(state.stableFrames>=2)recognizeCurrentCard();
}
async function recognizeCurrentCard(){
  state.recognizing=true;state.stableFrames=0;setLive('busy','Erkennung läuft …');progress(45);captureCardCrop();
  try{
    if(!window.Tesseract)throw new Error('Texterkennung wurde nicht geladen');
    setStatus('Text auf der Karte wird kostenlos auf deinem Handy gelesen …');
    const selected=$('#language').value, language=ocrLanguages[selected]||'eng';
    const result=await Tesseract.recognize(state.photo,language,{logger:m=>{if(m.status==='recognizing text')progress(45+Math.round(m.progress*30))}});
    const text=result.data.text.replace(/\r/g,'');const parsed=parseCardText(text);progress(78);
    setStatus(parsed.number?`Kartennummer ${parsed.number} erkannt – Datenbankabgleich …`:'Name wird mit der Kartendatenbank abgeglichen …');
    const cards=await findOcrCandidates(parsed,selected);progress(100);
    if(!cards.length)throw new Error('Kein passender Kartentreffer gefunden');
    state.autoCandidates=cards;showAutoCandidate(cards[0],Math.round(Math.min(99,(result.data.confidence||45)*.65+(parsed.number?30:10))));
  }catch(e){setStatus(`${e.message}. Karte anders ausrichten oder unten die manuelle Suche öffnen.`);setLive('on','Noch einmal versuchen');progress(0);setTimeout(()=>{state.recognizing=false;state.lastSample=null},1800);return}
  state.recognizing=false;
}
function captureCardCrop(){
  const v=$('#video'),c=$('#canvas'),targetRatio=2.5/3.5;let w=v.videoWidth*.68,h=v.videoHeight*.82;if(w/h>targetRatio)w=h*targetRatio;else h=w/targetRatio;
  const x=(v.videoWidth-w)/2,y=(v.videoHeight-h)/2;c.width=900;c.height=Math.round(900/targetRatio);c.getContext('2d').drawImage(v,x,y,w,h,0,0,c.width,c.height);state.photo=c.toDataURL('image/jpeg',.86);
}
function parseCardText(text){
  const clean=text.replace(/[|©®]/g,' ').replace(/\s+/g,' ').trim();const number=(clean.match(/\b([A-Z]{0,4}\s?\d{1,3})\s*[\/／]\s*\d{2,3}\b/i)||[])[1]?.replace(/\s/g,'')||'';
  const lines=text.split('\n').map(x=>x.replace(/[^\p{L}\p{N}\-' .]/gu,'').trim()).filter(x=>x.length>=3&&x.length<32&&!/^\d/.test(x));
  return {number,name:lines[0]||'',text:clean};
}
async function findOcrCandidates(parsed,lang){
  const params=new URLSearchParams();if(parsed.number)params.set('localId',parsed.number);else if(parsed.name)params.set('name',parsed.name);
  if(!params.toString())return[];if(lang==='auto')lang=inferLanguage(parsed.text);state.detectedLang=lang;const res=await fetch(`https://api.tcgdex.net/v2/${lang}/cards?${params}`);if(!res.ok)throw new Error('Kartendatenbank nicht erreichbar');let list=await res.json();
  if(!Array.isArray(list))return[];const query=(parsed.name||'').toLowerCase();list.sort((a,b)=>nameScore(b.name,query)-nameScore(a.name,query));
  return await Promise.all(list.slice(0,6).map(async c=>{try{return await(await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${c.id}`)).json()}catch{return c}}));
}
function inferLanguage(text){text=(text||'').toLowerCase();const de=['schwäche','widerstand','rückzug','entwicklung','basis','kampfunfähig'];const en=['weakness','resistance','retreat','evolves','basic','damage'];return de.filter(w=>text.includes(w)).length>=en.filter(w=>text.includes(w)).length?'de':'en'}
function nameScore(name,q){if(!q)return 0;name=(name||'').toLowerCase();if(q.includes(name)||name.includes(q))return 10;return [...name].filter(ch=>q.includes(ch)).length/Math.max(name.length,1)}
function showAutoCandidate(card,confidence){state.autoChosen=card;const lang=$('#language').value==='auto'?state.detectedLang:$('#language').value;$('#autoCandidate').innerHTML=`<div class="auto-card"><img src="${imageUrl(card)}" alt=""><span class="eyebrow">ERKANNTER TREFFER</span><h2>${esc(card.name)}</h2><p>${esc(setName(card))} · ${esc(card.localId||'–')} · ${langNames[lang]}</p></div>`;$('#confidence').textContent=confidence+' %';$('#confirmDialog').showModal();setLive('busy','Bitte bestätigen')}
$('#acceptBtn').onclick=()=>{const card=state.autoChosen,selected=$('#language').value,lang=selected==='auto'?state.detectedLang:selected;if(!card)return;const existing=state.batch.find(c=>c.tcgdexId===card.id&&c.language===lang&&c.condition==='NM'&&c.variant==='Normal');if(existing)existing.quantity+=1;else state.batch.unshift({uid:crypto.randomUUID(),tcgdexId:card.id,name:card.name,set:setName(card),setId:card.set?.id||'',number:card.localId||'',language:lang,condition:'NM',variant:'Normal',quantity:1,price:marketPrice(card),cardmarketId:card.variants?.find?.(v=>v.thirdParty?.cardmarket)?.thirdParty?.cardmarket||card.thirdParty?.cardmarket||'',image:imageUrl(card),photo:state.photo,addedAt:new Date().toISOString()});updateBatchBar();resumeAfterDecision(`${card.name} vorgemerkt. Karte entfernen und nächste einlegen.`)};
$('#rejectBtn').onclick=()=>resumeAfterDecision('Nicht übernommen. Karte entfernen und nächste einlegen.');
$('#alternativesBtn').onclick=()=>{$('#confirmDialog').close();renderResults(state.autoCandidates,$('#language').value);document.querySelector('details').open=true;resumeAfterDecision('Bitte unten einen anderen Treffer auswählen.')};
function resumeAfterDecision(message){setStatus(message);setLive('on','Karte entfernen');progress(0);state.removalSample=state.lastSample;state.waitingRemoval=true;state.stableFrames=0;state.recognizing=false}

// Mehrere lokale Sammlungen und ein Scan-Stapel, der erst am Ende übernommen wird.
state.collections=JSON.parse(localStorage.getItem('pokescan.collections')||'null')||[{id:'default',name:'Meine Sammlung',cards:state.cards}];
state.activeCollectionId=localStorage.getItem('pokescan.activeCollection')||state.collections[0].id;
if(!state.collections.some(c=>c.id===state.activeCollectionId))state.activeCollectionId=state.collections[0].id;
state.cards=state.collections.find(c=>c.id===state.activeCollectionId).cards;
function persist(){localStorage.setItem('pokescan.collections',JSON.stringify(state.collections));localStorage.setItem('pokescan.activeCollection',state.activeCollectionId);localStorage.setItem('pokescan.cards',JSON.stringify(state.cards));renderCollectionPicker();renderInventory()}
function renderCollectionPicker(){const options=state.collections.map(c=>`<option value="${c.id}"${c.id===state.activeCollectionId?' selected':''}>${esc(c.name)} (${c.cards.reduce((n,x)=>n+x.quantity,0)})</option>`).join('');$('#collectionSelect').innerHTML=options;$('#batchCollection').innerHTML=options}
$('#collectionSelect').onchange=()=>{state.activeCollectionId=$('#collectionSelect').value;state.cards=state.collections.find(c=>c.id===state.activeCollectionId).cards;persist()};
$('#newCollectionBtn').onclick=()=>{const name=prompt('Wie soll die neue Sammlung heißen?','Neue Sammlung');if(!name?.trim())return;const collection={id:crypto.randomUUID(),name:name.trim(),cards:[]};state.collections.push(collection);state.activeCollectionId=collection.id;state.cards=collection.cards;persist()};
function updateBatchBar(){$('#batchCount').textContent=state.batch.reduce((n,c)=>n+c.quantity,0);$('#batchBar').classList.toggle('active',state.batch.length>0)}
$('#finishBatchBtn').onclick=()=>{if(state.autoScanning)stopAutoScan();else openBatchSummary()};
function openBatchSummary(){if(!state.batch.length)return;renderCollectionPicker();$('#batchList').innerHTML=state.batch.map(c=>`<article class="inventory-item"><img src="${c.image}" alt=""><div><strong>${esc(c.name)}</strong><div class="meta">${esc(c.set)} · ${esc(c.number)} · ${langNames[c.language]}</div><div class="meta">${c.quantity}× vorgemerkt</div></div></article>`).join('');$('#batchCollection').value=state.activeCollectionId;if(!$('#batchDialog').open)$('#batchDialog').showModal()}
$('#commitBatchBtn').onclick=()=>{const collection=state.collections.find(c=>c.id===$('#batchCollection').value);if(!collection)return;for(const card of state.batch){const existing=collection.cards.find(c=>c.tcgdexId===card.tcgdexId&&c.language===card.language&&c.condition===card.condition&&c.variant===card.variant);if(existing)existing.quantity+=card.quantity;else collection.cards.unshift(card)}state.activeCollectionId=collection.id;state.cards=collection.cards;state.batch=[];updateBatchBar();persist();setStatus(`Scan-Stapel wurde zu „${collection.name}“ hinzugefügt.`)};
$('#discardBatchBtn').onclick=()=>{if(confirm('Den gesamten Scan-Stapel verwerfen?')){state.batch=[];updateBatchBar()}};
renderCollectionPicker();renderInventory();updateBatchBar();

function renderInventory(){
  const q=$('#filter').value.toLowerCase(),cond=$('#conditionFilter').value,cards=state.cards.filter(c=>(!q||`${c.name} ${c.set} ${c.number}`.toLowerCase().includes(q))&&(!cond||c.condition===cond));
  $('#totalCount').textContent=state.cards.reduce((n,c)=>n+c.quantity,0);$('#inventory').innerHTML=cards.length?cards.map(c=>`<article class="inventory-item"><img src="${c.image}" alt=""><div><strong>${esc(c.name)}</strong><div class="meta">${esc(c.set)} · ${esc(c.number)} · ${langNames[c.language]||c.language}</div><div class="meta">${c.quantity}× ${c.condition} · ${c.variant}${c.price!=null?` · <span class="price">${Number(c.price).toFixed(2)} €</span>`:''}</div></div><button class="delete" data-id="${c.uid}" aria-label="Löschen">×</button></article>`).join(''):'<div class="empty">In dieser Sammlung sind noch keine Karten gespeichert.</div>';
  document.querySelectorAll('.delete').forEach(b=>b.onclick=()=>{const i=state.cards.findIndex(c=>c.uid===b.dataset.id);if(i>=0)state.cards.splice(i,1);persist()});
}
$('#clearBtn').onclick=()=>{const collection=state.collections.find(c=>c.id===state.activeCollectionId);if(confirm(`„${collection.name}“ wirklich leeren?`)){collection.cards.length=0;persist()}};
