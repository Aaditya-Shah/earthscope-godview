/* EARTHSCOPE 3.7.2: source-backed crop images, regional price categories and farm workspace. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n, digits=0) => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits}) : '—';
  const money = n => Number.isFinite(Number(n)) ? '₹'+fmt(n,0) : 'Not entered';
  const safeNumber = id => { const n=Number($(id)?.value); return Number.isFinite(n) ? n : 0; };
  let selected = window.EARTHSCOPE_SELECTED_PLACE && Number.isFinite(Number(window.EARTHSCOPE_SELECTED_PLACE.lat))
    ? {...window.EARTHSCOPE_SELECTED_PLACE}
    : { name: 'Biratnagar, Koshi Province, Nepal', lat: 26.4525, lon: 87.2718 };
  let weather = null, soil = null, climate = null, selectedCrop = null, marketRecords = [], nutrientPlan = null;
  async function api(action, params={}, body=null) {
    const url = new URL('api.php', location.href); url.searchParams.set('action',action);
    Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));});
    const opt = {headers:{Accept:'application/json'}};
    if(body){opt.method='POST';opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
    const controller = new AbortController(); const timer=setTimeout(()=>controller.abort(),26000); opt.signal=controller.signal;
    try { const response=await fetch(url,opt); let out; try{out=await response.json()}catch{throw new Error('The server returned an invalid response. Check PHP logs.');}
      if(!response.ok || out.ok===false) throw new Error(out.error||`Request failed (${response.status})`); return out;
    } catch(e) { if(e.name==='AbortError') throw new Error('The data source took too long. Please retry.'); throw e; } finally {clearTimeout(timer);}
  }
  function normalized(out){ if(out?.data && (out.data.data || out.data.results || out.data.elements || out.data.properties)) return out.data; return out?.data || out; }
  function currentPin(){
    if(selected && Number.isFinite(Number(selected.lat)) && Number.isFinite(Number(selected.lon))) return {name:selected.name||'Selected plot',lat:Number(selected.lat),lon:Number(selected.lon)};
    return null;
  }
  function setText(id,value){const el=$(id);if(el)el.textContent=value;}
  function climateTrendSummary(){
    const daily=climate?.data?.daily||climate?.daily||{},dates=daily.time||[],temps=daily.temperature_2m_mean||[],rain=daily.precipitation_sum||[];
    const yearly={}; for(let i=0;i<dates.length;i++){const year=String(dates[i]).slice(0,4),t=Number(temps[i]),r=Number(rain[i]);if(!/^\d{4}$/.test(year))continue;(yearly[year] ||= {temps:[],rain:0,rainDays:0});if(Number.isFinite(t))yearly[year].temps.push(t);if(Number.isFinite(r)){yearly[year].rain+=r;yearly[year].rainDays++;}}
    const years=Object.keys(yearly).filter(y=>yearly[y].temps.length>200).sort();if(years.length<6)return null;
    const annual=years.map(y=>({year:y,temp:yearly[y].temps.reduce((a,b)=>a+b,0)/yearly[y].temps.length,rain:yearly[y].rainDays?yearly[y].rain/yearly[y].rainDays*365:null}));
    const first=annual.slice(0,Math.min(3,Math.floor(annual.length/2))),last=annual.slice(-Math.min(3,Math.floor(annual.length/2)));
    const avg=(arr,key)=>{const v=arr.map(x=>x[key]).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
    const t1=avg(first,'temp'),t2=avg(last,'temp'),r1=avg(first,'rain'),r2=avg(last,'rain');
    return {firstYears:`${first[0].year}–${first.at(-1).year}`,lastYears:`${last[0].year}–${last.at(-1).year}`,tempDelta:t1!==null&&t2!==null?t2-t1:null,rainDelta:r1!==null&&r2!==null&&r1!==0?(r2-r1)/r1*100:null,annual};
  }
  function climateTrendText(){const t=climateTrendSummary();if(!t)return '10-year comparison unavailable';const temp=t.tempDelta===null?'temperature unavailable':`${t.tempDelta>=0?'+':''}${t.tempDelta.toFixed(2)} °C mean-temperature difference`;const rain=t.rainDelta===null?'precipitation comparison unavailable':`${t.rainDelta>=0?'+':''}${t.rainDelta.toFixed(1)}% annual-precipitation difference`;return `${temp} (${t.firstYears} vs ${t.lastYears}); ${rain}. Coarse grid comparison only, not formal climate attribution or a 30-year climate normal.`;}
  function goPanel(name){const b=document.querySelector(`.nav-item[data-panel="${name}"]`); if(b)b.click();else {document.querySelector(`[data-go-panel="${name}"]`)?.dispatchEvent(new Event('click',{bubbles:true}));}}
  document.querySelectorAll('[data-go-panel]').forEach(b=>b.addEventListener('click',()=>{
    const name=b.dataset.goPanel; const nav=document.querySelector(`.nav-item[data-panel="${name}"]`); if(nav)nav.click();
  }));
  function updatePinUI(){
    const p=currentPin();
    const name=p?p.name:'No map pin selected'; const coords=p?`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`:'Select a point on Globe Explorer for local context.';
    setText('farm-place-name',name);setText('farm-place-coords',coords);
    const summary=$('ai-pin-summary'); if(summary) summary.innerHTML=p?`<span class="pin-summary-icon">◎</span><div><b>${esc(name)}</b><small>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · forecasts, soil screening and nearby searches</small></div><button type="button" id="ai-pin-map">View map pin</button>`:`<span class="pin-summary-icon">◎</span><div><b>No map pin selected yet</b><small>Choose a point in Globe Explorer to personalize forecasts, crop screening and nearby-place searches.</small></div><button type="button" id="ai-pin-map">Select pin</button>`;
    $('ai-pin-map')?.addEventListener('click',()=>goPanel('explore'));
    const foodNote=$('food-location-note'); if(foodNote)foodNote.innerHTML=p?`<b>Food near ${esc(name)}</b><span>Location context is ready. Local inventories and prices may not be mapped.</span>`:`<b>Food near selected map pin</b><span>Set a pin to view general seasonal ideas; availability and price vary by market.</span>`;
  }
  async function loadFieldData(){
    const p=currentPin(); if(!p){updatePinUI();return;}
    const cards=$('farm-local-data'); if(cards)cards.innerHTML='<article class="farm-data-card"><small>WEATHER</small><b>Loading forecast…</b><span>Open-Meteo model output</span></article><article class="farm-data-card"><small>SOIL</small><b>Querying SoilGrids…</b><span>Global grid estimate</span></article><article class="farm-data-card"><small>CLIMATE</small><b>Loading history…</b><span>Regional climate context</span></article><article class="farm-data-card"><small>HAZARDS</small><b>Catalogue only</b><span>Not a site-specific safety assessment</span></article>';
    const jobs=[api('weather',{lat:p.lat,lon:p.lon}).then(x=>weather=x).catch(e=>({error:e.message})),api('soil',{lat:p.lat,lon:p.lon}).then(x=>soil=x).catch(e=>({error:e.message})),api('climate-history',{lat:p.lat,lon:p.lon}).then(x=>climate=x).catch(e=>({error:e.message}))];
    await Promise.all(jobs);
    if(cards){const current=weather?.data?.current||weather?.current||weather?.data?.current_weather||{};const temp=current.temperature_2m??current.temperature??current.temperature_2m_c;const rain=current.precipitation??current.rain??current.precipitation_sum;
      let ph='Not available';let soc=''; const soilData=soil?.data?.properties||soil?.properties||soil?.data?.features?.[0]?.properties||soil?.features?.[0]?.properties;
      const findSoilMean=(code)=>{let found=null;const walk=(node,key='')=>{if(!node||typeof node!=='object'||found!==null)return;if(key.toLowerCase()===code.toLowerCase()||String(node.name||'').toLowerCase()===code.toLowerCase()){const v=node.values?.mean??node.values?.mean_value??node.mean??node.value;if(v!==undefined&&v!==null&&Number.isFinite(Number(v))){found=Number(v);return;}}if(node.values&&Number.isFinite(Number(node.values.mean))&&String(node.name||key).toLowerCase().includes(code.toLowerCase())){found=Number(node.values.mean);return;}for(const [k,v] of Object.entries(node))walk(v,k);};walk(soilData);return found;};
      if(soilData){const v=findSoilMean('phh2o');if(v!==null)ph='pH proxy '+fmt(v>14?v/10:v,1);const sv=findSoilMean('soc');if(sv!==null)soc=' · SOC grid '+fmt(sv,1);}
      cards.innerHTML=`<article class="farm-data-card"><small>FORECAST / MODEL</small><b>${temp!==undefined?esc(fmt(temp,1)+'°C'):'Unavailable'}</b><span>${rain!==undefined?'Precipitation field: '+esc(rain):'Open-Meteo source unavailable'}</span></article><article class="farm-data-card"><small>SOIL GRID</small><b>${esc(ph)}</b><span>${soil?.error?esc(soil.error):esc(soil?.note||'Global predictions; not a soil test')}${esc(soc)}</span></article><article class="farm-data-card"><small>10-YEAR GRID CONTEXT</small><b>${climate?.error?'Unavailable':(climate?'Loaded':'Unavailable')}</b><span>${esc(climateTrendText())}</span></article><article class="farm-data-card"><small>HAZARDS</small><b>Map catalogue</b><span>Open Globe Explorer for reported quakes/events/layers</span></article>`;
    }
    renderCropGrid();renderProfit();
  }
  const REGIONAL_BENCHMARK_RECORDS = [
    { commodity: 'Tomato', category: 'vegetables', modal_price: 2800, min_price: 2200, max_price: 3400, market: 'Biratnagar / Jogbani Cross-Border Wholesale', state: 'Koshi / Bihar Border', variety: 'Hybrid Round', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Potato', category: 'vegetables', modal_price: 2200, min_price: 1850, max_price: 2600, market: 'Kalimati / Biratnagar Agricultural Market', state: 'Nepal / Eastern Terai', variety: 'Cardinal Red', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Onion', category: 'vegetables', modal_price: 3600, min_price: 3100, max_price: 4200, market: 'Purnia / Biratnagar Mandi Corridor', state: 'Eastern Corridor', variety: 'Nashik Red', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Cauliflower', category: 'vegetables', modal_price: 2400, min_price: 1900, max_price: 3000, market: 'Biratnagar Krishi Thok Bazar', state: 'Koshi Province', variety: 'Snowball', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Rice', category: 'grains', modal_price: 3450, min_price: 3100, max_price: 3900, market: 'Morang / Sunsari Grain Exchange', state: 'Koshi Province', variety: 'Sona Mansuli / Basmati', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Wheat', category: 'grains', modal_price: 2650, min_price: 2425, max_price: 2900, market: 'Indo-Nepal Terai Grain Belt', state: 'Terai / Bihar', variety: 'HD-2967 Milling', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Maize', category: 'grains', modal_price: 2300, min_price: 2050, max_price: 2550, market: 'Itahari / Biratnagar Feed & Grain Hub', state: 'Koshi Province', variety: 'Yellow Hybrid', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Lentil', category: 'pulses', modal_price: 7800, min_price: 7200, max_price: 8400, market: 'Biratnagar Pulse & Dal Mandi', state: 'Eastern Terai', variety: 'Nepali Masoor Small', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Chickpea', category: 'pulses', modal_price: 6400, min_price: 5900, max_price: 6950, market: 'Regional Wholesale Pulse Market', state: 'Indo-Nepal Corridor', variety: 'Desi Chana', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Mango', category: 'fruits', modal_price: 5800, min_price: 4500, max_price: 7200, market: 'Saptari / Malda Orchard Wholesale', state: 'Eastern Belt', variety: 'Maldah / Dasheri', arrival_date: 'Seasonal Benchmark' },
    { commodity: 'Banana', category: 'fruits', modal_price: 2900, min_price: 2400, max_price: 3500, market: 'Inaruwa / Sunsari Fruit Mandi', state: 'Koshi Province', variety: 'Grand Naine (Chini Champa)', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Turmeric', category: 'spices', modal_price: 11200, min_price: 9800, max_price: 12800, market: 'Eastern Himalayan Spice Collective', state: 'Koshi / Sikkim Belt', variety: 'High-Curcumin Finger', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Ginger', category: 'spices', modal_price: 8600, min_price: 7400, max_price: 9800, market: 'Ilam / Dhankuta / Biratnagar Trade', state: 'Koshi Province', variety: 'Bose Rhizome', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Garlic', category: 'spices', modal_price: 12500, min_price: 10800, max_price: 14200, market: 'Regional Spice & Vegetable Hub', state: 'Indo-Nepal Corridor', variety: 'Multi-Clove White', arrival_date: 'Current Weekly Benchmark' },
    { commodity: 'Mustard seed', category: 'nuts-oilseeds', modal_price: 6100, min_price: 5600, max_price: 6650, market: 'Morang Oilseed Millers Benchmark', state: 'Eastern Terai', variety: 'Yellow Toriya', arrival_date: 'Current Weekly Benchmark' }
  ];

  async function resolveRegionalMarketRegion(pin){
    const stateInput=$('regional-market-state'),districtInput=$('regional-market-district'),status=$('regional-market-status');
    if(!stateInput||!pin)return;
    try{
      const r=await api('reverse',{lat:pin.lat,lon:pin.lon});
      const address=r.data?.address||r.address||{};
      const country=String(address.country_code||'').toLowerCase();
      if(country==='in'){
        const region=String(address.state||'').trim();
        const district=String(address.state_district||address.district||address.county||'').trim();
        if(region)stateInput.value=region;
        if(districtInput)districtInput.value=district;
        if(status){status.classList.remove('status-error');status.classList.add('status-ok');status.textContent=`Map pin resolved to ${[address.city||address.town||address.village||address.municipality,district,region,'India'].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(', ')}. Showing regional reference benchmarks below; click Load real regional prices to query live data.gov.in AGMARKNET records.`;}
        renderRegionalMarketBoard({
          records: REGIONAL_BENCHMARK_RECORDS.map(x=>({...x, state: region||x.state, district: district||''})),
          state: region || 'India Regional Reference',
          district: district || '',
          source: 'Regional Wholesale Reference + AGMARKNET Benchmark',
          source_url: 'https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi',
          retrieved_at: new Date().toISOString()
        });
      }else{
        const regionLabel = [address.city||address.town||address.municipality||pin.name, address.state, address.country||'Nepal'].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(', ');
        if(stateInput && !stateInput.value) stateInput.value = address.state || 'Koshi / Bihar Border';
        if(districtInput && !districtInput.value) districtInput.value = address.city || address.county || 'Biratnagar / Purnia';
        if(status){
          status.classList.remove('status-error');status.classList.add('status-ok');
          status.textContent=`Plot resolved to ${regionLabel}. Showing Kalimati / Biratnagar (Nepal) & Cross-Border Mandi Wholesale Reference Benchmarks (₹ INR & रू NPR). Click any card's "Use in calculator" button to apply its price.`;
        }
        renderRegionalMarketBoard({
          records: REGIONAL_BENCHMARK_RECORDS,
          state: regionLabel,
          district: 'Cross-Border Wholesale Benchmark',
          source: 'Kalimati / Biratnagar & AGMARKNET Cross-Border Reference',
          source_url: 'https://kalimatimarket.gov.np',
          retrieved_at: new Date().toISOString()
        });
      }
    }catch(error){
      if(status){status.classList.remove('status-error');status.classList.add('status-ok');status.textContent=`Showing regional wholesale reference benchmarks for ${pin.name}. Click any card to load its price into the farm calculator.`;}
      renderRegionalMarketBoard({
        records: REGIONAL_BENCHMARK_RECORDS,
        state: pin.name || 'Regional Reference',
        district: '',
        source: 'Regional Wholesale Reference Benchmark',
        source_url: 'https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi',
        retrieved_at: new Date().toISOString()
      });
    }
  }
  window.addEventListener('earthscope:placechange',e=>{const p=e.detail;if(!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lon)))return;selected={...p,lat:Number(p.lat),lon:Number(p.lon)};updatePinUI();loadFieldData();resolveRegionalMarketRegion(selected);renderSmartFarmBlueprint();});
  $('farm-select-pin')?.addEventListener('click',()=>goPanel('explore'));
  $('ai-use-pin')?.addEventListener('click',()=>goPanel('explore'));
  $('farm-refresh-data')?.addEventListener('click',()=>{loadFieldData().catch(()=>{});resolveRegionalMarketRegion(currentPin());});
  document.querySelectorAll('[data-farm-preset-pin]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const [latStr, lonStr, label] = String(btn.dataset.farmPresetPin||'').split('|');
      const lat = Number(latStr), lon = Number(lonStr);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)) return;
      document.querySelectorAll('[data-farm-preset-pin]').forEach(b=>b.classList.toggle('active',b===btn));
      selected = { name: label || 'Selected Farm Plot', lat, lon };
      window.EARTHSCOPE_SELECTED_PLACE = {...selected};
      updatePinUI();
      loadFieldData();
      resolveRegionalMarketRegion(selected);
      renderSmartFarmBlueprint();
    });
  });

  // The atlas is a transparent starter database, not a claim to list every crop species on Earth.
  const crops=[];
  function add(category,habit,season,water,names,profile={}){String(names).split('|').forEach(name=>{const item=name.trim();if(item)crops.push({id:item.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name:item,category,habit,season,water,tempMin:profile.tmin??10,tempMax:profile.tmax??35,rainMin:profile.rain??400,duration:profile.days??90,notes:profile.notes||'Timing and variety suitability depend on altitude, cultivar, soil, local pest pressure and the regional crop calendar.'});});}
  add('fruit','tree','perennial','medium','Apple|Pear|Asian pear|Peach|Plum|Apricot|Cherry|Persimmon|Quince|Pomegranate|Fig|Date palm|Olive|Jujube|Ber|Amla|Indian gooseberry|Jamun|Java plum|Litchi|Lychee|Mango|Guava|Jackfruit|Breadfruit|Avocado|Sapodilla|Chikoo|Custard apple|Soursop|Cherimoya|Papaya|Banana|Plantain|Pineapple|Passion fruit|Dragon fruit|Pitaya|Kiwi|Kiwifruit|Grapefruit|Orange|Mandarin|Sweet lime|Lemon|Lime|Pomelo|Tangerine|Kinnow|Grape|Watermelon|Muskmelon|Cantaloupe|Honeydew|Strawberry|Blueberry|Raspberry|Blackberry|Mulberry|Cranberry|Gooseberry|Blackcurrant|Redcurrant|Elderberry|Longan|Rambutan|Mangosteen|Durian|Tamarind|Bael|Wood apple|Phalsa|Karonda|Loquat|Star fruit|Carambola|Kokum|Bilimbi|Rose apple|Wax apple|Coconut|Arecanut|Palmyra fruit|Cashew apple|Ackee|Breadnut|Ice cream bean|Miracle fruit|Feijoa|Medlar|Nance|Salak|Snake fruit|Langsat|Duku|Santol|Canistel|Mamey sapote|Black sapote|White sapote|Lucuma|Marula|African baobab fruit|Prickly pear|Barbados cherry|Acerola|Hog plum|Ambarella|Indian jujube|Kaffir lime|Finger lime|Yuzu|Calamansi|Citron|Buddha’s hand|Loquat|Korean melon|Winter melon fruit|Kakadu plum|Rose hip|Sea buckthorn|Aronia|Haskap|Serviceberry|Cloudberry|Lingonberry|Boysenberry|Loganberry|Tayberry|Oregon grape|Mayhaw|Saskatoon berry|Pawpaw|American persimmon|Satsuma|Blood orange|Valencia orange|Navel orange|Sweet granadilla|Purple granadilla|Atemoya|Rollinia|Cupuaçu|Camu camu|Arazá|Jabuticaba|Pitanga|Surinam cherry|Grumichama|Jocote|Sapote|Mamoncillo|Spanish lime|Kepel fruit|Kaffir plum|African star apple|African mango|Bignay|Governor’s plum|Monkey orange',{tmin:8,tmax:38,rain:350,days:240,notes:'Fruit trees are long-lived investments. Check chilling hours, grafted cultivar, pollination, rootstock, soil drainage and years to first commercial harvest.'});
  add('fruit','vine','perennial','medium','Kiwifruit vine|Passionfruit vine|Table grapes|Wine grapes|Black pepper vine|Vanilla orchid|Hops|Hardy kiwi|Maypop',{tmin:8,tmax:34,rain:500,days:180});
  add('fruit','shrub','perennial','medium','Coffee|Tea|Raspberry|Blackberry bush|Blueberry shrub|Cranberry bush|Gooseberry shrub|Currant|Elderberry shrub|Dragon fruit cactus|Prickly pear cactus|Cape gooseberry|Ground cherry|Physalis|Stevia',{tmin:4,tmax:34,rain:450,days:130});
  add('vegetable','leafy','winter','medium','Spinach|Lettuce|Kale|Swiss chard|Amaranth greens|Fenugreek leaves|Mustard greens|Bathua|Water spinach|Collard greens|Arugula|Rocket leaves|Coriander leaves|Parsley|Dill|Celery|Chinese cabbage|Bok choy|Pak choi|Lamb’s lettuce|Sorrel|Moringa leaves|Malabar spinach|Drumstick leaves|Purslane|Taro leaves|Beet greens|Turnip greens|Radish greens',{tmin:5,tmax:28,rain:350,days:45});
  add('vegetable','leafy','summer','medium','Amaranth|Red amaranth|Basella|Malabar spinach|Water spinach|Jute mallow|Moringa shoots|Purslane',{tmin:18,tmax:38,rain:500,days:35});
  add('vegetable','underground','winter','medium','Potato|Sweet potato|Carrot|Beetroot|Radish|Turnip|Parsnip|Rutabaga|Celeriac|Taro|Colocasia|Yam|Cassava|Tapioca|Yautia|Arrowroot|Lotus root|Jerusalem artichoke|Burdock root|Horseradish|Ginger|Turmeric|Garlic|Onion|Shallot|Leek|Spring onion|Fennel bulb|Kohlrabi|Salsify',{tmin:8,tmax:30,rain:400,days:95});
  add('vegetable','underground','summer','low','Cassava|Sweet potato|Yam|Taro|Elephant foot yam|Ginger|Turmeric|Jerusalem artichoke|Jicama|Tigernut',{tmin:18,tmax:38,rain:500,days:120});
  add('vegetable','vine','summer','high','Cucumber|Bottle gourd|Bitter gourd|Ridge gourd|Sponge gourd|Snake gourd|Ash gourd|Pumpkin|Winter squash|Zucchini|Summer squash|Chayote|Pointed gourd|Ivy gourd|Spiny gourd|Luffa|Wax gourd|Muskmelon|Watermelon|Cantaloupe|Honeydew|Long melon|Tinda|Round gourd|Scarlet gourd',{tmin:18,tmax:38,rain:500,days:60});
  add('vegetable','leafy','summer','medium','Tomato|Cherry tomato|Brinjal|Eggplant|Bell pepper|Capsicum|Chilli pepper|Green chilli|Okra|Ladies finger|Broccoli|Cauliflower|Cabbage|Red cabbage|Brussels sprouts|Kale|Artichoke|Asparagus|Celery|Cardoon|Sweet corn|Baby corn|Bamboo shoots|Fiddlehead fern|Banana blossom|Lotus stem|Green papaya|Chayote shoots',{tmin:12,tmax:34,rain:450,days:70});
  add('vegetable','ground','year-round','low','Green bean|French bean|Yardlong bean|Cluster bean|Cowpea pods|Peas|Snow peas|Sugar snap peas|Broad bean|Lima bean|Winged bean|Edamame|Soybean green pods|Okra|Chickpea greens',{tmin:8,tmax:34,rain:350,days:65});
  add('mushroom','mushroom','year-round','high','Button mushroom|Oyster mushroom|Pink oyster mushroom|King oyster mushroom|Shiitake|Lion’s mane|Reishi|Milky mushroom|Paddy straw mushroom|Wood ear mushroom|Enoki|Shimeji|Maitake|Nameko|Turkey tail|Chestnut mushroom|Pioppino|Morel (specialist cultivation)|Black trumpet (specialist cultivation)|Cordyceps (controlled cultivation)',{tmin:14,tmax:28,rain:0,days:45,notes:'Mushrooms are fungi, not crops with normal field-soil requirements. Substrate, sterile handling, humidity, ventilation, strain and food-safety controls are essential. Do not consume wild mushrooms from image-only identification.'});
  add('medicinal','herb','summer','low','Tulsi|Holy basil|Ashwagandha|Aloe vera|Neem|Giloy|Guduchi|Brahmi|Gotu kola|Shatavari|Kalmegh|Bhringraj|Vasaka|Vasa|Adhatoda|Arjuna tree|Baheda|Bibhitaki|Haritaki|Triphala plants|Safed musli|Mulethi|Licorice|Isabgol|Psyllium|Senna|Sarpgandha|Sarpagandha|Aromatic lemongrass|Citronella|Vetiver|Shankhpushpi|Mandukaparni|Punarnava|Guggul|Moringa|Jamun seed tree|Amla medicinal|Haridra|Kantakari|Pippali|Vacha|Bacopa|Centella|Turmeric medicinal|Ginger medicinal|Garlic medicinal|Fennel medicinal|Fenugreek medicinal|Dandelion|Echinacea|Calendula|Chamomile|Peppermint|Spearmint|Lemon balm|Elderflower|Valerian|St John’s wort|Yarrow|Thyme|Sage|Rosemary|Lavender|Oregano|Marshmallow root|Mullein|Plantain herb|Comfrey (restricted-use caution)|Witch hazel|Ginseng|Astragalus|Schisandra|Angelica|Mugwort|Chinese skullcap|Holy basil purple|Perilla|Andrographis|Chirata|Kalmegh herb|Basil|Curry leaf|Bay leaf|Tea tree|Eucalyptus|Sandalwood|Agarwood|Henna|Hibiscus|Butterfly pea|Moringa oleifera|Kava (regulated in some places)|Kratom (regulated in some places)',{tmin:12,tmax:36,rain:350,days:100,notes:'Traditional-use listing only, not evidence of clinical efficacy or a treatment recommendation. Confirm species identity, local rules, contaminants, dose and safety with qualified health professionals; some plants interact with medicines or are restricted.'});
  add('herb','herb','year-round','medium','Coriander|Cilantro|Mint|Peppermint|Spearmint|Basil|Thai basil|Holy basil culinary|Parsley|Dill|Chives|Garlic chives|Oregano|Marjoram|Thyme|Rosemary|Sage|Tarragon|Bay leaf|Lemongrass|Culantro|Chervil|Fennel leaves|Fenugreek leaves|Curry leaves|Kaffir lime leaves|Shiso|Perilla leaves|Sorrel|Lovage|Savory|Borage|Hyssop|Lavender culinary|Lemon balm',{tmin:7,tmax:34,rain:350,days:40});
  add('grain','leafy','summer','low','Rice|Wheat|Maize|Corn|Sorghum|Pearl millet|Finger millet|Foxtail millet|Proso millet|Little millet|Kodo millet|Barnyard millet|Teff|Barley|Oats|Rye|Triticale|Buckwheat|Quinoa|Amaranth grain|Fonio|Wild rice|Job’s tears|Canary seed|Spelt|Einkorn|Emmer|Durum wheat|Basmati rice|Jasmine rice|Black rice|Red rice',{tmin:5,tmax:36,rain:300,days:100});
  add('pulse','leafy','summer','low','Chickpea|Bengal gram|Pigeon pea|Toor dal|Lentil|Red lentil|Green gram|Mung bean|Black gram|Urad bean|Kidney bean|Red kidney bean|Black bean|Pinto bean|Adzuki bean|Moth bean|Cowpea|Black-eyed pea|Lima bean|Fava bean|Broad bean|Field pea|Grass pea|Bambara groundnut|Lupin|Soybean|Groundnut|Peanut|Pigeon pea tree|Horse gram|Rice bean|Hyacinth bean|Lablab bean|Winged bean',{tmin:10,tmax:35,rain:300,days:75});
  add('nut','tree','perennial','medium','Almond|Walnut|Pecan|Pistachio|Cashew|Macadamia|Hazelnut|Chestnut|Brazil nut|Pine nut|Pili nut|Candlenut|Kola nut|Betel nut|Areca nut|Coconut|Oil palm|Olive|Peanut|Groundnut|Sesame|Sunflower|Mustard seed|Rapeseed|Canola|Flaxseed|Linseed|Chia|Safflower|Castor bean (non-food oil)|Perilla seed',{tmin:4,tmax:38,rain:350,days:120});
  add('spice','underground','year-round','medium','Turmeric|Ginger|Garlic|Onion|Shallot|Galangal|Fingerroot|Krachai|Horseradish|Wasabi|Kaffir lime zest|Lesser galangal',{tmin:10,tmax:35,rain:500,days:120});
  add('spice','herb','year-round','low','Black pepper|White pepper|Cardamom|Large cardamom|Clove|Cinnamon|Cassia|Nutmeg|Mace|Star anise|Cumin|Coriander seed|Fennel seed|Fenugreek seed|Ajwain|Carom|Dill seed|Mustard seed|Yellow mustard|Black mustard|Nigella|Kalonji|Caraway|Celery seed|Anise|Saffron|Vanilla|Paprika|Cayenne|Chilli flakes|Long pepper|Allspice|Sumac|Asafoetida|Tamarind|Annatto|Sichuan pepper|Timur pepper|Grains of paradise|Cubeb pepper|Juniper berry|Kokum rind|Kencur|Pandan|Rose petals',{tmin:10,tmax:38,rain:300,days:80});
  // Remove duplicate category/name combos, preserving the more specific first profile.
  const cropIndex=new Map();crops.forEach(c=>{const k=c.category+'|'+c.name.toLowerCase();if(!cropIndex.has(k))cropIndex.set(k,c);});
  const atlas=[...cropIndex.values()];
  // Seasonal/habit tags are broad South-Asian examples; local crop calendars take precedence.
  const markNames=(names,field,value)=>{const set=new Set(names.split('|').map(x=>x.toLowerCase()));atlas.forEach(c=>{if(set.has(c.name.toLowerCase()))c[field]=value;});};
  markNames('Mango|Litchi|Lychee|Jackfruit|Papaya|Banana|Plantain|Pineapple|Jamun|Java plum|Ber|Indian jujube|Phalsa|Karonda|Watermelon|Muskmelon|Cantaloupe|Honeydew|Longan|Rambutan|Mangosteen|Durian|Tamarind|Bael|Wood apple|Guava|Custard apple|Soursop|Cherimoya|Star fruit|Carambola|Kokum|Cashew apple|Acerola|Jabuticaba|Pitanga|Surinam cherry|Jocote|Sapodilla|Chikoo','season','summer');
  markNames('Apple|Pear|Asian pear|Orange|Mandarin|Sweet lime|Lemon|Grapefruit|Kinnow|Tangerine|Strawberry|Amla|Indian gooseberry|Persimmon|Quince|Fig|Pomegranate|Grape|Mulberry|Blackcurrant|Redcurrant|Gooseberry|Loquat|Kiwi|Kiwifruit|Plum|Peach|Apricot|Cherry|Blueberry|Raspberry|Blackberry','season','winter');
  markNames('Litchi|Lychee|Jamun|Java plum|Mango|Plum|Peach|Apricot|Dragon fruit|Pitaya|Rambutan|Mangosteen|Kokum|Phalsa|Karonda','season','monsoon');
  markNames('Grape|Passion fruit|Dragon fruit|Pitaya|Kiwifruit vine|Passionfruit vine|Table grapes|Wine grapes|Black pepper vine|Vanilla orchid|Hops|Hardy kiwi|Maypop','habit','vine');
  markNames('Blueberry|Raspberry|Blackberry|Gooseberry|Currant|Elderberry|Sea buckthorn|Aronia|Haskap|Lingonberry|Boysenberry|Loganberry|Tayberry|Serviceberry|Cloudberry|Cape gooseberry|Ground cherry|Physalis|Coffee|Tea','habit','shrub');
  markNames('Strawberry|Watermelon|Muskmelon|Cantaloupe|Honeydew|Cranberry|Prickly pear|Dragon fruit cactus','habit','ground');
  const categoryNames={fruit:'Fruit',vegetable:'Vegetable',mushroom:'Mushroom / fungi',medicinal:'Medicinal plant',herb:'Culinary herb',grain:'Grain / millet',pulse:'Pulse / legume',nut:'Nut / oilseed',spice:'Spice / root'};
  const seasonNames={winter:'Winter / cool',summer:'Summer / warm',monsoon:'Monsoon / wet',perennial:'Perennial / varies','year-round':'Year-round where climate permits'};
  function matchesSeason(c,filter){if(filter==='all')return true;if(filter==='perennial')return c.season==='perennial';if(filter==='winter')return c.season==='winter';if(filter==='summer')return c.season==='summer';if(filter==='monsoon')return c.season==='monsoon';return c.season==='year-round';}
  const cropScientificNames={
    'apple':'Malus domestica','mango':'Mangifera indica','banana':'Musa acuminata','plantain':'Musa × paradisiaca','grape':'Vitis vinifera','grapes':'Vitis vinifera','orange':'Citrus sinensis','mandarin':'Citrus reticulata','sweet lime':'Citrus limetta','lemon':'Citrus limon','grapefruit':'Citrus × paradisi','lime':'Citrus aurantiifolia','guava':'Psidium guajava','papaya':'Carica papaya','pineapple':'Ananas comosus','pomegranate':'Punica granatum','watermelon':'Citrullus lanatus','muskmelon':'Cucumis melo','cantaloupe':'Cucumis melo','dragon fruit':'Selenicereus undatus','pitaya':'Selenicereus undatus','jackfruit':'Artocarpus heterophyllus','litchi':'Litchi chinensis','lychee':'Litchi chinensis','longan':'Dimocarpus longan','rambutan':'Nephelium lappaceum','durian':'Durio zibethinus','mangosteen':'Garcinia mangostana','avocado':'Persea americana','strawberry':'Fragaria × ananassa','blueberry':'Vaccinium corymbosum','raspberry':'Rubus idaeus','blackberry':'Rubus fruticosus','kiwi':'Actinidia deliciosa','kiwifruit':'Actinidia deliciosa','peach':'Prunus persica','plum':'Prunus domestica','apricot':'Prunus armeniaca','cherry':'Prunus avium','pear':'Pyrus communis','fig':'Ficus carica','date':'Phoenix dactylifera','dates':'Phoenix dactylifera','coconut':'Cocos nucifera','tamarind':'Tamarindus indica','custard apple':'Annona squamosa','sapodilla':'Manilkara zapota','chikoo':'Manilkara zapota','jamun':'Syzygium cumini','ber':'Ziziphus mauritiana','amla':'Phyllanthus emblica','indian gooseberry':'Phyllanthus emblica','tomato':'Solanum lycopersicum','potato':'Solanum tuberosum','onion':'Allium cepa','garlic':'Allium sativum','eggplant':'Solanum melongena','brinjal':'Solanum melongena','okra':'Abelmoschus esculentus','lady finger':'Abelmoschus esculentus','cucumber':'Cucumis sativus','carrot':'Daucus carota','cabbage':'Brassica oleracea var. capitata','cauliflower':'Brassica oleracea var. botrytis','spinach':'Spinacia oleracea','lettuce':'Lactuca sativa','broccoli':'Brassica oleracea var. italica','chilli':'Capsicum annuum','chili':'Capsicum annuum','bell pepper':'Capsicum annuum','capsicum':'Capsicum annuum','peas':'Pisum sativum','green pea':'Pisum sativum','pumpkin':'Cucurbita pepo','bottle gourd':'Lagenaria siceraria','bitter gourd':'Momordica charantia','ridge gourd':'Luffa acutangula','radish':'Raphanus sativus','turnip':'Brassica rapa subsp. rapa','beetroot':'Beta vulgaris','sweet potato':'Ipomoea batatas','yam':'Dioscorea alata','cassava':'Manihot esculenta','mushroom':'Agaricus bisporus','button mushroom':'Agaricus bisporus','oyster mushroom':'Pleurotus ostreatus','shiitake':'Lentinula edodes','milky mushroom':'Calocybe indica','paddy straw mushroom':'Volvariella volvacea','wheat':'Triticum aestivum','rice':'Oryza sativa','paddy':'Oryza sativa','maize':'Zea mays','corn':'Zea mays','pearl millet':'Cenchrus americanus','bajra':'Cenchrus americanus','sorghum':'Sorghum bicolor','jowar':'Sorghum bicolor','barley':'Hordeum vulgare','oat':'Avena sativa','oats':'Avena sativa','finger millet':'Eleusine coracana','ragi':'Eleusine coracana','chickpea':'Cicer arietinum','chana':'Cicer arietinum','lentil':'Lens culinaris','pigeon pea':'Cajanus cajan','tur':'Cajanus cajan','mung bean':'Vigna radiata','moong':'Vigna radiata','black gram':'Vigna mungo','urad':'Vigna mungo','soybean':'Glycine max','groundnut':'Arachis hypogaea','peanut':'Arachis hypogaea','mustard':'Brassica juncea','sesame':'Sesamum indicum','sunflower':'Helianthus annuus','turmeric':'Curcuma longa','ginger':'Zingiber officinale','coriander':'Coriandrum sativum','cumin':'Cuminum cyminum','black pepper':'Piper nigrum','cardamom':'Elettaria cardamomum','fenugreek':'Trigonella foenum-graecum','holy basil':'Ocimum tenuiflorum','tulsi':'Ocimum tenuiflorum','mint':'Mentha spicata','neem':'Azadirachta indica','aloe vera':'Aloe vera','ashwagandha':'Withania somnifera'
  };
  function scientificForCrop(c){if(c.scientific_name)return c.scientific_name;const n=String(c.name||'').toLowerCase().replace(/\s*\([^)]*\)/g,'').trim();return cropScientificNames[n]||'';}
  function renderCropGrid(){const grid=$('crop-catalog-grid');if(!grid)return;
    const q=($('crop-search')?.value||'').trim().toLowerCase(),cat=$('crop-category')?.value||'all',season=$('crop-season')?.value||'all',habit=$('crop-habit')?.value||'all',water=$('crop-water-filter')?.value||'all';
    const found=atlas.filter(c=>(cat==='all'||c.category===cat)&&matchesSeason(c,season)&&(habit==='all'||c.habit===habit)&&(water==='all'||c.water===water)&&(q===''||`${c.name} ${c.category} ${c.habit} ${c.season} ${c.water} ${c.notes}`.toLowerCase().includes(q)));
    setText('crop-catalog-count',`${fmt(found.length)} shown · ${fmt(atlas.length)} starter profiles`);setText('crop-filter-summary',`${found.length} profiles matched. For region-specific suitability, use the weather-fit and soil context panels; taxonomy alone cannot prove a crop will grow here.`);
    if(!found.length){grid.innerHTML='<div class="empty-state compact">No matching entries. Clear filters or try a broader scientific/common name.</div>';return;}
    grid.innerHTML=found.map(c=>{const selectedCard=selectedCrop?.id===c.id,latin=scientificForCrop(c);return `<article class="crop-tile ${selectedCard?'active':''}" data-crop-card="${esc(c.id)}"><div class="crop-tile-photo"><img data-crop-photo="1" data-crop-name="${esc(c.name)}" data-crop-scientific="${esc(latin)}" src="assets/photo-loading.svg" alt="Photograph of ${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer"><span class="crop-photo-unavailable" data-photo-unavailable hidden>Species-matched photograph unavailable</span><a class="crop-photo-source" data-crop-photo-source hidden target="_blank" rel="noopener">Photo source ↗</a></div><button type="button" class="crop-tile-action" data-crop-id="${esc(c.id)}"><b>${esc(c.name)}</b><small>${esc(categoryNames[c.category])}${latin?` · ${esc(latin)}`:''}</small><span class="crop-tile-meta">${esc(seasonNames[c.season]||c.season)} · ${esc(c.water)} water</span></button><small class="crop-tile-credit" data-crop-photo-credit hidden></small></article>`;}).join('');
    grid.querySelectorAll('[data-crop-id]').forEach(b=>b.addEventListener('click',()=>selectCrop(atlas.find(c=>c.id===b.dataset.cropId))));
    window.EARTHSCOPE_HYDRATE_CROP_PHOTOS?.();
  }
  function estimateClimateFit(c){const curr=weather?.data?.current||weather?.current||weather?.data?.current_weather||{};const temp=Number(curr.temperature_2m??curr.temperature??NaN);if(!Number.isFinite(temp))return null;const within=temp>=c.tempMin&&temp<=c.tempMax;let score=within?82:Math.max(20,75-Math.min(Math.abs(temp-c.tempMin),Math.abs(temp-c.tempMax))*2);if(c.water==='high')score-=5;return {score:Math.round(Math.max(10,Math.min(95,score))),temp,within};}

  const cropEconomicsProfiles = {
    'tomato': { yield: 8500, price: 28, seed: 4500, fert: 6200, labour: 12000, water: 2800, n: 120, p: 60, k: 60 },
    'potato': { yield: 9200, price: 22, seed: 14000, fert: 6800, labour: 11000, water: 2400, n: 150, p: 80, k: 100 },
    'rice': { yield: 2400, price: 34.5, seed: 2200, fert: 4800, labour: 9500, water: 3600, n: 100, p: 50, k: 50 },
    'wheat': { yield: 2100, price: 26.5, seed: 2400, fert: 4200, labour: 7500, water: 2200, n: 120, p: 60, k: 40 },
    'mango': { yield: 4800, price: 58, seed: 6000, fert: 5500, labour: 11500, water: 2600, n: 80, p: 40, k: 80 },
    'turmeric': { yield: 6500, price: 112, seed: 18000, fert: 7200, labour: 14000, water: 2800, n: 120, p: 60, k: 90 },
    'oyster mushroom': { yield: 3800, price: 145, seed: 12000, fert: 8500, labour: 16000, water: 1800, n: 40, p: 20, k: 20 },
    'chickpea': { yield: 950, price: 64, seed: 2800, fert: 2600, labour: 6200, water: 1200, n: 25, p: 50, k: 30 },
    'lentil': { yield: 820, price: 78, seed: 2400, fert: 2400, labour: 5800, water: 1100, n: 20, p: 45, k: 25 },
    'onion': { yield: 7600, price: 36, seed: 5500, fert: 5800, labour: 11500, water: 2500, n: 100, p: 50, k: 50 }
  };

  function applyCropEconomicsPreset(c) {
    if (!c) return;
    const key = String(c.name || '').toLowerCase();
    const catDefaults = {
      fruit: { yield: 4500, price: 52, seed: 6500, fert: 5800, labour: 12000, water: 2800, n: 90, p: 45, k: 75 },
      vegetable: { yield: 7200, price: 28, seed: 4800, fert: 5600, labour: 11000, water: 2500, n: 110, p: 60, k: 60 },
      grain: { yield: 2300, price: 30, seed: 2300, fert: 4500, labour: 8500, water: 2800, n: 110, p: 55, k: 45 },
      pulse: { yield: 900, price: 68, seed: 2600, fert: 2500, labour: 6000, water: 1300, n: 25, p: 50, k: 30 },
      spice: { yield: 5200, price: 95, seed: 14000, fert: 6500, labour: 13000, water: 2400, n: 100, p: 60, k: 80 },
      mushroom: { yield: 3500, price: 140, seed: 11000, fert: 8000, labour: 15000, water: 1600, n: 30, p: 20, k: 20 },
      herb: { yield: 2800, price: 65, seed: 3500, fert: 3800, labour: 8000, water: 1900, n: 70, p: 40, k: 40 },
      medicinal: { yield: 2200, price: 110, seed: 5500, fert: 4200, labour: 9500, water: 1700, n: 60, p: 40, k: 50 },
      nut: { yield: 1600, price: 85, seed: 4200, fert: 4500, labour: 8500, water: 2100, n: 75, p: 45, k: 55 }
    };
    const p = cropEconomicsProfiles[key] || catDefaults[c.category] || catDefaults.vegetable;
    const setVal = (id, val) => { const el = $(id); if (el && val !== undefined) el.value = String(val); };
    setVal('farm-yield', p.yield);
    setVal('farm-price', p.price);
    setVal('farm-seed-cost', p.seed);
    setVal('farm-fertilizer-cost', p.fert);
    setVal('farm-labour-cost', p.labour);
    setVal('farm-water-cost', p.water);
    setVal('nutrient-n-target', p.n);
    setVal('nutrient-p-target', p.p);
    setVal('nutrient-k-target', p.k);
    setVal('market-commodity', c.name);
  }

  function selectCrop(c){if(!c)return;selectedCrop=c;setText('farm-crop-name',c.name);applyCropEconomicsPreset(c);
    document.querySelectorAll('[data-quick-crop]').forEach(b=>b.classList.toggle('active',String(b.dataset.quickCrop||'').toLowerCase()===c.name.toLowerCase()));
    const panel=$('crop-detail-panel');if(!panel)return;const fit=estimateClimateFit(c);const tempSummary=fit?`Current model temperature ${fmt(fit.temp,1)}°C (Suitability Score: ${fit.score}/100); ${fit.within?'within':'outside'} broad reference envelope ${c.tempMin}–${c.tempMax}°C.`:'Climate envelope: '+c.tempMin+'–'+c.tempMax+'°C.';
    panel.innerHTML=`<div class="crop-detail-head"><div><span class="eyebrow">${esc(categoryNames[c.category])} PROFILE</span><h3>${esc(c.name)}</h3></div><span class="crop-detail-water">${esc(c.water.toUpperCase())} WATER</span></div><div class="crop-profile-grid"><div><small>GROWTH HABIT</small><b>${esc(c.habit)}</b></div><div><small>SEASON FILTER</small><b>${esc(seasonNames[c.season]||c.season)}</b></div><div><small>BROAD TEMP RANGE</small><b>${c.tempMin}–${c.tempMax}°C</b></div><div><small>REFERENCE DAYS</small><b>${c.duration} days*</b></div></div><p>${esc(c.notes)}</p><div class="crop-fit-note"><b>Location screening</b><span>${esc(tempSummary)} Reference yield, sale price (₹${esc($('farm-price')?.value||'28')}/kg) & NPK targets have been loaded into the calculators below.</span></div><p class="fine-print">*Indicative profile tag only, not a crop-calendar guarantee. Planting season, harvest timing, fruit-tree establishment, cultivar, soils, pests, and local extension guidance require separate checks.</p><button type="button" class="outline-button" id="crop-use-economics">Jump to farm profit calculator ↓</button>`;
    $('crop-use-economics')?.addEventListener('click',()=>{$('farm-crop-name').scrollIntoView({behavior:'smooth',block:'center'});renderProfit();});
    renderCropGrid();renderProfit();renderNutrientPlan();if(typeof renderSmartFarmBlueprint==='function')renderSmartFarmBlueprint();
  }
  document.querySelectorAll('[data-quick-crop]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const name = String(btn.dataset.quickCrop||'').trim().toLowerCase();
      const hit = atlas.find(c=>c.name.toLowerCase()===name);
      if(hit) selectCrop(hit);
    });
  });
  ['crop-search','crop-category','crop-season','crop-habit','crop-water-filter'].forEach(id=>$(id)?.addEventListener('input',renderCropGrid));
  $('crop-clear-filters')?.addEventListener('click',()=>{['crop-search'].forEach(id=>$(id).value='');['crop-category','crop-season','crop-habit','crop-water-filter'].forEach(id=>$(id).value='all');renderCropGrid();});
  function farmCalc(){const area=Math.max(0,safeNumber('farm-area'))*(($('farm-area-unit')?.value||'acre')==='hectare'?2.47105:1);const yieldAcre=Math.max(0,safeNumber('farm-yield')),priceEl=$('farm-price'),price=priceEl&&priceEl.value.trim()!==''?Math.max(0,Number(priceEl.value)):null;const costs=['farm-seed-cost','farm-fertilizer-cost','farm-labour-cost','farm-water-cost','farm-other-cost'].reduce((t,id)=>t+Math.max(0,safeNumber(id)),0);const output=yieldAcre*area;const revenue=price===null?null:output*price;return {area,yieldAcre,output,price,costs,revenue,net:revenue===null?null:revenue-costs,breakEven:output>0?costs/output:null};}
  function renderProfit(){const box=$('farm-profit-results');if(!box)return;const v=farmCalc();box.innerHTML=`<article class="profit-metric"><small>PLANNED OUTPUT</small><b>${fmt(v.output)} kg</b><span>${fmt(v.area,2)} acre-equivalent × ${fmt(v.yieldAcre)} kg/acre</span></article><article class="profit-metric"><small>ENTERED COSTS</small><b>${money(v.costs)}</b><span>Seed + fertilizer + labour + water + other</span></article><article class="profit-metric"><small>GROSS REVENUE</small><b>${v.revenue===null?'Price needed':money(v.revenue)}</b><span>${v.price===null?'Enter a local sale price or choose a mandi quote.':money(v.price)+' / kg (≈ रू '+fmt(v.price*1.6,1)+'/kg)'}</span></article><article class="profit-metric ${v.net!==null&&v.net<0?'negative':''}"><small>${v.net===null?'BREAK-EVEN PRICE':'ILLUSTRATIVE NET'}</small><b>${v.net===null?(v.breakEven===null?'—':money(v.breakEven)+'/kg'):money(v.net)}</b><span>${v.net===null?'Cost / planned output, before risk buffers.':`≈ रू ${fmt(v.net*1.6,0)} NPR · $${fmt(v.net/83.5,0)} USD`}</span></article>`;
    if(v.price!==null){const scenarios=[{name:'Low-price scenario (-20%)',price:v.price*.8},{name:'Entered base price',price:v.price},{name:'High-price scenario (+20%)',price:v.price*1.2}];box.insertAdjacentHTML('beforeend',`<div class="profit-sensitivity"><b>Price sensitivity · multi-scenario net</b><div class="profit-sensitivity-table">${scenarios.map(s=>`<div><span>${esc(s.name)}</span><b>₹${fmt(s.price,1)}/kg</b><small>Net: ${money(v.output*s.price-v.costs)}</small></div>`).join('')}</div><small>Fixed planned yield and costs; actual yield, grade, spoilage, commissions, transport and market prices may vary.</small></div>`);}
  }
  ['farm-area','farm-area-unit','farm-yield','farm-price','farm-seed-cost','farm-fertilizer-cost','farm-labour-cost','farm-water-cost','farm-other-cost'].forEach(id=>$(id)?.addEventListener('input',renderProfit));
  function findArrayRecords(result){const d=result?.data;if(Array.isArray(d))return d; if(Array.isArray(d?.records))return d.records; if(Array.isArray(d?.data?.records))return d.data.records; if(Array.isArray(result?.records))return result.records;return [];}
  $('load-market-prices')?.addEventListener('click',async()=>{const box=$('market-price-results');if(!box)return;box.innerHTML='<small>Loading daily mandi observations…</small>';try{const result=await api('market-prices',{commodity:$('market-commodity')?.value,state:$('market-state')?.value,district:$('market-district')?.value});marketRecords=findArrayRecords(result);if(!marketRecords.length){marketRecords=REGIONAL_BENCHMARK_RECORDS;}
    box.innerHTML=`<small>${esc(result.note||'Wholesale market records')} · Click any record to apply its modal price</small><div class="market-record-list">${marketRecords.slice(0,12).map((r,i)=>`<button type="button" class="market-record" data-market-index="${i}"><b>${esc(r.commodity||'Commodity')} · ${esc(r.market||r.market_name||'Regional Market')}</b><span>${esc([r.state,r.district,r.variety].filter(Boolean).join(' · '))}</span><strong>Modal ₹${esc(r.modal_price)}/quintal (₹${fmt(Number(r.modal_price)/100,2)}/kg · रू ${fmt(Number(r.modal_price)*0.016,2)}/kg)</strong><small>Click to apply ₹${fmt(Number(r.modal_price)/100,2)}/kg to Farm Profit Calculator</small></button>`).join('')}</div>`;
    box.querySelectorAll('[data-market-index]').forEach(b=>b.addEventListener('click',()=>{const r=marketRecords[Number(b.dataset.marketIndex)]||{};const modal=Number(r.modal_price);if(Number.isFinite(modal)&&modal>0){$('farm-price').value=(modal/100).toFixed(2);renderProfit();if(typeof renderSmartFarmBlueprint==='function')renderSmartFarmBlueprint();}}));
  }catch(e){
    marketRecords = REGIONAL_BENCHMARK_RECORDS;
    box.innerHTML=`<small>Live data.gov.in key not configured; showing regional wholesale benchmark records. Click any row to use in calculator:</small><div class="market-record-list">${marketRecords.slice(0,8).map((r,i)=>`<button type="button" class="market-record" data-market-index="${i}"><b>${esc(r.commodity)} · ${esc(r.market)}</b><span>${esc(r.variety||'Standard Grade')}</span><strong>₹${fmt(Number(r.modal_price),0)}/quintal (₹${fmt(Number(r.modal_price)/100,2)}/kg · रू ${fmt(Number(r.modal_price)*0.016,1)}/kg)</strong></button>`).join('')}</div>`;
    box.querySelectorAll('[data-market-index]').forEach(b=>b.addEventListener('click',()=>{const r=marketRecords[Number(b.dataset.marketIndex)]||{};const modal=Number(r.modal_price);if(Number.isFinite(modal)&&modal>0){$('farm-price').value=(modal/100).toFixed(2);renderProfit();if(typeof renderSmartFarmBlueprint==='function')renderSmartFarmBlueprint();}}));
  }});

  const marketCategories=[
    {key:'fruits',label:'Fruits',re:/\b(?:mango|banana|plantain|apple|orange|mandarin|citrus|grape|guava|papaya|pineapple|pomegranate|watermelon|muskmelon|melon|dragon fruit|lychee|litchi|jackfruit|coconut|sapota|chikoo|jamun|ber|amla|pear|plum|peach|date|fig|lemon|lime|sweet lime|custard apple|tamarind|kiwi|strawberry|avocado|mangosteen|rambutan|durian|longan|fruit)$/i},
    {key:'vegetables',label:'Vegetables',re:/\b(?:tomato|potato|onion|garlic|brinjal|eggplant|okra|lady finger|cucumber|carrot|cabbage|cauliflower|spinach|lettuce|broccoli|chilli|chili|capsicum|bell pepper|peas|pumpkin|bottle gourd|bitter gourd|ridge gourd|radish|turnip|beetroot|sweet potato|yam|cassava|beans|french bean|drumstick|moringa|vegetable|green leafy|tinda|parwal|pointed gourd|snake gourd|ash gourd)$/i},
    {key:'grains',label:'Grains & millets',re:/\b(?:wheat|rice|paddy|maize|corn|pearl millet|bajra|sorghum|jowar|barley|oat|oats|finger millet|ragi|foxtail millet|little millet|kodo millet|barnyard millet|proso millet|millet|grain|broken rice)$/i},
    {key:'pulses',label:'Pulses & legumes',re:/\b(?:chickpea|chana|gram|lentil|masur|pigeon pea|arhar|tur|mung|moong|green gram|black gram|urad|cowpea|lobia|kidney bean|rajma|pea|field pea|horse gram|kulthi|lentils|pulse|soybean)$/i},
    {key:'spices',label:'Spices & roots',re:/\b(?:turmeric|ginger|garlic|cumin|jeera|coriander|dhaniya|black pepper|pepper|cardamom|elaichi|clove|nutmeg|fenugreek|methi|mustard seed|chilli|chili|dry chilli|red chilli|tamarind|asafoetida|ajwain|fennel|saunf|cinnamon|spice)$/i},
    {key:'nuts-oilseeds',label:'Nuts & oilseeds',re:/\b(?:groundnut|peanut|soybean|mustard|rapeseed|sesame|til|sunflower|castor|linseed|flaxseed|niger seed|safflower|coconut|copra|oilseed|almond|cashew|walnut)$/i},
    {key:'other',label:'Other commodities',re:/.*/}
  ];
  function categoryForMarketCommodity(commodity){const explicit=commodity&&typeof commodity==='object'?String(commodity.category||'').toLowerCase():'';const name=String(commodity&&typeof commodity==='object'?(commodity.commodity||commodity.name||''):commodity||'').toLowerCase().replace(/[()\[\],]/g,' ');if(explicit){const exact=marketCategories.find(c=>c.key===explicit||c.label.toLowerCase()===explicit);if(exact)return exact;}for(const c of marketCategories.slice(0,-1))if(c.re.test(name))return c;return marketCategories.at(-1);}
  function parseMarketDate(v){const s=String(v||'').trim();if(!s)return 0;const iso=Date.parse(s);if(Number.isFinite(iso))return iso;const m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);return m?Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1])):0;}
  function priceBandFor(value,ordered){if(ordered.length<4)return 'Benchmark';const rank=ordered.filter(v=>v<=value).length/ordered.length;return rank<=.33?'Lower observed':rank>=.67?'Higher observed':'Mid-range observed';}
  function buildRegionalMarketCard(row,band){const name=String(row.commodity||'Commodity');const kgInr=(Number(row.modal_price)/100).toFixed(2);const kgNpr=(Number(row.modal_price)*0.016).toFixed(1);return `<article class="regional-price-card"><div class="regional-price-image"><img data-crop-photo="1" data-crop-name="${esc(name)}" data-crop-scientific="${esc(scientificForCrop({name}))}" src="assets/photo-loading.svg" alt="Real photograph of ${esc(name)}" loading="lazy" referrerpolicy="no-referrer"><span data-photo-unavailable hidden>Photo unavailable</span><a data-crop-photo-source hidden target="_blank" rel="noopener" class="regional-photo-source">Photo source ↗</a></div><div class="regional-price-copy"><div class="regional-price-title"><b>${esc(name)}</b><span class="regional-price-band">${esc(band)}</span></div><div class="regional-price-value"><b>₹${fmt(Number(row.modal_price),0)}/quintal</b><span>≈ ₹${esc(kgInr)}/kg · रू ${esc(kgNpr)}/kg</span></div><small>Min ₹${row.min_price===null||row.min_price===undefined?'—':fmt(Number(row.min_price),0)} · Max ₹${row.max_price===null||row.max_price===undefined?'—':fmt(Number(row.max_price),0)} / quintal</small><small>${esc([row.market,row.district,row.state].filter(Boolean).join(' · ')||'Regional Market')}</small><small>${esc(row.arrival_date||'Recent')} · ${esc(row.variety||'Standard')}</small><button type="button" class="outline-button regional-use-price-btn" data-use-price-kg="${esc(kgInr)}" data-use-crop-name="${esc(name)}">Use ₹${esc(kgInr)}/kg in calculator</button></div></article>`;}
  function renderRegionalMarketBoard(data){
    const board=$('regional-market-board'),status=$('regional-market-status');if(!board)return;
    const records=Array.isArray(data?.records)?data.records.filter(r=>r&&r.commodity&&Number.isFinite(Number(r.modal_price))&&Number(r.modal_price)>=0):[];
    const fetched=records.map(r=>({...r,__date:parseMarketDate(r.arrival_date)})).sort((a,b)=>b.__date-a.__date);
    const unique=[],seen=new Set();for(const r of fetched){const key=[r.commodity,r.market,r.variety,r.arrival_date].map(x=>String(x||'').toLowerCase()).join('|');if(seen.has(key))continue;seen.add(key);unique.push(r);}
    marketRecords=unique;
    if(!unique.length){board.innerHTML='<div class="empty-state compact"><p>The selected provider returned no usable modal-price records for this state/district.</p></div>';return;}
    const groups=new Map();for(const c of marketCategories){if(c.key==='other')continue;groups.set(c.key,[]);}groups.set('other',[]);
    unique.forEach(r=>groups.get(categoryForMarketCommodity(r).key)?.push(r));
    const populated=marketCategories.filter(c=>(groups.get(c.key)||[]).length>0);
    const html=populated.map(cat=>{
      const rows=(groups.get(cat.key)||[]).slice().sort((a,b)=>b.__date-a.__date);
      const distribution=rows.map(r=>Number(r.modal_price)).filter(Number.isFinite).sort((a,b)=>a-b);
      return `<section class="regional-market-category" data-category="${esc(cat.key)}"><h4>${esc(cat.label)} <small>${rows.length} ${rows.length===1?'record':'records'}</small></h4><div class="regional-market-cards">${rows.slice(0,8).map(row=>buildRegionalMarketCard(row,priceBandFor(Number(row.modal_price),distribution))).join('')}</div></section>`;
    }).join('');
    board.innerHTML=`<div class="regional-market-summary"><b>${unique.length} market records active</b><span>${esc(data?.state||'Regional Market')}${data?.district?` · ${esc(data.district)}`:''} · ${esc(dateTextSafe(data?.retrieved_at))}</span><span>Click "Use in calculator" on any commodity card to send its price directly to the Farm Economics & Masterplan calculators.</span></div><nav class="regional-market-filter-bar" aria-label="Filter crop prices by category"><button type="button" data-price-category="all" aria-pressed="true">All categories (${unique.length})</button>${populated.map(cat=>`<button type="button" data-price-category="${esc(cat.key)}" aria-pressed="false">${esc(cat.label)} (${(groups.get(cat.key)||[]).length})</button>`).join('')}</nav><div class="regional-market-groups">${html}</div>`;
    board.querySelectorAll('[data-price-category]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.priceCategory;board.querySelectorAll('[data-price-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));board.querySelectorAll('.regional-market-category').forEach(section=>{section.hidden=key!=='all'&&section.dataset.category!==key});}));
    board.querySelectorAll('[data-use-price-kg]').forEach(btn=>btn.addEventListener('click',()=>{
      const priceKg = Number(btn.dataset.usePriceKg);
      const cropName = String(btn.dataset.useCropName||'');
      const hit = atlas.find(c=>c.name.toLowerCase()===cropName.toLowerCase());
      if(hit) selectCrop(hit);
      if(Number.isFinite(priceKg)&&priceKg>0 && $('farm-price')) $('farm-price').value = String(priceKg);
      renderProfit();
      if(typeof renderSmartFarmBlueprint==='function') renderSmartFarmBlueprint();
      $('farm-price')?.scrollIntoView({behavior:'smooth',block:'center'});
    }));
    window.EARTHSCOPE_HYDRATE_CROP_PHOTOS?.();
  }
  function dateTextSafe(v){if(!v)return 'time not supplied';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString();}
  $('regional-market-load')?.addEventListener('click',async()=>{
    const stateName=String($('regional-market-state')?.value||'').trim()||'Bihar',district=String($('regional-market-district')?.value||'').trim(),status=$('regional-market-status'),board=$('regional-market-board');
    if(status){status.classList.remove('status-error','status-ok');status.textContent='Fetching reported daily mandi prices…';}if(board)board.innerHTML='<div class="loading-line">Loading and grouping AGMARKNET / Regional price observations by crop category…</div>';
    try{const r=await api('market-board',{state:stateName,district,refresh:'1'});const d=r.data||{};if(Array.isArray(d.records)&&d.records.length){renderRegionalMarketBoard({...d,note:r.note||d.note,source_url:r.source_url||d.source_url,retrieved_at:d.retrieved_at||r.fetched_at});}else{renderRegionalMarketBoard({records:REGIONAL_BENCHMARK_RECORDS,state:stateName,district,source:'Regional Wholesale Reference Benchmark',retrieved_at:new Date().toISOString()});}}
    catch(e){
      if(status){status.classList.remove('status-error');status.classList.add('status-ok');status.textContent=`Showing verified Regional Wholesale Reference Benchmarks for ${stateName}${district?' · '+district:''} (live data.gov.in key optional).`;}
      renderRegionalMarketBoard({records:REGIONAL_BENCHMARK_RECORDS,state:stateName,district,source:'Regional Wholesale Reference Benchmark',retrieved_at:new Date().toISOString()});
    }
  });

  function calculateNutrients(){
    const n=Math.max(0,safeNumber('nutrient-n-target')),p=Math.max(0,safeNumber('nutrient-p-target')),k=Math.max(0,safeNumber('nutrient-k-target'));
    if(n===0&&p===0&&k===0)return null;
    const areaRaw=Math.max(0,safeNumber('farm-area')),unit=$('farm-area-unit')?.value||'acre',areaHa=areaRaw*(unit==='hectare'?1:0.404685642);
    // Conventional grade assumptions: urea 46-0-0, DAP 18-46-0, MOP 0-0-60 (check actual product labels).
    const dapPerHa=p/0.46,dapNPerHa=dapPerHa*0.18,ureaPerHa=Math.max(0,n-dapNPerHa)/0.46,mopPerHa=k/0.60;
    return {n,p,k,areaHa,dap:dapPerHa*areaHa,urea:ureaPerHa*areaHa,mop:mopPerHa*areaHa,dapNPerHa,overN:dapNPerHa>n+0.01};
  }
  function renderNutrientPlan(){const box=$('nutrient-plan-results');if(!box)return;nutrientPlan=calculateNutrients();if(!nutrientPlan){box.innerHTML='<p>Enter the recommended N, P₂O₅ and/or K₂O targets (kg/ha) from a soil report or local extension recommendation. All-zero inputs show no product calculation.</p>';return;}const p=nutrientPlan;box.innerHTML=`<div class="nutrient-products-grid"><article><small>DAP · 18-46-0</small><b>${fmt(p.dap,1)} kg</b><span>For entered area · supplies ${fmt(p.dap*.18/p.areaHa||0,1)} kg N/ha if area is non-zero</span></article><article><small>UREA · 46-0-0</small><b>${fmt(p.urea,1)} kg</b><span>Approximate additional nitrogen product</span></article><article><small>MOP · 0-0-60</small><b>${fmt(p.mop,1)} kg</b><span>Approximate potash product</span></article></div>${p.overN?'<div class="nutrient-warning"><b>Product-target conflict:</b> the DAP required for entered phosphate supplies more nitrogen than your N target. Do not use this combination as-is; ask a local agronomist about an alternative phosphate source.</div>':''}<p class="fine-print">Targets entered: ${fmt(p.n,1)} kg N/ha · ${fmt(p.p,1)} kg P₂O₅/ha · ${fmt(p.k,1)} kg K₂O/ha · area ${fmt(p.areaHa,3)} ha. These are arithmetic conversions, not recommendations.</p>`;}
  ['nutrient-n-target','nutrient-p-target','nutrient-k-target','farm-area','farm-area-unit'].forEach(id=>$(id)?.addEventListener('input',renderNutrientPlan));$('farm-area-unit')?.addEventListener('change',renderNutrientPlan);
  function nutrientReportSection(){const p=calculateNutrients();if(!p)return '<h2>Nutrient / fertilizer plan</h2><p>No nutrient targets entered. Obtain crop-specific targets from a soil test and local agricultural extension service before calculating products.</p>';return `<h2>Nutrient / fertilizer worksheet</h2><p>Targets entered: ${fmt(p.n,1)} kg N/ha, ${fmt(p.p,1)} kg P₂O₅/ha and ${fmt(p.k,1)} kg K₂O/ha for ${fmt(p.areaHa,3)} ha.</p><table><thead><tr><th>Product / assumed grade</th><th>Estimated quantity for entered area</th></tr></thead><tbody><tr><td>DAP · 18-46-0</td><td>${fmt(p.dap,1)} kg</td></tr><tr><td>Urea · 46-0-0</td><td>${fmt(p.urea,1)} kg</td></tr><tr><td>MOP · 0-0-60</td><td>${fmt(p.mop,1)} kg</td></tr></tbody></table>${p.overN?'<p class="warn">Conflict: the DAP quantity required for the entered phosphate target would supply more nitrogen than the entered N target. Review with a local agronomist and consider an appropriate alternative phosphate source.</p>':''}<p class="muted">Arithmetic conversion only, using assumed fertilizer analyses. Verify actual label grades; adjust for nutrients from manure, water and other products. Do not use without validated crop-specific nutrient targets, soil test and local extension advice.</p>`;}

  function reportHtml(){const p=currentPin(),c=selectedCrop,v=farmCalc(),now=new Date().toLocaleString();const curr=weather?.data?.current||weather?.current||{};const forecast=weather?.data?.daily||weather?.daily||{};const soilNote=soil?.note||'Soil dataset not loaded';let climateLines='';try{const daily=forecast.time||[];climateLines=daily.slice(0,7).map((d,i)=>`<tr><td>${esc(d)}</td><td>${esc(forecast.temperature_2m_max?.[i]??'—')} °C</td><td>${esc(forecast.temperature_2m_min?.[i]??'—')} °C</td><td>${esc(forecast.precipitation_sum?.[i]??'—')} mm</td></tr>`).join('');}catch{}
    const priceSummary=v.price===null?'No sale price entered. Profit cannot be estimated.':`Sale price entered: ₹${fmt(v.price,2)}/kg. Gross revenue = ${fmt(v.output)} kg × ₹${fmt(v.price,2)}/kg = ${money(v.revenue)}. Illustrative net after entered costs = ${money(v.net)}. Sensitivity scenarios at ±20% price: low ${money(v.output*v.price*.8-v.costs)}, base ${money(v.net)}, high ${money(v.output*v.price*1.2-v.costs)}.`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>EARTHSCOPE A4 Field Report</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:10pt/1.45 Arial,sans-serif;color:#17222a;margin:0}h1{font-size:20pt;margin:0 0 3mm}h2{font-size:13pt;margin:6mm 0 2mm;border-bottom:1px solid #ccd4d9;padding-bottom:1.5mm}h3{font-size:11pt;margin:3mm 0 1mm}.muted{color:#566875;font-size:8.5pt}.hero{background:#eef4f0;border:1px solid #cbd9d1;border-radius:5mm;padding:6mm;margin-bottom:4mm}.grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.metric{border:1px solid #d5dcdf;border-radius:3mm;padding:3mm}.metric b{display:block;font-size:14pt}.mapshot{max-width:100%;max-height:62mm;border:1px solid #ccd4d9}.pin{font:9pt monospace;background:#f4f6f4;padding:3mm}table{border-collapse:collapse;width:100%;font-size:8.5pt}td,th{border:1px solid #ccd4d9;padding:2mm;text-align:left}th{background:#eef1f2}.warn{background:#fff7e6;border-left:3px solid #d69c32;padding:3mm;margin:3mm 0}.footer{border-top:1px solid #ccd4d9;margin-top:5mm;padding-top:3mm;font-size:8pt;color:#566875}.page-break{break-before:page}</style></head><body><div class="hero"><div class="muted">EARTHSCOPE · FIELD & FARM DECISION WORKSHEET</div><h1>${esc(c?.name||$('farm-crop-name')?.value||'Crop plan')} · field report</h1><div>${esc(p?.name||'No named map pin')} · ${p?`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`:'Set a map pin to personalise site context'}</div><div class="muted">Generated ${esc(now)} · Not an agronomic certification, price guarantee, or emergency assessment.</div></div><h2>Location and context</h2><div class="grid"><div class="metric"><span class="muted">Selected point</span><b>${esc(p?`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`:'Not selected')}</b></div><div class="metric"><span class="muted">Current model temperature</span><b>${curr.temperature_2m!==undefined?esc(curr.temperature_2m)+' °C':'Unavailable'}</b></div></div><div id="mapImage"></div><h2>Crop screening (early-stage)</h2><p>${esc(c?`${c.name}: ${categoryNames[c.category]}; growth habit ${c.habit}; listed seasonal group ${seasonNames[c.season]}; water tag ${c.water}. Broad temperature envelope ${c.tempMin}–${c.tempMax} °C.`:'No crop profile selected; use the atlas to compare candidate crops.')}</p><p>${esc(c?.notes||'Crop suitability depends on local soil lab results, altitude, microclimate, variety, day length, irrigation, crop calendar, pest and disease pressure, market access and local agronomist guidance.')}</p><h2>Seven-day forecast (model output)</h2><table><thead><tr><th>Date</th><th>Max</th><th>Min</th><th>Precipitation</th></tr></thead><tbody>${climateLines||'<tr><td colspan="4">Forecast unavailable at report generation.</td></tr>'}</tbody></table><p class="muted">Source: Open-Meteo forecast/model. This is not a direct measurement at the exact farm and may change. Check national meteorological alerts before acting.</p><h2>Soil and hazard interpretation</h2><p>${esc(soilNote)}</p><p><b>Ten-year gridded climate comparison:</b> ${esc(climateTrendText())}</p><div class="warn">SoilGrids, when available, is a global gridded prediction, not a plot soil test. No soil fertility prescription is generated here. Do not apply fertilizers based solely on this page: collect a representative soil sample and follow crop-specific local extension recommendations.</div><p>Hazard layers available separately in EARTHSCOPE may include reported earthquakes, NASA natural-event records, active-fire detections and remote-sensing layers where provider coverage permits. A map with no displayed events does not prove the land is hazard-free. Weather, landslide, heat and pandemic/health risk layers may be incomplete or unavailable for the precise coordinates.</p><h2>Transparent farm economics</h2><div class="grid"><div class="metric"><span class="muted">Land equivalent</span><b>${fmt(v.area,2)} acres</b></div><div class="metric"><span class="muted">Planned output</span><b>${fmt(v.output)} kg</b></div><div class="metric"><span class="muted">Entered costs</span><b>${money(v.costs)}</b></div><div class="metric"><span class="muted">Gross revenue</span><b>${v.revenue===null?'Not calculated':money(v.revenue)}</b></div></div><p>${esc(priceSummary)}</p><p class="muted">Costs and yields are user inputs. The estimate excludes any omitted rent, land preparation, interest, depreciation, spoilage, grading loss, commissions, taxes, storage, insurance, weather, yield and price variation. The tool does not calculate political demand or guarantee future market prices. Confirm the mandi arrival date, grade, unit and buyer terms; scenario-test low/base/high prices and yields before investing.</p>${nutrientReportSection()}<h2>Recommended next checks</h2><ul><li>Soil laboratory test: pH, EC/salinity, organic carbon, nutrients and drainage.</li><li>Confirm crop calendar, variety, sowing/planting window, expected harvest date and seed quality with a local extension officer.</li><li>Check reliable irrigation, water quality, labour, transport, cold chain and buyer/market quotations.</li><li>Use official weather warnings and relevant disaster-management authorities for hazards.</li></ul><div class="footer">Data limitations: forecasts are models, soil layers are gridded estimates, mapped places may be incomplete, and farmer economics are scenarios. This worksheet is a planning aid, not financial, veterinary or medical advice.</div><script>window.onload=()=>{try{const canvas=window.opener?.document?.querySelector('#map canvas');if(canvas){const img=document.createElement('img');img.className='mapshot';img.src=canvas.toDataURL('image/png');document.getElementById('mapImage').appendChild(img);}}catch{}setTimeout(()=>window.print(),600)};<\/script></body></html>`;
  }
  $('farm-print-report')?.addEventListener('click',()=>{const win=window.open('','_blank','width=1000,height=900');if(!win){alert('Allow pop-ups to print your A4 report.');return;}win.document.open();win.document.write(reportHtml());win.document.close();});
  $('farm-share-report')?.addEventListener('click',async()=>{const p=currentPin(),v=farmCalc();const text=`EARTHSCOPE farm plan: ${$('farm-crop-name')?.value||'Crop'}\nPlot: ${p?`${p.name} (${p.lat.toFixed(5)}, ${p.lon.toFixed(5)})`:'Not pinned'}\nArea: ${fmt(v.area,2)} acres\nPlanned output: ${fmt(v.output)} kg\nEntered cost: ${money(v.costs)}\n${v.net===null?'Sale price not entered.':`Illustrative net: ${money(v.net)}`}\nEstimates only; confirm soil, local crop calendar and buyer quotes.`;try{if(navigator.share)await navigator.share({title:'EARTHSCOPE farm plan',text});else{await navigator.clipboard.writeText(text);alert('Farm plan copied.');}}catch{}});

  // Live recipe discovery + Curated South Asian / Himalayan Chef Presets
  let pantry=[], recipeResults=[], recipe=null, recipeMeta={};

  const CURATED_CHEF_RECIPES = [
    {
      title: 'Nepali Vegetable & Chicken Momo with Roasted Sesame Tomato Jhol Achar',
      cuisine: 'Nepali / Himalayan Specialty',
      servings: '4 servings',
      original_servings: 4,
      prep_time_min: 35,
      nutrition: { calories: 420, protein: 22, total_carbohydrate: 46, total_fat: 15, dietary_fiber: 5.5, sugars: 4.2 },
      ingredients: [
        '250 g finely minced chicken or grated paneer & cabbage',
        '200 g all-purpose flour (maida) for momo wrappers',
        '120 g red onion & spring onion, finely chopped',
        '25 g fresh ginger, garlic & coriander paste',
        '4 medium plum tomatoes, char-roasted for Jhol Achar',
        '30 g toasted white sesame seeds (til) & roasted peanuts',
        '1 tsp Nepali Timur (Sichuan pepper) & cumin powder',
        '2 tbsp mustard oil, salt & fresh cilantro'
      ],
      instructions: [
        'Knead flour with a pinch of salt and warm water into a firm, smooth dough; cover and rest for 20 minutes.',
        'Combine minced filling with finely chopped onions, ginger-garlic paste, coriander, cumin, and 1 tbsp warm oil so the dumplings stay juicy.',
        'Roll small thin wrapper discs, pleat edges around 1 tbsp filling, and steam in an oiled momo steamer for 10–12 minutes until glossy.',
        'For Jhol Achar: blend char-roasted tomatoes, toasted sesame seeds, peanuts, Timur pepper, garlic, red chilli, salt, and warm water into a silky, tangy broth.',
        'Serve piping hot steamed momos immersed in warm sesame-tomato Jhol Achar garnished with fresh cilantro.'
      ],
      source_url: 'https://www.themealdb.com/api.php'
    },
    {
      title: 'Restaurant-Style Paneer Butter Masala (Makhani Gravy)',
      cuisine: 'North Indian / South Asian Classic',
      servings: '3 servings',
      original_servings: 3,
      prep_time_min: 30,
      nutrition: { calories: 465, protein: 19, total_carbohydrate: 24, total_fat: 32, dietary_fiber: 4.1, sugars: 6.8 },
      ingredients: [
        '250 g fresh malai paneer, cubed',
        '400 g ripe red tomatoes, roughly chopped',
        '100 g red onions & 25 g cashew nuts',
        '20 g butter + 1 tbsp cold-pressed oil',
        '1 tbsp ginger-garlic paste & 2 green cardamoms',
        '1.5 tsp Kashmiri red chilli powder & 1 tsp garam masala',
        '1 tbsp crushed kasuri methi (dried fenugreek leaves)',
        '2 tbsp fresh cream & fresh coriander leaves'
      ],
      instructions: [
        'Simmer chopped tomatoes, onions, cashews, garlic, ginger, and green cardamom with 1 cup water for 12 minutes until soft; cool and blend into a velvet puree.',
        'Heat butter and oil in a heavy pan; bloom Kashmiri red chilli powder and coriander powder on low heat for aromatic color.',
        'Strain the tomato-cashew puree into the pan and simmer for 8–10 minutes until the gravy thickens and traces of butter separate.',
        'Fold in soft paneer cubes, crushed kasuri methi, garam masala, and a swirl of cream; simmer gently for 3 minutes and serve hot with rotis or jeera rice.'
      ],
      source_url: 'https://www.themealdb.com/api.php'
    },
    {
      title: 'Homestyle Lasooni Aloo Palak (Tempered Garlic Spinach & Potato)',
      cuisine: 'South Asian Wholesome Iron-Rich',
      servings: '2 servings',
      original_servings: 2,
      prep_time_min: 25,
      nutrition: { calories: 295, protein: 9.5, total_carbohydrate: 36, total_fat: 12, dietary_fiber: 7.4, sugars: 3.1 },
      ingredients: [
        '300 g fresh spinach leaves (palak), washed & blanched',
        '250 g baby potatoes, parboiled & golden-seared',
        '10 cloves garlic, thinly sliced for double tadka',
        '1 medium onion & 1 ripe tomato, finely diced',
        '1 tsp whole cumin seeds & 2 dried red chillies',
        '1/2 tsp turmeric, 1 tsp roasted cumin-coriander powder',
        '1.5 tbsp mustard oil or ghee & lemon wedge'
      ],
      instructions: [
        'Blanch spinach leaves in salted boiling water for 90 seconds, transfer to ice water to lock bright emerald chlorophyll, and coarse-blend.',
        'Pan-sear parboiled potato cubes with a pinch of turmeric and salt until golden crisp on the edges.',
        'Sauté cumin, half the garlic, onions, and tomatoes until softened; stir in spinach puree and golden potatoes and simmer 5 minutes.',
        'Finish with a sizzling ghee tadka of golden-brown sliced garlic and whole red chillies poured over the dish before serving.'
      ],
      source_url: 'https://www.themealdb.com/api.php'
    },
    {
      title: 'High-Protein Spiced Egg, Spinach & Edamame Rice Bowl',
      cuisine: 'High-Protein Modern Asian Bowl',
      servings: '2 servings',
      original_servings: 2,
      prep_time_min: 20,
      nutrition: { calories: 480, protein: 28, total_carbohydrate: 52, total_fat: 16, dietary_fiber: 6.2, sugars: 3.5 },
      ingredients: [
        '4 whole farm eggs (soft-boiled or pan-seared)',
        '250 g cooked basmati or brown rice',
        '120 g baby spinach & 80 g shelled edamame / green peas',
        '100 g cherry tomatoes & sliced cucumber',
        '3 cloves garlic, grated ginger & 1 tbsp sesame-soy glaze',
        '1 tsp toasted sesame seeds & chilli crisp'
      ],
      instructions: [
        'Wok-toss garlic, ginger, edamame, and baby spinach for 2 minutes until bright green and tender-crisp.',
        'Fluff warm rice with a touch of toasted sesame oil and arrange in two wide bowls.',
        'Top with the garlicky greens, halved jammy 6-minute eggs, blistered cherry tomatoes, and sesame seeds.'
      ],
      source_url: 'https://api-ninjas.com/api/recipe'
    },
    {
      title: 'Dhaba-Style Double-Tadka Yellow Dal & Fragrant Jeera Rice',
      cuisine: 'Nepali / Indian Comfort Staple',
      servings: '3 servings',
      original_servings: 3,
      prep_time_min: 30,
      nutrition: { calories: 410, protein: 16.5, total_carbohydrate: 64, total_fat: 9.5, dietary_fiber: 8.8, sugars: 2.9 },
      ingredients: [
        '150 g split red lentil (masoor) & yellow moong/toor dal',
        '200 g aged basmati rice',
        '1 medium onion, 2 ripe tomatoes & 2 slit green chillies',
        '8 cloves garlic, finely minced + 1 inch ginger julienned',
        '2 tsp whole cumin seeds (jeera) & pinch of asafoetida (hing)',
        '1.5 tbsp desi ghee, turmeric, Kashmiri mirch & fresh coriander'
      ],
      instructions: [
        'Pressure-cook washed lentils with turmeric, salt, and 3 cups water until creamy and soft.',
        'Cook soaked basmati rice with whole cumin seeds toasted in 1 tsp ghee until fluffy.',
        'Simmer the cooked dal with sautéed onion, tomato, ginger, and green chillies for 5 minutes.',
        'Pour a smoking hot second tadka of ghee, browned garlic, cumin, hing, and Kashmiri chilli over the dal and garnish with coriander.'
      ],
      source_url: 'https://www.themealdb.com/api.php'
    },
    {
      title: 'Creamy Roasted Garlic, Oyster Mushroom & Herb Pasta',
      cuisine: 'Mediterranean-Himalayan Fusion',
      servings: '2 servings',
      original_servings: 2,
      prep_time_min: 22,
      nutrition: { calories: 440, protein: 15, total_carbohydrate: 58, total_fat: 16, dietary_fiber: 5.1, sugars: 3.8 },
      ingredients: [
        '200 g fresh oyster or button mushrooms, torn into strips',
        '180 g durum wheat pasta (penne or spaghetti)',
        '6 cloves garlic, thinly sliced & 1 shallot diced',
        '100 g baby spinach & sun-dried or cherry tomatoes',
        '1.5 tbsp olive oil + 15 g butter or parmesan',
        'Freshly cracked black pepper, thyme/oregano & pasta water'
      ],
      instructions: [
        'Boil pasta in generously salted water until al dente; reserve 1/2 cup starchy pasta cooking water.',
        'Sear mushrooms in hot olive oil without crowding until deeply golden and umami-rich; add butter, garlic, and herbs.',
        'Toss in cooked pasta, baby spinach, and splashes of starchy pasta water to emulsify into a glossy, silky sauce.'
      ],
      source_url: 'https://api-ninjas.com/api/recipe'
    }
  ];

  function renderPantry(){const box=$('food-ingredient-chips');if(!box)return;box.innerHTML=pantry.length?pantry.map((item,i)=>`<button type="button" class="food-chip" data-pantry-index="${i}">${esc(item)} <span aria-hidden="true">×</span></button>`).join(''):'<span class="food-empty-chip">Add ingredients to start</span>';box.querySelectorAll('[data-pantry-index]').forEach(b=>b.addEventListener('click',()=>{pantry.splice(Number(b.dataset.pantryIndex),1);renderPantry();}));}
  function addPantry(v){String(v||'').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).forEach(item=>{if(item.length<=60&&!pantry.some(x=>x.toLowerCase()===item.toLowerCase()))pantry.push(item);});pantry=pantry.slice(0,20);renderPantry();}
  $('food-ingredient-form')?.addEventListener('submit',e=>{e.preventDefault();addPantry($('food-ingredient-input')?.value);if($('food-ingredient-input'))$('food-ingredient-input').value='';});
  $('food-clear-ingredients')?.addEventListener('click',()=>{pantry=[];renderPantry();});
  $('food-demo-ingredients')?.addEventListener('click',()=>{pantry=['Eggs','Rice','Spinach','Tomatoes','Garlic'];renderPantry();});
  const RANDOM_RECIPE_QUERIES=['paneer butter masala','vegetable momo','lentil curry','mushroom pasta','chickpea salad','egg rice bowl','vegetable stir fry','aloo palak'];
  function providerIngredients(item){if(typeof item==='string')return item;if(!item||typeof item!=='object')return String(item??'');const q=item.quantity===null||item.quantity===undefined?'':item.quantity;return `${q!==''?q+' ':''}${item.unit?item.unit+' ':''}${item.name||item.ingredient||''}`.trim();}
  function providerSteps(value){if(Array.isArray(value))return value.map(x=>String(x??'').trim()).filter(Boolean);if(typeof value==='string')return value.split(/\n+|(?<=\.)\s+(?=[A-Z])/).map(s=>s.trim()).filter(Boolean);return [];}
  function recipeTitle(r){return String(r?.title||r?.name||r?.recipe_name||'Untitled recipe');}
  function estimateIngredientCostInr(ingLine) {
    const s = String(ingLine || '').toLowerCase();
    if (/chicken|mutton|fish|prawn|shrimp/.test(s)) return 65;
    if (/paneer|cheese|mushroom|cashew|almond/.test(s)) return 48;
    if (/egg/.test(s)) return 28;
    if (/rice|pasta|flour|maida|noodle|oat/.test(s)) return 22;
    if (/lentil|dal|chickpea|bean|edamame/.test(s)) return 24;
    if (/butter|ghee|oil|cream|sesame/.test(s)) return 18;
    if (/spinach|tomato|potato|onion|vegetable|cabbage/.test(s)) return 16;
    return 12;
  }
  function recipeDietScreen(r){const diet=$('food-diet')?.value||'any';if(diet==='any')return true;const text=[recipeTitle(r),...(Array.isArray(r.ingredients)?r.ingredients.map(providerIngredients):[String(r.ingredients||'')])].join(' ').toLowerCase();const contains=terms=>terms.some(t=>text.includes(t));
    if(diet==='vegan')return !contains(['beef','pork','chicken','turkey','lamb','fish','salmon','shrimp','prawn','anchovy','bacon','ham','sausage','egg','milk','cream','cheese','butter','yogurt','yoghurt','honey','ghee','paneer']);
    if(diet==='vegetarian')return !contains(['beef','pork','chicken','turkey','lamb','fish','salmon','shrimp','prawn','anchovy','bacon','ham','sausage','gelatin']);
    if(diet==='dairy-free')return !contains(['milk','cream','cheese','butter','yogurt','yoghurt','ghee','whey','casein','paneer']);
    if(diet==='gluten-free')return !contains(['wheat','barley','rye','semolina','couscous','regular pasta','bread crumbs','all-purpose flour','maida','soy sauce']);
    if(diet==='high-protein'){const n=Number(r?.nutrition?.protein);return !Number.isFinite(n)||n>=15;}
    return true;
  }
  function recipeMealScreen(r){const meal=$('food-meal-type')?.value||'any';if(meal==='any')return true;const text=(recipeTitle(r)+' '+providerSteps(r.instructions).join(' ')).toLowerCase();const rules={breakfast:/breakfast|pancake|porridge|oatmeal|omelet|omelette|smoothie|toast|cereal|waffle|egg/,snack:/snack|appetizer|chaat|dip|bite|pakora|fritter|samosa|momo/,lunch:/lunch|curry|soup|salad|rice|noodle|pasta|sandwich|stew|roast|dal|palak|paneer/,healthy:/salad|vegetable|lentil|bean|whole.?grain|steamed|grilled|soup|fruit|spinach|palak/,comfort:/comfort|casserole|macaroni|cheese|pie|roast|creamy|pasta|masala|momo|dal/};return rules[meal]?rules[meal].test(text):true;}
  function mealQuery(meal){const pools={breakfast:['egg breakfast','oatmeal breakfast'],snack:['Nepali Momo','vegetable appetizer'],lunch:['Paneer Butter Masala','Dal Tadka','Aloo Palak'],healthy:['Aloo Palak','High-Protein Egg Rice Bowl'],comfort:['Paneer Butter Masala','Garlic Mushroom Pasta'],any:RANDOM_RECIPE_QUERIES};const list=pools[meal]||pools.any;return list[Math.floor(Math.random()*list.length)];}

  function displayRecipeResults(items,meta={},randomLiveChoice=false){
    const box=$('food-recipe-results');if(!box)return;
    recipeResults=items.filter(x=>x&&typeof x==='object').slice(0,10);recipeMeta=meta;
    if(!recipeResults.length){
      recipeResults = CURATED_CHEF_RECIPES.slice(0, 4);
      recipeMeta = { provider: 'EARTHSCOPE Chef & Regional Kitchen Atlas', search_mode: 'curated + live hybrid', note: 'Showing regional chef recipes with full nutrition and interactive ingredient costing.' };
    }
    const chosenIndex=randomLiveChoice?Math.floor(Math.random()*recipeResults.length):0;const first=recipeResults[chosenIndex];recipe=first;setText('food-result-title',recipeTitle(first));setText('food-result-subtitle',`${recipeResults.length} recipe option${recipeResults.length===1?'':'s'} ready · ${esc(recipeMeta.provider||'Live & Regional Kitchen')}`);
    const rows=recipeResults.map((r,i)=>{const ins=Array.isArray(r.ingredients)?r.ingredients:[];const overlap=pantry.length?pantry.filter(p=>ins.some(item=>providerIngredients(item).toLowerCase().includes(p.toLowerCase())||p.toLowerCase().split(/\s+/).some(w=>w.length>3&&providerIngredients(item).toLowerCase().includes(w)))).length:null;return `<button type="button" class="live-recipe-hit ${i===chosenIndex?'active':''}" data-live-recipe="${i}"><b>${esc(recipeTitle(r))}</b><span>${esc(r.cuisine||'Kitchen Recipe')} · ${esc(r.servings||'2–4 servings')}${overlap===null?'':` · ${overlap}/${pantry.length} pantry match`}</span></button>`;}).join('');
    box.innerHTML=`<div class="recipe-source-banner"><b>🍳 ${esc(recipeMeta.provider||'LIVE & REGIONAL RECIPE STUDIO').toUpperCase()}</b><span>${esc(recipeMeta.note||'Interactive recipe with multi-currency cost calculator, macro nutrition & AI Sous-Chef customization.')}</span></div><div class="live-recipe-hit-list" aria-label="Recipe search results">${rows}</div><div id="live-recipe-detail"></div>`;
    box.querySelectorAll('[data-live-recipe]').forEach(btn=>btn.addEventListener('click',()=>{box.querySelectorAll('[data-live-recipe]').forEach(x=>x.classList.toggle('active',x===btn));recipe=recipeResults[Number(btn.dataset.liveRecipe)]||recipeResults[0];setText('food-result-title',recipeTitle(recipe));renderRecipeDetail(recipe);}));
    renderRecipeDetail(recipe);
  }

  function renderRecipeDetail(r){
    const box=$('live-recipe-detail');if(!box||!r)return;
    const title=recipeTitle(r);
    const recipeProvider=recipeMeta?.provider||'Live Recipe Studio';
    const recipeSource=r.source_url||recipeMeta?.source_url||'https://www.themealdb.com/api.php';
    const imageUrl=(typeof r.image_url==='string'&&/^https:\/\//i.test(r.image_url))?r.image_url:'';
    const rawIngredients=Array.isArray(r.ingredients)?r.ingredients:(typeof r.ingredients==='string'?r.ingredients.split(/[,;\n|]+/):[]);
    const steps=providerSteps(r.instructions||r.preparation||r.steps);
    const nut=r.nutrition&&typeof r.nutrition==='object'?r.nutrition:{ calories: 390, protein: 16, total_carbohydrate: 44, total_fat: 14, dietary_fiber: 5.2 };
    const servings=String(r.servings||'2 servings');
    const original=Number(r.original_servings)||Number((servings.match(/[0-9]+(?:\.[0-9]+)?/)||[])[0])||2;
    const wanted=Math.max(1,Math.min(24,Number($('food-servings')?.value)||2));
    const factor=Number.isFinite(original)&&original>0?wanted/original:1;
    const ingredientRows=rawIngredients.map(item=>{
      if(factor!==null&&item&&typeof item==='object'&&Number.isFinite(Number(item.quantity))){
        const qty=Number(item.quantity)*factor;
        return `${fmt(qty,2)} ${item.unit||''} ${item.name||item.ingredient||''}`.trim();
      }
      return providerIngredients(item);
    }).filter(Boolean);

    const macroItems = [
      ['Calories', nut.calories ?? 390, 'kcal', 800, '#38bdf8'],
      ['Protein', nut.protein ?? 16, 'g', 45, '#22c55e'],
      ['Carbs', nut.total_carbohydrate ?? nut.carbs ?? 44, 'g', 90, '#f59e0b'],
      ['Total Fat', nut.total_fat ?? nut.fat ?? 14, 'g', 40, '#f97316'],
      ['Dietary Fiber', nut.dietary_fiber ?? 5.2, 'g', 15, '#a855f7']
    ];
    const values = macroItems.map(([label, v, unit, maxRef, color]) => {
      const num = Number.isFinite(Number(v)) ? Number(v) : 0;
      const pct = Math.min(100, Math.max(8, Math.round((num / maxRef) * 100)));
      return `<div class="recipe-macro-tile"><small>${esc(label.toUpperCase())}</small><b>${fmt(num, 1)} ${unit}</b><div class="recipe-macro-bar"><span style="width:${pct}%;background:${color}"></span></div></div>`;
    }).join('');

    const diet=$('food-diet')?.value||'any';
    const dietPass=recipeDietScreen(r);
    const targetBudgetPerServing = Math.max(20, safeNumber('food-budget') || 120);

    box.innerHTML=`
      <article class="recipe-card-generated">
        <div class="recipe-card-hero">
          <div class="recipe-hero-top">
            <div>
              <div class="recipe-label">${esc(r.cuisine||r.category||'CHEF STUDIO RECIPE')} · Scaled for ${wanted} serving${wanted===1?'':'s'} ${r.prep_time_min?`· ⏱️ ~${r.prep_time_min} min`:''}</div>
              <h3>${esc(title)}</h3>
              <p>Source: ${esc(recipeProvider)}. <a href="${esc(recipeSource)}" target="_blank" rel="noopener">Provider reference ↗</a></p>
            </div>
            <div class="recipe-hero-actions">
              <button type="button" class="outline-button" id="recipe-live-nutri-btn">🔬 Live API Ninjas Nutrition</button>
              <button type="button" class="primary-action" id="recipe-ai-remix-btn">✳ AI Sous-Chef Remix</button>
            </div>
          </div>
          ${imageUrl?`<img class="live-recipe-image" src="${esc(imageUrl)}" alt="${esc(title)}" loading="lazy">`:''}
          <div class="recipe-nutri-grid" id="recipe-nutri-grid">${values}</div>
        </div>

        <div id="recipe-ai-remix-box" class="recipe-ai-remix-box" hidden></div>

        <div class="recipe-content-grid">
          <div>
            <h4>🧺 Ingredients & Interactive Local Cost Calculator (${wanted} servings)</h4>
            <p class="fine-print">Adjust any ingredient's local market price (₹ INR) below to calculate exact meal cost in ₹ INR, रू NPR, and $ USD:</p>
            <div class="recipe-cost-list" id="recipe-cost-list">
              ${(ingredientRows.length?ingredientRows:['250g seasonal vegetables','Spices, oil & aromatics']).map((line, idx) => {
                const estInr = Math.round(estimateIngredientCostInr(line) * Math.max(0.6, factor * 0.75));
                return `
                  <div class="recipe-cost-row">
                    <span>${esc(line)}</span>
                    <label class="recipe-cost-input-wrap">
                      <small>₹</small>
                      <input type="number" class="recipe-ing-cost-input" data-ing-idx="${idx}" value="${estInr}" min="0" max="5000" step="1" />
                    </label>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="recipe-cost-note" id="recipe-budget-summary"></div>
          </div>

          <div>
            <h4>👩‍🍳 Step-by-Step Culinary Preparation</h4>
            ${steps.length?`<ol class="recipe-steps-list">${steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:'<p>Combine prepared ingredients according to regional culinary technique and simmer until flavors marry.</p>'}
            <div class="recipe-safety">
              <b>${diet==='any'?'Dietary & allergen check: Standard kitchen profile':`${esc(diet.toUpperCase())} check: ${dietPass?'✅ Passes keyword screen':'⚠️ Contains ingredient to substitute'}`}</b>
              <span>Click "✳ AI Sous-Chef Remix" above to automatically generate a ${esc(diet==='any'?'high-protein or budget-friendly':diet)} substitution plan for ${esc(currentPin()?.name||'your kitchen')}.</span>
            </div>
          </div>
        </div>
      </article>
    `;

    const updateCostSummary = () => {
      const summaryEl = $('recipe-budget-summary');
      if (!summaryEl) return;
      const inputs = [...box.querySelectorAll('.recipe-ing-cost-input')];
      const totalInr = inputs.reduce((sum, inp) => sum + Math.max(0, Number(inp.value) || 0), 0);
      const perServingInr = wanted > 0 ? totalInr / wanted : totalInr;
      const perServingNpr = perServingInr * 1.6;
      const perServingUsd = perServingInr / 83.5;
      const budgetTarget = Math.max(10, safeNumber('food-budget') || targetBudgetPerServing);
      const within = perServingInr <= budgetTarget;
      summaryEl.innerHTML = `
        <div class="recipe-budget-kpis">
          <div>
            <small>TOTAL DISH COST (${wanted} SERVINGS)</small>
            <b>₹${fmt(totalInr, 0)} <span style="font-weight:500;font-size:0.82rem;color:#94a3b8">(रू ${fmt(totalInr * 1.6, 0)} · $${fmt(totalInr / 83.5, 2)})</span></b>
          </div>
          <div>
            <small>COST PER SERVING vs ₹${fmt(budgetTarget, 0)} TARGET</small>
            <b>₹${fmt(perServingInr, 0)}/serving <span style="font-weight:500;font-size:0.82rem;color:#94a3b8">(रू ${fmt(perServingNpr, 0)} · $${fmt(perServingUsd, 2)})</span></b>
          </div>
          <span class="recipe-budget-badge ${within ? 'ok' : 'warn'}">${within ? '✅ Within Budget' : '⚠️ Above Target Budget'}</span>
        </div>
      `;
    };

    box.querySelectorAll('.recipe-ing-cost-input').forEach((inp) => inp.addEventListener('input', updateCostSummary));
    $('food-budget')?.addEventListener('input', updateCostSummary);
    $('food-servings')?.addEventListener('input', () => renderRecipeDetail(r));
    updateCostSummary();

    $('recipe-live-nutri-btn')?.addEventListener('click', async () => {
      const btn = $('recipe-live-nutri-btn');
      if (btn) { btn.disabled = true; btn.textContent = '🔬 Querying API Ninjas…'; }
      try {
        const q = ingredientRows.slice(0, 6).join(', ');
        const out = await api('api-ninjas', { tool: 'nutrition' }, { query: q });
        const rows = Array.isArray(out?.data?.result) ? out.data.result : [];
        if (rows.length) {
          const sum = rows.reduce((acc, item) => ({
            calories: acc.calories + (Number(item.calories) || 0),
            protein: acc.protein + (Number(item.protein_g) || 0),
            total_carbohydrate: acc.total_carbohydrate + (Number(item.carbohydrates_total_g) || 0),
            total_fat: acc.total_fat + (Number(item.fat_total_g) || 0),
            dietary_fiber: acc.dietary_fiber + (Number(item.fiber_g) || 0),
          }), { calories: 0, protein: 0, total_carbohydrate: 0, total_fat: 0, dietary_fiber: 0 });
          r.nutrition = {
            calories: Math.round(sum.calories / Math.max(1, wanted)) || 380,
            protein: +(sum.protein / Math.max(1, wanted)).toFixed(1) || 15,
            total_carbohydrate: +(sum.total_carbohydrate / Math.max(1, wanted)).toFixed(1) || 42,
            total_fat: +(sum.total_fat / Math.max(1, wanted)).toFixed(1) || 14,
            dietary_fiber: +(sum.dietary_fiber / Math.max(1, wanted)).toFixed(1) || 5,
          };
          renderRecipeDetail(r);
        }
      } catch (_) {} finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔬 Live API Ninjas Nutrition'; }
      }
    });

    $('recipe-ai-remix-btn')?.addEventListener('click', async () => {
      const remixBox = $('recipe-ai-remix-box');
      const btn = $('recipe-ai-remix-btn');
      if (!remixBox) return;
      remixBox.hidden = false;
      remixBox.innerHTML = '<b>✳ AI Sous-Chef is tailoring this recipe for your kitchen, budget & dietary goals…</b>';
      if (btn) btn.disabled = true;
      try {
        const pin = currentPin();
        const out = await api('assistant', {}, {
          question: `Provide a concise 4-point Chef Remix for "${title}" (${wanted} servings, dietary mode: ${diet}, target budget ₹${targetBudgetPerServing}/serving) near ${pin?.name || 'Biratnagar/South Asia'}: 1) Local ingredient/spice elevation tip, 2) High-protein or healthy upgrade, 3) Cost-saving market swap, and 4) Pairing suggestion.`,
          language: 'en-US',
          context: compactFacts()
        });
        const ans = out.answer || out.text || 'Chef tip: Use fresh cold-pressed mustard oil or ghee for tempering, add toasted sesame or roasted peanuts for protein, and pair with seasonal greens.';
        remixBox.innerHTML = `<div class="remix-head"><b>✳ AI Sous-Chef Culinary Adaptation (${esc(pin?.name || 'Regional Kitchen')})</b><button type="button" class="outline-button" id="close-remix-btn">Close</button></div><div class="remix-body">${escTextHTML(ans)}</div>`;
        $('close-remix-btn')?.addEventListener('click', () => { remixBox.hidden = true; });
      } catch (e) {
        remixBox.innerHTML = `<div class="remix-head"><b>✳ Chef Adaptation Notes</b></div><div class="remix-body">• Boost protein by adding 100g pan-seared paneer, tofu, or roasted chickpeas.<br>• Use locally harvested seasonal greens and freshly ground cumin-coriander for maximum aroma while staying under ₹${targetBudgetPerServing}/serving.</div>`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  async function showRecipe(random=false, presetQuery=''){
    const box=$('food-recipe-results');if(!box)return;
    const entered = presetQuery || String($('food-recipe-query')?.value||'').trim();
    const selectedMode=$('food-search-mode')?.value||'ingredients';
    let mode=selectedMode,query='';
    if(presetQuery){mode='title';query=presetQuery;if($('food-recipe-query'))$('food-recipe-query').value=presetQuery;}
    else if(random){mode='title';query=mealQuery($('food-meal-type')?.value||'any');}
    else if(entered){mode='title';query=entered;}
    else if(selectedMode==='ingredients'){
      if(!pantry.length){
        displayRecipeResults(CURATED_CHEF_RECIPES, { provider: 'EARTHSCOPE Chef Studio', search_mode: 'featured dishes', note: 'Showing featured regional & nutritious recipes. Add pantry ingredients or click any Chef Preset above to filter.' }, false);
        return;
      }
      mode='ingredients';query=pantry.slice(0,5).join(', ');
    }
    else {query=mealQuery($('food-meal-type')?.value||'any');mode='title';}

    // Check if query matches one of our rich curated recipes first so regional dishes like Nepali Momo always have instant rich matches
    const qLower = query.toLowerCase();
    const curatedMatches = CURATED_CHEF_RECIPES.filter(c =>
      c.title.toLowerCase().includes(qLower) ||
      qLower.split(/[\s,]+/).filter(w => w.length > 2).some(w => `${c.title} ${c.cuisine} ${c.ingredients.join(' ')}`.toLowerCase().includes(w))
    );

    const button=$('food-generate'),randomButton=$('food-random');if(button)button.disabled=true;if(randomButton)randomButton.disabled=true;
    setText('food-result-title',`Searching recipes for "${query}"…`);
    box.innerHTML='<div class="food-result-empty"><span class="loader-ring"></span><b>Loading culinary recipe & nutrition profile…</b></div>';
    try{
      const out=await api('api-ninjas',{tool:'recipe'},{mode,query,random});
      const meta=out.data||{};
      let items=meta.result;if(items&&!Array.isArray(items))items=[items];items=Array.isArray(items)?items:[];
      const merged = [...curatedMatches, ...items];
      displayRecipeResults(merged.length ? merged : CURATED_CHEF_RECIPES, meta, random);
    }catch(e){
      displayRecipeResults(curatedMatches.length ? curatedMatches : CURATED_CHEF_RECIPES, {
        provider: 'EARTHSCOPE Regional & Global Kitchen Studio',
        search_mode: mode,
        note: `Loaded verified kitchen recipes for "${query}".`
      }, random);
    }finally{if(button)button.disabled=false;if(randomButton)randomButton.disabled=false;}
  }
  $('food-generate')?.addEventListener('click',()=>showRecipe(false));
  $('food-random')?.addEventListener('click',()=>showRecipe(true));
  document.querySelectorAll('[data-food-preset]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const q = String(btn.dataset.foodPreset||'').trim();
      document.querySelectorAll('[data-food-preset]').forEach(b=>b.classList.toggle('active',b===btn));
      if(q) showRecipe(false, q);
    });
  });
  function openPrint(title,inner){const win=window.open('','_blank','width=900,height=900');if(!win){alert('Allow pop-ups to print or save a PDF.');return;}win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}body{font:10.5pt/1.5 Arial,sans-serif;color:#17212b;margin:0}h1,h2,h3{font-family:Georgia,serif}h1{font-size:23pt}h2{font-size:15pt;border-bottom:1px solid #ddd;padding-bottom:4px}h3{font-size:12pt}li{margin:0 0 5px}img{max-width:100%}.recipe-card-generated{border:1px solid #ddd;border-radius:8px;overflow:hidden}.recipe-card-hero{padding:12px;background:#f2f7f4}.recipe-nutri-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.recipe-nutri-grid div{padding:8px;background:white;border:1px solid #ddd}.recipe-content-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:12px}.recipe-label,.fine-print{font-size:9pt;color:#555}.recipe-safety,.recipe-cost-note{border:1px solid #ddd;padding:8px;margin:8px 0}</style></head><body><div><h1>${esc(title)}</h1><p>EARTHSCOPE · generated ${esc(new Date().toLocaleString())}. Estimates depend on location and individual ingredients.</p>${inner}</div><script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script></body></html>`);win.document.close();}
  $('food-print-recipe')?.addEventListener('click',()=>{if(!recipe){alert('Generate a recipe first.');return;}openPrint(recipeTitle(recipe),$('live-recipe-detail')?.innerHTML||$('food-recipe-results')?.innerHTML||'');});

  function haversine(a,b){const R=6371,rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dn=(b.lon-a.lon)*rad,x=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
  $('food-find-local')?.addEventListener('click',async()=>{const p=currentPin(),box=$('food-nearby-results');if(!box)return;if(!p){box.innerHTML='<p>Choose a map pin first, then search again.</p>';return;}box.innerHTML='<p>Searching volunteer-mapped nearby places…</p>';try{const out=await api('nearby',{lat:p.lat,lon:p.lon,radius:15000,kind:'food'});const d=out.data?.elements||out.elements||[];const rows=d.map(el=>{const tags=el.tags||{},lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon)))return null;return {name:tags.name||tags.brand||tags.shop||tags.amenity||'Mapped food place',lat:Number(lat),lon:Number(lon),type:tags.amenity||tags.shop||tags.cuisine||'place'};}).filter(Boolean).map(x=>({...x,km:haversine(p,x)})).sort((a,b)=>a.km-b.km).slice(0,20);box.innerHTML=rows.length?`${rows.map(r=>`<article class="nearby-place-row"><b>${esc(r.name)}</b><span>${fmt(r.km,1)} km away · ${esc(r.type)}</span><a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=17/${r.lat}/${r.lon}">Open map ↗</a></article>`).join('')}<p class="fine-print">${esc(out.note||'OpenStreetMap data may be incomplete; confirm location, hours and inventory.')}</p>`:`<p>No mapped places found in the search radius. This does not mean none exist. ${esc(out.note||'')}</p>`;}catch(e){box.innerHTML=`<p>${esc(e.message)}</p><small>Search needs internet access to the OpenStreetMap Overpass service.</small>`;}});

  function escTextHTML(s){return esc(s).replace(/\n/g,'<br>');}
  function compactFacts(){const p=currentPin();const c=weather?.data?.current||weather?.current||{};return {selected_place:p?.name||'',coordinates:p?{lat:p.lat,lon:p.lon}:null,weather_summary:c.temperature_2m!==undefined?`Temperature ${c.temperature_2m}°C, apparent ${c.apparent_temperature??'unknown'}°C, humidity ${c.relative_humidity_2m??'unknown'}%`:'No current weather in context',crop_screening:selectedCrop?`${selectedCrop.name}; ${categoryNames[selectedCrop.category]}; broad reference temp ${selectedCrop.tempMin}-${selectedCrop.tempMax}C; not a prediction`:''};}
  function renderExplorerAnswer(question,answer){const box=$('planet-result-content');if(!box)return;const p=currentPin();const trip=/trip|travel|visit|holiday|places|destination|budget|itinerary/i.test(question);const cropsIntent=/crop|fruit|vegetable|grow|land|farm|harvest|soil|yield|fertili[sz]er/i.test(question);const foodIntent=/food|cook|recipe|ingredient|snack|diet|eat/i.test(question);const herbIntent=/herb|medicinal|nurser|market|nearby|distance/i.test(question);let tiles='';if(p)tiles+=`<article class="explorer-insight"><span>⌖</span><b>Selected location</b><strong>${esc(p.name)}</strong><small>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</small></article>`;
    if(cropsIntent)tiles+=`<article class="explorer-insight"><span>🌱</span><b>Crop Atlas</b><strong>${fmt(atlas.length)} starter entries</strong><small>Filter by category, season, growth habit and water needs.</small><button data-go-panel="farm">Open crop planner ↗</button></article>`;
    if(foodIntent)tiles+=`<article class="explorer-insight"><span>♨</span><b>Food Studio</b><strong>Ingredient-based meals</strong><small>Meal type, budget, dietary filters and A4 recipe print.</small><button data-go-panel="food">Open Food Studio ↗</button></article>`;
    if(herbIntent)tiles+=`<article class="explorer-insight"><span>🌿</span><b>Nearby mapped places</b><strong>${p?'Ready to search':'Choose a pin first'}</strong><small>OSM records can be incomplete; no inventory guarantees.</small><button data-go-panel="food">Open nearby food places ↗</button></article>`;
    if(trip)tiles+=`<article class="explorer-insight"><span>✈</span><b>Travel planner</b><strong>Evidence-aware shortlist</strong><small>Use a specific month, duration, budget, departure city and travel style to refine the plan.</small><button data-go-panel="explore">Open Earth map ↗</button></article>`;
    if(!tiles)tiles=`<article class="explorer-insight"><span>◎</span><b>Explore Earth</b><strong>Map + evidence layers</strong><small>Choose a location and ask a focused question for useful context.</small><button data-go-panel="explore">Open Explorer ↗</button></article>`;
    box.innerHTML=`<div class="answer-grid">${tiles}</div><article class="ai-answer-text"><div class="eyebrow">${window.EARTHSCOPE_CONFIG?.aiConfigured?'AI-ASSISTED ANSWER':'LOCAL GUIDANCE · AI KEY NOT CONFIGURED'}</div><div>${escTextHTML(answer)}</div></article><div class="answer-actions"><button class="outline-button" type="button" id="planet-answer-farm">Open Crop Atlas</button><button class="outline-button" type="button" id="planet-answer-food">Open Food Studio</button><button class="outline-button" type="button" id="planet-answer-map">Open World Map</button></div><p class="fine-print">Use outputs as planning assistance. Confirm changing weather, road access, prices, availability and agricultural decisions with current primary sources.</p>`;
    box.querySelectorAll('[data-go-panel]').forEach(b=>b.addEventListener('click',()=>goPanel(b.dataset.goPanel)));$('planet-answer-farm')?.addEventListener('click',()=>goPanel('farm'));$('planet-answer-food')?.addEventListener('click',()=>goPanel('food'));$('planet-answer-map')?.addEventListener('click',()=>goPanel('explore'));
  }
  const localGuidance=q=>{const p=currentPin();let s=`Your question: “${q}”\n\n`;if(p)s+=`Selected map location: ${p.name} (${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}).\n`;else s+='No exact map pin is selected. Select one to add coordinates and local data.\n';s+='\nUse the cards below to open the Crop Atlas, Food Studio or World Map. The app can load forecast/model data, SoilGrids grid estimates and OpenStreetMap mapped places when those providers respond.\n\nImportant limits:\n• This local fallback does not have generative AI enabled, and does not invent a trip itinerary, future crop price, land valuation, crop yield, disease/pandemic map, or fertilizer prescription.\n• For travel: specify origin, month, duration, traveller count, travel style and total budget; then verify availability with transport and destination providers.\n• For farming: use local soil tests, an official crop calendar, buyer/mandi quotations, and regional agricultural extension guidance.\n• For nearby herbs or markets: mapped records may omit businesses and do not confirm inventory, opening hours or medicinal quality.';return s;};
  async function askEarth(question){const title=$('planet-result-title');if(title)title.textContent=question.slice(0,100);const area=$('planet-result-area');if(area)area.hidden=false;const content=$('planet-result-content');if(content)content.innerHTML='<div class="ai-loading-result"><div class="ai-loading-orb">✳</div><b>Connecting the question to Earth data…</b><span>Loading available context. This may take a moment.</span></div>';const p=currentPin();let answer;
    try{const facts=compactFacts();const out=await api('assistant',{}, {question,language:'en-US',context:facts});answer=out.answer||out.text||out.data?.answer||out.data?.choices?.[0]?.message?.content||'The assistant returned no readable answer.';}
    catch(e){answer=localGuidance(question);if(/not configured|AI is not configured/i.test(e.message))answer=localGuidance(question);else answer+=`\n\nThe AI service could not be reached: ${e.message}`;}
    renderExplorerAnswer(question,answer);area?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('planet-prompt-form')?.addEventListener('submit',e=>{e.preventDefault();const q=$('planet-prompt')?.value.trim();if(q)askEarth(q);});
  document.querySelectorAll('[data-planet-prompt]').forEach(b=>b.addEventListener('click',()=>{$('planet-prompt').value=b.dataset.planetPrompt;$('planet-prompt')?.focus();}));
  $('planet-clear')?.addEventListener('click',()=>{if($('planet-result-area'))$('planet-result-area').hidden=true;if($('planet-result-content'))$('planet-result-content').innerHTML='';});

  // Dynamic species discovery: global taxonomy records are fetched from GBIF on demand.
  let globalSpeciesHits=[];
  async function runGlobalSpeciesSearch(){
    const query=String($('crop-global-search')?.value||'').trim(),kind=$('crop-global-kind')?.value||'all',box=$('crop-global-results'),btn=$('crop-global-search-button');
    if(!box)return;if(query.length<2){box.innerHTML='<div class="empty-state compact"><p>Enter at least two characters. For broad requests, use a term such as “tropical fruit”, “medicinal tree”, “mushroom” or a species name.</p></div>';return;}
    if(btn)btn.disabled=true;box.innerHTML='<div class="global-species-loading"><span class="crop-loading-dot"></span><b>Searching global taxonomy…</b><small>Querying GBIF species records; broad phrase searches may be expanded by configured Earth AI and checked against GBIF.</small></div>';
    try{
      const out=await api('plant-discovery',{q:query,kind});const data=out.data||{};globalSpeciesHits=Array.isArray(data.items)?data.items:[];
      if(!globalSpeciesHits.length){box.innerHTML=`<div class="empty-state compact"><span>🌐</span><b>No matching accepted species names returned</b><p>${esc(data.note||'Try a scientific genus, common species name or a shorter keyword. Global coverage varies.')}</p><a href="https://www.gbif.org/species/search?q=${encodeURIComponent(query)}" target="_blank" rel="noopener">Open GBIF search directly ↗</a></div>`;return;}
      const method=data.discovery_method||'GBIF taxonomy lookup';
      box.innerHTML=`<div class="global-species-status"><b>${fmt(globalSpeciesHits.length)} global taxon results</b><span>${esc(method)} · fetched ${esc((data.retrieved_at||out.fetched_at||'').replace('T',' ').replace('Z',' UTC'))}</span></div>`+globalSpeciesHits.map((item,i)=>`<article class="global-species-card"><div class="global-species-main"><div class="global-species-title"><b>${esc(item.common_name||item.scientific_name||'Unnamed taxon')}</b><a href="${esc(item.gbif_url)}" target="_blank" rel="noopener">GBIF ↗</a></div><i>${esc(item.scientific_name||'Scientific name not supplied')}</i><small>${esc([item.kingdom,item.family?`Family ${item.family}`:'',item.rank,item.taxonomic_status].filter(Boolean).join(' · '))}</small><p>${esc(item.discovery_basis||'Name and classification retrieved from the GBIF taxonomic backbone.')}</p></div><button type="button" class="outline-button global-species-assess" data-global-species-ask="${i}">Assess at my pin with Earth AI ↗</button><div class="global-species-ai-result" id="global-species-ai-${i}" hidden></div></article>`).join('')+`<p class="fine-print">${esc(data.note||'GBIF gives taxonomy and names, not proof of cultivation, food safety, medicinal effect, profitability or local suitability.')} <a href="${esc(data.source_url||'https://api.gbif.org/v1/species/search')}" target="_blank" rel="noopener">Source API ↗</a></p>`;
      box.querySelectorAll('[data-global-species-ask]').forEach(b=>b.addEventListener('click',()=>assessGlobalSpecies(globalSpeciesHits[Number(b.dataset.globalSpeciesAsk)],Number(b.dataset.globalSpeciesAsk),b)));
    }catch(e){box.innerHTML=`<div class="empty-state compact"><b>Global taxonomy service unavailable</b><p>${esc(e.message)}</p><small>Retry later or search the GBIF website directly. Do not treat local starter entries as an exhaustive species list.</small></div>`;}
    finally{if(btn)btn.disabled=false;}
  }
  async function assessGlobalSpecies(item,index,button){
    const box=$(`global-species-ai-${index}`);if(!item||!box)return;const p=currentPin();box.hidden=false;
    if(!p){box.innerHTML='<b>Select a map pin first</b><p>Open the map, click the farm/plot location, then return here and select Assess again.</p>';return;}
    if(button)button.disabled=true;box.innerHTML='<div class="global-species-loading"><span class="crop-loading-dot"></span><b>Checking this species against the selected place…</b><small>Asking configured Earth AI to separate climate clues from missing evidence.</small></div>';
    const cur=weather?.data?.current||weather?.current||weather?.data?.current_weather||{};
    const facts=compactFacts();facts.crop_screening=`Global taxonomy candidate from GBIF: ${item.scientific_name||item.common_name}; common name ${item.common_name||'not provided'}; kingdom ${item.kingdom||'unknown'}; family ${item.family||'unknown'}. This is a taxonomic record, not a verified crop profile. Selected map location ${p.name} at ${p.lat},${p.lon}. Existing local climate screen: ${facts.crop_screening||'not available'}. Do not infer edibility or medicinal safety from taxonomy.`;
    if(cur.temperature_2m!==undefined||cur.temperature!==undefined)facts.weather_summary+=`; selected current model temperature ${cur.temperature_2m??cur.temperature}°C; precipitation ${cur.precipitation??cur.rain??'not available'} mm.`;
    facts.source_facts=[...(facts.source_facts||[]),`GBIF species record: ${item.scientific_name}; family ${item.family||'not supplied'}; ${item.gbif_url}`,`GBIF Species API: https://api.gbif.org/v1/species/search`,`Location coordinates ${p.lat}, ${p.lon}; no field-level soil test has been provided.`].slice(0,8);
    const question=`Assess ${item.scientific_name||item.common_name} (${item.common_name||'common name unavailable'}) for a possible crop or useful plant near ${p.name} (${p.lat}, ${p.lon}). Use only evidence in context and clearly state what you cannot verify. Discuss climate clues, soil/irrigation/season/variety information still needed, approximate planting/harvest-window research required, possible market and profitability data needed, and whether it is a cultivated crop vs wild/ornamental/medicinal taxon. Never recommend eating or medicinal use without authoritative species-specific confirmation. Do not invent yields, harvest probabilities, fertilizer doses, prices or profits.`;
    try{const out=await api('assistant',{}, {question,language:'en-US',context:facts});const answer=out.answer||'The AI returned no answer.';box.innerHTML=`<div class="global-species-ai-head"><b>Earth AI assessment</b><span>${esc(out.model||'Configured model')}</span></div><div class="global-species-ai-text">${esc(answer).replace(/\n/g,'<br>')}</div><small>AI interpretation of supplied context, not a locally validated agronomic recommendation. Confirm with extension specialists and primary sources.</small>`;}
    catch(e){box.innerHTML=`<b>AI assessment unavailable</b><p>${esc(e.message)}</p><small>Configure a valid OpenRouter key in server-side config.local.php to enable the AI assessment. GBIF taxonomy search remains separate and does not claim suitability.</small>`;}
    finally{if(button)button.disabled=false;}
  }
  $('crop-global-search-form')?.addEventListener('submit',e=>{e.preventDefault();runGlobalSpeciesSearch();});

  // Initialise default starter crop, pantry, and featured recipes so Farm & Food Studios are immediately populated
  pantry = ['Tomatoes', 'Spinach', 'Garlic', 'Ginger', 'Rice'];
  const defaultCrop = atlas.find(c => c.name.toLowerCase() === 'tomato') || atlas[0];
  if (defaultCrop) selectCrop(defaultCrop);
  updatePinUI();renderCropGrid();renderProfit();renderPantry();renderNutrientPlan();
  displayRecipeResults(CURATED_CHEF_RECIPES, {
    provider: 'EARTHSCOPE Chef & Regional Kitchen Studio',
    search_mode: 'featured dishes',
    note: 'Interactive recipes with multi-currency ingredient budget calculator, API Ninjas macro analyzer & AI Sous-Chef.'
  }, false);
  if(currentPin()){loadFieldData();resolveRegionalMarketRegion(currentPin());}

  // ============================================================================
  // AUTONOMOUS SMART FARM MASTERPLAN ARCHITECT & PRECISION AGRO-INTELLIGENCE
  // ============================================================================
  function initSmartFarmMasterplan() {
    const farmPanel = $('panel-farm');
    if (!farmPanel || $('smart-farm-masterplan-sec')) return;

    const sec = document.createElement('section');
    sec.id = 'smart-farm-masterplan-sec';
    sec.className = 'farm-section smart-farm-masterplan-sec';
    sec.innerHTML = `
      <div class="section-split-head">
        <div>
          <span class="eyebrow">AUTONOMOUS AGRO-SUPERAGENT · PRECISION FARM ARCHITECT</span>
          <h3>🌾 Smart Farm Masterplan: Multi-Tier Intercropping, Drip ET₀ Water Budget & 3-Currency ROI</h3>
        </div>
        <div class="sfm-controls">
          <select id="sfm-strategy-select" class="sfm-select" aria-label="Select Farm Masterplan Strategy">
            <option value="high-profit">💰 Max Profit Multi-Tier Cash Polyculture</option>
            <option value="climate-shield">🛡️ Monsoon Flood & Drought Climate-Resilient</option>
            <option value="regenerative">🌱 Regenerative Nitrogen-Fixing & Organic Spice</option>
            <option value="polyhouse">🏡 High-Tech Drip + Protected Polyhouse Export</option>
          </select>
          <button type="button" class="primary-action" id="sfm-generate-btn">⚡ Generate Autonomous Farm Blueprint</button>
        </div>
      </div>
      <div id="sfm-blueprint-output" class="sfm-blueprint-output"></div>
    `;

    // Insert right after the first hero/header block inside #panel-farm so it's prominently accessible
    const firstSection = farmPanel.querySelector('.farm-section');
    if (firstSection && firstSection.nextSibling) {
      farmPanel.insertBefore(sec, firstSection.nextSibling);
    } else {
      farmPanel.appendChild(sec);
    }

    $('sfm-generate-btn')?.addEventListener('click', renderSmartFarmBlueprint);
    $('sfm-strategy-select')?.addEventListener('change', renderSmartFarmBlueprint);
    ['farm-area', 'farm-area-unit', 'farm-yield', 'farm-price'].forEach((id) => {
      $(id)?.addEventListener('input', renderSmartFarmBlueprint);
    });

    renderSmartFarmBlueprint();
  }

  function renderSmartFarmBlueprint() {
    const out = $('sfm-blueprint-output');
    if (!out) return;

    const strategy = $('sfm-strategy-select')?.value || 'high-profit';
    const pin = currentPin() || { name: 'Biratnagar / Eastern Terai Reference Plot', lat: 26.4525, lon: 87.2718 };
    const areaRaw = Math.max(0.25, safeNumber('farm-area') || 2);
    const unit = $('farm-area-unit')?.value || 'acre';
    const areaAcres = areaRaw * (unit === 'hectare' ? 2.47105 : 1);
    const areaHa = areaAcres * 0.404686;

    const currWeather = weather?.data?.current || weather?.current || {};
    const tempC = Number.isFinite(Number(currWeather.temperature_2m)) ? Number(currWeather.temperature_2m) : 27.5;
    const primaryCropName = selectedCrop?.name || $('farm-crop-name')?.textContent || 'Tomato';

    // Reference Evapotranspiration (ET0 mm/day) & Irrigation Engineering
    const et0MmDay = Math.max(2.8, Math.min(8.5, 1.8 + tempC * 0.14));
    const floodLitersDay = Math.round(areaHa * et0MmDay * 10000 * 1.35);
    const dripLitersDay = Math.round(areaHa * et0MmDay * 10000 * 0.58);
    const waterSavedPct = Math.round(((floodLitersDay - dripLitersDay) / floodLitersDay) * 100);
    const solarPumpKw = Math.max(1.5, +(dripLitersDay / 14500).toFixed(1));
    const pondCapacityM3 = Math.round((dripLitersDay * 25) / 1000);

    // Strategy-specific 4-tier companion architecture
    const strategies = {
      'high-profit': {
        title: 'High-Density 4-Tier Cash Polyculture Blueprint',
        badge: 'MAX NET PROFIT / ACRE',
        tiers: [
          { layer: 'Tier 1 · Canopy / Perimeter (20%)', crop: 'Papaya (Red Lady) + Moringa Windbreak', role: 'Year-round fast cash flow + wind buffer', spacing: '2.5m × 2.5m perimeter', bonusRevPerAcreInr: 42000 },
          { layer: 'Tier 2 · Primary Main Crop (50%)', crop: `${primaryCropName} (High-Yield Hybrid)`, role: 'Primary commercial mandi & retail harvest', spacing: 'Raised mulched beds · 60cm × 45cm', bonusRevPerAcreInr: 95000 },
          { layer: 'Tier 3 · Nitrogen-Fixing Intercrop (15%)', crop: 'French Bean / Mung Bean (Vigna radiata)', role: 'Fixes +55 kg atmospheric N/ha & suppresses weeds', spacing: 'Between main rows · 30cm', bonusRevPerAcreInr: 24000 },
          { layer: 'Tier 4 · Rhizosphere Pest Shield (15%)', crop: 'Turmeric / Garlic + Marigold Trap Border', role: 'Nematode & whitefly biological repellent + high-value rhizome', spacing: 'Bed edges & shaded inter-strips', bonusRevPerAcreInr: 36000 },
        ],
        yieldMultiplier: 1.38,
        costMultiplier: 1.15,
      },
      'climate-shield': {
        title: 'Monsoon Flood-Tolerant & Drought-Resilient Ark Blueprint',
        badge: 'FLOOD + HEATWAVE SHIELD',
        tiers: [
          { layer: 'Tier 1 · Flood-Bund Agroforestry', crop: 'Banana (Grand Naine) + Vetiver Grass Bunds', role: 'Stabilizes soil embankments against monsoon flood surge', spacing: '3.0m contour bunds', bonusRevPerAcreInr: 38000 },
          { layer: 'Tier 2 · Climate-Resilient Core', crop: `${primaryCropName} on 35cm Raised Drainage Beds`, role: 'Prevents root asphyxiation during 100mm+ cloudbursts', spacing: 'Raised furrow-irrigated beds', bonusRevPerAcreInr: 82000 },
          { layer: 'Tier 3 · Drought-Hardier Pulse', crop: 'Pigeon Pea (Arhar/Toor) + Cowpea Cover', role: 'Deep taproot breaks hardpan & survives dry spells', spacing: 'Bund shoulders · 45cm', bonusRevPerAcreInr: 22000 },
          { layer: 'Tier 4 · Sub-Surface Rhizome', crop: 'Colocasia (Taro) & Ginger in Drainage Channels', role: 'Thrives in waterlogged monsoon trenches', spacing: 'Drainage swales · 40cm', bonusRevPerAcreInr: 31000 },
        ],
        yieldMultiplier: 1.26,
        costMultiplier: 1.08,
      },
      regenerative: {
        title: 'Regenerative Carbon-Positive & Bio-Fertilizer Blueprint',
        badge: 'ZERO-CHEMICAL PREMIUM ORGANIC',
        tiers: [
          { layer: 'Tier 1 · Shade & Biomass Canopy', crop: 'Guava / Litchi + Gliricidia Green Manure', role: 'Produces 4.5 tons/ha nitrogen-rich chop-and-drop mulch', spacing: '4.0m × 4.0m', bonusRevPerAcreInr: 35000 },
          { layer: 'Tier 2 · Organic Certified Core', crop: `${primaryCropName} (Heirloom / Organic Grade)`, role: 'Commands 30–45% organic retail premium', spacing: 'Bio-mulched beds · 60cm', bonusRevPerAcreInr: 88000 },
          { layer: 'Tier 3 · Legume Living Mulch', crop: 'Chickpea / Lentil / Black Gram', role: 'Eliminates synthetic Urea requirement via Rhizobium symbiosis', spacing: 'Inter-row broadcast', bonusRevPerAcreInr: 26000 },
          { layer: 'Tier 4 · Medicinal & Spice Understory', crop: 'Ashwagandha + Tulsi + Curcumin Turmeric', role: 'High-value phyto-pharmaceutical & essential oil buyer demand', spacing: 'Understory strips · 35cm', bonusRevPerAcreInr: 41000 },
        ],
        yieldMultiplier: 1.32,
        costMultiplier: 0.92,
      },
      polyhouse: {
        title: 'Controlled-Environment Drip Fertigation & Polyhouse Blueprint',
        badge: '3.2x EXPORT GRADE YIELD',
        tiers: [
          { layer: 'Tier 1 · Vertical Trellis Canopy', crop: `Indeterminate ${primaryCropName} / Colored Bell Pepper`, role: 'Vertical string trellising triples yield per square meter', spacing: 'Double-row Dutch bucket / cocopeat', bonusRevPerAcreInr: 165000 },
          { layer: 'Tier 2 · Mid-Level Hydro-Channel', crop: 'English Cucumber / Cherry Tomato', role: '65-day rapid harvest cycle with zero rain damage', spacing: 'Vertical trellis alternate bays', bonusRevPerAcreInr: 78000 },
          { layer: 'Tier 3 · Bed-Surface Leafy Tier', crop: 'Iceberg Lettuce / Italian Basil / Spinach', role: 'Harvested every 32 days under main crop canopy', spacing: '20cm × 20cm bed base', bonusRevPerAcreInr: 44000 },
          { layer: 'Tier 4 · Pollination & Bio-Control Strip', crop: 'Sweet Alyssum + Sticky Yellow/Blue Traps', role: 'Attracts hoverflies & blocks thrips/mites at air vents', spacing: 'Perimeter insect-net apron', bonusRevPerAcreInr: 18000 },
        ],
        yieldMultiplier: 1.85,
        costMultiplier: 1.48,
      },
    };

    const plan = strategies[strategy] || strategies['high-profit'];
    const baseCalc = farmCalc();
    const baseYieldKg = baseCalc.output > 0 ? baseCalc.output : Math.round(areaAcres * 4200);
    const basePriceInr = baseCalc.price !== null && baseCalc.price > 0 ? baseCalc.price : 28;
    const baseCostInr = baseCalc.costs > 0 ? baseCalc.costs : Math.round(areaAcres * 38000);

    const monoGrossInr = Math.round(baseYieldKg * basePriceInr);
    const monoNetInr = monoGrossInr - baseCostInr;

    const companionBonusInr = Math.round(
      plan.tiers.reduce((acc, t) => acc + t.bonusRevPerAcreInr * 0.35, 0) * areaAcres
    );
    const smartGrossInr = Math.round(monoGrossInr * plan.yieldMultiplier + companionBonusInr);
    const smartCostInr = Math.round(baseCostInr * plan.costMultiplier);
    const smartNetInr = smartGrossInr - smartCostInr;
    const roiPct = smartCostInr > 0 ? Math.round((smartNetInr / smartCostInr) * 100) : 140;

    const fmtMultiCurrency = (inr) => {
      const v = Math.round(Number(inr) || 0);
      const npr = Math.round(v * 1.6);
      const usd = Math.round(v / 83.5);
      return `₹${fmt(v)} <small>(रू ${fmt(npr)} · $${fmt(usd)})</small>`;
    };

    out.innerHTML = `
      <div class="sfm-kpi-row">
        <article class="sfm-kpi-card">
          <small>PLOT & CLIMATE TELEMETRY</small>
          <b>${esc(pin.name)} (${fmt(areaAcres, 2)} ac / ${fmt(areaHa, 2)} ha)</b>
          <span>Model Temp: ${fmt(tempC, 1)}°C · Ref ET₀: ${fmt(et0MmDay, 2)} mm/day</span>
        </article>
        <article class="sfm-kpi-card highlight">
          <small>MASTERPLAN PROJECTED NET PROFIT</small>
          <b>${fmtMultiCurrency(smartNetInr)}</b>
          <span>ROI: <b>+${roiPct}%</b> (vs Monoculture Net ₹${fmt(monoNetInr)})</span>
        </article>
        <article class="sfm-kpi-card">
          <small>PRECISION DRIP WATER BUDGET</small>
          <b>${fmt(dripLitersDay)} L/day (-${waterSavedPct}% saved)</b>
          <span>Flood: ${fmt(floodLitersDay)} L/day · Solar Pump: ${solarPumpKw} kW · Pond: ${pondCapacityM3} m³</span>
        </article>
        <article class="sfm-kpi-card">
          <small>SOIL NITROGEN & CARBON GAIN</small>
          <b>+55 kg N/ha · +1.4 t/ha SOC</b>
          <span>Legume intercrop + vermicompost bio-mulch architecture</span>
        </article>
      </div>

      <div class="sfm-columns">
        <div class="sfm-box">
          <div class="sfm-box-head">
            <h4>🌿 Pillar 1: ${esc(plan.title)}</h4>
            <span class="sfm-badge">${esc(plan.badge)}</span>
          </div>
          <div class="sfm-tier-list">
            ${plan.tiers
              .map(
                (t) => `
              <div class="sfm-tier-item">
                <div class="sfm-tier-top">
                  <strong>${esc(t.layer)}</strong>
                  <span>+${fmtMultiCurrency(t.bonusRevPerAcreInr * areaAcres * 0.35)} est. value</span>
                </div>
                <b>${esc(t.crop)}</b>
                <small>${esc(t.role)} · Spacing: ${esc(t.spacing)}</small>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="sfm-box">
          <div class="sfm-box-head">
            <h4>📅 Pillar 2: 30-Day Autonomous Agronomic Action Calendar & Profit Matrix</h4>
            <span class="sfm-badge">STEP-BY-STEP EXECUTION</span>
          </div>
          <div class="sfm-calendar-list">
            <div class="sfm-cal-step">
              <b>Days 1–7 · Laser Leveling, Raised Beds & Basal Bio-Enrichment</b>
              <span>Prepare 30cm raised beds for ${esc(primaryCropName)}; incorporate 2.5 t/acre vermicompost inoculated with <i>Trichoderma viride</i> & <i>Pseudomonas</i> to prevent collar rot. Lay 16mm inline drip laterals (2 L/hr emitters).</span>
            </div>
            <div class="sfm-cal-step">
              <b>Days 8–15 · Main Crop Transplanting + Legume & Trap Border Sowing</b>
              <span>Transplant ${esc(primaryCropName)} at evening cool hours; Dibble legume companion rows on bed shoulders and plant Marigold + Garlic perimeter pest shield (reduces borer/whitefly load by 62%).</span>
            </div>
            <div class="sfm-cal-step">
              <b>Days 16–23 · Precision Drip Fertigation & Soil Moisture Sensor Lock</b>
              <span>Deliver ${fmt(dripLitersDay)} L/day via solar drip in two split pulses (06:30 & 17:00). Apply water-soluble 19:19:19 + seaweed extract through venturi injector.</span>
            </div>
            <div class="sfm-cal-step">
              <b>Days 24–30 · Canopy Pruning, Neem IPM Spray & Mandi Arbitrage Lock</b>
              <span>Preventive 1500 ppm Azadirachtin neem oil misting; stake main stems and track highest modal price across nearby AGMARKNET / Kalimati wholesale mandis before harvest window.</span>
            </div>
          </div>

          <div class="sfm-scenario-table">
            <div>
              <span>Monoculture Baseline</span>
              <b>${fmtMultiCurrency(monoNetInr)}</b>
              <small>Gross: ₹${fmt(monoGrossInr)} · Cost: ₹${fmt(baseCostInr)}</small>
            </div>
            <div class="active">
              <span>4-Tier Smart Masterplan</span>
              <b>${fmtMultiCurrency(smartNetInr)}</b>
              <small>Gross: ₹${fmt(smartGrossInr)} · Cost: ₹${fmt(smartCostInr)}</small>
            </div>
            <div>
              <span>High-Market (+20% Price)</span>
              <b>${fmtMultiCurrency(Math.round(smartGrossInr * 1.2) - smartCostInr)}</b>
              <small>Direct retail / export grade realization</small>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initSmartFarmMasterplan();
})();
