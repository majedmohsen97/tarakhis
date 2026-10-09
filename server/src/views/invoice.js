// Printable bilingual (Arabic / English) invoice. Use the browser's "Print → Save as PDF".

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (halalas) => (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const UNIT = { trip: 'رحلة / Trip', ton: 'طن / Ton', item: 'بند / Item' };

export function renderInvoicePage({ inv, lines, company }) {
  const rows = lines
    .map(
      (l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td class="n">${esc(l.quantity)}</td><td>${esc(UNIT[l.unit] || l.unit)}</td><td class="n">${money(l.unit_price)}</td><td class="n">${money(l.amount)}</td></tr>`,
    )
    .join('');
  const draft = inv.status === 'draft';
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(inv.number || 'مسودة فاتورة')} · Tarakhis</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, system-ui, sans-serif; color:#13201b; margin:0; background:#f4f6f5; }
  .page { max-width: 820px; margin: 16px auto; background:#fff; padding: 28px; border-radius: 10px; position: relative; overflow: hidden; }
  .draft { position:absolute; inset:0; display:grid; place-items:center; font-size:110px; font-weight:800; color:rgba(198,40,40,.08); transform: rotate(-20deg); pointer-events:none; }
  header { display:flex; justify-content:space-between; gap:16px; border-bottom:3px solid #0f6b4a; padding-bottom:14px; flex-wrap: wrap; }
  h1 { margin:0; color:#0f6b4a; font-size:24px; }
  .muted { color:#5d6b66; font-size:13px; }
  .meta { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin: 16px 0; }
  .box { background:#f4f6f5; border-radius:8px; padding:10px 12px; }
  table { width:100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 8px; border-bottom: 1px solid #e3e8e6; text-align: start; vertical-align: top; }
  th { background:#0f6b4a; color:#fff; font-weight:600; }
  td.n { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { margin-top: 12px; margin-inline-start: auto; width: min(340px, 100%); }
  .totals div { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e3e8e6; }
  .totals .grand { font-weight:800; font-size:18px; border-bottom: 0; color:#0f6b4a; }
  .wrap { overflow-x: auto; }
  .print { margin: 16px auto; display:block; padding:10px 18px; border:0; border-radius:8px; background:#0f6b4a; color:#fff; font-size:15px; cursor:pointer; }
  @media print { body { background:#fff; } .page { margin:0; border-radius:0; } .print { display:none; } }
</style>
</head>
<body>
<div class="page">
  ${draft ? '<div class="draft">مسودة DRAFT</div>' : ''}
  <header>
    <div>
      <h1>${esc(company.name)}</h1>
      ${company.cr_number ? `<div class="muted">السجل التجاري / CR: ${esc(company.cr_number)}</div>` : ''}
      ${company.vat_number ? `<div class="muted">الرقم الضريبي / VAT No: ${esc(company.vat_number)}</div>` : ''}
      ${company.city ? `<div class="muted">${esc(company.city)}</div>` : ''}
    </div>
    <div>
      <h1>فاتورة ضريبية · Tax Invoice</h1>
      <div class="muted">رقم الفاتورة / No: <b>${esc(inv.number || '—')}</b></div>
      <div class="muted">التاريخ / Date: ${esc((inv.approved_at || inv.created_at).slice(0, 10))}</div>
    </div>
  </header>
  <div class="meta">
    <div class="box"><div class="muted">العميل / Client</div><b>${esc(inv.client_name)}</b>${inv.client_vat_number ? `<div class="muted">VAT: ${esc(inv.client_vat_number)}</div>` : ''}</div>
    <div class="box"><div class="muted">الفترة / Period</div><b>${esc(inv.week_start)} → ${esc(inv.week_end)}</b></div>
  </div>
  <div class="wrap"><table>
    <thead><tr><th>#</th><th>الوصف / Description</th><th>الكمية / Qty</th><th>الوحدة / Unit</th><th>السعر / Price</th><th>المبلغ / Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <div class="totals">
    <div><span>المجموع / Subtotal</span><span>${money(inv.subtotal)} ${esc(inv.currency)}</span></div>
    <div><span>ضريبة القيمة المضافة / VAT ${Math.round(inv.vat_rate * 100)}%</span><span>${money(inv.vat_amount)} ${esc(inv.currency)}</span></div>
    <div class="grand"><span>الإجمالي / Total</span><span>${money(inv.total)} ${esc(inv.currency)}</span></div>
  </div>
  ${inv.notes ? `<p class="muted">${esc(inv.notes)}</p>` : ''}
</div>
<button class="print" onclick="window.print()">طباعة / Print</button>
</body></html>`;
}
