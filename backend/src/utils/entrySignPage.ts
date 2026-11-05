/**
 * The page a Master or responsible person opens from an entry signature link. It
 * shows the entry as it stood when the link was made and asks for their name,
 * capacity and signature. Plain HTML with a small inline script and a canvas, in
 * the same style as the testimonial signing page.
 */

import { escapeHtml, shell } from './testimonialSignPage.js';
import type { EntrySnapshot } from './entrySignature.js';

const ukDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const ukDateTime = (iso: string) => `${ukDate(iso)} ${iso.slice(11, 16)} UTC`;

/** The rows for when the entry ran: a timed period, or the date(s) of a declared day entry. */
function whenRows(s: EntrySnapshot): string {
  if (s.end_time) {
    return `<dt>From</dt><dd>${escapeHtml(ukDateTime(s.start_time))}</dd>
  <dt>To</dt><dd>${escapeHtml(ukDateTime(s.end_time))}</dd>
  <dt>Hours</dt><dd>${escapeHtml((s.hours ?? 0).toFixed(1))}</dd>`;
  }
  const days = Math.max(1, Math.floor(s.sea_days ?? 1));
  if (days === 1) {
    return `<dt>Date</dt><dd>${escapeHtml(ukDate(s.start_time))}</dd>
  <dt>Sea days</dt><dd>1</dd>`;
  }
  const last = new Date(Date.parse(s.start_time.slice(0, 10) + 'T00:00:00Z') + (days - 1) * 86_400_000).toISOString();
  return `<dt>Dates</dt><dd>${escapeHtml(ukDate(s.start_time))} to ${escapeHtml(ukDate(last))}</dd>
  <dt>Sea days</dt><dd>${days}</dd>`;
}

/** Link not found, expired, cancelled, already signed, or the entry changed. */
export function entrySignPageMessage(
  kind: 'not_found' | 'expired' | 'cancelled' | 'signed' | 'changed',
  signedAt?: Date | null,
): string {
  const text = {
    not_found: 'This signature link is not valid. Please ask the seafarer for a new one.',
    expired: 'This signature link has expired. Please ask the seafarer for a new one.',
    cancelled: 'The seafarer has cancelled this request.',
    signed: `This entry was signed${signedAt ? ` on ${ukDate(signedAt.toISOString())}` : ''}. Thank you.`,
    changed: 'The seafarer has changed this entry since the link was made. Please ask them for a new link.',
  }[kind];
  return shell('Sea time entry', `<h1>Sea time entry</h1><p>${escapeHtml(text)}</p>`);
}

export function entrySignPage(s: EntrySnapshot, postUrl: string): string {
  const body = `
<h1>Sign a sea time entry</h1>
<p>${escapeHtml(s.seafarer_name)} has asked you to sign this entry from their SeaTime Tracker record
for <strong>${escapeHtml(s.vessel_name)}</strong>. Please check it against the vessel's records before signing.</p>

<h2>The entry</h2>
<dl>
  <dt>Seafarer</dt><dd>${escapeHtml(s.seafarer_name)}</dd>
  <dt>Vessel</dt><dd>${escapeHtml(s.vessel_name)}</dd>
  ${whenRows(s)}
  <dt>Service</dt><dd>${escapeHtml(s.service_type)}</dd>
  ${s.capacity ? `<dt>Capacity</dt><dd>${escapeHtml(s.capacity)}</dd>` : ''}
  ${s.from_port ? `<dt>Departed</dt><dd>${escapeHtml(s.from_port)}</dd>` : ''}
  ${s.to_port ? `<dt>Arrived</dt><dd>${escapeHtml(s.to_port)}</dd>` : ''}
</dl>
<div class="box">If anything is wrong, do not sign: tell the seafarer, who can correct the entry and send a new link.
If the entry is changed after you sign, your signature no longer counts.</div>
${s.served_as_master ? '<div class="box">The seafarer served as Master, so this must be signed by the owner or a responsible person from the management company, such as a Company Director or Superintendent (MGN 496 5.3).</div>' : ''}

<form id="f" novalidate>
<h2>Signed by</h2>
<label for="signer_name">Name (print)</label><input type="text" id="signer_name" maxlength="200" autocomplete="name">
<label>Capacity</label>
<div class="radio">
  ${s.served_as_master ? '' : '<label><input type="radio" name="cap" value="master"> Master</label>'}
  <label><input type="radio" name="cap" value="responsible_person" ${s.served_as_master ? 'checked' : ''}> Responsible person</label>
</div>
<label>Signature</label>
<canvas id="sig"></canvas>
<button type="button" class="link" id="clear">Clear signature</button>
<label class="check"><input type="checkbox" id="confirm"> <span>I have checked this entry against the vessel's records and confirm it.</span></label>
<div class="error" id="err" role="alert"></div>
<button type="submit" class="primary" id="go">Sign entry</button>
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
  function cap() { var r = document.querySelector('input[name=cap]:checked'); return r ? r.value : null; }
  document.getElementById('f').onsubmit = function (e) {
    e.preventDefault();
    var err = document.getElementById('err'), go = document.getElementById('go'); err.textContent = '';
    if (!drawn) { err.textContent = 'Please sign in the box.'; return; }
    var body = { confirm: document.getElementById('confirm').checked, signer_capacity: cap(),
      signer_name: document.getElementById('signer_name').value, signature_image: c.toDataURL('image/png') };
    go.disabled = true; go.textContent = 'Signing...';
    fetch(${JSON.stringify(postUrl)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { document.querySelector('main').innerHTML = '<h1>Thank you</h1><p>The entry is signed. The seafarer will see your signature in SeaTime Tracker.</p>'; return; }
        err.textContent = (res.j && res.j.error) || 'Something went wrong. Please try again.'; go.disabled = false; go.textContent = 'Sign entry';
      })
      .catch(function () { err.textContent = 'Could not reach the server. Please try again.'; go.disabled = false; go.textContent = 'Sign entry'; });
  };
})();
</script>`;
  return shell(`Sea time entry for ${s.seafarer_name}`, body);
}
