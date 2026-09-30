// Dahahi Attendance - backend (Node 18+, không cần npm install)
const http = require('http'), fs = require('fs'), path = require('path');
const E = process.env, PORT = +E.PORT || 3000, SF = path.join(__dirname, 'settings.json');
let S = {}; try { S = JSON.parse(fs.readFileSync(SF, 'utf8')); } catch {}
// Cài đặt kết nối: ưu tiên file settings.json (lưu từ trang Cài đặt), sau đó biến môi trường
let MOCK = S.mock ?? E.MOCK === '1', HOST = (S.host || E.DAHAHI_HOST || '').replace(/\/$/, ''), AK = S.appKey || E.APP_KEY || 'k77hcPwEXB4LTdJv96mz', SK = S.secret || E.SECRET_KEY || '';
let DEV = S.devices || [], USEDEV = Array.isArray(S.devices); // máy đã kết nối (nhập ở tab Kết nối máy)
const saveS = () => fs.writeFileSync(SF, JSON.stringify({ host: HOST, appKey: AK, secret: SK, mock: MOCK, devices: DEV }));
const PASS = E.ADMIN_PASS || '', START = E.WORK_START || '08:30', DB = path.join(__dirname, 'data.json');

let db = { emp: {}, logs: [], seen: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB, 'utf8')) }; } catch {}
const kset = new Set(db.logs.map(l => `${l.pid}|${l.time}|${l.m}`));
const save = () => fs.writeFileSync(DB, JSON.stringify(db));
const p2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
// yyyy-MM-dd[ HH:mm[:ss]] -> dd/MM/yyyy HH:mm:ss (định dạng API Dahahi)
const toDH = s => { if (!s) return ''; const [d, t = '00:00:00'] = s.replace('T', ' ').split(' '); const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y} ${t.length === 5 ? t + ':00' : t}`; };
const fromDH = s => { const m = /(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):?(\d*)/.exec(s || ''); return m ? `${m[3]}-${p2(m[2])}-${p2(m[1])} ${p2(m[4])}:${m[5]}:${p2(m[6] || 0)}` : s; };
const raw64 = s => (s || '').replace(/^data:image\/\w+;base64,/, '');

// ---------- Gọi API Dahahi (hoặc mock khi MOCK=1) ----------
async function dh(url, body = {}) {
  if (MOCK) return mock(url, body);
  if (!HOST) throw new Error('Chưa cấu hình DAHAHI_HOST');
  const r = await fetch(HOST + url, { method: 'POST', headers: { 'Content-Type': 'application/json', AppKey: AK, SecretKey: SK }, body: JSON.stringify(body) });
  return r.json();
}
const M = { machines: [{ MachineName: 'Demo VP1', MachineCode: 'MAC0000001', MachineBoxId: '1001' }, { MachineName: 'Demo VP2', MachineCode: 'MAC0000002', MachineBoxId: '1002' }], people: {} };
function mock(url, b) {
  const ok = (x = {}) => ({ ErrorCode: '000000', ErrorMessage: 'Thành công', ...x });
  const P = M.people[b.MachineBoxId] ??= {};
  switch (url) {
    case '/api/faceid/getAllMachine': return ok({ Data: M.machines });
    case '/api/facereg/edit': P[b.FacePersionId] = { FacePersionId: b.FacePersionId, FullName: b.FullName, Base64Image: b.Base64Image }; return ok();
    case '/api/facereg/remove': delete P[b.FacePersionId]; return ok();
    case '/api/facereg/ClearAllPerson': M.people[b.MachineBoxId] = {}; return ok();
    case '/api/facereg/getInfo': return P[b.FacePersionId] ? ok({ Data: P[b.FacePersionId] }) : { ErrorCode: 'FARE0012', ErrorMessage: 'Người dùng không tồn tại trên thiết bị' };
    case '/api/facereg/searchByName': { const a = Object.values(P).filter(x => x.FullName.toLowerCase().includes((b.FullName || '').toLowerCase())); return ok({ Total: a.length, Data: a.slice((b.pageIndex - 1) * b.PageSize, b.pageIndex * b.PageSize).map(x => ({ Name: x.FullName, FacePersionId: x.FacePersionId, MachineBoxId: b.MachineBoxId })) }); }
    case '/api/facereg/checkinhis': {
      const r = []; if (b.pageIndex === 1) for (const x of Object.values(P)) for (let d = 0; d < 5; d++) for (const h of [8, 17]) { const t = new Date(Date.now() - d * 864e5); t.setHours(h, Math.floor(Math.random() * 45), 0); r.push({ FacePersionId: x.FacePersionId, CheckinTimeStr: toDH(iso(t)), FaceId: b.MachineBoxId }); }
      return ok({ Total: r.length, Data: r });
    }
    case '/api/facereg/GetEmployeeList': { const a = [{ EmployeeCode: 'EMP001', Name: 'Nguyen Van Demo', RegisteredFace: false, FacePersionId: '' }, { EmployeeCode: 'EMP002', Name: 'Tran Thi Mau', RegisteredFace: false, FacePersionId: '' }].filter(x => x.Name.toLowerCase().includes((b.FullName || '').toLowerCase())); return ok({ Total: a.length, Data: b.PageIndex > 1 ? [] : a }); }
    case '/api/facereg/SyncFace': return ok({ Total: 0, Data: ['demo'] });
    default: return ok({ Data: [] });
  }
}
const okc = r => r && r.ErrorCode === '000000';
const msg = r => `${r?.ErrorCode || 'ERR'} ${r?.ErrorMessage || ''}`.trim();

// ---------- Nghiệp vụ ----------
function addLog(pid, time, m, temp) {
  const k = `${pid}|${time}|${m}`; if (kset.has(k)) return 0;
  kset.add(k); db.logs.push({ pid: String(pid), time, m: String(m), temp: temp ?? null }); return 1;
}
async function pushEmp(e, machines) {
  const res = {};
  for (const m of machines) {
    const r = await dh('/api/facereg/edit', { FacePersionId: e.id, MachineBoxId: m, FullName: e.name, Base64Image: raw64(e.photo), FromTimeStr: toDH(e.from), ToTimeStr: toDH(e.to) });
    res[m] = okc(r) ? 'OK' : msg(r);
  }
  return res;
}
async function pullMachine(m) {
  let pg = 1, n = 0;
  for (;;) {
    const r = await dh('/api/facereg/searchByName', { FullName: '', MachineBoxId: m, pageIndex: pg, PageSize: 50 });
    if (!okc(r)) throw new Error(msg(r));
    const d = r.Data || [];
    for (const x of d) {
      const id = String(x.FacePersionId), old = db.emp[id] || { id, name: x.Name, machines: [] };
      const info = await dh('/api/facereg/getInfo', { FacePersionId: id, MachineBoxId: m });
      if (okc(info) && info.Data?.Base64Image) old.photo = info.Data.Base64Image;
      old.machines = [...new Set([...(old.machines || []), m])]; db.emp[id] = old; n++;
    }
    if (!d.length || pg * 50 >= r.Total) break; pg++;
  }
  save(); return n;
}
async function pullCloud() { // API v2.0.0: /api/facereg/GetEmployeeList
  let pg = 1, n = 0;
  for (;;) {
    const r = await dh('/api/facereg/GetEmployeeList', { FullName: '', PageIndex: pg, PageSize: 100 });
    if (!okc(r)) throw new Error(msg(r));
    const d = r.Data || [];
    for (const x of d) {
      const id = String(x.FacePersionId || x.FacePersonId || x.EmployeeCode || ''); if (!id) continue;
      db.emp[id] = { machines: [], ...(db.emp[id] || {}), id, name: x.Name, code: x.EmployeeCode, registered: !!x.RegisteredFace }; n++;
    }
    if (!d.length || pg * 100 >= r.Total) break; pg++;
  }
  save(); return n;
}
async function syncLogs(m, from, to) {
  let pg = 1, n = 0;
  for (;;) {
    const r = await dh('/api/facereg/checkinhis', { MachineBoxId: m, FacePersionId: '', FromTimeStr: toDH(from + ' 00:00:00'), ToTimeStr: toDH(to + ' 23:59:59'), pageIndex: pg, PageSize: 200 });
    if (!okc(r)) throw new Error(msg(r));
    const d = r.Data || [];
    for (const x of d) { n += addLog(x.FacePersionId, fromDH(x.CheckinTimeStr), m); const e = db.emp[x.FacePersionId]; if (e && !e.code && x.EmployeCode) e.code = x.EmployeCode; }
    if (!d.length || pg * 200 >= r.Total) break; pg++;
  }
  save(); return n;
}
function report(month) {
  const days = {};
  for (const l of db.logs) if (l.time.startsWith(month)) ((days[l.pid] ??= {})[l.time.slice(8, 10)] ??= []).push(l.time.slice(11, 16));
  const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
  return Object.entries(days).map(([pid, ds]) => {
    let min = 0, late = 0; const row = {};
    for (const [d, ts] of Object.entries(ds)) { ts.sort(); const a = ts[0], b = ts.at(-1); row[d] = [a, b]; min += mins(b) - mins(a); if (a > START) late++; }
    return { pid, name: db.emp[pid]?.name || '(chưa có trong danh sách)', days: row, workDays: Object.keys(row).length, hours: +(min / 60).toFixed(1), late };
  }).sort((a, b) => a.pid.localeCompare(b.pid, undefined, { numeric: true }));
}
const csv = rows => '\ufeff' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
const filterLogs = q => db.logs.filter(l => (!q.from || l.time.slice(0, 10) >= q.from) && (!q.to || l.time.slice(0, 10) <= q.to) && (!q.m || l.m === q.m) && (!q.pid || l.pid === q.pid)).sort((a, b) => b.time.localeCompare(a.time));
const empList = () => Object.values(db.emp).map(({ photo, ...e }) => ({ ...e, hasPhoto: !!photo })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

// ---------- HTTP ----------
const send = (res, c, o, h = {}) => { res.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8', ...h }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
const file = (res, name, rows) => send(res, 200, csv(rows), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
const body = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 40e6) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(e); } }); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), q = Object.fromEntries(u.searchParams), route = `${req.method} ${u.pathname}`;
  try {
    // Callback từ thiết bị (không cần đăng nhập): đặt URL dạng http://server:3000/callback/checkin
    if (route === 'POST /callback/checkin') { const b = await body(req); addLog(b.FacePersonId, fromDH(b.CheckinTime), b.MachineBoxId, b.Temperature); save(); return send(res, 200, { ErrorCode: '000000' }); }
    if (route === 'POST /callback/heartbeat') { const b = await body(req); db.seen[b.MachineBoxId] = b.MachineTime; save(); return send(res, 200, { ErrorCode: '000000' }); }
    if (PASS) {
      const a = Buffer.from((req.headers.authorization || '').slice(6), 'base64').toString();
      if (a.split(':').slice(1).join(':') !== PASS) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Cham cong"' }); return res.end('Cần đăng nhập'); }
    }
    if (route === 'GET /' || route === 'GET /index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(__dirname, 'public/index.html'))); }
    if (route === 'GET /api/settings') return send(res, 200, { host: HOST, appKey: AK, hasSecret: !!SK, mock: MOCK });
    if (route === 'POST /api/settings') {
      const b = await body(req); let h = (b.host || '').trim().replace(/\/$/, ''); if (h && !/^https?:\/\//.test(h)) h = 'https://' + h;
      HOST = h; AK = (b.appKey || '').trim() || AK; if (b.secret) SK = b.secret.trim(); MOCK = !!b.mock;
      saveS(); return send(res, 200, { ok: true });
    }
    if (route === 'POST /api/test') { // kiểm tra kết nối: gọi getAllMachine
      try { const r = await dh('/api/faceid/getAllMachine'); if (!okc(r)) return send(res, 200, { ok: false, error: msg(r) }); return send(res, 200, { ok: true, machines: (r.Data || []).map(m => `${m.MachineName} (${m.MachineBoxId})`) }); }
      catch (e) { return send(res, 200, { ok: false, error: 'Không kết nối được tới ' + (HOST || '(chưa nhập địa chỉ)') + ': ' + e.message }); }
    }
    if (route === 'GET /api/info') return send(res, 200, { mock: MOCK, host: HOST, start: START });
    if (route === 'GET /api/machines' && USEDEV) return send(res, 200, DEV.map(d => ({ MachineName: d.name, MachineCode: d.code, MachineBoxId: d.box, lastSeen: db.seen[d.box] || null })));
    if (route === 'POST /api/connect') { // giống màn "Thêm kết nối máy chấm công": website + secret key + mã thiết bị
      const b = await body(req); let h = (b.host || '').trim().replace(/\/$/, ''); if (h && !/^https?:\/\//.test(h)) h = 'https://' + h;
      const old = { HOST, SK, MOCK }; HOST = h || HOST; if (b.secret) SK = b.secret.trim(); MOCK = !!b.mock;
      try {
        const r = await dh('/api/faceid/getAllMachine'); if (!okc(r)) throw new Error(msg(r) + ' — kiểm tra lại Api Secret Key');
        const box = String(b.box || '').trim(), list = r.Data || [], m = list.find(x => String(x.MachineBoxId) === box || x.MachineCode === box);
        if (!m) throw new Error(`Kết nối Dahahi được nhưng không thấy mã thiết bị "${box}". Mã hiện có: ${list.map(x => x.MachineBoxId).join(', ') || '(chưa có máy nào)'}`);
        DEV = DEV.filter(d => d.box !== String(m.MachineBoxId)); DEV.push({ name: (b.name || '').trim() || m.MachineName, box: String(m.MachineBoxId), code: m.MachineCode }); USEDEV = true; saveS();
        return send(res, 200, { ok: true });
      } catch (e) { HOST = old.HOST; SK = old.SK; MOCK = old.MOCK; return send(res, 200, { ok: false, error: e.message === 'fetch failed' ? `Không kết nối được tới ${h} (sai địa chỉ website hoặc không có mạng)` : e.message }); }
    }
    if (route === 'DELETE /api/connect') { DEV = DEV.filter(d => d.box !== q.box); saveS(); return send(res, 200, { ok: true }); }
    if (route === 'GET /api/machines') { const r = await dh('/api/faceid/getAllMachine'); if (!okc(r)) return send(res, 502, { error: msg(r) }); return send(res, 200, (r.Data || []).map(m => ({ ...m, lastSeen: db.seen[m.MachineBoxId] || null }))); }
    if (route === 'GET /api/employees') return send(res, 200, empList());
    if (route === 'GET /api/photo') { const p = db.emp[q.id]?.photo; if (!p) return send(res, 404, {}); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' }); return res.end(Buffer.from(raw64(p), 'base64')); }
    if (route === 'POST /api/employees') { // thêm/sửa (chỉ gửi trường cần đổi)
      const b = await body(req); if (!b.id) return send(res, 400, { error: 'Thiếu mã nhân viên' });
      const id = String(b.id), e = { ...(db.emp[id] || {}), ...b, id }; e.machines ??= [];
      if (!e.name) return send(res, 400, { error: 'Thiếu họ tên' });
      db.emp[id] = e; save();
      const result = e.photo && e.machines.length ? await pushEmp(e, e.machines) : {};
      return send(res, 200, { ok: true, result, warn: !e.photo ? 'Chưa có ảnh nên chưa đẩy lên thiết bị' : undefined });
    }
    if (route === 'DELETE /api/employees') { // xóa trên thiết bị + danh sách
      const e = db.emp[q.id]; if (!e) return send(res, 404, { error: 'Không tồn tại' }); const result = {};
      for (const m of e.machines || []) { const r = await dh('/api/facereg/remove', { FacePersionId: e.id, MachineBoxId: m }); result[m] = okc(r) || r.ErrorCode === 'FARE0012' ? 'OK' : msg(r); }
      if (Object.values(result).every(v => v === 'OK')) { delete db.emp[q.id]; save(); }
      return send(res, 200, { result });
    }
    if (route === 'POST /api/pull') { const b = await body(req); return send(res, 200, { count: await pullMachine(b.m) }); }
    if (route === 'POST /api/pull-cloud') return send(res, 200, { count: await pullCloud() });
    if (route === 'POST /api/sync-logs') { const b = await body(req); return send(res, 200, { added: await syncLogs(b.m, b.from, b.to) }); }
    if (route === 'POST /api/sync-faces') { const b = await body(req); const r = await dh('/api/facereg/SyncFace', { FromMachineBoxId: b.from, ToMachineBoxId: b.to }); return okc(r) ? send(res, 200, r) : send(res, 502, { error: msg(r) }); }
    if (route === 'POST /api/clear') { const b = await body(req); const r = await dh('/api/facereg/ClearAllPerson', { MachineBoxId: b.m }); if (!okc(r)) return send(res, 502, { error: msg(r) }); for (const e of Object.values(db.emp)) e.machines = (e.machines || []).filter(x => x !== b.m); save(); return send(res, 200, { ok: true }); }
    if (route === 'GET /api/logs') return send(res, 200, filterLogs(q).slice(0, 2000).map(l => ({ ...l, name: db.emp[l.pid]?.name || '' })));
    if (route === 'GET /api/report') return send(res, 200, report(q.month));
    if (route === 'GET /api/export/employees.csv') return file(res, 'nhan-vien.csv', [['id', 'name', 'from', 'to', 'machines'], ...empList().map(e => [e.id, e.name, e.from || '', e.to || '', (e.machines || []).join('|')])]);
    if (route === 'GET /api/export/logs.csv') return file(res, 'lich-su-cham-cong.csv', [['Mã NV', 'Họ tên', 'Thời gian', 'Thiết bị', 'Nhiệt độ'], ...filterLogs(q).map(l => [l.pid, db.emp[l.pid]?.name || '', l.time, l.m, l.temp ?? ''])]);
    if (route === 'GET /api/export/report.csv') { const r = report(q.month), ds = [...Array(31)].map((_, i) => p2(i + 1)); return file(res, `bang-cong-${q.month}.csv`, [['Mã NV', 'Họ tên', 'Ngày công', 'Tổng giờ', 'Đi muộn', ...ds], ...r.map(x => [x.pid, x.name, x.workDays, x.hours, x.late, ...ds.map(d => x.days[d] ? x.days[d].join('-') : '')])]); }
    send(res, 404, { error: 'Not found' });
  } catch (e) { send(res, 500, { error: e.message }); }
}).listen(PORT, () => console.log(`Chấm công Dahahi chạy tại http://localhost:${PORT}  ${MOCK ? '[CHẾ ĐỘ DEMO]' : '[' + HOST + ']'}`));
