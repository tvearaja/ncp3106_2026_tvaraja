import {config,isSupabaseConfigured,loadPublicDrains,loadThresholds} from './supabase.js';

const $ = (s) => document.querySelector(s);
const stateNames = {normal:'Normal',warning:'Warning',high_risk:'High risk',critical:'Critical',offline:'Offline'};
const stateIcons = {normal:'bi-check-circle',warning:'bi-exclamation-circle',high_risk:'bi-water',critical:'bi-exclamation-triangle-fill',offline:'bi-wifi-off'};
let currentDrains = [], criticalSignature = '', liveData = false, currentRainfall = 0;
let thresholds;
const markerPositions = [[350,128],[350,425],[700,128],[700,280],[920,280],[150,280],[520,280],[1050,280],[350,505],[700,485],[820,280],[1000,280],[350,185],[700,185],[700,375],[350,365]];

function timeLabel(date) { return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(date); }
function escapeHtml(value='') { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function reading(value){return value===null||value===undefined||!Number.isFinite(Number(value))?'--':Number(value).toFixed(0);}
function initTheme() {
  const saved = localStorage.getItem('flowguard-theme') || 'light'; document.documentElement.dataset.bsTheme = saved;
  $('#themeToggle').innerHTML = saved === 'dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
  $('#themeToggle').addEventListener('click',()=>{const next=document.documentElement.dataset.bsTheme==='dark'?'light':'dark';document.documentElement.dataset.bsTheme=next;localStorage.setItem('flowguard-theme',next);$('#themeToggle').innerHTML=next==='dark'?'<i class="bi bi-sun"></i>':'<i class="bi bi-moon-stars"></i>';});
}
function initMap() {
  $('#drainMap').addEventListener('click',event=>{const marker=event.target.closest('[data-drain-id]');if(marker){const drain=currentDrains.find(item=>item.id===marker.dataset.drainId);if(drain)showDrainDetails(drain);}});
  $('#drainMap').addEventListener('keydown',event=>{const marker=event.target.closest('[data-drain-id]');if(marker&&(event.key==='Enter'||event.key===' ')){event.preventDefault();const drain=currentDrains.find(item=>item.id===marker.dataset.drainId);if(drain)showDrainDetails(drain);}});
  document.addEventListener('flowguard:drain-selected',event=>{const drain=currentDrains.find(item=>String(item.id)===String(event.detail?.id));if(drain)showDrainDetails(drain);});
  window.flowguardDashboardReady=true;
}
function showDrainDetails(drain){$('#drainDetailsTitle').textContent=`${drain.drain_code} · ${drain.location}`;$('#drainDetailsBody').innerHTML=`<dl class="profile-details"><div><dt>Status</dt><dd>${stateNames[drain.status]}</dd></div><div><dt>Water level</dt><dd>${reading(drain.water_level)}%</dd></div><div><dt>Flow rate</dt><dd>${reading(drain.flow_rate)}%</dd></div><div><dt>Debris</dt><dd>${escapeHtml(drain.debris_status||'unknown')}</dd></div><div><dt>Last reading</dt><dd>${drain.last_reading?new Date(drain.last_reading).toLocaleString():'Unavailable'}</dd></div></dl>`;bootstrap.Modal.getOrCreateInstance($('#drainDetailsModal')).show();}
function focusDrain(drain){$('#map-section').scrollIntoView({behavior:'smooth',block:'center'});const marker=$(`[data-drain-id="${CSS.escape(String(drain.id))}"]`);if(marker){marker.classList.add('drain-marker-focus');setTimeout(()=>marker.classList.remove('drain-marker-focus'),2200);}window.flowguardPipe3D?.focusDrain(drain.id);}
function renderStatusCards(drains) {
  const counts={normal:0,warning:0,high_risk:0,critical:0,offline:0}; drains.forEach(d=>counts[d.status]=(counts[d.status]||0)+1);
  const cards=[['normal','Normal','bi-check-lg'],['warning','Warning','bi-exclamation'],['high_risk','High risk','bi-water'],['critical','Critical','bi-exclamation-triangle'],['offline','Offline','bi-wifi-off']];
  $('#statusCards').innerHTML=cards.map(([key,label,icon])=>`<div class="col"><div class="summary-card state-${key.replace('_','-')}"><span class="summary-icon"><i class="bi ${icon}"></i></span><div><strong>${counts[key]||0}</strong><small>${label}</small></div></div></div>`).join('');
  $('#drainTotal').textContent=drains.length;
  const heroTotal=$('#drainTotalHero'); if(heroTotal)heroTotal.textContent=drains.length;
  const critical=drains.filter(d=>d.status==='critical').length, high=drains.some(d=>['critical','high_risk'].includes(d.status)), abnormal=drains.some(d=>d.status==='warning');
  const system=$('#systemStatus'); system.querySelector('strong').textContent=liveData?'LIVE DATA':'DEMO MODE'; system.querySelector('small').textContent=liveData?'Monitoring data connected':'Showing sample monitoring data'; system.querySelector('.status-dot').style.background=liveData?'#4eaa6a':'#e3bd4d';
  $('#footerDataStatus').textContent=liveData?'Live Supabase data':'Sample data'; $('#demoNotice').classList.toggle('d-none',liveData);
  let risk='LOW',desc='No critical conditions reported.',width='18%',color='#4eaa6a';
  const heavyRain=currentRainfall>=(thresholds?.weatherHeavyRainMm??5);
  if(critical){risk='CRITICAL';desc='Critical drainage condition detected.';width='100%';color='#d34552'} else if(heavyRain&&high){risk='HIGH';desc='Elevated rainfall and abnormal drain readings need closer monitoring.';width='76%';color='#ed8a39'} else if(high){risk='HIGH';desc='Water or flow conditions need attention.';width='76%';color='#ed8a39'} else if(abnormal){risk='MODERATE';desc='Some abnormal readings need attention.';width='48%';color='#e3bd4d'}
  $('#riskLabel').textContent=`${risk[0]}${risk.slice(1).toLowerCase()} monitoring`;$('#riskDescription').textContent=desc;$('#riskMeterFill').style.width=width;$('#riskMeterFill').style.background=color;
  const heroRisk=$('#heroRiskState'); if(heroRisk)heroRisk.textContent=`${risk[0]}${risk.slice(1).toLowerCase()} monitoring`;
  $('#riskContext').querySelector('small').textContent=critical?'Critical drain reading detected; check affected locations.':heavyRain&&high?'Elevated rainfall plus abnormal drain readings: higher monitoring attention.':high?'Drain conditions require closer attention.':abnormal?'At least one abnormal reading; continue monitoring.':'No critical drain readings reported.';
  renderAlerts(drains);
}
async function renderAlerts(drains) {
  const notices=drains.filter(d=>['critical','high_risk','warning','offline'].includes(d.status)).sort((a,b)=>['critical','high_risk','warning','offline'].indexOf(a.status)-['critical','high_risk','warning','offline'].indexOf(b.status));
  let publicAlerts=[];
  if(isSupabaseConfigured){try{const client=await (await import('./supabase.js')).getSupabase();const {data,error}=await client.from('alerts').select('id,alert_type,message,created_at,drains(drain_code,location)').eq('is_public',true).in('status',['active','acknowledged']).order('created_at',{ascending:false}).limit(6);if(error)throw error;publicAlerts=data||[];}catch(error){console.warn('Public alerts are temporarily unavailable',error);}}
  const active=notices.filter(d=>['critical','high_risk'].includes(d.status)).length+publicAlerts.length;$('#alertCount').textContent=`${active} active`;
  const sensorMarkup=notices.slice(0,6).map(d=>`<div class="list-group-item"><div class="alert-item ${d.status==='warning'?'warning':''}"><span class="alert-symbol"><i class="bi ${stateIcons[d.status]}"></i></span><div><strong>${escapeHtml(d.drain_code)} · ${stateNames[d.status]}</strong><small>${escapeHtml(d.location||'Location unavailable')} · ${d.last_reading?timeLabel(new Date(d.last_reading)):'No timestamp'}</small><p>${d.status==='offline'?'No recent reading received.':`Water ${reading(d.water_level)}% · Flow ${reading(d.flow_rate)}%`}</p></div></div></div>`).join('');
  const storedMarkup=publicAlerts.map(a=>`<div class="list-group-item"><div class="alert-item"><span class="alert-symbol"><i class="bi bi-megaphone-fill"></i></span><div><strong>${escapeHtml(a.alert_type)}</strong><small>${escapeHtml(a.drains?.drain_code||'Public alert')} · ${timeLabel(new Date(a.created_at))}</small><p>${escapeHtml(a.message)}</p></div></div></div>`).join('');
  $('#alertList').innerHTML=sensorMarkup+storedMarkup||'<div class="empty-alerts"><i class="bi bi-check-circle me-1"></i>No active public drain alerts.</div>';
}
function renderMap(drains) {
  const layer=$('#drainMarkers');layer.innerHTML=drains.map((d,index)=>{const [x,y]=markerPositions[index%markerPositions.length],label=`${d.drain_code} · ${stateNames[d.status]} · Water ${reading(d.water_level)}% · Flow ${reading(d.flow_rate)}%`;return `<g class="pipe-drain-marker status-${d.status.replace('_','-')}" data-drain-id="${escapeHtml(d.id)}" role="button" tabindex="0" aria-label="${escapeHtml(label)}" transform="translate(${x} ${y})"><circle class="marker-halo" r="20"/><circle class="marker-core" r="11"/><text class="marker-code" x="17" y="5">${escapeHtml(d.drain_code)}</text></g>`;}).join('');
  window.flowguardPipe3D?.setDrains(drains);
}
function showCriticalAlert(drains) {
  const critical=drains.filter(d=>d.status==='critical');if(!critical.length){criticalSignature='';return;}
  const signature=critical.map(d=>d.id).sort().join('|');if(signature===criticalSignature)return;criticalSignature=signature;
  const all=critical.length===drains.length,kicker=all?'SYSTEM-WIDE CRITICAL CONDITION':critical.length>1?'CRITICAL ALERT':'CRITICAL DRAIN ALERT';
  $('#criticalKicker').textContent=kicker;$('#criticalTitle').textContent=all?'All monitored drainage systems are critical':critical.length>1?'Multiple critical drains detected':'Critical drainage condition detected';
  $('#criticalBody').innerHTML=all?'<p>All monitored drainage systems are currently reporting critical conditions.</p><p>Several areas may be at increased flood risk. Please follow instructions from local authorities.</p>':critical.length>1?'<p>Multiple drainage systems are reporting critical conditions. Several monitored areas may be at increased flood risk.</p>':`<p>A critical drainage condition has been detected.</p><div class="critical-drain-row"><strong>${escapeHtml(critical[0].drain_code)} · ${escapeHtml(critical[0].location)}</strong><small>Water level: ${reading(critical[0].water_level)}% · Flow: ${reading(critical[0].flow_rate)}% · Debris: ${escapeHtml(critical[0].debris_status||'unknown')}</small></div>`;
  $('#viewCriticalMap').innerHTML=`<i class="bi bi-geo-alt me-1"></i>${critical.length>1?'View affected areas':'View on map'}`;$('#viewCriticalMap').onclick=()=>{bootstrap.Modal.getOrCreateInstance($('#criticalModal')).hide();if(window.flowguardPipe3D?.ready)window.flowguardPipe3D.setMode('3d');else window.flowguardPipeFallback?.setMode('3d',true);focusDrain(critical[0]);};
  bootstrap.Modal.getOrCreateInstance($('#criticalModal')).show();
}
async function refreshDrains() {
  $('#refreshIcon').classList.add('spin');$('#dataError').classList.add('d-none');
  try{thresholds ||= await loadThresholds();const result=await loadPublicDrains(thresholds);liveData=result.live;currentDrains=result.drains;window.flowguardDrains=currentDrains;renderStatusCards(currentDrains);renderMap(currentDrains);$('#lastUpdate').textContent=timeLabel(new Date());showCriticalAlert(currentDrains);}
  catch(error){console.error('FlowGuard monitoring fetch failed',error);$('#dataError').classList.remove('d-none');$('#systemStatus').querySelector('strong').textContent='DATA UNAVAILABLE';$('#systemStatus').querySelector('small').textContent='Latest readings could not be retrieved';$('#footerDataStatus').textContent='Unavailable';liveData=false;}
  finally{$('#refreshIcon').classList.remove('spin');}
}
const weatherDescriptions={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',80:'Rain showers',81:'Rain showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Thunderstorm with hail'};
function describeWeather(code){return weatherDescriptions[code]||'Current conditions';}
async function loadWeather(){
  const lat=Number(config.weatherLatitude??14.5995),lon=Number(config.weatherLongitude??120.9842),location=config.weatherLocation||'Manila, Philippines';$('#weatherLocation').textContent=location;
  try{const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m&hourly=precipitation_probability&daily=weather_code,temperature_2m_max,precipitation_probability_max&forecast_days=3&timezone=auto`;
    const response=await fetch(url);if(!response.ok)throw Error(`Weather API returned ${response.status}`);const data=await response.json(),current=data.current;currentRainfall=Number(current.rain??current.precipitation??0);
    $('#temperature').textContent=`${Math.round(current.temperature_2m)}°`;$('#weatherCondition').textContent=describeWeather(current.weather_code);$('#rainfall').textContent=`${Number(current.rain??current.precipitation??0).toFixed(1)} mm`;$('#windSpeed').textContent=`${Math.round(current.wind_speed_10m)} km/h`;$('#weatherUpdated').textContent=`Updated ${timeLabel(new Date(current.time))} · Open-Meteo`;
    const days=data.daily;$('#forecastStrip').innerHTML=days.time.map((day,i)=>`<div class="forecast-day"><span>${i===0?'Today':i===1?'Tomorrow':new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(new Date(`${day}T12:00:00`))}</span><i class="bi ${Number(days.precipitation_probability_max[i])>50?'bi-cloud-rain':'bi-cloud-sun'}"></i><strong>${Math.round(days.temperature_2m_max[i])}°</strong><small>Rain ${days.precipitation_probability_max[i]}%</small></div>`).join('');
    if(current.rain>=5){$('#riskContext').querySelector('small').textContent='Rain is elevated; compare with current drain readings.';}
  }catch(error){console.warn('FlowGuard weather unavailable',error);currentRainfall=0;$('#temperature').textContent='--°';$('#weatherCondition').textContent='Weather data temporarily unavailable.';$('#rainfall').textContent='-- mm';$('#windSpeed').textContent='-- km/h';$('#weatherUpdated').textContent='Weather data temporarily unavailable.';}
}
async function loadEmergencyContacts(){if(!isSupabaseConfigured)return;try{const {getSupabase}=await import('./supabase.js');const client=await getSupabase();const {data,error}=await client.from('system_settings').select('setting_name,setting_value').in('setting_name',['emergency_police','emergency_medical','emergency_fire','emergency_barangay']);if(error)throw error;const values=Object.fromEntries((data||[]).map(x=>[x.setting_name,x.setting_value]));const mapping={emergency_police:'Police',emergency_medical:'Medical',emergency_fire:'Fire',emergency_barangay:'Barangay emergency'};for(const [key,label] of Object.entries(mapping)){const number=String(values[key]||'').trim(),phone=number.replace(/[^+\d]/g,'');const modalLink=[...document.querySelectorAll('.contact-list a')].find(a=>a.querySelector('strong')?.textContent===label);if(modalLink){if(number){modalLink.href=`tel:${phone}`;modalLink.querySelector('b').textContent=number;modalLink.querySelector('small').textContent='Call emergency contact';}else if(key==='emergency_barangay'){modalLink.removeAttribute('href');modalLink.querySelector('b').textContent='Not set';}}document.querySelectorAll(`[data-emergency="${key}"]`).forEach(link=>{const display=link.querySelector('strong');if(number){link.href=`tel:${phone}`;if(display)display.textContent=number;}else if(key==='emergency_barangay'){link.removeAttribute('href');if(display)display.textContent='Not set';}});}}catch(error){console.warn('Emergency contacts are using their default display values',error);}}
initTheme();initMap();loadWeather();loadEmergencyContacts();refreshDrains();setInterval(refreshDrains,15000);setInterval(loadWeather,10*60*1000);
