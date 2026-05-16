// settings.js — Settings module

import { db, state, $, toast } from './config.js';
import { can, getLimit, PLANS } from './permissions.js';
import { openModal, closeModal } from './ui.js';

// ── LOAD SETTINGS ──
export function loadSettings() {
  if(!state.biz) return;
  const map = {
    'set-name':'name','set-email':'email','set-phone':'phone',
    'set-web':'website','set-addr':'address',
    'set-stripe':'stripe_link','set-paypal':'paypal_link',
    'set-mp':'mercadopago_link','set-zelle':'zelle_info',
    'set-venmo':'venmo_info','set-cashapp':'cashapp_info',
    'set-prefix':'invoice_prefix','set-notes':'invoice_notes',
    'set-bank':'bank_details','set-overdue-days':'overdue_days',
  };
  Object.entries(map).forEach(([id,key]) => {
    const el=$(id); if(el) el.value = state.biz[key]||'';
  });
  if($('set-currency')) $('set-currency').value = state.biz.currency||'USD';
  if($('set-terms')) $('set-terms').value = state.biz.payment_terms||'Due on receipt';

  // Toggles
  const togPipeline = $('tog-pipeline');
  if(togPipeline) togPipeline.classList.toggle('on', state.biz.module_pipeline !== false);

  // Plan info
  const planInfo = $('plan-info');
  if(planInfo) {
    const limit = getLimit(state.plan, 'contacts');
    const userLimit = getLimit(state.plan, 'users');
    planInfo.innerHTML = `
      <p style="font-size:0.82rem;font-weight:700;color:var(--text)">Current Plan: ${PLANS[state.plan]?.label||state.plan}</p>
      <p style="font-size:0.78rem;color:var(--text2)">Contacts: ${limit===Infinity?'Unlimited':limit} · Users: ${userLimit===Infinity?'Unlimited':userLimit}</p>
      ${can('showUpgrade',state.plan)?`<button class="btn btn-sm btn-dark" style="margin-top:0.8rem" onclick="document.dispatchEvent(new CustomEvent('upgrade:open'))">Upgrade Plan</button>`:''}
    `;
  }

  // White label section
  const wlSection = $('whitlabel-section');
  if(wlSection) {
    wlSection.style.display = can('whiteLabel', state.plan) ? 'block' : 'none';
    if(!can('whiteLabel', state.plan)) {
      const wlLock = $('whitlabel-lock');
      if(wlLock) wlLock.style.display = 'block';
    }
  }
  loadTeamMembers();
}

// ── SAVE SETTINGS ──
export async function saveSettings() {
  if(!state.bizId) return;
  const updates = {
    name: $('set-name')?.value || state.biz.name,
    email: $('set-email')?.value,
    phone: $('set-phone')?.value,
    website: $('set-web')?.value,
    address: $('set-addr')?.value,
    stripe_link: $('set-stripe')?.value,
    paypal_link: $('set-paypal')?.value,
    mercadopago_link: $('set-mp')?.value,
    zelle_info: $('set-zelle')?.value,
    venmo_info: $('set-venmo')?.value,
    cashapp_info: $('set-cashapp')?.value,
    invoice_prefix: $('set-prefix')?.value || 'INV',
    currency: $('set-currency')?.value || 'USD',
    payment_terms: $('set-terms')?.value || 'Due on receipt',
    invoice_notes: $('set-notes')?.value,
    bank_details: $('set-bank')?.value,
    overdue_days: parseInt($('set-overdue-days')?.value) || 30,
  };
  const { error } = await db.from('businesses').update(updates).eq('id', state.bizId);
  if(error) { toast('Error: '+error.message,'fail'); return; }
  Object.assign(state.biz, updates);
  $('biz-name').textContent = state.biz.name;
  toast('Settings saved!');
}

// ── TOGGLE MODULE ──
export async function toggleModule(key) {
  const tog = $(`tog-${key}`);
  if(!tog) return;
  const isOn = tog.classList.toggle('on');
  const upd = {}; upd[`module_${key}`] = isOn;
  await db.from('businesses').update(upd).eq('id', state.bizId);
  state.biz[`module_${key}`] = isOn;
  toast(isOn ? 'Enabled' : 'Disabled');
}

