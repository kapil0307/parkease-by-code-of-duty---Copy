/**
 * ParkEase Backend API v3.0
 * AI Smart Parking + Gate Entry System
 * Run: npm install && node parkease-backend-api.js
 */

const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const http     = require('http');
const https    = require('https');
const FormData = require('form-data');

const PLATE_RECOGNIZER_TOKEN = 'ENTER YOUR PLATE RECOGNIZER API';

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', methods: ['GET','POST','DELETE','OPTIONS'] }));
app.use(express.json());

// ── Serve HTML files (same origin = no CORS issues) ──────
app.use(express.static(__dirname));
app.get('/',        (req, res) => res.sendFile(path.join(__dirname, 'gate.html')));
app.get('/gate',    (req, res) => res.sendFile(path.join(__dirname, 'gate.html')));
app.get('/booking', (req, res) => res.sendFile(path.join(__dirname, 'ParkEase-Connected.html')));
app.get('/owner-portal', (req, res) => res.sendFile(path.join(__dirname, 'owner-portal.html')));
app.get('/owner-login', (req, res) => res.sendFile(path.join(__dirname, 'owner-portal.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'admin-login.html')));
app.get('/admin',       (req, res) => res.sendFile(path.join(__dirname, 'admin-login.html')));

// ─────────────────────────────────────────────────────────
// PLATE HELPERS
// ─────────────────────────────────────────────────────────

/**
 * stripIND — removes IND country code prefix if present
 */
const stripIND = (raw) => {
  let p = (raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim();
  if (p.startsWith('IND') && p.length > 3) p = p.slice(3);
  return p;
};

/**
 * normPlate — clean alphanumeric uppercase (no IND stripping)
 */
const normPlate = (raw) => (raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim();

/**
 * cleanPlate — always stores WITH IND prefix
 * "CG07CD7866"    → "INDCG07CD7866"
 * "INDCG07CD7866" → "INDCG07CD7866"
 */
const cleanPlate = (raw) => {
  const p = stripIND(raw);
  return p ? 'IND' + p : '';
};

/**
 * platesMatch — IND-agnostic comparison, handles all 4 combinations
 *   INDCG07 vs INDCG07 ✅  INDCG07 vs CG07 ✅
 *   CG07 vs INDCG07    ✅  CG07 vs CG07    ✅
 */
const platesMatch = (a, b) => {
  if (!a || !b) return false;
  const na = stripIND(a);
  const nb = stripIND(b);
  return na.length > 0 && na === nb;
};

// ─────────────────────────────────────────────────────────
// DATABASE  (parkease-db.json)
// ─────────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'parkease-db.json');

const readDB  = () => {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { stations: SEED_STATIONS, bookings: [] }; }
};
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');

const SEED_STATIONS = [
  { id:1,  station_name:'Shankar Nagar Smart Parking',  city:'Raipur',      address:'Shankar Nagar Square, Sector-1, Raipur – 492007',      latitude:21.25269, longitude:81.66788, total_slots:30, available_slots:18, price_per_hour:40, rating:4.6, amenities:['CCTV','EV Charging','Covered','24/7'],            gradient:'linear-gradient(135deg, #1e3a8a, #2563eb)' },
  { id:2,  station_name:'Telibandha Parking Hub',       city:'Raipur',      address:'Telibandha Talab Road, Raipur – 492001',               latitude:21.24136, longitude:81.66309, total_slots:20, available_slots:8,  price_per_hour:30, rating:4.3, amenities:['CCTV','Open Air','24x7','Restrooms'],            gradient:'linear-gradient(135deg, #065f46, #059669)' },
  { id:3,  station_name:'Pandri Multi-Level Parking',   city:'Raipur',      address:'Near City Centre Mall, Pandri, Raipur – 492001',       latitude:21.25470, longitude:81.64871, total_slots:50, available_slots:32, price_per_hour:50, rating:4.8, amenities:['CCTV','Multi-Level','Valet','Covered'],          gradient:'linear-gradient(135deg, #4c1d95, #7c3aed)' },
  { id:4,  station_name:'GE Road Parking Complex',      city:'Raipur',      address:'GE Road, Near New Bus Stand, Raipur – 492009',         latitude:21.22800, longitude:81.63300, total_slots:25, available_slots:10, price_per_hour:25, rating:4.1, amenities:['CCTV','Security','Open Air'],                    gradient:'linear-gradient(135deg, #0c4a6e, #0284c7)' },
  { id:5,  station_name:'Durg Station Parking',         city:'Durg',        address:'Railway Colony, Near Durg Junction, Durg – 491001',    latitude:21.19972, longitude:81.29167, total_slots:30, available_slots:15, price_per_hour:30, rating:4.2, amenities:['CCTV','Covered','24/7','Restrooms'],             gradient:'linear-gradient(135deg, #7c2d12, #ea580c)' },
  { id:6,  station_name:'Nehru Nagar Parking Zone',     city:'Durg',        address:'Nehru Nagar, Durg – 491001',                           latitude:21.19800, longitude:81.28300, total_slots:18, available_slots:6,  price_per_hour:25, rating:4.0, amenities:['CCTV','Open Air','Security'],                    gradient:'linear-gradient(135deg, #854d0e, #ca8a04)' },
  { id:7,  station_name:'Durg City Center Parking',     city:'Durg',        address:'Durga Chowk, City Centre, Durg – 491001',              latitude:21.18720, longitude:81.28500, total_slots:22, available_slots:12, price_per_hour:35, rating:4.4, amenities:['CCTV','EV Charging','Covered','Security'],       gradient:'linear-gradient(135deg, #dc2626, #b91c1c)' },
  { id:8,  station_name:'Bhilai Steel City Parking',    city:'Bhilai',      address:'Sector-1 Market Area, Bhilai – 490001',                latitude:21.22130, longitude:81.38280, total_slots:40, available_slots:22, price_per_hour:35, rating:4.5, amenities:['CCTV','Covered','24/7','EV Charging'],           gradient:'linear-gradient(135deg, #1e40af, #1d4ed8)' },
  { id:9,  station_name:'Supela Parking Complex',       city:'Bhilai',      address:'Supela Chowk, Bhilai – 490023',                        latitude:21.21430, longitude:81.40120, total_slots:24, available_slots:9,  price_per_hour:30, rating:4.3, amenities:['CCTV','Open Air','Security'],                    gradient:'linear-gradient(135deg, #0f766e, #0d9488)' },
  { id:10, station_name:'BSP Township Parking',         city:'Bhilai',      address:'Civic Centre, BSP Township, Bhilai – 490021',          latitude:21.19500, longitude:81.37800, total_slots:35, available_slots:20, price_per_hour:45, rating:4.7, amenities:['CCTV','Multi-Level','Valet','Covered','Car Wash'], gradient:'linear-gradient(135deg, #581c87, #7e22ce)' },
  { id:11, station_name:'Rajnandgaon Central Parking',  city:'Rajnandgaon', address:'Gandhi Chowk, Rajnandgaon – 491441',                   latitude:21.09710, longitude:81.03022, total_slots:20, available_slots:11, price_per_hour:20, rating:4.0, amenities:['CCTV','Open Air','Security'],                    gradient:'linear-gradient(135deg, #065f46, #047857)' },
  { id:12, station_name:'Amgaon Road Parking',          city:'Rajnandgaon', address:'Amgaon Road, Rajnandgaon – 491441',                    latitude:21.10580, longitude:81.03750, total_slots:15, available_slots:7,  price_per_hour:25, rating:4.2, amenities:['CCTV','Covered','Restrooms'],                    gradient:'linear-gradient(135deg, #92400e, #b45309)' }
];

if (!fs.existsSync(DB_FILE)) {
  writeDB({ stations: SEED_STATIONS, bookings: [] });
  console.log('✅ Database created: parkease-db.json');
} else {
  console.log('✅ Loaded existing database: parkease-db.json');
}

const validateCity = (c) => {
  // Allow known cities, 'all', or any city that exists in the DB
  const knownCities = ['Raipur','Durg','Bhilai','Rajnandgaon'];
  if (knownCities.includes(c) || c === 'all') return true;
  // Also allow any city that exists in the current stations data
  try { const db = readDB(); return db.stations.some(s => s.city === c); } catch { return false; }
};

// ─────────────────────────────────────────────────────────
// ENTRY LOGS  (data/entry_logs.json)
// ─────────────────────────────────────────────────────────
const DATA_DIR        = path.join(__dirname, 'data');
const ENTRY_LOGS_FILE = path.join(DATA_DIR, 'entry_logs.json');

if (!fs.existsSync(DATA_DIR))        fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ENTRY_LOGS_FILE)) fs.writeFileSync(ENTRY_LOGS_FILE, '[]', 'utf8');

// ─────────────────────────────────────────────────────────
// FLAGGED VEHICLE DETECTION SYSTEM
// Simulated secure blacklist database for demonstration
// ─────────────────────────────────────────────────────────
const FLAGGED_DB_FILE    = path.join(DATA_DIR, 'flagged-vehicles.json');
const FLAGGED_ALERTS_FILE = path.join(DATA_DIR, 'flagged-alerts.json');

// Seed flagged vehicles file if it doesn't exist
if (!fs.existsSync(FLAGGED_DB_FILE)) {
  const seedFlagged = [
    { plateNumber: 'CG07CD7866', status: 'Flagged', reason: 'Crime Investigation', addedAt: new Date().toISOString(), addedBy: 'system' },
    { plateNumber: 'GJ77GG3456', status: 'Flagged', reason: 'Crime Investigation', addedAt: new Date().toISOString(), addedBy: 'system' }
  ];
  fs.writeFileSync(FLAGGED_DB_FILE, JSON.stringify(seedFlagged, null, 2), 'utf8');
  console.log('✅ Flagged vehicle database initialised');
}
if (!fs.existsSync(FLAGGED_ALERTS_FILE)) fs.writeFileSync(FLAGGED_ALERTS_FILE, '[]', 'utf8');

/**
 * checkFlaggedVehicle — IND-agnostic lookup against blacklist
 * Returns the flagged record or null
 */
const checkFlaggedVehicle = (rawPlate) => {
  try {
    const flaggedList = safeReadJSON(FLAGGED_DB_FILE);
    const norm = stripIND(rawPlate);
    return flaggedList.find(f => stripIND(f.plateNumber) === norm) || null;
  } catch { return null; }
};

/**
 * logFlaggedAlert — append event to secure flagged-alerts log
 */
const logFlaggedAlert = (plateDisplay, reason, cameraId, stationId) => {
  const alerts = safeReadJSON(FLAGGED_ALERTS_FILE);
  const alertEntry = {
    id:         'ALERT' + Date.now(),
    plate:      plateDisplay,
    reason,
    cameraId:   cameraId || 'CAM-GATE-01',
    stationId:  stationId || 'GATE-MAIN',
    timestamp:  new Date().toISOString(),
    authorityNotified: true,
    status:     'active'
  };
  alerts.push(alertEntry);
  safeWriteJSON(FLAGGED_ALERTS_FILE, alerts);
  return alertEntry;
};

/**
 * notifyAuthorities — async mock POST to law enforcement endpoint
 * Runs fire-and-forget so it never delays the gate response
 */
const notifyAuthorities = async (alertEntry) => {
  const payload = JSON.stringify({
    source:     'ParkEase AI Gate System',
    alert_type: 'FLAGGED_VEHICLE_DETECTED',
    plate:      alertEntry.plate,
    reason:     alertEntry.reason,
    camera_id:  alertEntry.cameraId,
    timestamp:  alertEntry.timestamp,
    alert_id:   alertEntry.id
  });

  // Primary: mock police endpoint (httpbin reflects the request for demo)
  const mockEndpoints = [
    { host: 'httpbin.org', path: '/post', protocol: 'https:' }
  ];

  for (const ep of mockEndpoints) {
    try {
      const lib = ep.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: ep.host,
        path:     ep.path,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-ParkEase-Key': 'DEMO-AUTHORITY-TOKEN-2025'
        },
        timeout: 10000
      }, (res) => {
        console.log(`🚔 [AUTHORITY NOTIFIED] Endpoint ${ep.host} → HTTP ${res.statusCode} for plate ${alertEntry.plate}`);
      });
      req.on('error', (e) => console.error(`🚔 [AUTHORITY NOTIFY ERROR] ${ep.host}: ${e.message}`));
      req.on('timeout', () => { req.destroy(); console.error(`🚔 [AUTHORITY NOTIFY TIMEOUT] ${ep.host}`); });
      req.write(payload);
      req.end();
    } catch (e) {
      console.error('notifyAuthorities error:', e.message);
    }
  }
};

