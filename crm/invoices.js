// invoices.js — Invoices module

import { db, state, $, money, fdate, badge, toast, today } from './config.js';
import { can, featureState } from './permissions.js';
import { openModal, closeModal, renderLockedOverlay } from './ui.js';
import { logActivity } from './dashboard.js';

let allInvoices = [];
let currentInvoice = null;

// ── LOAD INVOICES ──
export async function loadInvoices(search = '') {
  if(!state.bizId) return;
  const { data, error } = await db.from('invoices')
    .select('*, clients(full_name,email,whatsapp,phone)')
    .eq('business_id', state.bizId)
    .order('created_at', { ascending: false });
  if(error) { toast('Error loading invoices', 'fail'); return; }
  allInvoices = data || [];
  const filtered = search
    ? allInvoices.filter(i =>
        i.clients?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        i.description?.toLowerCase().includes(search.toLowerCase()))
    : allInvoices;
  renderInvoiceSummary(allInvoices);
  renderInvoicesTable(filtered);
}

function renderInvoiceSummary(invs) {
  const total = invs.reduce((s,i) => s+(i.total||i.amount||0), 0);
  const paid  = invs.filter(i=>i.status==='paid').reduce((s,i) => s+(i.total||i.amount||0), 0);
  const out   = invs.filter(i=>i.status!=='paid').reduce((s,i) => s+(i.total||i.amount||0), 0);
  const el = id => document.getElementById(id);
  if(el('inv-total')) el('inv-total').textContent = money(total);
  if(el('inv-paid'))  el('inv-paid').textContent  = money(paid);
  if(el('inv-out'))   el('inv-out').textContent   = money(out);
  if(el('invoices-count')) el('invoices-count').textContent = `${invs.length}`;
}

