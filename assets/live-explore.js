/* EARTHSCOPE 4.5 · Live Voice Explore & Instant Source Dossier.
 * All values displayed here come from provider responses or explicitly labelled estimates.
 * Browser microphone access requires HTTPS/localhost and user permission. Speech playback is click-only.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.EARTHSCOPE_CONFIG || {apiBase:'api.php',aiConfigured:false};
  const apiBase = cfg.apiBase || 'api.php';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v,d=1) => Number.isFinite(Number(v)) ? Number(v).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d}) : '—';
  const dateText = v => { if(!v) return 'time not supplied'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString(); };
  const setText = (id,v) => { const n=$(id); if(n)n.textContent=String(v??''); };
  let liveRecognition=null, liveListening=false, liveRestartTimer=null, liveProcessTimer=null, liveFinalBuffer='', voiceSequence=0, lastSpeechButton=null, speechUtterance=null;
  let liveVoiceBusy=false, liveVoiceQueue=[];
  let lastReport=null;

  function weatherCodeName(code){
    const c=Number(code);
    const map={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Depositing rime fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',71:'Slight snow',73:'Moderate snow',75:'Heavy snow',80:'Rain showers',81:'Moderate showers',82:'Violent showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Severe hail thunderstorm'};
    return map[c] || `Weather code ${Number.isFinite(c)?c:'—'}`;
  }

  async function request(action, params={}, body=null, timeoutMs=8000){
    const u=new URL(apiBase,location.href);u.searchParams.set('action',action);
    Object.entries(params||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));});
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const options={method:body?'POST':'GET',headers:{Accept:'application/json'},signal:controller.signal};
    if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
    try{
      const response=await fetch(u.toString(),options);let result;
      try{result=await response.json();}catch(_){throw new Error(`The server returned non-JSON for ${action} (HTTP ${response.status}).`);}
      if(!response.ok||result.ok===false){const e=new Error(result.error||`${action} failed (HTTP ${response.status}).`);e.status=response.status;e.payload=result;throw e;}
      return result;
    }catch(e){if(e.name==='AbortError')throw new Error(`${action} request timed out after ${Math.round(timeoutMs/1000)}s.`);throw e;}
    finally{clearTimeout(timer);}
  }

  function resultData(r){return r?.data?.data || r?.data || r || {};}
  function getBridge(){return window.EARTHSCOPE_BRIDGE||null;}

  function ensureCommandBar(){
    const dialog=$('live-explore-dialog');
    const statusEl=$('live-explore-status');
    if(!dialog||!statusEl||$('live-explore-commandbar'))return;
    const bar=document.createElement('div');
    bar.id='live-explore-commandbar';
    bar.className='live-explore-commandbar';
    bar.style.cssText='padding:12px 20px;background:rgba(15,23,42,0.06);border-bottom:1px solid rgba(148,163,184,0.22);display:flex;flex-direction:column;gap:8px;';
    bar.innerHTML=`
      <form id="live-explore-search-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input type="search" id="live-explore-query-input" placeholder="Speak or type any place, hazard or recipe (e.g. Biratnagar, floods in Nepal, potato recipe)…" style="flex:1;min-width:220px;padding:9px 13px;border-radius:10px;border:1px solid rgba(148,163,184,0.38);background:var(--surface,#fff);color:var(--text,#0f172a);font:inherit;font-size:0.92rem;" />
        <button type="submit" class="live-action-button" id="live-explore-submit-btn" style="background:#0284c7;color:#fff;border:none;padding:9px 16px;border-radius:10px;font-weight:600;cursor:pointer;">Explore Now ↗</button>
        <button type="button" class="live-action-button secondary" id="live-explore-mic-toggle" style="padding:9px 14px;border-radius:10px;cursor:pointer;">🎙 Voice Listen</button>
      </form>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:0.78rem;">
        <span style="opacity:0.75;font-weight:600;">QUICK DOSSIERS:</span>
        <button type="button" class="live-quick-chip" data-live-quick="current" style="padding:4px 10px;border-radius:999px;border:1px solid rgba(14,165,233,0.4);background:rgba(14,165,233,0.1);color:inherit;cursor:pointer;">📍 Current Map Pin</button>
        <button type="button" class="live-quick-chip" data-live-quick="Biratnagar" style="padding:4px 10px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:transparent;color:inherit;cursor:pointer;">🏙️ Biratnagar</button>
        <button type="button" class="live-quick-chip" data-live-quick="where are floods reported in Nepal" style="padding:4px 10px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:transparent;color:inherit;cursor:pointer;">🌊 Floods in Nepal</button>
        <button type="button" class="live-quick-chip" data-live-quick="Kathmandu" style="padding:4px 10px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:transparent;color:inherit;cursor:pointer;">🏔️ Kathmandu</button>
        <button type="button" class="live-quick-chip" data-live-quick="Bangalore" style="padding:4px 10px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:transparent;color:inherit;cursor:pointer;">🌆 Bangalore</button>
        <button type="button" class="live-quick-chip" data-live-quick="find a recipe with potatoes and spinach" style="padding:4px 10px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:transparent;color:inherit;cursor:pointer;">🥔 Potato Recipe</button>
      </div>
    `;
    statusEl.insertAdjacentElement('afterend', bar);

    bar.querySelector('#live-explore-search-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const val = String($('live-explore-query-input')?.value || '').trim();
      if (val) runLiveQuery(val, 'typed');
    });

    bar.querySelector('#live-explore-mic-toggle')?.addEventListener('click', () => {
      if (liveListening) stopLiveVoice();
      else startLiveVoice();
    });

    bar.querySelectorAll('[data-live-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-live-quick');
        if (q === 'current') {
          const sel = getBridge()?.getSelectedPlace?.();
          const target = sel?.name && sel.name !== 'Global view' ? sel.name : 'Biratnagar, Nepal';
          if ($('live-explore-query-input')) $('live-explore-query-input').value = target;
          runLiveQuery(target, 'typed');
        } else if (q) {
          if ($('live-explore-query-input')) $('live-explore-query-input').value = q;
          runLiveQuery(q, 'typed');
        }
      });
    });
  }

  function openExplorerModal(title, subtitle=''){
    const back=$('live-explore-backdrop');if(!back)return;
    ensureCommandBar();
    back.hidden=false;document.body.classList.add('live-explore-open');
    setText('live-explore-title',title||'Live Explore');
    setText('live-explore-subtitle',subtitle||'Source-grounded map intelligence and printable results.');
  }

  function showModal(title,subtitle=''){
    openExplorerModal(title,subtitle);
    setText('live-explore-status','Resolving intent and requesting available public data…');
    $('live-explore-content').innerHTML='<div class="live-loading"><span class="live-spinner"></span><b>Working across live data sources</b><p>Fetching live weather, air quality, hazards, flood models and news (completes in ~2–5 seconds)…</p></div>';
  }

  function closeModal(){const back=$('live-explore-backdrop');if(back)back.hidden=true;document.body.classList.remove('live-explore-open');}
  function openMap(){getBridge()?.showPanel?.('explore');}

  function chatBubble(role,text,meta=''){
    const box=$('assistant-messages');if(!box)return null;
    const item=document.createElement('div');item.className=`assistant-message ${role==='user'?'user':'assistant'}`;
    const small=document.createElement('small');small.textContent=role==='user'?'YOU':`EARTHSCOPE LIVE EXPLORER${meta?' · '+meta:''}`;
    const p=document.createElement('p');p.textContent=String(text||'');item.append(small,p);box.appendChild(item);box.scrollTop=box.scrollHeight;return item;
  }

  function attachChatListeners(){
    const box=$('assistant-messages');if(!box)return;
    const attach=msg=>{
      if(!msg?.classList?.contains('assistant')||msg.querySelector('.assistant-listen-control'))return;
      const p=msg.querySelector('p');if(!p)return;const text=(p.textContent||'').trim();
      if(!text||/^(Resolving place and checking source context|Connecting the question|Resolving place|Searching|Loading|Preparing the source-grounded answer)/i.test(text))return;
      const tools=document.createElement('div');tools.className='assistant-message-tools';
      const listen=document.createElement('button');listen.type='button';listen.className='assistant-listen-control';listen.textContent='▶ Listen';listen.setAttribute('aria-label','Play this answer aloud');listen.title='Only plays when you click this button';
      listen.addEventListener('click',()=>{
        const value=(msg.querySelector('p')?.textContent||'').trim();if(!value)return;
        if(!('speechSynthesis'in window)||!window.SpeechSynthesisUtterance){announce('Speech playback is unavailable in this browser.');return;}
        if(lastSpeechButton===listen){stopSpeech();return;}
        stopSpeech();const utterance=new SpeechSynthesisUtterance(value.slice(0,6000));utterance.lang=$('assistant-language')?.value||'en-US';utterance.rate=.96;
        const voices=window.speechSynthesis.getVoices();const primary=utterance.lang.toLowerCase().split('-')[0];const match=voices.find(v=>v.lang?.toLowerCase()===utterance.lang.toLowerCase())||voices.find(v=>v.lang?.toLowerCase().startsWith(primary));if(match)utterance.voice=match;
        lastSpeechButton=listen;speechUtterance=utterance;listen.textContent='■ Stop';listen.classList.add('is-speaking');
        utterance.onend=utterance.onerror=()=>{if(lastSpeechButton===listen){listen.textContent='▶ Listen';listen.classList.remove('is-speaking');lastSpeechButton=null;speechUtterance=null;}};
        window.speechSynthesis.speak(utterance);
      });
      tools.appendChild(listen);msg.appendChild(tools);
    };
    box.querySelectorAll('.assistant-message.assistant').forEach(attach);
    if(!box.dataset.listenObserver){const observer=new MutationObserver(records=>records.forEach(record=>{
      if(record.type==='childList')record.addedNodes.forEach(node=>{if(node.nodeType===1){if(node.matches?.('.assistant-message.assistant'))attach(node);node.querySelectorAll?.('.assistant-message.assistant').forEach(attach);}});
      let node=record.target?.nodeType===1?record.target:record.target?.parentElement;const msg=node?.closest?.('.assistant-message.assistant');if(msg)attach(msg);
    }));observer.observe(box,{subtree:true,childList:true,characterData:true});box.dataset.listenObserver='1';}
  }

  function stopSpeech(){if('speechSynthesis'in window)window.speechSynthesis.cancel();if(lastSpeechButton){lastSpeechButton.textContent='▶ Listen';lastSpeechButton.classList.remove('is-speaking');}lastSpeechButton=null;speechUtterance=null;}
  function announce(text){const live=$('live-explore-status');if(live)live.textContent=text;else console.info(text);}
  function haversine(a,b){const rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dn=(b.lon-a.lon)*rad,h=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));}
  function featurePoint(feature){
    const c=feature?.geometry?.coordinates;if(!c)return null;const type=feature.geometry.type;
    if(type==='Point'&&c.length>=2)return {lon:Number(c[0]),lat:Number(c[1])};
    let node=c;while(Array.isArray(node)&&node.length){if(typeof node[0]==='number'&&typeof node[1]==='number')return {lon:Number(node[0]),lat:Number(node[1])};node=node[0];}
    return null;
  }

  const countryBounds={
    nepal:[[80.0,26.3],[88.2,30.5]],
    india:[[68.1,6.4],[97.4,35.8]],
    bangladesh:[[88.0,20.6],[92.7,26.7]],
    bhutan:[[88.7,26.6],[92.2,28.4]],
    sri_lanka:[[79.4,5.8],[82.1,10.1]]
  };
  const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
  function guessedRegionBounds(query){const q=norm(query).replace(/\s/g,'_');for(const [k,b] of Object.entries(countryBounds))if(q===k||q.includes(k))return b;return null;}
  function coordinatesFromText(query){const m=String(query).trim().match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);if(!m)return null;const a=Number(m[1]),b=Number(m[2]);if(Math.abs(a)<=90&&Math.abs(b)<=180)return {lat:a,lon:b,name:`Coordinates ${a}, ${b}`};return null;}

  function candidateFromQuestion(question,kind='place'){
    let q=String(question||'').trim();if(!q)return '';
    const coords=coordinatesFromText(q);if(coords)return q;
    const countryAliases=[[/\bnepal\b|(?:नेपाल|नेपालमा|नेपाली)/iu,'Nepal'],[/\bindia\b|(?:भारत|भारतमा|इंडिया)/iu,'India'],[/\bbangladesh\b|(?:बंगलादेश|बङ्गलादेश)/iu,'Bangladesh'],[/\bbhutan\b|भुटान/iu,'Bhutan'],[/\bsri lanka\b|श्रीलंका/iu,'Sri Lanka']];
    if(kind==='disaster'){for(const [re,name] of countryAliases)if(re.test(q))return name;}
    const stopWords=/\b(?:currently|right now|today|tomorrow|yesterday|weather|forecast|news|information|info|details|map|pin|place|location|flood|floods|earthquake|earthquakes|landslide|landslides|wildfire|wildfires|cyclone|storm|storms|disaster|disasters|rain|rainfall|happening|coming|occur|occuring|occurring|are|is|was|were|where|what|whats|what's|tell|show|open|please|can|could|you|me|to|the|in|near|around|over|at|about|of|for|on|all|current|local)\b.*$/iu;
    if(kind==='disaster'||/\b(?:in|near|around|over|within)\b/iu.test(q)){
      const matches=[...q.matchAll(/\b(?:in|near|around|over|within|at)\s+([\p{L}\p{M}][\p{L}\p{M}.'’\-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}.'’\-]*){0,3})/giu)];
      if(matches.length){let c=matches[matches.length-1][1].replace(stopWords,'').trim();c=c.replace(/\s+(?:today|currently|right now|this week|this month)$/iu,'').trim();if(c.length>=2)return c;}
    }
    q=q.replace(/^(?:please\s+)?(?:open|show|find|locate|pin|navigate to|go to|take me to|zoom to|zoom into|take me|tell me about|tell me|give me information about|information about|where is|where's|what is|what's|what are|who is|learn about|explore|search for)\s+/iu,'').trim();
    q=q.replace(/^(?:the\s+)?(?:place|city|town|country|location)\s+/iu,'').trim();
    q=q.replace(/\s+(?:please|on the map|on map|on the globe|in the map)$/iu,'').trim();
    q=q.replace(stopWords,'').trim();
    if(q.split(/\s+/u).length>4)q=q.split(/\s+/u).slice(0,4).join(' ');
    return q.length>=2?q:'';
  }

  function classifyQuery(question,forcePlace=false){
    const q=String(question||'').trim();
    if(/\b(?:flood|floods|inundation|earthquake|earthquakes|landslide|landslides|wildfire|wildfires|forest fire|cyclone|typhoon|hurricane|storm|storms|drought|volcano|volcanic eruption|tsunami|disaster|hazard|river level|flash flood|pandemic|disease outbreak|badh|pahiro|bhukampa)\b|(?:बाढी|बाढ़|पहिरो|भूस्खलन|भूकम्प|भूकंप|डुबान|चक्रवात|तूफान|जंगलको आगो|जंगल की आग|सुख्खा|सूखा)/iu.test(q))return 'disaster';
    if(/\b(?:recipe|recipes|cook|cooking|food|foods|eat|eating|dish|meal|meals|snack|snacks|ingredients|what can i make|what should i eat|random dish|random meal|nutritious|healthy meal|healthy food|khana|khane|khau|pakau|parikar)\b|(?:खाना|भोजन|रेसिपी|पकाना|खाऊँ|खान|परिकार|स्वस्थ खाना|क्या खाऊँ|के बनाउने|फलफूल|सब्जी)/iu.test(q))return 'food';
    if(forcePlace)return 'place';
    if(/\b(?:open|go to|take me to|navigate to|zoom to|zoom into|pin|locate|show me|what'?s happening|what is happening|where is|tell me about|current(?:ly)? in|news near|latest news in)\b/i.test(q))return 'place';
    if(q.length<=60&&!/[?]/.test(q)&&!/^\s*(?:why|how|explain|define|compare|calculate|write|make|build|what is|who is|when|which)\b/i.test(q)&&q.split(/\s+/).length<=4)return 'place';
    return 'chat';
  }

  function extractIngredients(question){
    const q=String(question||'').trim();
    const m=q.match(/\b(?:with|using|from|ingredients?\s*(?::|are|include)?|i have|we have)\s+(.+?)(?=\s+(?:under|within|for under|budget|cost|in my area|near me|near\s+[A-Z]|vegan|vegetarian|gluten.free|dairy.free|keto|healthy|quick|fast|random)\b|$)/iu);
    if(m){const candidate=m[1].replace(/[?.!]+$/,'').trim();if(candidate.length>=2)return candidate.slice(0,240);}
    const direct=q.replace(/^(?:please\s+)?(?:find|show|give me|suggest|make|cook|generate|recommend)?\s*(?:a|an)?\s*(?:real\s+)?(?:food|recipe|recipes|dish|meal|snack|healthy meal|healthy food)?\s*(?:from|with|using)?\s*/iu,'').replace(/\b(?:recipe|recipes|please|for me|to cook|cook something|healthy|quick|easy|under \S+)\b/giu,' ').trim();
    return direct.length>=3?direct.slice(0,240):'';
  }

  function isRandomFood(q,ingredients){return !ingredients||/\b(?:random|surprise me|surprise dish|anything|whatever|any food|any meal)\b/i.test(q);}
  function safeURL(v){try{const u=new URL(String(v||''),location.href);return u.protocol==='https:'?u.href:'';}catch(_){return '';}}
  function asList(v){if(Array.isArray(v))return v.filter(x=>x!==null&&x!==undefined).map(x=>typeof x==='string'?x:(x.name||x.ingredient||JSON.stringify(x)));if(typeof v==='string')return v.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);return [];}
  function getRecipeInstructions(r){let v=r.instructions||r.preparation||r.steps||r.method||r.strInstructions||[];if(Array.isArray(v))return v.map(x=>typeof x==='string'?x:(x.text||x.step||'')).filter(Boolean);if(typeof v==='string')return v.split(/\r?\n|(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);return [];}
  function getRecipeTitle(r){return r.title||r.name||r.recipe_name||r.strMeal||'Recipe from provider';}
  function getRecipeImage(r){return safeURL(r.image_url||r.image||r.strMealThumb||r.thumbnail||'');}

  function renderRecipeReport(question,recipes,meta,ingredients){
    const title=recipes.length===1?getRecipeTitle(recipes[0]):'Live recipe results';
    const content=$('live-explore-content');
    const provider=meta?.provider||meta?.source||'Live recipe API';
    let cards=recipes.map((r,i)=>{
      const image=getRecipeImage(r),title=getRecipeTitle(r),src=safeURL(r.source_url||r.source||r.strSource||meta?.source_url||'');
      const ing=asList(r.ingredients).slice(0,16);
      const instr=getRecipeInstructions(r).slice(0,7);
      return `<article class="live-recipe-card ${i===0?'primary-recipe':''}">${image?`<img class="live-recipe-image" src="${esc(image)}" alt="Photograph of ${esc(title)}" loading="lazy">`:'<div class="live-recipe-no-image">Provider did not supply an image</div>'}<div class="live-recipe-body"><div class="live-card-kicker">${esc([r.cuisine||r.strArea,r.category||r.strCategory].filter(Boolean).join(' · ')||'Live provider record')}</div><h2>${esc(title)}</h2>${ing.length?`<h3>Ingredients</h3><ul>${ing.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${instr.length?`<h3>Preparation</h3><ol>${instr.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:'<p>Provider supplied no structured preparation steps. Open its source record before using.</p>'}${r.nutrition?`<div class="live-nutrition">Nutrition returned by provider: ${esc(JSON.stringify(r.nutrition))}</div>`:''}<div class="live-recipe-links">${src?`<a href="${esc(src)}" target="_blank" rel="noopener">Original recipe ↗</a>`:''}${r.image_credit?`<span>Image: ${esc(r.image_credit)}</span>`:''}</div></div></article>`;
    }).join('');
    content.innerHTML=`<div class="live-report-hero"><div><div class="live-explore-eyebrow">REAL RECIPE RECORDS · NOT A PRESET RECIPE</div><h2>${esc(title)}</h2><p>Request: ${esc(question)}${ingredients?`<br>Ingredient query: ${esc(ingredients)}`:''}</p></div><div class="live-hero-stamp">${esc(provider)}</div></div><div class="live-source-strip"><span>Provider: ${esc(provider)}</span><span>Retrieved: ${esc(dateText(meta?.retrieved_at||meta?.fetched_at))}</span><span>Results returned: ${recipes.length}</span></div>${cards}<div class="live-caveat"><b>Recipe evidence and safety</b><p>Recipes, ingredients, instructions and images are shown from the provider when supplied. Confirm allergens and cross-contact yourself.</p>${meta?.note?`<p>${esc(meta.note)}</p>`:''}${meta?.source_url?`<a href="${esc(safeURL(meta.source_url)||'https://www.themealdb.com/api.php')}" target="_blank" rel="noopener">Recipe provider ↗</a>`:''}</div>`;
    setText('live-explore-title','Food Studio · live recipe search');setText('live-explore-subtitle','Provider-backed recipes with ingredients, instructions, attribution and print layout.');setText('live-explore-status',recipes.length?`${recipes.length} live recipe record${recipes.length===1?'':'s'} returned.`:'No recipe records returned.');
    lastReport={type:'food',title:question,recipes,meta,ingredients};
  }

  async function runFoodQuery(question,sequence){
    const ingredients=extractIngredients(question);const random=isRandomFood(question,ingredients);const query=random?'surprise meal':ingredients||String(question).trim().slice(0,200);
    let result,meta,items=[];
    try{
      const body=random?{tool:'recipe',mode:'title',query,random:true}:{tool:'recipe',mode:'ingredients',query};
      result=await request('api-ninjas',{},body,12000);meta=resultData(result);items=meta.result;if(items&&!Array.isArray(items))items=[items];if(!Array.isArray(items))items=[];
    }catch(first){
      if(!random){
        try{result=await request('api-ninjas',{}, {tool:'recipe',mode:'title',query:ingredients||query,random:false},10000);meta=resultData(result);items=meta.result;if(items&&!Array.isArray(items))items=[items];if(!Array.isArray(items))items=[];}
        catch(second){throw new Error(`Live recipe search failed. Ingredient search: ${first.message}; title fallback: ${second.message}`);}
      }else throw first;
    }
    if(sequence!==voiceSequence)return;
    if(!items.length)throw new Error('The recipe provider returned zero actual records. Try one specific ingredient or dish name.');
    renderRecipeReport(question,items.slice(0,5),meta,ingredients);
    const summary=`Live recipe search returned ${items.length} result(s) from ${meta.provider||'a recipe provider'}. First result: ${getRecipeTitle(items[0])}.`;
    chatBubble('assistant',summary,meta.provider||'LIVE RECIPE');
  }

  function extractRegionForPlace(question,kind){
    const coordinate=coordinatesFromText(question);if(coordinate)return {query:question,coordinate};
    const cleaned=candidateFromQuestion(question,kind);
    if(cleaned)return {query:cleaned,coordinate:null};
    const current=getBridge()?.getSelectedPlace?.();if(current&&Number.isFinite(Number(current.lat))&&Number.isFinite(Number(current.lon)))return {query:current.name,coordinate:{lat:Number(current.lat),lon:Number(current.lon),name:current.name},current:true};
    return {query:'Biratnagar, Nepal',coordinate:{lat:26.4525,lon:87.2718,name:'Biratnagar, Nepal'},current:true};
  }

  function hitScore(query,hit){const q=norm(query),name=norm(hit.name),display=norm(hit.display_name);let score=0;if(name===q)score+=100;if(display===q)score+=85;if(name.startsWith(q))score+=45;if(display.startsWith(q))score+=25;if(norm(hit.type).includes('country')&&q===norm(hit.country))score+=30;if(display.includes(q))score+=10;return score;}
  async function geocodeQuery(query){
    const coords=coordinatesFromText(query);if(coords)return {name:coords.name,lat:coords.lat,lon:coords.lon,display_name:coords.name,type:'coordinate',country:'',extent:null,source:'user-entered coordinates'};
    const result=await request('geocode',{q:query},null,8500);
    const hits=Array.isArray(resultData(result))?resultData(result):[];
    if(!hits.length)throw new Error(`No place result was returned for “${query}”. Please say or type a more specific town, city, district or country.`);
    return [...hits].sort((a,b)=>hitScore(query,b)-hitScore(query,a))[0];
  }

  function convertExtent(extent){if(Array.isArray(extent)&&extent.length>=4&&extent.every(v=>Number.isFinite(Number(v)))){const [w,s,e,n]=extent.map(Number);if(e>w&&n>s)return [[w,s],[e,n]];}if(extent&&typeof extent==='object'){const w=Number(extent.west??extent.minLon??extent.xmin),s=Number(extent.south??extent.minLat??extent.ymin),e=Number(extent.east??extent.maxLon??extent.xmax),n=Number(extent.north??extent.maxLat??extent.ymax);if([w,s,e,n].every(Number.isFinite)&&e>w&&n>s)return [[w,s],[e,n]];}return null;}

  async function pinPlace(hit,query){
    const name=hit.display_name||hit.name||query;const extent=convertExtent(hit.extent)||guessedRegionBounds(query);let zoom=extent?undefined:(/country|state|region|administrative/i.test(String(hit.type||''))?5.1:10.5);
    const bridge=getBridge();
    if(bridge?.goToPlace){
      bridge.showPanel?.('explore');
      bridge.goToPlace(Number(hit.lon),Number(hit.lat),name,{bounds:extent,zoom});
    }
    return {name,shortName:String(query||hit.name||name).split(',')[0].trim(),queryName:String(query||hit.name||name),lat:Number(hit.lat),lon:Number(hit.lon),country:hit.country||'',type:hit.type||'',extent,source:hit.source||'Photon / OpenStreetMap'};
  }

  function inBounds(point,bounds){if(!bounds)return false;const [[w,s],[e,n]]=bounds;return point.lon>=w&&point.lon<=e&&point.lat>=s&&point.lat<=n;}
  function localFeatures(features,place,radiusKm,bounds=null){return (Array.isArray(features)?features:[]).map(f=>{const point=featurePoint(f);if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return null;const dist=haversine({lat:place.lat,lon:place.lon},point);return {feature:f,point,dist,properties:f.properties||{}};}).filter(x=>x&&(bounds?inBounds(x.point,bounds):x.dist<=radiusKm)).sort((a,b)=>a.dist-b.dist);}
  function isFloodRecord(x){const p=x?.properties||{};return /\b(?:FL|FLOOD|FLOODS|FLOODING)\b/i.test(`${p.eventtype||''} ${p.eventType||''} ${p.title||''} ${p.name||''} ${p.description||''} ${p.category||''}`)||p.is_flood===true;}
  function sourceLink(url,fallback){return safeURL(url)||fallback;}
  function weatherDetails(result){const d=resultData(result),c=d.current||{};const daily=d.daily||{};return {d,c,daily};}
  function aqiDetails(result){const d=resultData(result),c=d.current||{};return {d,c};}
  function soilLayers(result){const d=resultData(result);const props=d.properties||d.data?.properties||{};const layers=props.layers||props.properties||d.layers||[];return Array.isArray(layers)?layers:[];}
  function soilSummary(result){const layers=soilLayers(result);if(!layers.length)return {lines:[],raw:result?.error||'No readable SoilGrids property layers were returned for this point.'};const labels={phh2o:'Soil pH (water)',clay:'Clay fraction',soc:'Soil organic carbon',nitrogen:'Nitrogen'};const lines=[];layers.forEach(layer=>{const depth=layer.depths?.find(x=>x.label==='0-5cm')||layer.depths?.[0];const raw=depth?.values?.mean??depth?.values?.Q0_5??null;if(raw===null||raw===undefined)return;const units=layer.unit_measure?.expression||layer.unit_measure?.unit||'';let value=Number(raw);if(!Number.isFinite(value))return;if(layer.name==='phh2o'&&value>14)value/=10;lines.push({label:labels[layer.name]||layer.name||'Soil property',value:num(value,layer.name==='phh2o'?1:2),unit:units,depth:depth?.label||'depth not supplied'});});return {lines,raw:result?.note||'Global gridded soil prediction, not a sample from the exact field.'};}
  function climateSummary(result){const d=resultData(result),daily=d.daily||{},dates=daily.time||[],temps=daily.temperature_2m_mean||[],rain=daily.precipitation_sum||[];const t=temps.map(Number).filter(Number.isFinite),r=rain.map(Number).filter(Number.isFinite);return {period:dates.length?`${dates[0]} to ${dates[dates.length-1]}`:'period not supplied',days:dates.length,meanTemp:t.length?num(t.reduce((a,b)=>a+b,0)/t.length,1)+' °C':'unavailable',rainTotal:r.length?num(r.reduce((a,b)=>a+b,0),0)+' mm total across returned daily records':'unavailable',note:d.note||'Historical grid data, not an on-site weather station.'};}
  function floodSummary(result){const d=resultData(result),daily=d.daily||{},times=daily.time||[],vals=daily.river_discharge||[],means=daily.river_discharge_mean||[],maxs=daily.river_discharge_max||[];const rows=times.map((time,i)=>({time,value:Number(vals[i]),mean:Number(means[i]),max:Number(maxs[i])})).filter(x=>Number.isFinite(x.value));const next=rows.filter(x=>x.time>=new Date().toISOString().slice(0,10)).slice(0,7);const peak=next.length?next.reduce((a,b)=>b.value>a.value?b:a,next[0]):null;return {rows:next,peak,unit:d.daily_units?.river_discharge||'m³/s',source:d.source||'Open-Meteo / GloFAS',note:d.note||'Modelled river discharge is not an official flood warning.'};}
  function dataValueCard(label,value,sub='',status='source'){return `<article class="live-data-card"><span class="live-card-kicker">${esc(label)}</span><b>${esc(value||'—')}</b><small>${esc(sub||'Provider did not supply this field.')}</small><span class="live-data-badge">${esc(status)}</span></article>`;}
  function section(title,body,sourceName='',sourceUrl='',retrieved=''){return `<section class="live-report-section"><div class="live-section-head"><h2>${esc(title)}</h2>${retrieved?`<small>Retrieved ${esc(dateText(retrieved))}</small>`:''}</div>${body||'<p class="live-no-data">No records returned for this section. That does not establish that the condition or feature is absent.</p>'}${sourceUrl?`<p class="live-source-line">Source: <a href="${esc(sourceLink(sourceUrl,'https://www.nasa.gov/'))}" target="_blank" rel="noopener">${esc(sourceName||sourceUrl)} ↗</a></p>`:''}</section>`;}
  function articleList(records,empty,limit=6){if(!records?.length)return `<p class="live-no-data">${esc(empty)}</p>`;return `<div class="live-article-list">${records.slice(0,limit).map(a=>`<article class="live-article"><a href="${esc(sourceLink(a.url,'https://www.gdeltproject.org/'))}" target="_blank" rel="noopener">${esc(a.title||a.properties?.title||a.properties?.name||'Open source record')} ↗</a><small>${esc(a.domain||a.properties?.source||'Source')} · ${esc(dateText(a.seendate||a.properties?.fromdate||a.properties?.time||a.date))}</small>${a.properties?.alertlevel?`<span class="alert-pill">${esc(String(a.properties.alertlevel).toUpperCase())} · ${esc(a.properties.eventtype||'Hazard')}</span>`:''}${a.dist!==undefined?`<small>${num(a.dist,0)} km from selected point</small>`:''}</article>`).join('')}</div>`;}
  function describeNews(news){const d=resultData(news);return {records:d.articles||[],source:d.source||'GDELT / Google News RSS',url:d.source_url||'https://www.gdeltproject.org/',note:d.note||'',retrieved:d.retrieved_at||news?.fetched_at};}
  function describeEvents(result,place,radius,bounds,type='event'){
    const d=resultData(result);const fs=d.features||[];let filtered=localFeatures(fs,place,radius,bounds);
    if(type==='flood')filtered=filtered.filter(isFloodRecord);return {items:filtered,source:d.source||'Public event feed',url:d.source_url||'https://www.gdacs.org/',retrieved:d.retrieved_at||result?.fetched_at,note:d.note||''};
  }

  function localDeterministicSummary(place,packed){
    const weather=packed.weather?.data?.current||{},aqi=packed.aqi?.data?.current||{};const floods=packed.floodEvents?.items||[];const hazards=packed.disasterEvents?.items||[];const earthquakes=packed.quakes?.items||[];const news=packed.news?.records||[];
    const parts=[`${place.name} is pinned at ${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}.`,weather.temperature_2m!==undefined?`Weather model currently reports ${num(weather.temperature_2m,1)} °C, ${weather.relative_humidity_2m!==undefined?num(weather.relative_humidity_2m,0)+'% humidity':'humidity unavailable'}, and ${weather.wind_speed_10m!==undefined?num(weather.wind_speed_10m,1)+' km/h wind':'wind unavailable'}.`:'No current weather model record was returned.',aqi.us_aqi!==undefined||aqi.european_aqi!==undefined?`Air-quality model reports ${aqi.us_aqi!==undefined?'US AQI '+num(aqi.us_aqi,0):''}${aqi.us_aqi!==undefined&&aqi.european_aqi!==undefined?' / ':''}${aqi.european_aqi!==undefined?'European AQI '+num(aqi.european_aqi,0):''}.`:'No AQI record was returned.',`Recent records in the requested search window: ${floods.length} flood-matching record(s), ${hazards.length} regional disaster/event record(s), and ${earthquakes.length} regional earthquake record(s) returned by queried feeds. ${news.length} recent news-index article(s) matched the place query.`,'Counts describe returned source records for the stated query and geographic filter; they are not a completeness guarantee or a prediction.'];
    return parts.join(' ');
  }

  async function getPlaceData(place,question,queryType,sequence){
    const regionBounds=place.extent||guessedRegionBounds(question)||guessedRegionBounds(place.name);
    const knownCountry=/^(?:nepal|india|bangladesh|bhutan|sri lanka)$/i.test(String(question||'').trim())||/country/i.test(place.type);
    const radius=knownCountry?600:250;
    const shortPlace=String(place.shortName||place.queryName||place.name||'').split(',')[0].trim();const newsQuery=[shortPlace,place.country].filter((v,i,a)=>v&&a.findIndex(x=>String(x).toLowerCase()===String(v).toLowerCase())===i).join(', ').slice(0,115);
    setText('live-explore-status',`Pinned ${place.name}. Loading live weather, AQI, soil, climate, river discharge, hazards and news in parallel…`);
    const tasks={
      weather:request('weather',{lat:place.lat,lon:place.lon},null,6500),
      aqi:request('air-quality',{lat:place.lat,lon:place.lon},null,6500),
      soil:request('soil',{lat:place.lat,lon:place.lon},null,5500),
      climate:request('climate-history',{lat:place.lat,lon:place.lon,refresh:''},null,6500),
      floodModel:request('flood-forecast',{lat:place.lat,lon:place.lon},null,6500),
      disasters:request('disasters',{days:30},null,6500),
      eonet:request('events',{},null,6500),
      earthquakes:request('earthquakes',{},null,6500),
      news:request('news',{q:newsQuery},null,6000)
    };
    const names=Object.keys(tasks),settled=await Promise.allSettled(Object.values(tasks));if(sequence!==voiceSequence)return null;
    const packed={};names.forEach((name,i)=>{if(settled[i].status==='fulfilled')packed[name]=settled[i].value;else packed[name]={error:settled[i].reason?.message||'Provider failed'};});
    const disasterEvents=packed.disasters&&!packed.disasters.error?describeEvents(packed.disasters,place,radius,regionBounds,'event'):{items:[],source:'GDACS',url:'https://www.gdacs.org/',note:packed.disasters?.error||'Feed not available'};
    const floodEvents=packed.disasters&&!packed.disasters.error?describeEvents(packed.disasters,place,radius,regionBounds,'flood'):{items:[],source:'GDACS',url:'https://www.gdacs.org/',note:packed.disasters?.error||'Feed not available'};
    const eonetAll=packed.eonet&&!packed.eonet.error?describeEvents(packed.eonet,place,radius,regionBounds,'event'):{items:[],source:'NASA EONET',url:'https://eonet.gsfc.nasa.gov/',note:packed.eonet?.error||'Feed not available'};
    const eonetFlood=packed.eonet&&!packed.eonet.error?describeEvents(packed.eonet,place,radius,regionBounds,'flood'):{items:[],source:'NASA EONET',url:'https://eonet.gsfc.nasa.gov/',note:packed.eonet?.error||'Feed not available'};
    const quakes=packed.earthquakes&&!packed.earthquakes.error?describeEvents(packed.earthquakes,place,radius,regionBounds,'event'):{items:[],source:'USGS',url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',note:packed.earthquakes?.error||'Feed not available'};
    quakes.items=quakes.items.filter(x=>x.properties?.mag!==undefined||x.properties?.place||x.properties?.type==='earthquake');
    const news=describeNews(packed.news||{});packed.disasters=packed.disasters||{error:'No data'};packed.disasterEvents=disasterEvents;packed.floodEvents={...floodEvents,items:floodEvents.items};packed.eonetEvents=queryType==='flood'?eonetFlood:eonetAll;packed.eonetAllEvents=eonetAll;packed.quakes=quakes;packed.news=news;
    if(queryType==='flood')enableDisasterLayers('flood');else if(queryType==='disaster')enableDisasterLayers('all');
    const aiFacts=[];const w=packed.weather?.data||{},wc=w.current||{},aq=packed.aqi?.data||{},ac=aq.current||{};
    if(wc.temperature_2m!==undefined)aiFacts.push(`Open-Meteo current model: ${wc.temperature_2m} °C; relative humidity ${wc.relative_humidity_2m??'not supplied'}%; wind ${wc.wind_speed_10m??'not supplied'} km/h; model time ${wc.time||'not supplied'}.`);
    if(ac.us_aqi!==undefined||ac.european_aqi!==undefined)aiFacts.push(`Open-Meteo/CAMS AQI model: US AQI ${ac.us_aqi??'not supplied'}, European AQI ${ac.european_aqi??'not supplied'}, PM2.5 ${ac.pm2_5??'not supplied'} µg/m³.`);
    aiFacts.push(`GDACS returned ${disasterEvents.items.length} regional event record(s), including ${floodEvents.items.length} flood-matching record(s); NASA EONET returned ${eonetAll.items.length} regional natural-event record(s), including ${eonetFlood.items.length} flood-matching record(s); USGS last-day feed returned ${quakes.items.length} earthquake record(s) after the selected-region filter.`);
    aiFacts.push(`Local news index returned ${news.records.length} article(s) for query ${newsQuery}; these are headlines that mention the place, not proof that an event happened at that exact location.`);
    aiFacts.push(`Soil provider: ISRIC SoilGrids global gridded predictions at 0–5 cm if values are returned; not a local laboratory soil test.`);
    packed.sourceFacts=aiFacts;packed.place=place;packed.radius=radius;packed.regionBounds=regionBounds;
    const summary=localDeterministicSummary(place,packed);

    // Render the report IMMEDIATELY so the user never waits on AI latency!
    renderPlaceReport(question,packed,summary,'',queryType);
    chatBubble('assistant',[summary,`A source-linked ${queryType==='flood'?'flood and regional hazard':'place'} report is open in Live Explore and can be printed.`].join('\n\n'),'PUBLIC SOURCES');

    // Stream AI summary asynchronously into #live-ai-summary-box if OpenRouter is configured
    if(cfg.aiConfigured){
      request('assistant',{}, {question:`For the selected place ${place.name}, summarize the queried source records for this request: ${question}. Use only the data facts supplied below. Never infer safety from no alerts. State that flood discharge and weather are model output, news is an index, soil is gridded model data, and record counts are limited by geographic filtering. If a fact is missing say so.`,language:$('assistant-language')?.value||'en-US',context:{selected_place:place.name,coordinates:{lat:place.lat,lon:place.lon},weather_summary:summary,crop_screening:'Not requested',selected_event:'',source_facts:aiFacts}},18000)
        .then(ai=>{
          if(sequence!==voiceSequence)return;
          const aiSummary=String(ai?.answer||'').trim();
          const box=$('live-ai-summary-box');
          if(aiSummary && box){
            box.innerHTML=esc(aiSummary).replace(/\n/g,'<br>');
          }
        })
        .catch(()=>{});
    }
    return packed;
  }

  function enableDisasterLayers(type='all'){
    openMap();
    if(type==='flood'){
      const f=$('gdacs-event-filter');if(f){f.value='FL';f.dispatchEvent(new Event('change',{bubbles:true}));}
      const eonetFlood=$('layer-floods');if(eonetFlood){eonetFlood.checked=true;eonetFlood.dispatchEvent(new Event('change',{bubbles:true}));}
    }
    const g=$('layer-gdacs');if(g){g.checked=true;g.dispatchEvent(new Event('change',{bubbles:true}));}
    const q=$('layer-quakes');if(q&&type==='all'){q.checked=true;q.dispatchEvent(new Event('change',{bubbles:true}));}
    getBridge()?.setMapLayer?.('disasters',true);
  }

  function renderPlaceReport(question,p,summary,aiSummary,type){
    const place=p.place||{name:'Selected location',lat:26.4525,lon:87.2718};
    const weather=p.weather&&!p.weather.error?weatherDetails(p.weather):null;const aqi=p.aqi&&!p.aqi.error?aqiDetails(p.aqi):null;const soil=p.soil&&!p.soil.error?soilSummary(p.soil):null;const climate=p.climate&&!p.climate.error?climateSummary(p.climate):null;const flood=p.floodModel&&!p.floodModel.error?floodSummary(p.floodModel):null;
    const wc=weather?.c||{},ac=aqi?.c||{},daily=weather?.daily||{};const rain=(daily.precipitation_sum||[]).slice(0,7).reduce((sum,v)=>sum+(Number(v)||0),0);const maxDischarge=flood?.peak;
    const metrics=[dataValueCard('CURRENT WEATHER',wc.temperature_2m!==undefined?num(wc.temperature_2m,1)+' °C':'Unavailable',wc.weather_code!==undefined?weatherCodeName(wc.weather_code):'Open-Meteo model output',weather?'MODEL':'UNAVAILABLE'),dataValueCard('AIR QUALITY',ac.us_aqi!==undefined?'US AQI '+num(ac.us_aqi,0):ac.european_aqi!==undefined?'EU AQI '+num(ac.european_aqi,0):'Unavailable',ac.pm2_5!==undefined?'PM2.5 '+num(ac.pm2_5,1)+' µg/m³':'CAMS/Open-Meteo model',aqi?'MODEL':'UNAVAILABLE'),dataValueCard('NEXT 7 DAYS',Number.isFinite(rain)?num(rain,1)+' mm precip.':'Unavailable','Sum of returned 7-day precipitation forecast','FORECAST'),dataValueCard(type==='flood'?'FLOOD-MODEL PEAK':'RIVER DISCHARGE',maxDischarge?`${num(maxDischarge.value,1)} ${flood.unit}`:flood?'No value returned':'Unavailable',maxDischarge?`Peak among returned upcoming daily discharge values on ${maxDischarge.time}`:'Nearest model grid may not represent the selected river','MODEL')].join('');
    const weatherBody=weather?`<div class="live-fact-grid"><div><small>Temperature</small><b>${wc.temperature_2m!==undefined?num(wc.temperature_2m,1)+' °C':'—'}</b></div><div><small>Feels like</small><b>${wc.apparent_temperature!==undefined?num(wc.apparent_temperature,1)+' °C':'—'}</b></div><div><small>Humidity</small><b>${wc.relative_humidity_2m!==undefined?num(wc.relative_humidity_2m,0)+'%':'—'}</b></div><div><small>Wind</small><b>${wc.wind_speed_10m!==undefined?num(wc.wind_speed_10m,1)+' km/h':'—'}</b></div><div><small>Model time</small><b>${esc(wc.time||'not supplied')}</b></div><div><small>7-day precipitation total</small><b>${num(rain,1)} mm</b></div></div>${(daily.time||[]).length?`<div class="live-mini-forecast">${daily.time.slice(0,7).map((d,i)=>`<div><small>${esc(d)}</small><b>${daily.temperature_2m_max?.[i]!==undefined?num(daily.temperature_2m_max[i],0)+'°':''}</b><span>Rain ${daily.precipitation_probability_max?.[i]!==undefined?num(daily.precipitation_probability_max[i],0)+'%':'—'}</span></div>`).join('')}</div>`:''}<p class="live-note">Forecast/model values are not station observations. Source: Open-Meteo.</p>`:`<p class="live-no-data">${esc(p.weather?.error||'No weather record was returned for this coordinate.')}</p>`;
    const aqiBody=aqi?`<div class="live-fact-grid"><div><small>US AQI</small><b>${ac.us_aqi!==undefined?num(ac.us_aqi,0):'—'}</b></div><div><small>European AQI</small><b>${ac.european_aqi!==undefined?num(ac.european_aqi,0):'—'}</b></div><div><small>PM2.5</small><b>${ac.pm2_5!==undefined?num(ac.pm2_5,1)+' µg/m³':'—'}</b></div><div><small>PM10</small><b>${ac.pm10!==undefined?num(ac.pm10,1)+' µg/m³':'—'}</b></div><div><small>Ozone</small><b>${ac.ozone!==undefined?num(ac.ozone,1)+' µg/m³':'—'}</b></div><div><small>Model valid time</small><b>${esc(ac.time||'not supplied')}</b></div></div><p class="live-note">AQI and pollutants are atmospheric model estimates at a grid coordinate, not a certified monitor reading or official health advisory.</p>`:`<p class="live-no-data">${esc(p.aqi?.error||'No air-quality data returned.')}</p>`;
    const soilBody=soil?`${soil.lines.length?`<div class="live-soil-grid">${soil.lines.map(x=>`<div><small>${esc(x.label)} · ${esc(x.depth)}</small><b>${esc(x.value)} ${esc(x.unit)}</b></div>`).join('')}</div>`:'<p class="live-no-data">SoilGrids responded, but its returned properties had no parseable mean values.</p>'}<p class="live-note">${esc(soil.raw||'ISRIC SoilGrids global prediction at 0–5 cm depth when available; not an on-farm soil test.')}</p>`:`<p class="live-no-data">${esc(p.soil?.error||'SoilGrids unavailable for this request.')}</p>`;
    const climateBody=climate?`<div class="live-fact-grid"><div><small>Returned period</small><b>${esc(climate.period)}</b></div><div><small>Mean of daily means</small><b>${esc(climate.meanTemp)}</b></div><div><small>Precipitation sum</small><b>${esc(climate.rainTotal)}</b></div><div><small>Daily records</small><b>${climate.days}</b></div></div><p class="live-note">${esc(climate.note||'Historical grid/reanalysis data; not an on-site sensor.')}</p>`:`<p class="live-no-data">${esc(p.climate?.error||'Historical climate data unavailable.')}</p>`;
    const floodBody=flood?`${flood.peak?`<div class="live-flood-callout"><small>Highest value among returned upcoming daily discharge records</small><b>${num(flood.peak.value,1)} ${esc(flood.unit)}</b><span>${esc(flood.peak.time)}</span></div>`:'<p class="live-no-data">No upcoming daily river-discharge values were supplied for this coordinate.</p>'}${flood.rows.length?`<div class="live-flood-rows">${flood.rows.map(r=>`<div><b>${esc(r.time)}</b><span>${num(r.value,1)} ${esc(flood.unit)}</span><small>${Number.isFinite(r.mean)?'Mean '+num(r.mean,1):''}${Number.isFinite(r.max)?' · Historical max '+num(r.max,1):''}</small></div>`).join('')}</div>`:''}<p class="live-note">${esc(flood.note)}</p>`:`<p class="live-no-data">${esc(p.floodModel?.error||'Flood model unavailable. Absence of model output is not evidence of safety.')}</p>`;
    const hazardItems=p.disasterEvents?.items||[],floodItems=p.floodEvents?.items||[],eonetItems=p.eonetEvents?.items||[],quakeItems=p.quakes?.items||[];
    const radiusNote=p.regionBounds?'Regional filter uses a source extent or approximate displayed bounds; it is not an official administrative boundary.':`Regional filter: within about ${p.radius} km of this pin.`;
    const disasterBody=`<div class="live-hazard-counts"><div><b>${hazardItems.length}</b><small>GDACS reported records</small></div><div><b>${floodItems.length}</b><small>Flood-matching GDACS records</small></div><div><b>${eonetItems.length}</b><small>NASA EONET records</small></div><div><b>${quakeItems.length}</b><small>USGS earthquake records</small></div></div>${type==='flood'?articleList(floodItems.map(x=>({...x,...x.properties,properties:x.properties,dist:x.dist,url:x.properties.url,title:x.properties.title||x.properties.name})), 'No GDACS flood records matched the selected source extent/radius in the requested lookback. This does not mean the region is flood-free.',8):articleList(hazardItems.slice(0,8).map(x=>({...x,...x.properties,properties:x.properties,dist:x.dist,url:x.properties.url,title:x.properties.title||x.properties.name})), 'No GDACS event records matched the current region filter. This does not mean the region is hazard-free.',8)}<p class="live-note">${esc(radiusNote)} ${esc(p.disasterEvents?.note||'GDACS alerts depend on event coverage and publication latency.')}</p>`;
    const quakeBody=articleList(quakeItems.slice(0,8).map(x=>({...x,...x.properties,properties:x.properties,dist:x.dist,url:x.properties.url||x.properties.detail||'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',title:x.properties.place||x.properties.title||'Earthquake'})), 'No recent earthquake records matched this source filter. This is a query result, not proof of zero seismic activity.',8)+`<p class="live-note">USGS feed is a recent reported-earthquake catalogue; magnitudes and records may be revised.</p>`;
    const news=p.news||{records:[],source:'GDELT',url:'https://www.gdeltproject.org/'};
    const newsBody=`${articleList(news.records,'No articles matched this location query during this request. Try the broader district or country name.',10)}<p class="live-note">${esc(news.note||'News search results are headlines that mention a queried location; they are not independently verified and may refer to nearby regions.')}</p>`;
    const aiBody=`<div class="live-ai-summary" id="live-ai-summary-box">${esc(aiSummary||summary).replace(/\n/g,'<br>')}</div><p class="live-note">Source-grounded deterministic & AI summary. Verify linked primary sources below.</p>`;
    const coords=`${Number(place.lat).toFixed(5)}, ${Number(place.lon).toFixed(5)}`;
    $('live-explore-content').innerHTML=`<div class="live-report-hero"><div><div class="live-explore-eyebrow">PINNED LOCATION · SOURCE-GROUNDED DOSSIER</div><h2>${esc(place.name)}</h2><p>${esc(place.country||'Country/region not supplied')} · ${esc(coords)}<br>Requested: ${esc(question)}</p></div><div class="live-hero-stamp">${esc(type==='flood'?'FLOOD & HAZARD VIEW':type==='disaster'?'HAZARD & EVENT VIEW':'LOCATION OVERVIEW')}</div></div><div class="live-source-strip"><span>Place source: ${esc(place.source||'Photon / OpenStreetMap')}</span><span>Generated: ${esc(new Date().toLocaleString())}</span><span>Providers are queried separately; failed sources are disclosed.</span></div><div class="live-data-grid">${metrics}</div>${section('Earth AI · source-grounded summary',aiBody,'OpenRouter + Public Feeds','https://openrouter.ai/models')}<div class="live-report-grid">${section('Weather and 7-day forecast',weatherBody,'Open-Meteo','https://open-meteo.com/en/docs',p.weather?.fetched_at||p.weather?.data?.current?.time)}${section('Air quality and AQI',aqiBody,'Open-Meteo / CAMS','https://open-meteo.com/en/docs/air-quality-api',p.aqi?.fetched_at||ac.time)}${section('Soil properties',soilBody,'ISRIC SoilGrids','https://soilgrids.org/',p.soil?.fetched_at)}${section('Historical climate context',climateBody,'Open-Meteo Historical Weather','https://open-meteo.com/en/docs/historical-weather-api',p.climate?.fetched_at)}${section(type==='flood'?'Flood records in selected region':'Recent disaster and natural-event records',disasterBody,'GDACS / NASA EONET','https://www.gdacs.org/',p.disasters?.fetched_at)}${section('Recent earthquake records',quakeBody,'USGS Earthquake Hazards Program','https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',p.earthquakes?.fetched_at)}${section('Latest news mentioning this place',newsBody,news.source,news.url,news.retrieved)}${section('Modelled river discharge',floodBody,'Open-Meteo Flood API / Copernicus GloFAS','https://open-meteo.com/en/docs/flood-api',p.floodModel?.fetched_at)}</div><section class="live-report-section"><div class="live-section-head"><h2>What this report cannot prove</h2></div><ul class="live-limit-list"><li>Weather and AQI values are model/grid products, not guaranteed local sensor readings.</li><li>SoilGrids is gridded model data; crop decisions require field sampling, crop calendars, cultivar and local advice.</li><li>No returned flood or earthquake event does not mean an area is safe. Modelled river discharge is not a property-level inundation prediction.</li><li>News search results and their geographic relation are unverified; a headline mentioning a city does not prove the event occurred inside its boundary.</li><li>The report is a point-in-time snapshot. Open each source record and timestamp to verify it.</li></ul></section>`;
    setText('live-explore-title',type==='flood'?'Flood intelligence · '+place.name:type==='disaster'?'Hazard intelligence · '+place.name:place.name+' · Earth dossier');
    setText('live-explore-subtitle',type==='flood'?'Reported flood alerts and modelled river discharge, separated by source and uncertainty.':'Weather, AQI, soil, climate, hazards, news and source-linked context for the selected map pin.');
    setText('live-explore-status',`Report ready for ${place.name}: ${Object.keys(p).filter(k=>p[k]&&!p[k].error).length} live sources loaded.${liveListening?' 🎙 Microphone is active — speak your next place or query.':''}`);
    lastReport={type:'place',question,place,data:p,summary,aiSummary};
  }

  function enableMapLayersForIntent(type){
    openMap();
    const turnOn=id=>{const el=$(id);if(el&&!el.checked){el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}};
    if(type==='flood'){turnOn('layer-gdacs');const filter=$('gdacs-event-filter');if(filter){filter.value='FL';filter.dispatchEvent(new Event('change',{bubbles:true}));}turnOn('layer-floods');}
    else if(type==='disaster'){turnOn('layer-gdacs');turnOn('layer-quakes');turnOn('layer-events');}
  }

  async function runPlaceQuery(question,kind,sequence){
    const info=extractRegionForPlace(question,kind);
    const hit=info.coordinate?{...info.coordinate,display_name:info.coordinate.name||info.query,name:info.coordinate.name||info.query,source:'coordinates',country:'',type:'coordinate'}:await geocodeQuery(info.query);
    if(sequence!==voiceSequence)return;
    const place=await pinPlace(hit,info.query||hit.name);if(sequence!==voiceSequence)return;
    const type=kind==='disaster'?( /\b(?:flood|floods|inundation|flash flood|river level)\b/i.test(question)?'flood':'disaster'):'place';
    enableMapLayersForIntent(type==='flood'?'flood':type);
    const packed=await getPlaceData(place,question,type,sequence);if(!packed)return;
    return packed;
  }

  async function runLiveQuery(question,source='typed'){
    const q=String(question||'').trim();if(!q)return;
    if(source==='live-voice'&&liveVoiceBusy){if(liveVoiceQueue.length<3)liveVoiceQueue.push(q);announce(`Another voice request is being processed. Queued “${q}” for the next report.`);return;}
    if(source!=='live-voice')liveVoiceQueue.length=0;
    const isLiveVoice=source==='live-voice';if(isLiveVoice)liveVoiceBusy=true;
    const sequence=++voiceSequence;
    const kind=source==='auto-init'?'place':classifyQuery(q,isLiveVoice);
    showModal(kind==='food'?'Food Studio · Live search':kind==='disaster'?'Live disaster intelligence':'Live Earth Explorer',`Request: ${q}`);
    if($('live-explore-query-input'))$('live-explore-query-input').value=q;
    if((source==='typed'||source==='single-mic'||isLiveVoice)&&kind!=='chat')chatBubble('user',q,isLiveVoice?'LIVE VOICE':source==='single-mic'?'VOICE':'ASK EARTH');
    try{
      if(kind==='food'){await runFoodQuery(q,sequence);return;}
      if(kind==='disaster'||kind==='place'){await runPlaceQuery(q,kind,sequence);return;}
      closeModal();const form=$('assistant-form'),input=$('assistant-question');if(input)input.value=q;if(form?.requestSubmit)form.requestSubmit();else window.EARTHSCOPE_LIVE_EXPLORER?.sendFallback?.(q);
    }catch(e){
      if(sequence!==voiceSequence)return;
      setText('live-explore-status','Search did not finish successfully. Use the search bar or quick buttons below to retry.');
      $('live-explore-content').innerHTML=`<div class="live-error-card"><b>Live request notice</b><p>${esc(e.message||'Provider error')}</p><p>Select any quick dossier button above (e.g. Biratnagar, Floods in Nepal, Kathmandu) or type a city name to load live source records immediately.</p></div>`;
      chatBubble('assistant',`Live Explore could not complete this request: ${e.message||'provider error'}.`,'SOURCE STATUS');
    }finally{
      if(isLiveVoice){liveVoiceBusy=false;if(liveListening&&liveVoiceQueue.length){const next=liveVoiceQueue.shift();clearTimeout(liveProcessTimer);liveProcessTimer=setTimeout(()=>{if(liveListening)runLiveQuery(next,'live-voice');},180);}}
    }
  }

  document.addEventListener('submit',event=>{
    if(event.target?.id!=='assistant-form')return;const q=$('assistant-question')?.value||'';const kind=classifyQuery(q,false);if(kind==='chat')return;
    event.preventDefault();event.stopImmediatePropagation();runLiveQuery(q,'typed');
  },true);

  function makeLiveRecognizer(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){announce('Live speech recognition is unsupported in this browser. Type a query or click a quick dossier button below.');liveListening=false;updateLiveButton();return null;}
    const rec=new SR();rec.lang=$('assistant-language')?.value||'en-US';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;liveRecognition=rec;let interim='';
    rec.onresult=event=>{
      for(let i=event.resultIndex;i<event.results.length;i++){
        const item=event.results[i];const t=String(item[0]?.transcript||'').trim();if(!t)continue;
        if(!item.isFinal){interim=t;setText('live-explore-status',`🎙 Listening… ${interim}`);continue;}
        interim='';liveFinalBuffer=(liveFinalBuffer+' '+t).trim();setText('live-explore-status',`Heard: “${liveFinalBuffer}”. Searching live sources…`);
        clearTimeout(liveProcessTimer);liveProcessTimer=setTimeout(()=>{const utterance=liveFinalBuffer.trim();liveFinalBuffer='';if(liveListening&&utterance)runLiveQuery(utterance,'live-voice');},950);
      }
    };
    rec.onerror=event=>{
      const reason=event.error||'unavailable';if(reason==='not-allowed'||reason==='service-not-allowed'){liveListening=false;announce('Microphone permission was denied. Use the search box or quick dossier buttons below.');updateLiveButton();}
      else if(reason!=='no-speech'&&reason!=='aborted')announce(`Speech recognition: ${reason}. You can also type or click a quick dossier button below.`);
    };
    rec.onend=()=>{if(liveRecognition===rec)liveRecognition=null;if(liveListening){clearTimeout(liveRestartTimer);liveRestartTimer=setTimeout(()=>{if(liveListening)startRecognitionCycle();},350);}else updateLiveButton();};
    return rec;
  }

  function startRecognitionCycle(){if(!liveListening)return;const rec=makeLiveRecognizer();if(!rec)return;try{rec.start();}catch(e){clearTimeout(liveRestartTimer);liveRestartTimer=setTimeout(()=>{if(liveListening&&!liveRecognition)startRecognitionCycle();},600);}}

  function updateLiveButton(){
    const b=$('assistant-live-voice');
    if(b){
      b.classList.toggle('listening',liveListening);
      b.setAttribute('aria-pressed',liveListening?'true':'false');
      b.textContent=liveListening?'■ Stop listening':'✦ Live Explore';
      b.title=liveListening?'Click to stop microphone listening':'Open Live Explore & voice intelligence dossier';
    }
    const mb=$('live-explore-mic-toggle');
    if(mb){
      mb.textContent=liveListening?'■ Stop Voice':'🎙 Voice Listen';
    }
  }

  function stopLiveVoice(){
    liveListening=false;clearTimeout(liveRestartTimer);clearTimeout(liveProcessTimer);liveFinalBuffer='';
    if(liveRecognition){try{liveRecognition.onend=null;liveRecognition.stop();}catch(_){}liveRecognition=null;}
    updateLiveButton();
    announce('Voice listening paused. You can type a query above or click Voice Listen to resume.');
  }

  function startLiveVoice(){
    ensureCommandBar();
    const back=$('live-explore-backdrop');
    // If modal is not open yet, open it and immediately load the current/default pin dossier so it NEVER hangs on a blank spinner!
    if(back && back.hidden){
      openExplorerModal('Live Voice Explore','Speak a place name, food request, or a disaster question — or use the search bar below.');
      const sel=getBridge()?.getSelectedPlace?.();
      const initialPlace=(sel?.name && sel.name!=='Global view') ? sel.name : 'Biratnagar, Nepal';
      if(!lastReport){
        runLiveQuery(initialPlace,'auto-init');
      }
    }
    if(liveListening){stopLiveVoice();return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){
      announce('Voice recognition is not supported in this browser; showing live interactive dossier. Use the search bar above.');
      return;
    }
    liveListening=true;
    updateLiveButton();
    announce('🎙 Microphone is active. Say a place (e.g. “Biratnagar”), “find a recipe with potatoes”, or “where are floods reported in Nepal”.');
    startRecognitionCycle();
  }

  function stopLiveIfSingleMic(){if(liveListening)stopLiveVoice();}

  function init(){
    attachChatListeners();
    ensureCommandBar();
    $('assistant-live-voice')?.addEventListener('click',startLiveVoice);
    $('assistant-mic')?.addEventListener('click',stopLiveIfSingleMic);
    $('live-explore-close')?.addEventListener('click',closeModal);
    $('live-explore-backdrop')?.addEventListener('click',event=>{if(event.target===$('live-explore-backdrop'))closeModal();});
    $('live-explore-back-map')?.addEventListener('click',()=>{closeModal();openMap();});
    $('live-explore-print')?.addEventListener('click',()=>{if(!lastReport){announce('Run a search first to create a report.');return;}window.print();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('live-explore-backdrop')?.hidden)closeModal();});
    $('assistant-language')?.addEventListener('change',()=>{if(liveListening){stopLiveVoice();announce('Language changed. Click Voice Listen to start listening again in the selected language.');}});
    window.EARTHSCOPE_LIVE_EXPLORER={classify:classifyQuery,handle:(q,opts={})=>runLiveQuery(q,opts.source||'typed'),stop:stopLiveVoice,getLastReport:()=>lastReport};
  }
  document.addEventListener('DOMContentLoaded',init);
})();