const safeReadJSON = (filePath, fallback = []) => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('JSON read error:', e.message);
    return fallback;
  }
};

const safeWriteJSON = (filePath, data) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('JSON write error:', e.message);
    return false;
  }
};

// ─────────────────────────────────────────────────────────
// BOOKING ROUTES
// ─────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const db = readDB();
  res.json({ status:'OK', message:'ParkEase API v3.0 running', stats:{ stations:db.stations.length, bookings:db.bookings.length }, timestamp:new Date() });
});

app.get('/api/cities', (req, res) => {
  const db = readDB();
  // Normalize to title case and deduplicate so "durg" and "Durg" merge into "Durg"
  const normalizeCity = (c) => c.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  const cities = [...new Set(db.stations.map(s => normalizeCity(s.city)))].sort();
  res.json({ success:true, cities });
});

app.get('/api/stations', (req, res) => {
  const { city, search } = req.query;
  if (!city) return res.status(400).json({ success:false, message:'City parameter is required' });
  const db = readDB();
  // city=all → return every station (used by admin panel)
  // Otherwise: case-insensitive city match so "durg" == "Durg" == "DURG"
  let stations = (city === 'all')
    ? db.stations
    : db.stations.filter(s => s.city.toLowerCase() === city.toLowerCase());
  if (search) {
    const q = search.toLowerCase();
    stations = stations.filter(s => s.station_name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q));
  }
  stations.sort((a,b) => b.rating - a.rating);
  res.json({ success:true, city, count:stations.length, stations: stations.map(s => ({ ...s, is_available: s.available_slots > 0 })) });
});

