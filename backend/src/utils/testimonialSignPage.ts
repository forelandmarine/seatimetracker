/**
 * The page a Master or company opens from a testimonial signature link. It shows
 * Part 1 of the MGN 496 Annex C testimonial as the seafarer's record has it, and
 * asks for the company details, duties, Part 2 (conduct and ability) and Part 3
 * (name, position, CoC number or organisation, signature). Plain HTML with a small
 * inline script and a canvas for the signature; nothing is loaded from elsewhere.
 */

import type { TestimonialSnapshot } from './workboatTestimonial.js';

export const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ukDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const STYLE = `
  :root { --navy:#040D1A; --blue:#5386B6; --text:#4A5568; --line:#E2E8F0; --bg:#F7F9FC; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--navy); background: #fff; }
  main { max-width: 680px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  h2 { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--blue); margin: 28px 0 10px; }
  p, li { font-size: 15px; line-height: 1.5; color: var(--text); }
  dl { display: grid; grid-template-columns: minmax(120px, 40%) 1fr; gap: 6px 12px; margin: 0; font-size: 15px; }
  dt { color: var(--text); } dd { margin: 0; font-weight: 600; }
  label { display: block; font-size: 14px; color: var(--text); margin: 12px 0 4px; }
  input[type=text], input[type=email], textarea { width: 100%; font: inherit; font-size: 16px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; }
  textarea { min-height: 80px; }
  .radio { display: flex; gap: 20px; margin-top: 4px; font-size: 15px; }
  .box { background: var(--bg); border-left: 3px solid var(--blue); padding: 12px 14px; margin: 12px 0; font-size: 14px; color: var(--text); }
  canvas { width: 100%; height: 160px; border: 1px solid var(--line); border-radius: 8px; touch-action: none; background: #fff; }
  button { font: inherit; font-size: 16px; font-weight: 600; border: 0; border-radius: 10px; padding: 14px 18px; cursor: pointer; }
  .primary { background: var(--blue); color: #fff; width: 100%; margin-top: 20px; }
  .link { background: none; color: var(--blue); padding: 6px 0; font-size: 14px; }
  .error { color: #B00020; font-size: 15px; margin-top: 12px; }
  .check { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; font-size: 15px; color: var(--navy); }
  footer { margin-top: 40px; font-size: 12px; color: var(--text); }
`;

export function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><main>${body}<footer>SeaTime Tracker, Foreland Marine Consultancy Ltd</footer></main></body></html>`;
}

/** Link not found, expired, cancelled or already signed. */
export function signPageMessage(kind: 'not_found' | 'expired' | 'cancelled' | 'signed', signedAt?: Date | null): string {
  const text = {
    not_found: 'This signature link is not valid. Please ask the seafarer for a new one.',
    expired: 'This signature link has expired. Please ask the seafarer for a new one.',
    cancelled: 'The seafarer has cancelled this request.',
    signed: `This testimonial was signed${signedAt ? ` on ${ukDate(signedAt.toISOString())}` : ''}. Thank you.`,
  }[kind];
  return shell('Workboat testimonial', `<h1>Workboat testimonial</h1><p>${escapeHtml(text)}</p>`);
}

export function signPage(s: TestimonialSnapshot, postUrl: string): string {
  const months = s.sea_service_months;
  const rem = s.sea_service_remaining_days;
  const sea = s.sea_service_days ? `${months} ${months === 1 ? 'month' : 'months'} ${Number.isInteger(rem) ? rem : rem.toFixed(1)} ${rem === 1 ? 'day' : 'days'}` : 'NIL';
  const watch = s.watchkeeping_days ? `${s.watchkeeping_days} days` : 'NIL';
  const leave = s.leave.length
    ? s.leave.map((l) => `${ukDate(l.start_date)} to ${ukDate(l.end_date)}`).join(', ')
    : 'NIL';
  const capacity = s.capacities.length ? s.capacities.join(', ') : 'Not recorded';
  const v = s.vessel;

  const body = `
<h1>Deck (Workboat) Testimonial</h1>
<p>${escapeHtml(s.seafarer.name)} has asked you to complete and sign their sea service testimonial for
<strong>${escapeHtml(v.name)}</strong>, in the MGN 496 Annex C format the MCA asks for.
Please check Part 1 against the vessel's records before signing.</p>

<h2>Part 1 Service, from the seafarer's record</h2>
<dl>
  <dt>Full name</dt><dd>${escapeHtml(s.seafarer.name)}</dd>
  ${s.seafarer.date_of_birth ? `<dt>Date of birth</dt><dd>${escapeHtml(s.seafarer.date_of_birth)}</dd>` : ''}
  ${s.seafarer.discharge_book ? `<dt>Discharge book</dt><dd>${escapeHtml(s.seafarer.discharge_book)}</dd>` : ''}
  <dt>Capacity</dt><dd>${escapeHtml(capacity)}</dd>
  <dt>Vessel</dt><dd>${escapeHtml(v.name)}</dd>
  ${v.length_m ? `<dt>Length (m)</dt><dd>${escapeHtml(v.length_m)}</dd>` : ''}
  ${v.gross_tons ? `<dt>Gross tons</dt><dd>${escapeHtml(v.gross_tons)}</dd>` : ''}
  ${v.official_number ? `<dt>Official number</dt><dd>${escapeHtml(v.official_number)}</dd>` : ''}
  ${v.type ? `<dt>Vessel type</dt><dd>${escapeHtml(v.type)}</dd>` : ''}
  <dt>From</dt><dd>${ukDate(s.from)}</dd>
  <dt>To</dt><dd>${ukDate(s.to)}</dd>
  <dt>Sea service</dt><dd>${escapeHtml(sea)}</dd>
  <dt>Watchkeeping service</dt><dd>${escapeHtml(watch)}</dd>
  <dt>Leave of absence</dt><dd>${escapeHtml(leave)}</dd>
