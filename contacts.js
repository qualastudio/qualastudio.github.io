// contacts.js — Contacts module

import { db, state, $, $$, money, fdate, getColor, initials, badge, toast, today } from './config.js';
import { can, atLimit, getLimit, featureState, lockedBadge } from './permissions.js';
import { openModal, closeModal } from './ui.js';
import { logActivity } from './dashboard.js';

let currentContactId = null;
let allContacts = [];
let currentPage = 1;
const PAGE_SIZE = 25;

// ── LOAD CONTACTS ──
export async function loadContacts(search = '') {
  if(!state.bizId) return;
  let q = db.from('clients').select('*').eq('business_id', state.bizId).order('created_at', { ascending: false });
  if(search) q = q.ilike('full_name', `%${search}%`);
  const { data, error } = await q;
  if(error) { toast('Error loading contacts', 'fail'); return; }
  allContacts = data || [];
  state.clients = allContacts;
  renderContactsTable(allContacts);
}

function renderContactsTable(contacts) {
  const countEl = $('contacts-count');
  if(countEl) countEl.textContent = `${contacts.length}`;
  const tbody = $('contacts-table');
  if(!tbody) return;
  const now = new Date();
  if(!contacts.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty">No contacts yet. Add your first one.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = contacts.map(c => {
    const lastInv = c.last_invoice_date;
    const daysSince = lastInv ? Math.floor((now - new Date(lastInv)) / 86400000) : null;
    const isOverdue90 = daysSince && daysSince > 90 && c.status === 'active';
    const typeLabel = c.contact_type === 'provider' ? 'Provider' : 'Customer';
    return `<tr onclick="window.__contacts.viewContact('${c.id}')" style="cursor:pointer">
      <td>
        <div style="display:flex;align-items:center;gap:0.6rem">
          <span class="av" style="background:${getColor(c.full_name)}">${initials(c.full_name)}</span>
          <div>
            <p style="font-weight:700;font-size:0.82rem;color:var(--text)">${c.full_name}${c.is_favorite?' ⭐':''}</p>
            <p style="font-size:0.7rem;color:var(--text2)">${c.company||''}</p>
          </div>
          ${isOverdue90 ? `<span class="overdue-alert" title="No invoice in 90+ days">⚠️</span>` : ''}
        </div>
      </td>
      <td><span class="badge bgr" style="font-size:0.6rem">${typeLabel}</span></td>
      <td>${c.email ? `<a href="mailto:${c.email}" onclick="event.stopPropagation()" style="color:var(--text);text-decoration:none">${c.email}</a>` : '—'}</td>
      <td>${c.whatsapp || c.phone || '—'}</td>
      <td>${c.industry || '—'}</td>
      <td>${money(c.total_value)}</td>
      <td>${badge(c.status)}</td>
      <td onclick="event.stopPropagation()" style="display:flex;gap:0.4rem">
        <button class="btn btn-sm btn-outline" onclick="window.__contacts.openContactModal('${c.id}')" title="Contact">✉</button>
        <button class="btn btn-sm btn-outline" onclick="window.__contacts.viewContact('${c.id}')">View</button>
        <button class="btn btn-sm btn-red" onclick="window.__contacts.deleteContact('${c.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

// ── VIEW CONTACT DETAIL ──
export async function viewContact(id) {
  currentContactId = id;
  const c = allContacts.find(x=>x.id===id) || (await db.from('clients').select('*').eq('id',id).single()).data;
  if(!c) return;
  const [{ data: invs }, { data: acts }, { data: docs }] = await Promise.all([
    db.from('invoices').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    db.from('activities').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(10),
    db.from('files').select('*').eq('client_id', id).order('created_at', { ascending: false }),
  ]);
  $('detail-client-name').textContent = c.full_name;
  const totalInv = (invs||[]).reduce((s,i)=>s+(i.total||i.amount||0),0);
  const paidInv = (invs||[]).filter(i=>i.status==='paid').reduce((s,i)=>s+(i.total||i.amount||0),0);
  $('detail-body').innerHTML = `
    <!-- KPIs -->
    <div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:1.5rem">
      <div class="stat"><div class="stat-label">Total Invoiced</div><div class="stat-num">${money(totalInv)}</div></div>
      <div class="stat"><div class="stat-label">Collected</div><div class="stat-num" style="color:#16A34A">${money(paidInv)}</div></div>
      <div class="stat"><div class="stat-label">Outstanding</div><div class="stat-num" style="color:#D97706">${money(totalInv-paidInv)}</div></div>
      <div class="stat"><div class="stat-label">Status</div><div class="stat-num" style="font-size:1rem;padding-top:0.4rem">${badge(c.status)}</div></div>
    </div>
    <!-- Info + Actions -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div class="card" style="padding:1.4rem">
        <p style="font-size:0.78rem;font-weight:800;margin-bottom:1rem;color:var(--text)">Contact Info</p>
        <p style="font-size:0.9rem;font-weight:700;color:var(--text);margin-bottom:0.2rem">${c.full_name}</p>
        ${c.company ? `<p style="font-size:0.78rem;color:var(--text2);margin-bottom:0.5rem">${c.company}</p>` : ''}
        ${c.email ? `<p style="font-size:0.78rem;color:var(--text2)">${c.email}</p>` : ''}
        ${c.whatsapp ? `<p style="font-size:0.78rem;color:var(--text2)">${c.whatsapp}</p>` : ''}
        ${c.address ? `<p style="font-size:0.78rem;color:var(--text2)">${c.address}</p>` : ''}
        <p style="font-size:0.72rem;color:var(--text2);margin-top:0.5rem">${c.industry||''} ${c.source?'· Source: '+c.source:''}</p>
        ${c.notes ? `<p style="font-size:0.78rem;color:var(--text2);margin-top:0.6rem;font-style:italic;padding:0.6rem;background:var(--surface2);border-radius:6px">${c.notes}</p>` : ''}
        <div style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap">
          ${c.whatsapp ? `<a href="https://wa.me/${c.whatsapp.replace(/\D/g,'')}" target="_blank" class="btn btn-sm btn-green">WhatsApp</a>` : ''}
          ${c.email ? `<button class="btn btn-sm btn-outline" onclick="window.__contacts.openContactModal('${c.id}')">Send Email</button>` : ''}
          <button class="btn btn-sm btn-outline" onclick="window.__contacts.printContact('${c.id}')">Print Sheet</button>
          <button class="btn btn-sm btn-outline" onclick="window.__contacts.toggleFavorite('${c.id}',${c.is_favorite})">${c.is_favorite?'★ Unstar':'☆ Star'}</button>
        </div>
      </div>
      <!-- Linked contacts -->
      <div class="card" style="padding:1.4rem">
        <p style="font-size:0.78rem;font-weight:800;margin-bottom:0.8rem;color:var(--text)">Linked Contacts</p>
        <div id="linked-contacts-list">Loading...</div>
        <button class="btn btn-sm btn-outline" style="margin-top:0.8rem" onclick="window.__contacts.openLinkContact('${c.id}')">+ Link Contact</button>
      </div>
    </div>
    <!-- Invoices -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-head">
        <div class="card-title">Invoices</div>
        <button class="btn btn-sm btn-dark" onclick="document.dispatchEvent(new CustomEvent('invoice:new',{detail:'${c.id}'}))">+ New Invoice</button>
      </div>
      <table><thead><tr><th>#</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${(invs||[]).length ? (invs||[]).map((inv,i)=>`
        <tr>
          <td><b>${state.biz?.invoice_prefix||'INV'}-${String(i+1).padStart(4,'0')}</b></td>
          <td>${inv.description||'—'}</td>
          <td><b>${money(inv.total||inv.amount)}</b></td>
          <td>${fdate(inv.due_date)}</td>
          <td>${badge(inv.status)}</td>
          <td><button class="btn btn-sm btn-outline" onclick="document.dispatchEvent(new CustomEvent('invoice:view',{detail:'${inv.id}'}))">View</button></td>
        </tr>`).join('') : `<tr><td colspan="6"><div class="empty">No invoices yet.</div></td></tr>`}
      </tbody></table>
    </div>
    <!-- Documents -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-head">
        <div class="card-title">Documents</div>
        <button class="btn btn-sm btn-outline" onclick="window.__contacts.openDocUpload('${c.id}')">+ Upload</button>
      </div>
      <div style="padding:1rem">
        ${(docs||[]).length ? (docs||[]).map(f=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">
            <div>
              <p style="font-size:0.8rem;font-weight:600;color:var(--text)">${f.name}</p>
              <p style="font-size:0.7rem;color:var(--text2)">${fdate(f.created_at?.split('T')[0])}</p>
            </div>
            <a href="${f.url}" target="_blank" class="btn btn-sm btn-outline">View</a>
          </div>`).join('') : `<p style="font-size:0.8rem;color:var(--text2)">No documents yet.</p>`}
      </div>
    </div>
    <!-- Activity -->
    <div class="card">
      <div class="card-head"><div class="card-title">Activity History</div></div>
      <div style="padding:1rem">
        ${(acts||[]).length ? (acts||[]).map(a=>`
          <div style="display:flex;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--border)">
            <div style="width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0;margin-top:5px"></div>
            <div>
              <p style="font-size:0.78rem;color:var(--text)">${a.description}</p>
              <p style="font-size:0.68rem;color:var(--text2)">${fdate(a.created_at?.split('T')[0])}</p>
            </div>
          </div>`).join('') : `<p style="font-size:0.8rem;color:var(--text2)">No activity yet.</p>`}
      </div>
    </div>`;
  // Load linked contacts
  loadLinkedContacts(c.id, c.linked_contact_ids || []);
  // Navigate to detail tab
  document.dispatchEvent(new CustomEvent('tab:goto', { detail: 'client-detail' }));
}

async function loadLinkedContacts(clientId, linkedIds) {
  const el = $('linked-contacts-list');
  if(!el) return;
  if(!linkedIds.length) { el.innerHTML = `<p style="font-size:0.78rem;color:var(--text2)">No linked contacts.</p>`; return; }
  const { data } = await db.from('clients').select('id,full_name,status').in('id', linkedIds);
  el.innerHTML = (data||[]).map(c=>`
    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0">
      <span class="av" style="background:${getColor(c.full_name)};width:20px;height:20px;font-size:0.5rem">${initials(c.full_name)}</span>
      <span style="font-size:0.78rem;color:var(--text)">${c.full_name}</span>
      ${badge(c.status)}
    </div>`).join('');
}

// ── SAVE CONTACT ──
export async function saveContact() {
  const name = $('c-name')?.value.trim();
  if(!name) { toast('Name is required', 'fail'); return; }
  // Check limit
  if(atLimit(state.plan, 'contacts', allContacts.length)) {
    toast(`Contact limit reached. Upgrade to add more.`, 'fail');
    document.dispatchEvent(new CustomEvent('upgrade:open'));
    return;
  }
  const payload = {
    business_id: state.bizId,
    full_name: name,
    contact_type: $('c-type')?.value || 'customer',
    company: $('c-company')?.value.trim() || null,
    email: $('c-email')?.value.trim() || null,
    whatsapp: $('c-whatsapp')?.value.trim() || null,
    phone: $('c-phone')?.value.trim() || null,
    address: $('c-address')?.value.trim() || null,
    industry: $('c-industry')?.value || null,
    status: $('c-status')?.value || 'active',
    total_value: parseFloat($('c-value')?.value) || 0,
    source: $('c-source')?.value || null,
    notes: $('c-notes')?.value.trim() || null,
  };
  const { error } = await db.from('clients').insert(payload);
  if(error) { toast('Error: '+error.message, 'fail'); return; }
  await logActivity('client', `New contact added: ${name}`);
  closeModal('m-contact');
  toast('Contact added!');
  await loadContacts();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

// ── DELETE CONTACT ──
export async function deleteContact(id) {
  if(!confirm('Delete this contact? This will also delete their invoices and expenses.')) return;
  await Promise.all([
    db.from('invoices').delete().eq('client_id', id),
    db.from('expenses').delete().eq('client_id', id),
    db.from('appointments').delete().eq('client_id', id),
    db.from('files').delete().eq('client_id', id),
  ]);
  await db.from('clients').delete().eq('id', id);
  toast('Contact deleted');
  await loadContacts();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

// ── TOGGLE FAVORITE ──
export async function toggleFavorite(id, current) {
  await db.from('clients').update({ is_favorite: !current }).eq('id', id);
  toast(current ? 'Removed from favorites' : 'Added to favorites ⭐');
  await loadContacts();
}

// ── CONTACT MODAL (Send Email/WhatsApp) ──
export function openContactModal(clientId) {
  const c = allContacts.find(x=>x.id===clientId);
  if(!c) return;
  currentContactId = clientId;
  const el = $('contact-message-modal');
  if(!el) return;
  $('contact-modal-name').textContent = c.full_name;
  $('contact-msg-email').value = c.email || '';
  $('contact-msg-whatsapp').value = c.whatsapp || '';
  $('contact-msg-body').value = '';
  openModal('m-contact-message');
}

export function sendContactMessage() {
  const email = $('contact-msg-email')?.value.trim();
  const wa = $('contact-msg-whatsapp')?.value.trim();
  const body = $('contact-msg-body')?.value.trim();
  const method = $('contact-msg-method')?.value;
  if(!body) { toast('Message cannot be empty', 'fail'); return; }
  if(method === 'email') {
    if(!email) { toast('No email on file for this contact', 'fail'); return; }
    const subject = encodeURIComponent($('contact-msg-subject')?.value || 'Message from '+state.biz?.name);
    window.open(`mailto:${email}?subject=${subject}&body=${encodeURIComponent(body)}`);
  } else {
    if(!wa) { toast('No WhatsApp number on file', 'fail'); return; }
    window.open(`https://wa.me/${wa.replace(/\D/g,'')}?text=${encodeURIComponent(body)}`);
  }
  closeModal('m-contact-message');
  toast('Message opened!');
}