app.get('/api/stations/:id', (req, res) => {
  const db = readDB();
  const station = db.stations.find(s => s.id === parseInt(req.params.id));
  if (!station) return res.status(404).json({ success:false, message:'Station not found' });
  res.json({ success:true, station });
});

app.post('/api/book-slot', (req, res) => {
  const { user_id, station_id, duration, vehicle_no, vehicle_type='car', payment_method='upi' } = req.body;
  if (!user_id || !station_id || !duration || !vehicle_no)
    return res.status(400).json({ success:false, message:'Missing required fields: user_id, station_id, duration, vehicle_no' });
  if (duration < 1 || duration > 24)
    return res.status(400).json({ success:false, message:'Duration must be between 1 and 24 hours' });

  const db = readDB();
  const stIdx = db.stations.findIndex(s => s.id === parseInt(station_id));
  if (stIdx === -1) return res.status(404).json({ success:false, message:'Station not found' });
  if (db.stations[stIdx].available_slots <= 0) return res.status(409).json({ success:false, message:'No slots available' });

  const station      = db.stations[stIdx];
  const amount       = station.price_per_hour * duration;
  const start_time   = new Date().toISOString();
  const end_time     = new Date(Date.now() + duration * 3600000).toISOString();
  const booking_ref  = 'PKEASE' + Date.now().toString(36).toUpperCase();
  const payment_txn  = 'TXN' + Date.now();
  const booking_id   = db.bookings.length + 1;
  const stored_plate = cleanPlate(vehicle_no); // always stored with IND prefix

  db.bookings.push({
    id: booking_id, booking_ref, user_id,
    station_id: parseInt(station_id),
    vehicle_no: stored_plate,
    vehicle_type, start_time, end_time, duration, amount,
    status: 'confirmed', payment_method, payment_txn,
    created_at: new Date().toISOString()
  });
  db.stations[stIdx].available_slots -= 1;
  writeDB(db);

  console.log(`✅ Booking ${booking_ref} — plate stored as: ${stored_plate}`);

  res.status(201).json({
    success: true, message: 'Booking confirmed!',
    booking: {
      booking_id, booking_ref, user_id,
      station_id: parseInt(station_id),
      station_name: station.station_name,
      station_address: station.address,
      city: station.city,
      vehicle_no: stored_plate,
      vehicle_type, start_time, end_time, duration, amount,
      status: 'confirmed',
      payment: { method: payment_method, txn_id: payment_txn, status: 'paid' }
    }
  });
});