function renderInvoicesTable(invs) {
  const tbody = $('invoices-table');
  if(!tbody) return;
  const prefix = state.biz?.invoice_prefix || 'INV';
  const overdueDays = state.biz?.overdue_days || 30;
  const now = new Date();
  const canSend = can('invoiceSend', state.plan);

  if(!invs.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty">No invoices yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = invs.map((inv, i) => {
    const dueDate = inv.due_date ? new Date(inv.due_date) : null;
    const daysOverdue = dueDate ? Math.floor((now - dueDate) / 86400000) : 0;
    const isOverdue = inv.status !== 'paid' && daysOverdue > overdueDays;
    const rowStyle = isOverdue ? 'background:rgba(239,68,68,0.04)' : '';
    return `<tr style="${rowStyle}">
      <td><b>${prefix}-${String(invs.length-i).padStart(4,'0')}</b>${isOverdue?` <span style="color:#DC2626;font-size:0.7rem">⚠️ ${daysOverdue}d</span>`:''}</td>
      <td>${inv.clients?.full_name||'—'}</td>
      <td>${inv.description||'—'}</td>
      <td><b>${money(inv.total||inv.amount)}</b></td>
      <td style="color:${dueDate&&dueDate<now&&inv.status!=='paid'?'#DC2626':'var(--text)'}">${fdate(inv.due_date)}</td>
      <td>${badge(inv.status)}</td>
      <td style="display:flex;gap:0.3rem;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" onclick="window.__invoices.viewInvoice('${inv.id}')">View</button>
        <button class="btn btn-sm btn-outline" onclick="window.__invoices.markPaid('${inv.id}','${inv.status}')">${inv.status==='paid'?'Unpaid':'Paid'}</button>
        ${canSend
          ? `<button class="btn btn-sm btn-outline" onclick="window.__invoices.sendInvoice('${inv.id}')">Send</button>`
          : `<button class="btn btn-sm btn-outline" style="opacity:0.4;cursor:not-allowed" title="Upgrade to send">🔒 Send</button>`}
        <button class="btn btn-sm btn-red" onclick="window.__invoices.deleteInvoice('${inv.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

// ── VIEW INVOICE ──
export async function viewInvoice(id) {
  const inv = allInvoices.find(x=>x.id===id)
    || (await db.from('invoices').select('*, clients(full_name,email,whatsapp,phone,company)').eq('id',id).single()).data;
  if(!inv) return;
  currentInvoice = inv;
  const prefix = state.biz?.invoice_prefix || 'INV';
  const taxAmt = inv.tax_amount || (inv.amount * (inv.tax_rate||0) / 100);
  const total = inv.total || inv.amount;
  const payBtns = buildPaymentButtons();
  const canSend = can('invoiceSend', state.plan);

  $('invoice-body').innerHTML = `
    <div class="inv-doc">
      <div class="inv-doc-header">
        <div>
          ${state.biz?.logo_url && can('whiteLabel', state.plan)
            ? `<img src="${state.biz.logo_url}" style="height:40px;margin-bottom:0.5rem"/>`
            : `<div class="inv-doc-logo">${state.biz?.name||'Quala Studio'}</div>`}
          <p style="font-size:0.72rem;color:#6B7280">${state.biz?.email||''}</p>
          <p style="font-size:0.72rem;color:#6B7280">${state.biz?.phone||''}</p>
          <p style="font-size:0.72rem;color:#6B7280">${state.biz?.address||''}</p>
        </div>
        <div style="text-align:right">
          <div class="inv-doc-title">INVOICE</div>
          <p style="font-size:0.75rem;color:#6B7280">${prefix}-${String(Math.floor(Math.random()*8000)+1000).padStart(4,'0')}</p>
          <div style="margin-top:0.8rem;font-size:0.78rem">
            <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-bottom:0.2rem"><b style="width:60px;text-align:right">Date:</b><span style="color:#6B7280">${fdate(inv.created_at?.split('T')[0])}</span></div>
            <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-bottom:0.2rem"><b style="width:60px;text-align:right">Due:</b><span style="color:#6B7280">${fdate(inv.due_date)}</span></div>
            <div style="display:flex;justify-content:flex-end">${badge(inv.status)}</div>
          </div>
        </div>
      </div>
      <div class="inv-doc-parties">
        <div>
          <p class="inv-doc-label">From</p>
          <p class="inv-doc-name">${state.biz?.name||'Quala Studio'}</p>
          <p class="inv-doc-info">${state.biz?.email||''}<br/>${state.biz?.phone||''}<br/>${state.biz?.address||''}</p>
          ${state.biz?.bank_details ? `<p class="inv-doc-info" style="margin-top:0.5rem">${state.biz.bank_details}</p>` : ''}
        </div>
        <div>
          <p class="inv-doc-label">To</p>
          <p class="inv-doc-name">${inv.clients?.full_name||'Client'}</p>
          <p class="inv-doc-info">${inv.clients?.company||''}<br/>${inv.clients?.email||''}<br/>${inv.clients?.phone||inv.clients?.whatsapp||''}</p>
        </div>
      </div>
      <table class="inv-items-table">
        <thead><tr><th style="width:60%">Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          <tr><td>${inv.description||'Services'}</td><td style="text-align:right;font-weight:700">${money(inv.amount)}</td></tr>
          ${inv.notes?`<tr><td colspan="2" style="font-size:0.75rem;color:#6B7280;font-style:italic">${inv.notes}</td></tr>`:''}
        </tbody>
      </table>
      <div class="inv-total-box">
        <div class="inv-total-inner">
          ${(inv.tax_rate&&inv.tax_rate>0)?`
            <div class="inv-total-row"><span>Subtotal</span><span>${money(inv.amount)}</span></div>
            <div class="inv-total-row"><span>Tax (${inv.tax_rate}%)</span><span>${money(taxAmt)}</span></div>`:''}
          <div class="inv-total-final"><span>Total Due</span><span>${money(total)}</span></div>
        </div>
      </div>
      ${payBtns?`<div class="inv-pay-section"><p class="inv-pay-title">Payment Options</p><div class="inv-pay-btns">${payBtns}</div></div>`:''}
      <div class="inv-footer-note">
        <p>${state.biz?.invoice_notes||'Thank you for your business!'}</p>
        ${state.biz?.email?`<p style="margin-top:0.3rem">${state.biz.email}</p>`:''}
        <p style="margin-top:0.8rem;font-size:0.65rem;color:#9CA3AF">Powered by Quala Studio</p>
      </div>
    </div>`;

  // Send buttons in modal header
  const sendBtnsEl = $('inv-send-btns');
  if(sendBtnsEl) {
    sendBtnsEl.innerHTML = canSend
      ? `<button class="btn btn-sm btn-green" onclick="window.__invoices.sendByEmail()">Email</button>
         <button class="btn btn-sm btn-green" onclick="window.__invoices.sendByWhatsApp()">WhatsApp</button>`
      : `<span style="font-size:0.72rem;color:#9CA3AF;padding:0.3rem 0.5rem">🔒 Send — Growth+</span>`;
  }
  openModal('m-view-invoice');
}

// ── BUILD PAYMENT BUTTONS ──
function buildPaymentButtons() {
  let btns = '';
  if(state.biz?.stripe_link) btns += `<a href="${state.biz.stripe_link}" target="_blank" class="inv-pay-btn" style="background:#635BFF;color:white">Pay with Stripe</a>`;
  if(state.biz?.paypal_link) btns += `<a href="${state.biz.paypal_link}" target="_blank" class="inv-pay-btn" style="background:#003087;color:white">PayPal</a>`;
  if(state.biz?.mercadopago_link) btns += `<a href="${state.biz.mercadopago_link}" target="_blank" class="inv-pay-btn" style="background:#009EE3;color:white">Mercado Pago</a>`;
  if(state.biz?.zelle_info) btns += `<span class="inv-pay-btn" style="background:#6D1ED4;color:white">Zelle: ${state.biz.zelle_info}</span>`;
  if(state.biz?.venmo_info) btns += `<a href="https://venmo.com/${state.biz.venmo_info.replace('@','')}" target="_blank" class="inv-pay-btn" style="background:#3D95CE;color:white">Venmo</a>`;
  if(state.biz?.cashapp_info) btns += `<a href="https://cash.app/${state.biz.cashapp_info}" target="_blank" class="inv-pay-btn" style="background:#00D64F;color:black">CashApp</a>`;
  return btns;
}

// ── PRINT INVOICE ──
export function printInvoice() {
  const body = $('invoice-body');
  if(!body) return;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Invoice</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Plus Jakarta Sans',sans-serif;padding:2rem;color:#0F0F0F}
    .inv-doc{max-width:640px;margin:0 auto}
    .inv-doc-header{display:flex;justify-content:space-between;margin-bottom:2rem}
    .inv-doc-logo{font-size:1.2rem;font-weight:800;letter-spacing:-0.04em}
    .inv-doc-title{font-size:1.5rem;font-weight:800;text-align:right}
    .inv-doc-parties{display:grid;grid-template-columns:1fr 1fr;gap:2rem;background:#F8FAFC;padding:1.2rem;border-radius:8px;margin-bottom:1.5rem}
    .inv-doc-label{font-size:0.6rem;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem}
    .inv-doc-name{font-size:0.88rem;font-weight:700;margin-bottom:0.2rem}
    .inv-doc-info{font-size:0.75rem;color:#6B7280;line-height:1.6}
    .inv-items-table{width:100%;border-collapse:collapse;margin-bottom:1.5rem}
    .inv-items-table th{font-size:0.65rem;font-weight:700;color:#6B7280;text-transform:uppercase;padding:0.6rem 0.8rem;background:#F8FAFC;text-align:left}
    .inv-items-table td{padding:0.8rem;font-size:0.82rem;border-bottom:1px solid #E5E7EB}
    .inv-total-box{display:flex;justify-content:flex-end;margin-bottom:1.5rem}.inv-total-inner{min-width:200px}
    .inv-total-row{display:flex;justify-content:space-between;padding:0.35rem 0;font-size:0.82rem;color:#6B7280}
    .inv-total-final{display:flex;justify-content:space-between;padding:0.8rem;background:#0F0F0F;color:white;border-radius:8px;font-weight:800;font-size:1rem;margin-top:0.4rem}
    .inv-pay-section{margin-bottom:1rem}.inv-pay-title{font-size:0.68rem;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:0.6rem}
    .inv-pay-btns{display:flex;flex-wrap:wrap;gap:0.5rem}.inv-pay-btn{padding:0.45rem 0.9rem;border-radius:6px;font-size:0.75rem;font-weight:700;text-decoration:none;display:inline-block}
    .inv-footer-note{border-top:1px solid #E5E7EB;padding-top:1rem;font-size:0.72rem;color:#6B7280;text-align:center}
    .badge{display:inline-block;font-size:0.62rem;font-weight:700;padding:2px 8px;border-radius:4px}
    .bg{background:#DCFCE7;color:#15803D}.bb{background:#DBEAFE;color:#1D4ED8}.by{background:#FEF9C3;color:#A16207}.br{background:#FEE2E2;color:#B91C1C}.bgr{background:#F3F4F6;color:#6B7280}
    </style></head><body>${body.innerHTML}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ── SEND INVOICE ──
export function sendByEmail() {
  if(!currentInvoice) return;
  if(!can('invoiceSend', state.plan)) {
    document.dispatchEvent(new CustomEvent('upgrade:open'));
    return;
  }
  const email = currentInvoice.clients?.email;
  if(!email) { toast('No email on file. Update the contact first.', 'fail'); return; }
  const subject = encodeURIComponent(`Invoice from ${state.biz?.name||'Quala Studio'}`);
  const body = encodeURIComponent(buildShareText());
  window.open(`mailto:${email}?subject=${subject}&body=${body}`);
  db.from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', currentInvoice.id);
  toast('Email opened!');
}

export function sendByWhatsApp() {
  if(!currentInvoice) return;
  if(!can('invoiceSend', state.plan)) {
    document.dispatchEvent(new CustomEvent('upgrade:open'));
    return;
  }
  const wa = currentInvoice.clients?.whatsapp || currentInvoice.clients?.phone;
  if(!wa) { toast('No WhatsApp number on file. Update the contact first.', 'fail'); return; }
  const text = encodeURIComponent(buildShareText());
  window.open(`https://wa.me/${wa.replace(/\D/g,'')}?text=${text}`);
  db.from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', currentInvoice.id);
  toast('WhatsApp opened!');
}

function buildShareText() {
  const inv = currentInvoice;
  const payLink = state.biz?.stripe_link || state.biz?.paypal_link || state.biz?.mercadopago_link || '';
  return `Invoice from ${state.biz?.name||'Quala Studio'}\n\nClient: ${inv.clients?.full_name||'—'}\nDescription: ${inv.description||'Services'}\nAmount: ${money(inv.total||inv.amount)}\nDue: ${fdate(inv.due_date)}\nStatus: ${inv.status}\n\n${payLink?'Pay here: '+payLink:''}\n\nQuestions? ${state.biz?.email||''}`;
}

// ── SAVE INVOICE ──
export async function saveInvoice() {
  const clientId = $('i-client')?.value;
  const amount   = parseFloat($('i-amount')?.value);
  const desc     = $('i-desc')?.value.trim();
  if(!amount || !desc) { toast('Description and amount are required', 'fail'); return; }
  const taxRate = parseFloat($('i-tax')?.value) || 0;
  const taxAmt  = amount * (taxRate/100);
  const total   = amount + taxAmt;
  const { data: inv, error } = await db.from('invoices').insert({
    business_id: state.bizId,
    client_id: clientId || null,
    description: desc,
    amount,
    tax_rate: taxRate,
    tax_amount: taxAmt,
    total,
    due_date: $('i-due')?.value || null,
    status: $('i-status')?.value || 'pending',
    notes: $('i-notes')?.value.trim() || null,
  }).select().single();
  if(error) { toast('Error: '+error.message, 'fail'); return; }

  if(clientId) await db.from('clients').update({ last_invoice_date: today() }).eq('id', clientId);
  const cName = state.clients.find(c=>c.id===clientId)?.full_name || 'client';
  await logActivity('invoice', `Invoice created for ${cName}: ${money(total)}`, clientId);

  closeModal('m-invoice');

  // Post-create: ask to send
  const canSend = can('invoiceSend', state.plan);
  if(canSend) {
    currentInvoice = { ...inv, clients: state.clients.find(c=>c.id===clientId) };
    const send = confirm(`Invoice created! Would you like to send it to ${cName}?`);
    if(send) {
      const method = prompt('Send by:\n1 = Email\n2 = WhatsApp', '1');
      if(method === '1') sendByEmail();
      else if(method === '2') sendByWhatsApp();
    }
  } else {
    toast('Invoice created! Upgrade to Growth to send it directly.');
  }

  await loadInvoices();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

// ── MARK PAID ──
export async function markPaid(id, status) {
  const newStatus = status==='paid' ? 'pending' : 'paid';
  const upd = { status: newStatus };
  if(newStatus === 'paid') upd.paid_at = new Date().toISOString();
  await db.from('invoices').update(upd).eq('id', id);
  toast(newStatus==='paid' ? 'Marked as paid ✓' : 'Marked as pending');
  await loadInvoices();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

// ── DELETE INVOICE ──
export async function deleteInvoice(id) {
  if(!confirm('Delete this invoice?')) return;
  await db.from('invoices').delete().eq('id', id);
  toast('Invoice deleted');
  await loadInvoices();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

// ── OPEN NEW INVOICE MODAL ──
export function openNewInvoice(preSelectedClientId = null) {
  const sel = $('i-client');
  if(sel) {
    sel.innerHTML = `<option value="">— Select client —</option>` +
      state.clients.map(c => `<option value="${c.id}"${c.id===preSelectedClientId?' selected':''}>${c.full_name}</option>`).join('') +
      `<option value="__new__">+ Create new contact</option>`;
    sel.onchange = () => {
      if(sel.value === '__new__') {
        closeModal('m-invoice');
        document.dispatchEvent(new CustomEvent('contact:new', { detail: { callback: 'invoice' } }));
      }
    };
  }
  ['i-desc','i-amount','i-notes'].forEach(id => { const el=$(id); if(el) el.value=''; });
  if($('i-tax')) $('i-tax').value = '0';
  if($('i-status')) $('i-status').value = 'pending';
  const d = new Date(); d.setDate(d.getDate()+30);
  if($('i-due')) $('i-due').value = d.toISOString().split('T')[0];
  openModal('m-invoice');
}

window.__invoices = {
  viewInvoice, markPaid, deleteInvoice, sendInvoice: sendByEmail,
  sendByEmail, sendByWhatsApp, printInvoice,
};

document.addEventListener('invoice:view', e => viewInvoice(e.detail));
document.addEventListener('invoice:new', e => openNewInvoice(e.detail));