</dl>
<div class="box">Watchkeeping means in full charge of a navigational watch for not less than four out of every 24 hours
whilst the vessel was engaged on voyage. A day is a date with at least 4 hours of service and a month is 30 days.
${s.dual_capacity_days ? `${s.dual_capacity_days} days in a dual deck and engine capacity are counted at 50% (MGN 496 4.5).` : ''}
If any figure is wrong, do not sign: tell the seafarer, who can correct their record and send a new link.</div>
${s.served_as_master ? '<div class="box">The seafarer served as Master, so this must be signed by the owner or a responsible person from the management company, such as a Company Director or Superintendent (MGN 496 5.3).</div>' : ''}

<form id="f" novalidate>
<h2>Company</h2>
<label for="company_name">Company name</label><input type="text" id="company_name" maxlength="200">
<label for="company_address">Address</label><textarea id="company_address" maxlength="500"></textarea>
<label for="company_phone">Phone</label><input type="text" id="company_phone" maxlength="60">
<label for="company_email">Email</label><input type="email" id="company_email" maxlength="200">

<h2>Duties and tasks carried out</h2>
<textarea id="duties" maxlength="2000"></textarea>

<h2>Part 2 Testimonial</h2>
<label for="conduct">Conduct</label><textarea id="conduct" maxlength="2000"></textarea>
<label for="ability">Ability</label><textarea id="ability" maxlength="2000"></textarea>

<h2>Part 3 Official endorsement</h2>
<label for="signer_name">Name (print)</label><input type="text" id="signer_name" maxlength="200" autocomplete="name">
<label>Position</label>
<div class="radio">
  ${s.served_as_master ? '' : '<label><input type="radio" name="pos" value="master"> Master</label>'}
  <label><input type="radio" name="pos" value="responsible_person" ${s.served_as_master ? 'checked' : ''}> Responsible person</label>
</div>
<div id="master_fields">
  <label for="signer_coc_no">If Master, CoC number</label><input type="text" id="signer_coc_no" maxlength="60">
  <label for="signer_issuing_admin">Issuing administration</label><input type="text" id="signer_issuing_admin" maxlength="120">
</div>
<div id="rp_fields">
  <label for="signer_organisation">If responsible person, organisation</label><input type="text" id="signer_organisation" maxlength="200">
  <label for="signer_org_position">Position in organisation</label><input type="text" id="signer_org_position" maxlength="120">
</div>
<label>Signature</label>
<canvas id="sig"></canvas>
<button type="button" class="link" id="clear">Clear signature</button>
<label class="check"><input type="checkbox" id="confirm"> <span>I have checked the service above against the vessel's records and confirm this testimonial.</span></label>
<div class="error" id="err" role="alert"></div>
<button type="submit" class="primary" id="go">Sign testimonial</button>
</form>

<script>
(function () {
  var c = document.getElementById('sig'), ctx = c.getContext('2d'), drawn = false, down = false;
  function size() { var r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d;
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#040D1A'; drawn = false; }
  size(); window.addEventListener('resize', size);
  function pt(e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  c.addEventListener('pointerdown', function (e) { down = true; var p = pt(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', function (e) { if (!down) return; var p = pt(e); ctx.lineTo(p.x, p.y); ctx.stroke(); drawn = true; });
  c.addEventListener('pointerup', function () { down = false; });
  document.getElementById('clear').onclick = function () { ctx.clearRect(0, 0, c.width, c.height); drawn = false; };
  function pos() { var r = document.querySelector('input[name=pos]:checked'); return r ? r.value : null; }
  function fields() { var p = pos(); document.getElementById('master_fields').style.display = p === 'responsible_person' ? 'none' : '';
    document.getElementById('rp_fields').style.display = p === 'master' ? 'none' : ''; }
  document.querySelectorAll('input[name=pos]').forEach(function (r) { r.onchange = fields; }); fields();
  function val(id) { return document.getElementById(id).value; }
  document.getElementById('f').onsubmit = function (e) {
    e.preventDefault();
    var err = document.getElementById('err'), go = document.getElementById('go'); err.textContent = '';
    if (!drawn) { err.textContent = 'Please sign in the box.'; return; }
    var body = { confirm: document.getElementById('confirm').checked, signer_position: pos(),
      signature_image: c.toDataURL('image/png') };
    ['company_name','company_address','company_phone','company_email','duties','conduct','ability','signer_name',
     'signer_coc_no','signer_issuing_admin','signer_organisation','signer_org_position'].forEach(function (k) { body[k] = val(k); });
    go.disabled = true; go.textContent = 'Signing...';
    fetch(${JSON.stringify(postUrl)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { document.querySelector('main').innerHTML = '<h1>Thank you</h1><p>The testimonial is signed. The seafarer can now download it from SeaTime Tracker.</p>'; return; }
        err.textContent = (res.j && res.j.error) || 'Something went wrong. Please try again.'; go.disabled = false; go.textContent = 'Sign testimonial';
      })
      .catch(function () { err.textContent = 'Could not reach the server. Please try again.'; go.disabled = false; go.textContent = 'Sign testimonial'; });
  };
})();
</script>`;
  return shell(`Workboat testimonial for ${s.seafarer.name}`, body);
}