// ── UPLOAD LOGO (White Label) ──
export async function uploadLogo() {
  if(!can('whiteLabel', state.plan)) {
    document.dispatchEvent(new CustomEvent('upgrade:open'));
    return;
  }
  const fileInput = $('logo-upload-input');
  if(!fileInput?.files?.[0]) return;
  const file = fileInput.files[0];
  const path = `logos/${state.bizId}/${Date.now()}_${file.name}`;
  const { error } = await db.storage.from('logos').upload(path, file, { upsert: true });
  if(error) { toast('Upload failed','fail'); return; }
  const { data: urlData } = db.storage.from('logos').getPublicUrl(path);
  await db.from('businesses').update({ logo_url: urlData.publicUrl }).eq('id', state.bizId);
  state.biz.logo_url = urlData.publicUrl;
  const preview = $('logo-preview');
  if(preview) { preview.src = urlData.publicUrl; preview.style.display = 'block'; }
  toast('Logo updated!');
}

// ── TEAM MEMBERS ──
export async function loadTeamMembers() {
  if(!state.bizId) return;
  const { data } = await db.from('team_members').select('*').eq('business_id', state.bizId).order('created_at');
  const members = data || [];
  const tbody = $('team-table');
  if(!tbody) return;
  const userLimit = getLimit(state.plan, 'users');
  const isAdmin = state.biz?.owner_id === state.user?.id;

  $('team-count').textContent = `${members.length} / ${userLimit === Infinity ? '∞' : userLimit}`;

  tbody.innerHTML = members.length ? members.map(m=>`
    <tr>
      <td><b>${m.full_name}</b></td>
      <td>${m.email}</td>
      <td><span class="badge ${m.role==='admin'?'bg':'bb'}">${m.role}</span></td>
      <td><span class="badge ${m.is_active?'bg':'bgr'}">${m.is_active?'Active':'Inactive'}</span></td>
      <td>${isAdmin&&m.user_id!==state.user?.id?`
        <button class="btn btn-sm btn-red" onclick="window.__settings.removeMember('${m.id}')">Remove</button>
      `:'—'}</td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty">No team members yet.</div></td></tr>`;

  // Add member button visibility
  const addBtn = $('add-member-btn');
  if(addBtn) {
    addBtn.style.display = isAdmin ? 'block' : 'none';
    if(members.length >= userLimit && userLimit !== Infinity) {
      addBtn.disabled = true;
      addBtn.title = `User limit reached (${userLimit}). Upgrade to add more.`;
      addBtn.textContent = `🔒 Limit reached (${userLimit})`;
    } else {
      addBtn.disabled = false;
      addBtn.textContent = '+ Invite Team Member';
    }
  }
}

// ── INVITE TEAM MEMBER ──
export async function inviteMember() {
  const userLimit = getLimit(state.plan, 'users');
  const { data: existing } = await db.from('team_members').select('id').eq('business_id', state.bizId);
  if((existing?.length||0) >= userLimit) {
    toast(`User limit reached. Upgrade to add more.`, 'fail');
    document.dispatchEvent(new CustomEvent('upgrade:open'));
    return;
  }
  const name  = $('member-name')?.value.trim();
  const email = $('member-email')?.value.trim();
  const role  = $('member-role')?.value || 'staff';
  if(!name||!email) { toast('Name and email required','fail'); return; }

  // Create auth user via Supabase Admin is not possible from client.
  // We store the invite and the user must register with same email.
  const { error } = await db.from('team_members').insert({
    business_id: state.bizId,
    full_name: name,
    email,
    role,
    is_active: true,
    // user_id linked when they first sign in
  });
  if(error) { toast('Error: '+error.message,'fail'); return; }
  closeModal('m-invite-member');
  toast(`Invite created for ${email}. They must register with this email.`);
  await loadTeamMembers();
}

// ── REMOVE MEMBER ──
export async function removeMember(id) {
  if(!confirm('Remove this team member?')) return;
  await db.from('team_members').delete().eq('id', id);
  toast('Member removed');
  await loadTeamMembers();
}

window.__settings = { removeMember, toggleModule, uploadLogo };