// ── PRINT CONTACT SHEET ──
export function printContact(id) {
  const c = allContacts.find(x=>x.id===id);
  if(!c) return;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Contact — ${c.full_name}</title>
    <style>body{font-family:Arial,sans-serif;padding:2rem;color:#0F0F0F;max-width:600px;margin:0 auto}
    h1{font-size:1.4rem;margin-bottom:0.5rem}h2{font-size:0.9rem;color:#6B7280;margin-bottom:1.5rem}
    .field{margin-bottom:0.8rem}.label{font-size:0.65rem;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.2rem}
    .value{font-size:0.9rem}</style></head><body>
    <h1>${c.full_name}</h1><h2>${state.biz?.name||'Quala CRM'}</h2>
    ${c.company?`<div class="field"><div class="label">Company</div><div class="value">${c.company}</div></div>`:''}
    ${c.email?`<div class="field"><div class="label">Email</div><div class="value">${c.email}</div></div>`:''}
    ${c.whatsapp?`<div class="field"><div class="label">WhatsApp</div><div class="value">${c.whatsapp}</div></div>`:''}
    ${c.address?`<div class="field"><div class="label">Address</div><div class="value">${c.address}</div></div>`:''}
    ${c.industry?`<div class="field"><div class="label">Industry</div><div class="value">${c.industry}</div></div>`:''}
    ${c.notes?`<div class="field"><div class="label">Notes</div><div class="value">${c.notes}</div></div>`:''}
    </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ── LINK CONTACT ──
export function openLinkContact(clientId) {
  const sel = $('link-contact-select');
  if(!sel) return;
  sel.innerHTML = allContacts
    .filter(c => c.id !== clientId)
    .map(c => `<option value="${c.id}">${c.full_name}</option>`)
    .join('');
  $('link-contact-btn').onclick = () => linkContact(clientId, sel.value);
  openModal('m-link-contact');
}

async function linkContact(clientId, linkedId) {
  const c = allContacts.find(x=>x.id===clientId);
  const linked = [...(c?.linked_contact_ids||[])];
  if(!linked.includes(linkedId)) linked.push(linkedId);
  await db.from('clients').update({ linked_contact_ids: linked }).eq('id', clientId);
  closeModal('m-link-contact');
  toast('Contact linked!');
  viewContact(clientId);
}

// Expose to global for inline onclick handlers
window.__contacts = {
  viewContact, openContactModal, deleteContact,
  toggleFavorite, printContact, openLinkContact, openDocUpload,
};

function openDocUpload(clientId) {
  currentContactId = clientId;
  openModal('m-doc-upload');
}

export async function uploadDocument() {
  const fileInput = $('doc-file-input');
  const name = $('doc-file-name')?.value.trim();
  if(!fileInput?.files?.[0] || !name) { toast('Please select a file and enter a name', 'fail'); return; }
  const file = fileInput.files[0];
  const path = `${state.bizId}/${currentContactId}/${Date.now()}_${file.name}`;
  const { data, error } = await db.storage.from('documents').upload(path, file);
  if(error) { toast('Upload failed: '+error.message, 'fail'); return; }
  const { data: urlData } = db.storage.from('documents').getPublicUrl(path);
  await db.from('files').insert({
    business_id: state.bizId,
    client_id: currentContactId,
    name,
    url: urlData.publicUrl,
    file_type: file.type,
    size: file.size,
  });
  closeModal('m-doc-upload');
  toast('Document uploaded!');
  viewContact(currentContactId);
}