app.get('/api/admin/bookings', (req, res) => {
  const db = readDB();
  const bookings = db.bookings
    .map(b => { const s = db.stations.find(s => s.id === b.station_id) || {}; return { ...b, station_name:s.station_name||'', city:s.city||'', address:s.address||'' }; })
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ success:true, count:bookings.length, bookings });
});

app.get('/api/admin/stats', (req, res) => {
  const db = readDB();
  const bookings = db.bookings;
  const totalRevenue   = bookings.filter(b => b.status !== 'cancelled').reduce((s,b) => s + b.amount, 0);
  const totalBookings  = bookings.length;
  const activeBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'entered').length;
  const totalSlots     = db.stations.reduce((s,st) => s + st.total_slots, 0);
  const availableSlots = db.stations.reduce((s,st) => s + st.available_slots, 0);
  const revenueByDay   = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i));
    const date = d.toISOString().split('T')[0];
    const revenue = bookings.filter(b => b.status !== 'cancelled' && b.created_at?.startsWith(date)).reduce((s,b) => s+b.amount, 0);
    return { date: d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}), revenue, count: bookings.filter(b => b.created_at?.startsWith(date)).length };
  });
  res.json({ success:true, stats:{ totalBookings, totalRevenue, activeBookings, totalSlots, availableSlots, revenueByDay } });
});

app.get('/api/bookings/:userId', (req, res) => {
  const db = readDB();
  const bookings = db.bookings
    .filter(b => b.user_id === req.params.userId)
    .map(b => { const s = db.stations.find(s => s.id === b.station_id) || {}; return { ...b, station_name:s.station_name||'', city:s.city||'', address:s.address||'', latitude:s.latitude||0, longitude:s.longitude||0 }; })
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ success:true, count:bookings.length, bookings });
});

app.delete('/api/bookings/:bookingRef/cancel', (req, res) => {
  const db = readDB();
  const bIdx = db.bookings.findIndex(b => b.booking_ref === req.params.bookingRef);
  if (bIdx === -1) return res.status(404).json({ success:false, message:'Booking not found' });
  if (db.bookings[bIdx].status === 'cancelled') return res.status(400).json({ success:false, message:'Booking already cancelled' });
  db.bookings[bIdx].status = 'cancelled';
  const sIdx = db.stations.findIndex(s => s.id === db.bookings[bIdx].station_id);
  if (sIdx !== -1) db.stations[sIdx].available_slots += 1;
  writeDB(db);
  res.json({ success:true, message:'Booking cancelled and slot restored.', booking_ref:req.params.bookingRef });
});

// ─────────────────────────────────────────────────────────
// GATE ENTRY  — POST /api/scan-vehicle
// ─────────────────────────────────────────────────────────
/**
 * HOW MATCHING WORKS:
 *   - normPlate() strips IND from both the scanned plate AND the stored booking plate
 *   - So "INDCG07CD7866" (scan) == "INDCG07CD7866" (stored) == "CG07CD7866" (old stored) ✅
 *   - status 'confirmed' OR 'entered' both grant access (re-scans always work)
 *   - 30 min grace period after booking end_time
 *   - NO duplicate-entry block — multiple scans of valid plate always grant
 */
