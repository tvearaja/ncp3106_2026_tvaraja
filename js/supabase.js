// Add the Supabase project URL and public anon key in config.js. Never use a service-role key here.
export const config = window.FLOWGUARD_CONFIG || {};
export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

let clientPromise;
export async function getSupabase() {
  if (!isSupabaseConfigured) return null;
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then(({ createClient }) => createClient(config.supabaseUrl, config.supabaseAnonKey));
  }
  return clientPromise;
}

export const DEFAULT_THRESHOLDS = Object.freeze({ waterWarning: 60, waterCritical: 80, flowWarning: 50, flowCritical: 25, offlineMinutes: 30, weatherHeavyRainMm: 5 });
export const sampleDrains = [
  {id:'demo-001',drain_code:'D-001',location:'Riverside Road',latitude:14.5995,longitude:120.9842,water_level:32,flow_rate:76,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-2*60000).toISOString()},
  {id:'demo-002',drain_code:'D-002',location:'Market Street',latitude:14.6030,longitude:120.9900,water_level:67,flow_rate:54,debris_status:'clear',status:'warning',last_reading:new Date(Date.now()-3*60000).toISOString()},
  {id:'demo-003',drain_code:'D-003',location:'School Lane',latitude:14.5957,longitude:120.9780,water_level:28,flow_rate:81,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-4*60000).toISOString()},
  {id:'demo-004',drain_code:'D-004',location:'Main Street',latitude:14.6060,longitude:120.9775,water_level:88,flow_rate:18,debris_status:'detected',status:'critical',last_reading:new Date(Date.now()-1*60000).toISOString()},
  {id:'demo-005',drain_code:'D-005',location:'Creekside Path',latitude:14.5925,longitude:120.9870,water_level:45,flow_rate:62,debris_status:'clear',status:'offline',last_reading:new Date(Date.now()-65*60000).toISOString()},
  {id:'demo-006',drain_code:'D-006',location:'North Avenue',latitude:14.6080,longitude:120.9945,water_level:37,flow_rate:71,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-5*60000).toISOString()},
  {id:'demo-007',drain_code:'D-007',location:'Health Center Road',latitude:14.5895,longitude:120.9820,water_level:25,flow_rate:84,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-3*60000).toISOString()},
  {id:'demo-008',drain_code:'D-008',location:'Central Road',latitude:14.6005,longitude:120.9735,water_level:42,flow_rate:67,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-2*60000).toISOString()},
  {id:'demo-009',drain_code:'D-009',location:'East Block',latitude:14.6120,longitude:120.9800,water_level:35,flow_rate:73,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-6*60000).toISOString()},
  {id:'demo-010',drain_code:'D-010',location:'South Bridge',latitude:14.5865,longitude:120.9925,water_level:51,flow_rate:60,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-2*60000).toISOString()},
  {id:'demo-011',drain_code:'D-011',location:'Garden Street',latitude:14.6140,longitude:120.9860,water_level:30,flow_rate:79,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-2*60000).toISOString()},
  {id:'demo-012',drain_code:'D-012',location:'West Service Road',latitude:14.5870,longitude:120.9740,water_level:39,flow_rate:69,debris_status:'clear',status:'normal',last_reading:new Date(Date.now()-5*60000).toISOString()}
];

export function assessDrain(drain, thresholds = DEFAULT_THRESHOLDS) {
  const age = Date.now() - new Date(drain.last_reading || 0).getTime();
  if (!drain.last_reading || !Number.isFinite(age) || age > thresholds.offlineMinutes * 60_000) return 'offline';
  const water = drain.water_level === null || drain.water_level === undefined ? NaN : Number(drain.water_level), flow = drain.flow_rate === null || drain.flow_rate === undefined ? NaN : Number(drain.flow_rate);
  const debris = ['detected','yes','true'].includes(String(drain.debris_status).toLowerCase());
  if (!Number.isFinite(water) || !Number.isFinite(flow)) return (Number.isFinite(water) && water >= thresholds.waterWarning) || debris ? 'warning' : 'normal';
  if ((water >= thresholds.waterCritical && flow <= thresholds.flowCritical) || (debris && water >= thresholds.waterWarning && flow <= thresholds.flowWarning)) return 'critical';
  if (water >= thresholds.waterCritical || flow <= thresholds.flowCritical) return 'high_risk';
  if (water >= thresholds.waterWarning || flow <= thresholds.flowWarning || debris) return 'warning';
  return 'normal';
}

export async function loadPublicDrains(thresholds = DEFAULT_THRESHOLDS) {
  if (!isSupabaseConfigured) return {drains: sampleDrains.map(d => ({...d,status:assessDrain(d,thresholds)})), live:false};
  const client = await getSupabase();
  const {data,error} = await client.from('public_drain_status').select('*').order('drain_code');
  if (error) throw error;
  return {drains:(data || []).map(d => ({...d,status:assessDrain(d,thresholds)})),live:true};
}

export async function loadThresholds() {
  if (!isSupabaseConfigured) return DEFAULT_THRESHOLDS;
  const client = await getSupabase();
  const {data,error} = await client.from('system_settings').select('setting_name,setting_value');
  if (error) return DEFAULT_THRESHOLDS;
  const values = Object.fromEntries((data || []).map(row => [row.setting_name, Number(row.setting_value)]));
  return {...DEFAULT_THRESHOLDS,waterWarning:values.water_warning_threshold ?? DEFAULT_THRESHOLDS.waterWarning,waterCritical:values.water_critical_threshold ?? DEFAULT_THRESHOLDS.waterCritical,flowWarning:values.flow_warning_threshold ?? DEFAULT_THRESHOLDS.flowWarning,flowCritical:values.flow_critical_threshold ?? DEFAULT_THRESHOLDS.flowCritical,offlineMinutes:values.offline_minutes ?? DEFAULT_THRESHOLDS.offlineMinutes,weatherHeavyRainMm:values.weather_heavy_rain_threshold_mm ?? DEFAULT_THRESHOLDS.weatherHeavyRainMm};
}
