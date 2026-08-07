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
    setStatus('Setcode, Sprache und Kartennummer werden am unteren Rand gelesen …');
    const selected=$('#language').value, language=ocrLanguages[selected]||'eng';
    const identifierImage=prepareIdentifierImage();
    const result=await Tesseract.recognize(identifierImage,language,{logger:m=>{if(m.status==='recognizing text')progress(45+Math.round(m.progress*27))}});
    let parsed=parseCardIdentifier(result.data.text);progress(74);
    if(!parsed.number){setStatus('Kennung nicht eindeutig – gesamte Karte wird zusätzlich gelesen …');const fallback=await Tesseract.recognize(state.photo,language,{logger:m=>{if(m.status==='recognizing text')progress(74+Math.round(m.progress*12))}});parsed={...parseCardText(fallback.data.text),identifierText:result.data.text}}
    state.identifier=parsed;
    setStatus(parsed.setCode?`${parsed.setCode} ${parsed.languageCode||''} ${parsed.number} erkannt – exakter Abgleich …`:parsed.number?`Kartennummer ${parsed.number} erkannt – Datenbankabgleich …`:'Name wird mit der Kartendatenbank abgeglichen …');
    let cards=await findIdentifierCandidates(parsed,selected);
    if(cards.length&&!cards[0]._exactIdentifier&&parsed.number){setStatus('Setcode nicht eindeutig – Kartenname wird zur Gegenprüfung gelesen …');const nameResult=await Tesseract.recognize(prepareNameImage(),language,{logger:m=>{if(m.status==='recognizing text')progress(86+Math.round(m.progress*12))}}),nameData=parseCardText(nameResult.data.text);parsed.name=nameData.name;parsed.text+=` ${nameData.text}`;cards=await findOcrCandidates(parsed,state.detectedLang)}progress(100);
    if(!cards.length)throw new Error('Kein passender Kartentreffer gefunden');
    state.autoCandidates=cards;const exact=Boolean(parsed.setCode&&cards[0]._exactIdentifier);showAutoCandidate(cards[0],exact?Math.max(92,Math.round(result.data.confidence||70)):Math.round(Math.min(89,(result.data.confidence||45)*.62+(parsed.number?24:8))));
  }catch(e){recordRecognition('miss',{reason:e.message,identifier:state.identifier||null});setStatus(`${e.message}. Karte anders ausrichten oder unten die manuelle Suche öffnen.`);setLive('on','Noch einmal versuchen');progress(0);setTimeout(()=>{state.recognizing=false;state.lastSample=null},1800);return}
  state.recognizing=false;
}
function captureCardCrop(){
  const v=$('#video'),c=$('#canvas'),targetRatio=2.5/3.5;let w=v.videoWidth*.68,h=v.videoHeight*.82;if(w/h>targetRatio)w=h*targetRatio;else h=w/targetRatio;
  const x=(v.videoWidth-w)/2,y=(v.videoHeight-h)/2;c.width=900;c.height=Math.round(900/targetRatio);c.getContext('2d').drawImage(v,x,y,w,h,0,0,c.width,c.height);state.photo=c.toDataURL('image/jpeg',.86);
}
function prepareIdentifierImage(){
  const source=$('#canvas'),cropY=Math.floor(source.height*.74),cropH=source.height-cropY,out=document.createElement('canvas');out.width=1600;out.height=540;const ctx=out.getContext('2d',{willReadFrequently:true});
  for(let row=0;row<3;row++)ctx.drawImage(source,0,cropY,source.width,cropH,0,row*180,out.width,180);
  const image=ctx.getImageData(0,0,out.width,out.height),d=image.data;
  for(let i=0;i<d.length;i+=4){const row=Math.floor((i/4)/out.width/180),g=d[i]*.3+d[i+1]*.59+d[i+2]*.11;let value=row===0?Math.max(0,Math.min(255,(g-128)*1.65+128)):row===1?(g>150?255:0):(g>150?0:255);d[i]=d[i+1]=d[i+2]=value}
  ctx.putImageData(image,0,0);state.identifierPhoto=out.toDataURL('image/png');return state.identifierPhoto;
}
function prepareNameImage(){const source=$('#canvas'),out=document.createElement('canvas');out.width=1400;out.height=300;const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,source.width,source.height*.24,0,0,out.width,out.height);const image=ctx.getImageData(0,0,out.width,out.height),d=image.data;for(let i=0;i<d.length;i+=4){const g=d[i]*.3+d[i+1]*.59+d[i+2]*.11,v=Math.max(0,Math.min(255,(g-128)*1.55+128));d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(image,0,0);return out.toDataURL('image/png')}
function parseCardIdentifier(text){
  const normalized=(text||'').toUpperCase().replace(/[|]/g,'I').replace(/[–—_]/g,'-').replace(/[^A-Z0-9À-Ü★◆●/\-\s]/g,' ').replace(/\s+/g,' ').trim(),languageMap={DE:'de',EN:'en',FR:'fr',IT:'it',ES:'es',PT:'pt',JP:'ja',JPN:'ja'};let best=null;
  const patterns=[/\b([A-Z][A-Z0-9]{1,4})\s*[- ]\s*(DE|EN|FR|IT|ES|PT|JP|JPN)\s*[- ]?\s*(\d{1,3})(?:\s*\/\s*(\d{2,3}))?\b/g,/\b([A-Z][A-Z0-9]{1,4})\s+(\d{1,3})(?:\s*\/\s*(\d{2,3}))?\b/g];
  for(const pattern of patterns){for(const match of normalized.matchAll(pattern)){const hasLang=languageMap[match[2]],candidate={setCode:match[1],languageCode:hasLang?match[2]:'',language:hasLang||'',number:hasLang?match[3]:match[2],total:hasLang?(match[4]||''):(match[3]||''),text:normalized,identifierText:text};if(!['BASIC','TRAINER','ENERGY','POKEMON'].includes(candidate.setCode)){best=candidate;break}}if(best)break}
  if(!best){const ratio=normalized.match(/\b(\d{1,3})\s*\/\s*(\d{2,3})\b/);best={setCode:'',languageCode:'',language:'',number:ratio?.[1]||'',total:ratio?.[2]||'',text:normalized,identifierText:text}}
  best.rarity=normalized.includes('★')?'★':normalized.includes('◆')?'◆':normalized.includes('●')?'●':'';return best;
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
async function findIdentifierCandidates(parsed,selectedLang){
  let lang=parsed.language||(selectedLang==='auto'?inferLanguage(parsed.text):selectedLang);state.detectedLang=lang;
  if(parsed.setCode&&parsed.number){try{const set=await resolveSetByPrintedCode(parsed.setCode,parsed.number,lang);if(set){const detail=set.cards?set:await(await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${set.id}`)).json();const found=(detail.cards||[]).filter(c=>String(c.localId).replace(/^0+/,'')===String(parsed.number).replace(/^0+/,''));if(found.length){return await Promise.all(found.slice(0,6).map(async c=>{const full=await(await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${c.id}`)).json();full._exactIdentifier=true;return full}))}}}catch{}
  }
  return findOcrCandidates(parsed,lang);
}
async function resolveSetByPrintedCode(setCode,number,lang){
  const code=setCode.toLowerCase(),variants=new Set([code,code.replace(/1$/,'i'),code.replace(/0/g,'o')]),cache=JSON.parse(localStorage.getItem('pokescan.setCodes')||'{}');if(cache[code])return{id:cache[code]};
  const matchesCode=s=>[s.id,s.abbreviation,s.code].filter(Boolean).some(v=>variants.has(String(v).toLowerCase()));const setsRes=await fetch(`https://api.tcgdex.net/v2/${lang}/sets`),sets=setsRes.ok?await setsRes.json():[];let match=sets.find(matchesCode);
  if(!match){const cardsRes=await fetch(`https://api.tcgdex.net/v2/${lang}/cards?localId=${encodeURIComponent(number)}`),cards=cardsRes.ok?await cardsRes.json():[],setIds=[...new Set(cards.slice(0,45).map(c=>c.set?.id||String(c.id).replace(new RegExp(`-${String(c.localId||number)}$`),'')).filter(Boolean))];const details=await Promise.all(setIds.map(async id=>{try{return await(await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${id}`)).json()}catch{return null}}));match=details.find(s=>s&&matchesCode(s))}
  if(match){cache[code]=match.id;localStorage.setItem('pokescan.setCodes',JSON.stringify(cache))}return match;
}
function inferLanguage(text){text=(text||'').toLowerCase();const de=['schwäche','widerstand','rückzug','entwicklung','basis','kampfunfähig'];const en=['weakness','resistance','retreat','evolves','basic','damage'];return de.filter(w=>text.includes(w)).length>=en.filter(w=>text.includes(w)).length?'de':'en'}
function nameScore(name,q){if(!q)return 0;name=(name||'').toLowerCase();if(q.includes(name)||name.includes(q))return 10;return [...name].filter(ch=>q.includes(ch)).length/Math.max(name.length,1)}
function showAutoCandidate(card,confidence){state.autoChosen=card;const lang=$('#language').value==='auto'?state.detectedLang:$('#language').value,id=state.identifier||{};state.pendingRecognition={confidence,cardId:card.id,name:card.name,set:setName(card),number:card.localId||'',language:lang,identifier:id};$('#autoCandidate').innerHTML=`<div class="auto-card"><img src="${imageUrl(card)}" alt=""><span class="eyebrow">ERKANNTER TREFFER</span><h2>${esc(card.name)}</h2><p>${esc(setName(card))} · ${esc(card.localId||'–')} · ${langNames[lang]}</p></div>`;$('#identifierDetails').innerHTML=[id.setCode,id.languageCode,id.number,id.rarity].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('');$('#confidence').textContent=confidence+' %';$('#confirmDialog').showModal();setLive('busy','Bitte bestätigen')}
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

// Qualitätsmessung der Scannererkennung. Es werden keine Fotos gespeichert.
state.recognitionLog=JSON.parse(localStorage.getItem('pokescan.recognitionLog')||'[]');
function recordRecognition(outcome,extra={}){const pending=state.pendingRecognition||{};state.recognitionLog.push({at:new Date().toISOString(),outcome,confidence:pending.confidence??null,cardId:pending.cardId||'',name:pending.name||'',set:pending.set||'',number:pending.number||'',language:pending.language||'',identifier:pending.identifier||extra.identifier||null,reason:extra.reason||''});state.recognitionLog=state.recognitionLog.slice(-1000);localStorage.setItem('pokescan.recognitionLog',JSON.stringify(state.recognitionLog));state.pendingRecognition=null;renderQualityStats()}
$('#acceptBtn').addEventListener('click',()=>recordRecognition('correct'));
$('#rejectBtn').addEventListener('click',()=>recordRecognition('wrong'));
$('#alternativesBtn').addEventListener('click',()=>recordRecognition('wrong'));
function renderQualityStats(){const log=state.recognitionLog,decisions=log.filter(x=>x.outcome==='correct'||x.outcome==='wrong'),correct=decisions.filter(x=>x.outcome==='correct').length,wrong=decisions.length-correct,misses=log.filter(x=>x.outcome==='miss').length,rate=decisions.length?Math.round(correct/decisions.length*100):0;$('#qualityStats').innerHTML=[['Versuche',log.length],['Korrekt',correct],['Falsch',wrong],['Trefferquote',rate+' %'],['Ohne Treffer',misses],['Ø Sicherheit',decisions.length?Math.round(decisions.reduce((n,x)=>n+(x.confidence||0),0)/decisions.length)+' %':'–']].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}
$('#qualityClearBtn').onclick=()=>{if(confirm('Gesamte Erkennungsstatistik löschen?')){state.recognitionLog=[];localStorage.removeItem('pokescan.recognitionLog');renderQualityStats()}};
$('#qualityExportBtn').onclick=()=>{const data=JSON.stringify({exportedAt:new Date().toISOString(),summary:qualitySummary(),attempts:state.recognitionLog},null,2),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download='pokescan-erkennungsdiagnose.json';a.click();URL.revokeObjectURL(a.href)};
function qualitySummary(){const l=state.recognitionLog,d=l.filter(x=>['correct','wrong'].includes(x.outcome)),c=d.filter(x=>x.outcome==='correct').length;return{attempts:l.length,decisions:d.length,correct:c,wrong:d.length-c,misses:l.filter(x=>x.outcome==='miss').length,accuracyPercent:d.length?Math.round(c/d.length*100):null}}
renderQualityStats();

// Kostenloser Marktchancen-Screener mit lokalem Preisverlauf.
state.marketWatch=JSON.parse(localStorage.getItem('pokescan.marketWatch')||'[]');
$('#marketSearchBtn').onclick=searchMarketCards;
async function searchMarketCards(){const query=$('#marketQuery').value.trim(),lang=$('#marketLanguage').value;if(query.length<2){$('#marketStatus').textContent='Bitte mindestens zwei Zeichen eingeben.';return}$('#marketStatus').textContent='Kartendaten und verfügbare Marktpreise werden geladen …';$('#marketResults').innerHTML='';try{const res=await fetch(`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(query)}`),brief=await res.json(),cards=await Promise.all((Array.isArray(brief)?brief:[]).slice(0,16).map(async c=>{try{return await(await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${c.id}`)).json()}catch{return c}})),minimum=Number($('#marketDiscount').value);const prepared=cards.map(c=>({card:c,metrics:extractMarketMetrics(c)})).filter(x=>opportunityScore(x.metrics).discount>=minimum);$('#marketStatus').textContent=prepared.length?`${prepared.length} Karten gefunden. Preise sind Richtwerte, keine Verkaufszusagen.`:'Keine Karten mit passenden Preisdaten gefunden.';$('#marketResults').innerHTML=prepared.map((x,i)=>marketResultHtml(x.card,x.metrics,i)).join('');document.querySelectorAll('[data-watch-index]').forEach(b=>b.onclick=()=>addMarketWatch(prepared[+b.dataset.watchIndex].card,lang))}catch(e){$('#marketStatus').textContent='Marktdatenbank gerade nicht erreichbar.'}}
function flattenNumbers(obj,prefix='',out={}){if(!obj||typeof obj!=='object')return out;for(const [k,v] of Object.entries(obj)){const key=(prefix+'.'+k).toLowerCase();if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&!/time|date|updated|id/.test(key))out[key]=v;else if(v&&typeof v==='object')flattenNumbers(v,key,out)}return out}
function pickNumber(flat,patterns){for(const pattern of patterns){const entry=Object.entries(flat).find(([k])=>pattern.test(k));if(entry)return entry[1]}return null}
function extractMarketMetrics(card){const source=card.pricing?.cardmarket||card.cardmarket?.prices||card.pricing||{},flat=flattenNumbers(source);return{low:pickNumber(flat,[/\.low$/,/\.from$/,/lowest/]),trend:pickNumber(flat,[/trend/]),avg30:pickNumber(flat,[/avg30|average30|30d/]),avg7:pickNumber(flat,[/avg7|average7|7d/]),sell:pickNumber(flat,[/\.sell$/,/average.*sell/]),currency:'EUR',rawKeys:Object.keys(flat)}}
function opportunityScore(m,history=[]){const current=m.low??m.trend??m.avg7??m.sell,reference=m.avg30??m.trend??m.avg7??m.sell;let discount=current!=null&&reference>0?Math.round((reference-current)/reference*100):0;const historic=history.map(x=>x.trend??x.avg30??x.low).filter(Number.isFinite),historicAvg=historic.length?historic.reduce((a,b)=>a+b,0)/historic.length:null,historicDiscount=current!=null&&historicAvg>0?(historicAvg-current)/historicAvg*100:0;const dataPoints=[m.low,m.trend,m.avg30,m.avg7,m.sell].filter(Number.isFinite).length;const score=Math.max(0,Math.min(100,Math.round(Math.max(0,discount)*1.35+Math.max(0,historicDiscount)*.75+Math.min(20,dataPoints*4))));return{score,discount,current,reference,dataPoints}}
function euro(v){return Number.isFinite(v)?Number(v).toFixed(2)+' €':'–'}
function marketResultHtml(card,m,index){const o=opportunityScore(m);return`<article class="result"><img src="${imageUrl(card)}" alt=""><div><strong>${esc(card.name)}</strong><div class="meta">${esc(setName(card))} · ${esc(card.localId||'–')}</div><div class="meta">Niedrig: ${euro(m.low)} · Trend: ${euro(m.trend)} · 30 Tage: ${euro(m.avg30)}</div></div><button class="add" data-watch-index="${index}" title="Beobachten">+</button></article>`}
function addMarketWatch(card,lang){if(state.marketWatch.some(x=>x.id===card.id)){ $('#marketStatus').textContent='Diese Karte wird bereits beobachtet.';return}state.marketWatch.unshift({id:card.id,lang,name:card.name,set:setName(card),number:card.localId||'',image:imageUrl(card),cardmarketId:card.thirdParty?.cardmarket||'',snapshots:[]});saveMarketWatch();refreshOneMarketCard(state.marketWatch[0]).then(saveMarketWatch)}
function saveMarketWatch(){localStorage.setItem('pokescan.marketWatch',JSON.stringify(state.marketWatch));renderMarketWatchlist()}
async function refreshOneMarketCard(item){try{const card=await(await fetch(`https://api.tcgdex.net/v2/${item.lang}/cards/${item.id}`)).json(),metrics=extractMarketMetrics(card),today=new Date().toISOString().slice(0,10);item.name=card.name||item.name;item.image=imageUrl(card)||item.image;item.set=setName(card)||item.set;item.snapshots=item.snapshots.filter(s=>s.day!==today);item.snapshots.push({day:today,at:new Date().toISOString(),...metrics});item.snapshots=item.snapshots.slice(-180)}catch{}return item}
$('#refreshMarketBtn').onclick=async()=>{$('#refreshMarketBtn').disabled=true;$('#refreshMarketBtn').textContent='Aktualisiere …';for(const item of state.marketWatch)await refreshOneMarketCard(item);saveMarketWatch();$('#refreshMarketBtn').disabled=false;$('#refreshMarketBtn').textContent='Preise aktualisieren'};
function renderMarketWatchlist(){if(!state.marketWatch.length){$('#marketWatchlist').innerHTML='<div class="empty">Noch keine Karten beobachtet. Suche oben nach einer Karte und tippe auf +.</div>';return}$('#marketWatchlist').innerHTML=state.marketWatch.map(item=>{const latest=item.snapshots.at(-1)||{},o=opportunityScore(latest,item.snapshots.slice(0,-1)),cls=o.score>=65?'good':o.score>=35?'medium':'';return`<article class="market-card"><img src="${item.image}" alt=""><div><button class="score ${cls}" data-score-info="${item.id}" aria-label="Chancen-Score ${o.score} erklären">${o.score}</button><strong>${esc(item.name)}</strong><div class="meta">${esc(item.set)} · ${esc(item.number)}</div><div class="price-row"><span>Niedrig<strong>${euro(latest.low)}</strong></span><span>Trend<strong>${euro(latest.trend)}</strong></span><span>30 Tage<strong>${euro(latest.avg30)}</strong></span><span>Abstand<strong class="${o.discount>0?'trend-up':'trend-down'}">${o.discount}%</strong></span></div><div class="meta">${item.snapshots.length} lokaler Preisstand · Score-Daten ${o.dataPoints}/5</div></div><div class="actions"><a class="secondary" href="https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(item.name)}" target="_blank" rel="noopener">Cardmarket suchen</a><button class="secondary" data-remove-watch="${item.id}">Entfernen</button></div></article>`}).join('');document.querySelectorAll('[data-remove-watch]').forEach(b=>b.onclick=()=>{state.marketWatch=state.marketWatch.filter(x=>x.id!==b.dataset.removeWatch);saveMarketWatch()});document.querySelectorAll('[data-score-info]').forEach(b=>b.onclick=()=>showScoreExplanation(state.marketWatch.find(x=>x.id===b.dataset.scoreInfo)))}
function scoreBand(score){return score>=65?{label:'Auffällig günstig',className:'good',description:'Der aktuelle Richtwert liegt deutlich unter verfügbaren Referenzwerten. Das ist ein Signal zum genaueren Prüfen, aber keine Kaufempfehlung.'}:score>=35?{label:'Beobachten',className:'medium',description:'Es gibt einzelne positive Preissignale, aber der Abstand oder die Datenabdeckung reicht noch nicht für ein starkes Signal.'}:{label:'Schwaches Signal',className:'weak',description:'Die Karte wirkt anhand der vorhandenen Daten nicht besonders günstig oder es fehlen zu viele Vergleichswerte.'}}
function showScoreExplanation(item){if(!item)return;const latest=item.snapshots.at(-1)||{},history=item.snapshots.slice(0,-1),o=opportunityScore(latest,history),band=scoreBand(o.score),historicValues=history.map(x=>x.trend??x.avg30??x.low).filter(Number.isFinite),historyText=historicValues.length?`${historicValues.length} ältere lokale Vergleichswerte`:'noch keine ältere lokale Historie';$('#scoreExplanation').innerHTML=`<div class="score-hero"><span class="score ${o.score>=65?'good':o.score>=35?'medium':''}">${o.score}</span><div><h2>${esc(item.name)}</h2><div class="score-band ${band.className}">${band.label}</div></div></div><p>${band.description}</p><h3>Warum dieser Wert?</h3><ul class="explain-list"><li>Aktueller verwendeter Preis: <strong>${euro(o.current)}</strong></li><li>Verwendeter Referenzpreis: <strong>${euro(o.reference)}</strong></li><li>Abstand zur Referenz: <strong>${o.discount}%</strong></li><li>Datenabdeckung: <strong>${o.dataPoints} von 5</strong> möglichen Preisfeldern</li><li>Eigene Historie: <strong>${historyText}</strong></li></ul><div class="source-box"><strong>Woher kommen die Daten?</strong><p>Die Kartendaten und verfügbaren Marktrichtwerte werden über TCGdex geladen. Je nach Karte können darin Cardmarket-Werte wie Tiefst-, Trend- oder Durchschnittspreise enthalten sein. Deine täglichen Aktualisierungen werden ausschließlich in diesem Browser gespeichert und als zusätzliche lokale Historie verwendet.</p></div><p class="hint">Nicht berücksichtigt werden garantiert abgeschlossene Verkäufe, Angebotsmenge, Verkäuferqualität, Versand, Gebühren sowie die genaue Sprache, Variante und der Zustand jedes Angebots. Prüfe deshalb vor einem Kauf immer die tatsächlichen Cardmarket-Angebote.</p>`;$('#scoreDialog').showModal()}
$('#scoreHelpBtn').onclick=()=>{$('#scoreExplanation').innerHTML=`<h2>So entsteht der Chancen-Score</h2><p>Der Wert von 0 bis 100 zeigt, wie auffällig günstig eine Karte innerhalb der verfügbaren Daten erscheint.</p><ul class="explain-list"><li><strong>0–34:</strong> schwaches oder unzureichendes Signal</li><li><strong>35–64:</strong> beobachten und genauer prüfen</li><li><strong>65–100:</strong> auffällig günstig gegenüber den Referenzwerten</li></ul><h3>Einbezogene Faktoren</h3><ul class="explain-list"><li>Abstand des niedrigsten verfügbaren Preises zum Trend- oder 30-Tage-Wert</li><li>Abstand zu deinen zuvor lokal gespeicherten Preisständen</li><li>Vollständigkeit der verfügbaren Preisfelder</li></ul><div class="source-box"><strong>Datenquellen</strong><p>TCGdex liefert Karteninformationen und – sofern vorhanden – aggregierte Marktrichtwerte, teilweise mit Cardmarket-Bezug. Die App speichert bei jeder Aktualisierung zusätzlich einen lokalen Tagesstand in deinem Browser.</p></div><p class="hint">Der Score misst Preisauffälligkeit. Er kennt weder zukünftige Nachfrage noch sichere Verkaufspreise und ist keine Anlageberatung.</p>`;$('#scoreDialog').showModal()};
renderMarketWatchlist();