app.post('/api/scan-vehicle', (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ success:false, status:'Access Denied', vehicle_number:'', message:'No request body received.' });
    }

    const detectedRaw  = (req.body.detected_text || '').toString().trim();
    const vehicle_disp = cleanPlate(detectedRaw);  // IND prefixed — for display & logs
    const vehicle_norm = stripIND(detectedRaw);     // IND stripped — for comparison only

    if (!vehicle_norm) {
      return res.status(400).json({ success:false, status:'Access Denied', vehicle_number:'', message:'No vehicle number detected. Please type the plate manually.' });
    }

    console.log(`\n🔍 Gate scan: "${detectedRaw}" → norm="${vehicle_norm}" → display="${vehicle_disp}"`);

    const db       = readDB();
    const now      = new Date();
    const GRACE_MS = 30 * 60 * 1000; // 30 min grace after booking end_time

    // ── Find active booking ─────────────────────────────────
    // normPlate on both sides = IND-agnostic, works for old and new bookings
    const bIdx = db.bookings.findIndex(b => {
      const plateMatch = platesMatch(b.vehicle_no, detectedRaw);
      const statusOk   = b.status === 'confirmed' || b.status === 'entered';
      const timeOk     = (new Date(b.end_time).getTime() + GRACE_MS) > now.getTime();
      return plateMatch && statusOk && timeOk;
    });

    let status, message;

    if (bIdx !== -1) {
      // ✅ GRANT ACCESS
      const booking = db.bookings[bIdx];
      db.bookings[bIdx].status = 'entered';
      writeDB(db);
      const validUntil = new Date(booking.end_time).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
      status  = 'Access Granted';
      message = `Welcome! Booking ${booking.booking_ref} verified. Valid until ${validUntil}.`;
      console.log(`✅ GRANTED — ${vehicle_disp} → ${booking.booking_ref}`);

    } else {
      // ❌ DENY — explain why clearly
      const allForPlate = db.bookings.filter(b => platesMatch(b.vehicle_no, detectedRaw));

      if (allForPlate.length === 0) {
        status  = 'Access Denied';
        message = `No booking found for ${vehicle_disp}. Please make a booking first on the booking page.`;
        console.log(`❌ DENIED — ${vehicle_disp}: no booking found in DB`);
      } else {
        const latest = allForPlate.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (latest.status === 'cancelled') {
          status  = 'Access Denied';
          message = `Booking for ${vehicle_disp} was cancelled. Please make a new booking.`;
          console.log(`❌ DENIED — ${vehicle_disp}: booking cancelled`);
        } else {
          const endLocal = new Date(latest.end_time).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
          const endDate  = new Date(latest.end_time).toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
          status  = 'Access Denied';
          message = `Booking for ${vehicle_disp} expired at ${endDate} ${endLocal}. Please make a new booking.`;
          console.log(`❌ DENIED — ${vehicle_disp}: booking expired`);
        }
      }
    }

    // ── FLAGGED VEHICLE CHECK (async, never delays gate) ──────
    let flaggedInfo = null;
    const flaggedRecord = checkFlaggedVehicle(detectedRaw);
    if (flaggedRecord) {
      console.log(`\n🚨 FLAGGED VEHICLE DETECTED — ${vehicle_disp} | Reason: ${flaggedRecord.reason}`);
      // Log to secure flagged-alerts store
      const alertEntry = logFlaggedAlert(vehicle_disp, flaggedRecord.reason, req.body.camera_id, req.body.station_id);
      // Fire-and-forget authority notification (does NOT block gate response)
      setImmediate(() => notifyAuthorities(alertEntry));
      flaggedInfo = {
        flagged:   true,
        reason:    flaggedRecord.reason,
        alertId:   alertEntry.id,
        timestamp: alertEntry.timestamp
      };
    }

    // Log every scan
    const logs = safeReadJSON(ENTRY_LOGS_FILE);
    logs.push({
      vehicle_number: vehicle_disp,
      detected_text:  detectedRaw,
      status,
      flagged:        !!flaggedRecord,
      timestamp:      now.toISOString()
    });
    safeWriteJSON(ENTRY_LOGS_FILE, logs);

    res.json({
      success:        status === 'Access Granted',
      status,
      vehicle_number: vehicle_disp,
      message,
      flaggedAlert:   flaggedInfo   // admin-only payload — gate UI never surfaces this to driver
    });

  } catch (err) {
    console.error('scan-vehicle error:', err.message);
    res.status(500).json({ success:false, status:'Access Denied', vehicle_number:'', message:'Server error: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────
// ENTRY LOG ROUTES
// ─────────────────────────────────────────────────────────

app.get('/api/entry-logs', (req, res) => {
  const logs = safeReadJSON(ENTRY_LOGS_FILE);
  res.json({ success:true, count:logs.length, logs: [...logs].reverse() });
});

app.delete('/api/entry-logs', (req, res) => {
  safeWriteJSON(ENTRY_LOGS_FILE, []);
  res.json({ success:true, message:'Entry logs cleared' });
});

// ─────────────────────────────────────────────────────────
// FLAGGED VEHICLE API ROUTES  (admin-role access only)
// ─────────────────────────────────────────────────────────

/** GET /api/flagged-alerts — retrieve all flagged alert events */
app.get('/api/flagged-alerts', (req, res) => {
  const alerts = safeReadJSON(FLAGGED_ALERTS_FILE);
  res.json({ success: true, count: alerts.length, alerts: [...alerts].reverse() });
});

/** GET /api/flagged-vehicles — retrieve the flagged plates blacklist */
app.get('/api/flagged-vehicles', (req, res) => {
  const list = safeReadJSON(FLAGGED_DB_FILE);
  res.json({ success: true, count: list.length, vehicles: list });
});

/** POST /api/flagged-vehicles — add a new plate to the blacklist */
app.post('/api/flagged-vehicles', (req, res) => {
  try {
    const { plateNumber, reason } = req.body;
    if (!plateNumber) return res.status(400).json({ success: false, message: 'plateNumber is required' });
    const list   = safeReadJSON(FLAGGED_DB_FILE);
    const norm   = stripIND(plateNumber);
    const exists = list.find(f => stripIND(f.plateNumber) === norm);
    if (exists) return res.status(409).json({ success: false, message: 'Plate already in flagged list' });
    const entry  = { plateNumber: norm, status: 'Flagged', reason: reason || 'Crime Investigation', addedAt: new Date().toISOString(), addedBy: 'admin' };
    list.push(entry);
    safeWriteJSON(FLAGGED_DB_FILE, list);
    res.status(201).json({ success: true, message: 'Plate added to flagged list', vehicle: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** DELETE /api/flagged-vehicles/:plate — remove a plate from blacklist */
app.delete('/api/flagged-vehicles/:plate', (req, res) => {
  try {
    const norm  = stripIND(req.params.plate);
    let   list  = safeReadJSON(FLAGGED_DB_FILE);
    const before = list.length;
    list = list.filter(f => stripIND(f.plateNumber) !== norm);
    if (list.length === before) return res.status(404).json({ success: false, message: 'Plate not found in flagged list' });
    safeWriteJSON(FLAGGED_DB_FILE, list);
    res.json({ success: true, message: 'Plate removed from flagged list' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** DELETE /api/flagged-alerts — clear all flagged alert logs */
app.delete('/api/flagged-alerts', (req, res) => {
  safeWriteJSON(FLAGGED_ALERTS_FILE, []);
  res.json({ success: true, message: 'Flagged alerts log cleared' });
});

// ─────────────────────────────────────────────────────────
// DEBUG ROUTES
// ─────────────────────────────────────────────────────────

/** GET /api/db-status — live view of all bookings */
app.get('/api/db-status', (req, res) => {
  const db       = readDB();
  const now      = new Date();
  const GRACE_MS = 30 * 60 * 1000;
  const bookings = db.bookings.map(b => ({
    booking_ref: b.booking_ref,
    vehicle_no:  b.vehicle_no,
    norm:        stripIND(b.vehicle_no),
    status:      b.status,
    end_local:   new Date(b.end_time).toLocaleString('en-IN'),
    expired:     (new Date(b.end_time).getTime() + GRACE_MS) < now.getTime(),
    gate_active: (b.status === 'confirmed' || b.status === 'entered') && (new Date(b.end_time).getTime() + GRACE_MS) > now.getTime()
  }));
  res.json({ server_time_local: now.toLocaleString('en-IN'), total: bookings.length, bookings });
});

/** GET /api/debug-booking?vehicle=CG07CD7866 */
app.get('/api/debug-booking', (req, res) => {
  const vehicle  = req.query.vehicle ? stripIND(req.query.vehicle) : '';
  if (!vehicle) return res.status(400).json({ error: 'Provide ?vehicle=PLATE' });
  const db       = readDB();
  const now      = new Date();
  const GRACE_MS = 30 * 60 * 1000;
  const matches  = db.bookings.filter(b => platesMatch(b.vehicle_no, vehicle));
  res.json({
    searched_for: vehicle,
    total_bookings_in_db: db.bookings.length,
    matches_found: matches.length,
    server_time: now.toISOString(),
    bookings: matches.map(b => ({
      booking_ref:  b.booking_ref,
      vehicle_no:   b.vehicle_no,
      status:       b.status,
      end_local:    new Date(b.end_time).toLocaleString('en-IN'),
      gate_active:  (b.status === 'confirmed' || b.status === 'entered') && (new Date(b.end_time).getTime() + GRACE_MS) > now.getTime()
    }))
  });
});

// ─────────────────────────────────────────────────────────
// CAMERA PROXY  (bypasses browser CORS)
// GET /api/camera-proxy?url=http://10.x.x.x:8080/shot.jpg
// ─────────────────────────────────────────────────────────
app.get('/api/camera-proxy', (req, res) => {
  let camUrl = (req.query.url || '').trim();
  if (!camUrl) return res.status(400).json({ error: 'url param required' });

  if (!camUrl.includes('/shot') && !camUrl.includes('/video') && !camUrl.match(/\.\w{2,4}$/)) {
    camUrl = camUrl.replace(/\/$/, '') + '/shot.jpg';
  }

  let parsed;
  try { parsed = new URL(camUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const lib = parsed.protocol === 'https:' ? https : http;

  const proxyReq = lib.get(camUrl, { timeout: 8000 }, (camRes) => {
    if (camRes.statusCode !== 200) return res.status(502).json({ error: 'Camera returned HTTP ' + camRes.statusCode });
    res.setHeader('Content-Type', camRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache');
    camRes.pipe(res);
  });
  proxyReq.on('error',   (err) => res.status(502).json({ error: 'Cannot reach camera: ' + err.message }));
  proxyReq.on('timeout', ()    => { proxyReq.destroy(); res.status(504).json({ error: 'Camera timed out' }); });
});

// ─────────────────────────────────────────────────────────
// PLATE RECOGNIZER PROXY
// Fetch image from camera once → send to platerecognizer.com
// POST /api/ocr-plate  body: { url: "http://..." }
// ─────────────────────────────────────────────────────────
app.post('/api/ocr-plate', (req, res) => {
  let camUrl = (req.body.url || '').trim();
  if (!camUrl) return res.status(400).json({ success: false, error: 'url required' });

  if (!camUrl.includes('/shot') && !camUrl.match(/\.\w{2,4}$/)) {
    camUrl = camUrl.replace(/\/$/, '') + '/shot.jpg';
  }

  let parsed;
  try { parsed = new URL(camUrl); } catch { return res.status(400).json({ success: false, error: 'Invalid URL' }); }

  const lib = parsed.protocol === 'https:' ? https : http;

  // Step 1: Fetch image from IP Webcam
  const imgReq = lib.get(camUrl, { timeout: 8000 }, (imgRes) => {
    if (imgRes.statusCode !== 200) return res.status(502).json({ success: false, error: 'Camera HTTP ' + imgRes.statusCode });

    const chunks = [];
    imgRes.on('data', c => chunks.push(c));
    imgRes.on('end', () => {
      const imgBuffer = Buffer.concat(chunks);

      // Step 2: Send to Plate Recognizer API
      const form = new FormData();
      form.append('upload', imgBuffer, { filename: 'plate.jpg', contentType: 'image/jpeg' });
      form.append('regions', 'in'); // India region for best accuracy

      const postData    = form.getBuffer();
      const formHeaders = form.getHeaders();

      const prReq = https.request({
        hostname: 'api.platerecognizer.com',
        path:     '/v1/plate-reader/',
        method:   'POST',
        headers:  {
          ...formHeaders,
          'Authorization':  'Token ' + PLATE_RECOGNIZER_TOKEN,
          'Content-Length': postData.length
        },
        timeout: 15000
      }, (prRes) => {
        const prChunks = [];
        prRes.on('data', c => prChunks.push(c));
        prRes.on('end', () => {
          try {
            const result = JSON.parse(Buffer.concat(prChunks).toString());
            console.log('[PlateRecognizer] response:', JSON.stringify(result));

            if (!result.results || result.results.length === 0) {
              return res.json({ success: false, plate: '', error: 'No plate detected in image' });
            }

            // Pick the result with highest confidence
            const best  = result.results.reduce((a, b) => (a.score > b.score ? a : b));
            const plate = (best.plate || '').toUpperCase().replace(/[^A-Za-z0-9]/g, '').trim();
            const score = Math.round((best.score || 0) * 100);

            console.log(`[PlateRecognizer] plate:"${plate}" confidence:${score}%`);
            res.json({ success: !!plate, plate, confidence: score, raw: best.plate });

          } catch (e) {
            console.error('[PlateRecognizer] parse error:', e.message);
            res.status(500).json({ success: false, error: 'Response parse failed' });
          }
        });
      });

      prReq.on('error',   (e) => { console.error('[PlateRecognizer] error:', e.message); res.status(502).json({ success: false, error: 'Plate Recognizer unreachable: ' + e.message }); });
      prReq.on('timeout', ()  => { prReq.destroy(); res.status(504).json({ success: false, error: 'Plate Recognizer timed out' }); });
      prReq.write(postData);
      prReq.end();
    });
    imgRes.on('error', (e) => res.status(502).json({ success: false, error: 'Image stream error: ' + e.message }));
  });
  imgReq.on('error',   (err) => res.status(502).json({ success: false, error: 'Cannot reach camera: ' + err.message }));
  imgReq.on('timeout', ()    => { imgReq.destroy(); res.status(504).json({ success: false, error: 'Camera timed out' }); });
});

// ─────────────────────────────────────────────────────────
// OWNER PROPERTY → STATION PROMOTION
// Called by Admin panel when setting property status to "Live"
// ─────────────────────────────────────────────────────────

// POST /api/stations/add  — promote an owner property into a live station
app.post('/api/stations/add', (req, res) => {
  try {
    const {
      propertyName, address, city, latitude, longitude,
      capacity, electricity, internet, propertyType,
      propertyId, ownerId
    } = req.body;

    if (!propertyName || !city || !capacity) {
      return res.status(400).json({ success: false, message: 'Missing required fields: propertyName, city, capacity' });
    }

    // Normalize city name: title case (e.g. "durg" → "Durg", "BHILAI" → "Bhilai")
    const normalizeCity = (c) => c.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    const cityNormalized = normalizeCity(city);

    const db = readDB();

    // Avoid duplicate — if a station with this propertyId already exists, just return it
    const existing = db.stations.find(s => s.propertyId === propertyId);
    if (existing) {
      return res.json({ success: true, message: 'Station already exists', station: existing });
    }

    // Build amenities from property metadata
    const amenities = ['CCTV', 'Security'];
    if (electricity === 'Yes') amenities.push('EV Charging');
    if (internet === 'Yes') amenities.push('WiFi');
    if (propertyType === 'Basement' || propertyType === 'Mall') amenities.push('Covered');
    amenities.push('24/7');

    // Pick a gradient based on property type
    const gradients = {
      'Open Plot':    'linear-gradient(135deg, #065f46, #059669)',
      'Basement':     'linear-gradient(135deg, #1e3a8a, #2563eb)',
      'Mall':         'linear-gradient(135deg, #4c1d95, #7c3aed)',
      'Private Land': 'linear-gradient(135deg, #0c4a6e, #0284c7)',
    };

    const newId = Math.max(...db.stations.map(s => s.id), 0) + 1;
    const newStation = {
      id:              newId,
      propertyId:      propertyId || null,
      ownerId:         ownerId || null,
      station_name:    propertyName,
      city:            cityNormalized,
      address:         address || cityNormalized,
      latitude:        parseFloat(latitude) || 21.2514,
      longitude:       parseFloat(longitude) || 81.6296,
      total_slots:     parseInt(capacity) || 20,
      available_slots: parseInt(capacity) || 20,
      price_per_hour:  40,
      rating:          4.0,
      amenities:       amenities,
      gradient:        gradients[propertyType] || 'linear-gradient(135deg, #1e3a8a, #2563eb)',
      isOwnerProperty: true,
      createdAt:       new Date().toISOString()
    };

    db.stations.push(newStation);
    writeDB(db);

    console.log(`✅ New station promoted from owner property: "${propertyName}" (ID: ${newId})`);
    res.json({ success: true, message: 'Station added successfully', station: newStation });

  } catch (err) {
    console.error('Error adding station:', err);
    res.status(500).json({ success: false, message: 'Failed to add station' });
  }
});

// DELETE /api/stations/:id — remove a station (e.g. when property rejected/removed)
app.delete('/api/stations/:id', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    const idx = db.stations.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Station not found' });
    const removed = db.stations.splice(idx, 1)[0];
    writeDB(db);
    console.log(`🗑️ Station removed: "${removed.station_name}" (ID: ${id})`);
    res.json({ success: true, message: 'Station removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to remove station' });
  }
});

// PUT /api/stations/:id — update a station (price, slots, etc.)
app.put('/api/stations/:id', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    const idx = db.stations.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Station not found' });
    db.stations[idx] = { ...db.stations[idx], ...req.body, id };
    writeDB(db);
    res.json({ success: true, station: db.stations[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update station' });
  }
});

// GET /api/stations/by-property/:propertyId — check if a property is already a station
app.get('/api/stations/by-property/:propertyId', (req, res) => {
  const db = readDB();
  const station = db.stations.find(s => s.propertyId === req.params.propertyId);
  res.json({ success: true, exists: !!station, station: station || null });
});

// ─────────────────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success:false, message:'Internal server error' });
});

// ─────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const db         = readDB();
  const gateUrl    = `http://localhost:${PORT}/gate`;
  const bookingUrl = `http://localhost:${PORT}/booking`;
  const adminUrl   = `http://localhost:${PORT}/admin-login`;

  console.log('\n🚀 ParkEase AI Gate System v3.1 — Flagged Vehicle Detection Edition');
  console.log('📦 Database: ' + db.bookings.length + ' bookings, ' + db.stations.length + ' stations');
  console.log('🚨 Flagged Vehicle DB: ' + safeReadJSON(FLAGGED_DB_FILE).length + ' flagged plates loaded');
  console.log('📷 OCR: ✅ OCR.space API (cloud-based, no install needed)');
  console.log('📁 Entry logs: ' + ENTRY_LOGS_FILE);
  console.log('🔒 Flagged alerts log: ' + FLAGGED_ALERTS_FILE);
  console.log('\n📡 URLs:');
  console.log('   🚗 Gate:           ' + gateUrl);
  console.log('   📋 Booking:        ' + bookingUrl);
  console.log('   🔐 Admin Login:    ' + adminUrl);
  console.log('   🚨 Flagged Alerts: http://localhost:' + PORT + '/api/flagged-alerts');
  console.log('   🔍 DB Status:      http://localhost:' + PORT + '/api/db-status');
  console.log('   🔍 Debug:          http://localhost:' + PORT + '/api/debug-booking?vehicle=CG07CD7866\n');

  // Auto-open browser tabs
  const { exec } = require('child_process');
  const openCmd =
    process.platform === 'win32'  ? `start "" "${bookingUrl}" && start "" "${adminUrl}" && start "" "${gateUrl}"` :
    process.platform === 'darwin' ? `open "${bookingUrl}" && open "${adminUrl}" && open "${gateUrl}"` :
                                    `xdg-open "${bookingUrl}" && xdg-open "${adminUrl}" && xdg-open "${gateUrl}"`;

  exec(openCmd, (err) => {
    if (err) {
      console.log('⚠️  Browser did not open automatically. Open manually:');
      console.log('   Gate:        ' + gateUrl);
      console.log('   Booking:     ' + bookingUrl);
      console.log('   Admin Login: ' + adminUrl);
    }
  });
});

module.exports = app;
