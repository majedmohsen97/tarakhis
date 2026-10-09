// Server-rendered pass verification page for gate guards who don't have the app.

const T = {
  ar: {
    title: 'التحقق من تصريح الدخول',
    allowed: 'مسموح بالدخول',
    denied: 'غير مسموح بالدخول',
    invalid: 'تصريح غير صالح',
    expired: 'انتهت صلاحية رمز التصريح — اطلب من السائق تحديثه',
    company: 'الشركة',
    vehicle: 'الشاحنة',
    nationality: 'الجنسية',
    checkedAt: 'وقت التحقق',
    docs: 'المستندات',
    warnings: 'ملاحظات',
    notScheduled: 'السائق غير مدرج في جدول اليوم',
    expiresIn: (d) => `ينتهي خلال ${d} يوم`,
    states: { valid: 'ساري', expiring: 'ينتهي قريباً', expired: 'منتهي', pending: 'قيد المراجعة', rejected: 'مرفوض', missing: 'غير موجود' },
    req: { identity: 'الهوية / الإقامة', driving_license: 'رخصة القيادة', vehicle_registration: 'استمارة المركبة', insurance: 'التأمين', landfill_permit: 'تصريح دخول المردم' },
    noVehicle: 'لا توجد شاحنة مرتبطة بالسائق',
    other: 'English',
  },
  en: {
    title: 'Gate pass verification',
    allowed: 'ENTRY ALLOWED',
    denied: 'ENTRY DENIED',
    invalid: 'Invalid pass',
    expired: 'This pass code has expired — ask the driver to refresh it',
    company: 'Company',
    vehicle: 'Truck',
    nationality: 'Nationality',
    checkedAt: 'Checked at',
    docs: 'Documents',
    warnings: 'Notes',
    notScheduled: 'Driver is not on today\'s schedule',
    expiresIn: (d) => `expires in ${d} days`,
    states: { valid: 'Valid', expiring: 'Expiring soon', expired: 'Expired', pending: 'Under review', rejected: 'Rejected', missing: 'Missing' },
    req: { identity: 'National ID / Iqama', driving_license: 'Driving licence', vehicle_registration: 'Vehicle registration (Istimara)', insurance: 'Insurance', landfill_permit: 'Landfill entry permit' },
    noVehicle: 'No truck linked to this driver',
    other: 'العربية',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderVerifyPage(result, lang, token) {
  const t = T[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const otherLang = lang === 'ar' ? 'en' : 'ar';
  let body;

  if (!result.valid) {
    body = `<div class="banner bad"><div class="icon">✕</div><div>${esc(result.reason === 'EXPIRED' ? t.expired : t.invalid)}</div></div>`;
  } else {
    const ok = result.verdict === 'allowed';
    const fmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' });
    const rows = result.checks
      .map((c) => {
        const cls = c.state === 'valid' ? 'ok' : c.state === 'expiring' ? 'warn' : 'bad';
        const extra = c.expiry_date ? `<span class="muted">${esc(c.expiry_date)}${c.state === 'expiring' ? ' · ' + esc(t.expiresIn(c.days_left)) : ''}</span>` : '';
        return `<li><span>${esc(t.req[c.requirement] || c.requirement)}</span><span class="pill ${cls}">${esc(t.states[c.state] || c.state)}</span>${extra}</li>`;
      })
      .join('');
    const warns = result.warnings.filter((w) => w.code === 'NOT_SCHEDULED_TODAY').map(() => `<li>${esc(t.notScheduled)}</li>`).join('');
    const photo = result.driver.photo_url
      ? `<img class="photo" src="${esc(result.driver.photo_url)}" alt="">`
      : `<div class="photo placeholder">${esc(result.driver.name.slice(0, 1))}</div>`;
    body = `
      <div class="banner ${ok ? 'good' : 'bad'}"><div class="icon">${ok ? '✓' : '✕'}</div><div>${esc(ok ? t.allowed : t.denied)}</div></div>
      <div class="card person">
        ${photo}
        <div>
          <h2>${esc(result.driver.name)}</h2>
          <div class="muted">${esc(t.company)}: ${esc(result.company_name)}</div>
          ${result.driver.nationality ? `<div class="muted">${esc(t.nationality)}: ${esc(result.driver.nationality)}</div>` : ''}
          <div class="plate">${result.vehicle ? `${esc(t.vehicle)}: <b>${esc(result.vehicle.plate_number)}</b>` : esc(t.noVehicle)}</div>
        </div>
      </div>
      <div class="card"><h3>${esc(t.docs)}</h3><ul class="checks">${rows}</ul></div>
      ${warns ? `<div class="card"><h3>${esc(t.warnings)}</h3><ul class="notes">${warns}</ul></div>` : ''}
      <p class="muted center">${esc(t.checkedAt)}: ${esc(fmt.format(new Date(result.checked_at)))}</p>`;
  }

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(t.title)} · Tarakhis</title>
<style>
  :root { --bg:#f4f6f5; --card:#fff; --text:#13201b; --muted:#5d6b66; --good:#0f8a4f; --bad:#c62828; --warn:#b26a00; --line:#e3e8e6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0e1513; --card:#17211e; --text:#eef3f1; --muted:#9fb0aa; --line:#25332e; } }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Segoe UI", Tahoma, system-ui, sans-serif; background:var(--bg); color:var(--text); }
  main { max-width: 520px; margin: 0 auto; padding: 16px; }
  header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
  header b { font-size: 18px; } header a { color: var(--muted); font-size: 14px; }
  .banner { display:flex; align-items:center; gap:12px; padding:18px; border-radius:14px; color:#fff; font-size:22px; font-weight:700; margin-bottom:12px; }
  .banner.good { background: var(--good); } .banner.bad { background: var(--bad); }
  .icon { width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,.2); display:grid; place-items:center; font-size:26px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; margin-bottom:12px; }
  .person { display:flex; gap:14px; align-items:center; }
  .photo { width:88px; height:88px; border-radius:12px; object-fit:cover; flex:none; }
  .placeholder { background:var(--line); display:grid; place-items:center; font-size:36px; font-weight:700; }
  h2 { margin:0 0 4px; font-size:20px; } h3 { margin:0 0 8px; font-size:16px; }
  .muted { color:var(--muted); font-size:14px; } .center { text-align:center; }
  .plate { margin-top:6px; }
  ul { list-style:none; margin:0; padding:0; }
  .checks li { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 8px; padding:8px 0; border-top:1px solid var(--line); }
  .checks li:first-child { border-top:0; }
  .checks .muted { width:100%; }
  .pill { font-size:13px; font-weight:700; padding:2px 10px; border-radius:99px; color:#fff; }
  .pill.ok { background:var(--good); } .pill.warn { background:var(--warn); } .pill.bad { background:var(--bad); }
  .notes li { padding:4px 0; color: var(--warn); }
</style>
</head>
<body><main>
  <header><b>تراخيص · Tarakhis</b><a href="/v/${esc(token)}?lang=${otherLang}">${esc(t.other)}</a></header>
  ${body}
</main></body></html>`;
}
