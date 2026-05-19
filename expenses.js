// expenses.js — Expenses module

import { db, state, $, $$, money, fdate, badge, toast, today } from './config.js';
import { can } from './permissions.js';
import { openModal, closeModal } from './ui.js';
import { logActivity } from './dashboard.js';

let allExpenses = [];
let currentPage = 1;
let editingId = null;
const PAGE_SIZE = 25;
let sortKey = 'date';
let sortDir = 'desc';
let filterCategory = '';
let filterDateFrom = '';
let filterDateTo = '';

const DEFAULT_CATEGORIES = [
  'Software & Tools','Marketing & Ads','Office & Supplies',
  'Travel & Transport','Meals & Entertainment','Rent & Utilities',
  'Payroll & Contractors','Insurance','Taxes & Fees','Equipment','Other'
];

export async function loadExpenses() {
  if(!state.bizId) return;
  const customCats = state.biz?.expense_categories || [];
  const allCats = [...new Set([...DEFAULT_CATEGORIES, ...customCats])];
  populateCategorySelects(allCats);
  populateVendorSelect();

  let q = db.from('expenses')
    .select('*, clients(full_name)')
    .eq('business_id', state.bizId)
    .order(sortKey, { ascending: sortDir === 'asc' });
  if(filterCategory) q = q.eq('category', filterCategory);
  if(filterDateFrom) q = q.gte('date', filterDateFrom);
  if(filterDateTo) q = q.lte('date', filterDateTo);

  const { data, error } = await q;
  if(error) { toast('Error loading expenses', 'fail'); return; }
  allExpenses = data || [];
  renderExpenseSummary(allExpenses);
  renderExpensesTable(allExpenses);
}

async function populateVendorSelect() {
  // Get unique vendors from existing expenses
  const { data } = await db.from('expenses')
    .select('vendor')
    .eq('business_id', state.bizId)
    .not('vendor', 'is', null);
  
  const vendors = [...new Set((data||[]).map(e => e.vendor).filter(Boolean))];
  const sel = $('e-vendor-select');
  if(!sel) return;
  sel.innerHTML = `<option value="">Select vendor...</option>` +
    vendors.map(v => `<option value="${v}">${v}</option>`).join('') +
    `<option value="__new__">+ Add new vendor</option>`;
  sel.onchange = () => {
    const newWrap = $('e-vendor-new-wrap');
    if(sel.value === '__new__') {
      if(newWrap) newWrap.style.display = 'block';
    } else {
      if(newWrap) newWrap.style.display = 'none';
      const vendorInput = $('e-vendor');
      if(vendorInput) vendorInput.value = sel.value;
    }
  };
}

function populateCategorySelects(cats) {
  ['e-category', 'filter-category'].forEach(id => {
    const sel = $(id);
    if(!sel) return;
    const isFilter = id === 'filter-category';
    sel.innerHTML = (isFilter ? `<option value="">All categories</option>` : `<option value="">Select category *</option>`) +
      cats.map(c => `<option value="${c}">${c}</option>`).join('') +
      `<option value="__custom__">+ Add custom category</option>`;
    sel.onchange = () => {
      if(sel.value === '__custom__') {
        sel.value = '';
        openAddCategoryModal();
      }
    };
  });
}

function renderExpenseSummary(exps) {
  const total = exps.reduce((s,e) => s+(e.amount||0), 0);
  const now = new Date(); const m = now.getMonth(); const y = now.getFullYear();
  const monthTotal = exps.filter(e => {
    const d = new Date(e.date); return d.getMonth()===m && d.getFullYear()===y;
  }).reduce((s,e) => s+(e.amount||0), 0);
  const catMap = {};
  exps.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + (e.amount||0); });
  const topCat = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0];
  setEl('exp-total', money(total));
  setEl('exp-month', money(monthTotal));
  setEl('exp-top', topCat ? topCat[0] : '—');
  setEl('expenses-count', `${exps.length}`);
}

function renderExpensesTable(exps) {
  const tbody = $('expenses-table');
  const pageInfo = $('expenses-page-info');
  if(!tbody) return;
  const start = (currentPage-1)*PAGE_SIZE;
  const paginated = exps.slice(start, start+PAGE_SIZE);
  const totalPages = Math.ceil(exps.length/PAGE_SIZE);
  if(pageInfo) pageInfo.textContent = `Page ${currentPage} of ${Math.max(totalPages,1)} · ${exps.length} total`;
  const prevBtn = $('exp-prev'); const nextBtn = $('exp-next');
  if(prevBtn) prevBtn.disabled = currentPage <= 1;
  if(nextBtn) nextBtn.disabled = currentPage >= totalPages;

  if(!paginated.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty">No expenses found.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = paginated.map(e => {
    const isPaid = e.status === 'paid';
    return `<tr>
      <td>${fdate(e.date)}</td>
      <td>${e.description}</td>
      <td><span class="badge bgr">${e.category||'—'}</span></td>
      <td>${e.vendor||'—'}</td>
      <td><b style="color:var(--red)">${money(e.amount)}</b></td>
      <td>
        <button onclick="window.__expenses.togglePaid('${e.id}','${e.status||'pending'}')"
          style="background:${isPaid?'#DCFCE7':'#FEE2E2'};color:${isPaid?'#15803D':'#B91C1C'};border:none;border-radius:5px;padding:3px 10px;font-size:0.7rem;font-weight:700;cursor:pointer;font-family:inherit">
          ${isPaid?'Paid':'Pending'}
        </button>
      </td>
      <td style="display:flex;gap:0.3rem">
        ${e.receipt_url?`<a href="${e.receipt_url}" target="_blank" class="btn btn-sm btn-outline">📎</a>`:''}
        <button class="btn btn-sm btn-outline" onclick="window.__expenses.editExpense('${e.id}')" title="Edit">✏️</button>
        <button class="btn btn-sm btn-red" onclick="window.__expenses.deleteExpense('${e.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

export function sortExpenses(key) {
  if(sortKey === key) sortDir = sortDir==='asc'?'desc':'asc';
  else { sortKey = key; sortDir = 'asc'; }
  document.querySelectorAll('.sort-btn').forEach(el => {
    el.textContent = el.dataset.sort === key ? (sortDir==='asc'?'↑':'↓') : '↕';
  });
  loadExpenses();
}

export function filterExpenses() {
  filterCategory = $('filter-category')?.value || '';
  filterDateFrom = $('filter-date-from')?.value || '';
  filterDateTo = $('filter-date-to')?.value || '';
  currentPage = 1;
  loadExpenses();
}

export function prevPage() { if(currentPage>1){ currentPage--; renderExpensesTable(allExpenses); } }
export function nextPage() { currentPage++; renderExpensesTable(allExpenses); }

export async function togglePaid(id, currentStatus) {
  const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
  const { error } = await db.from('expenses').update({ status: newStatus }).eq('id', id);
  if(error) { toast('Error', 'fail'); return; }
  toast(newStatus === 'paid' ? 'Marked as paid' : 'Marked as pending');
  await loadExpenses();
}

export async function editExpense(id) {
  const e = allExpenses.find(x => x.id === id);
  if(!e) return;
  editingId = id;
  openExpenseModal();
  // Wait for modal to render then fill fields
  setTimeout(() => {
    if($('e-date')) $('e-date').value = e.date || '';
    if($('e-amount')) $('e-amount').value = e.amount || '';
    if($('e-desc')) $('e-desc').value = e.description || '';
    if($('e-category')) $('e-category').value = e.category || '';
    if($('e-vendor')) $('e-vendor').value = e.vendor || '';
    if($('e-notes')) $('e-notes').value = e.notes || '';
    if($('e-status')) $('e-status').value = e.status || 'pending';
    const recCheck = $('e-recurring');
    if(recCheck) recCheck.checked = e.is_recurring || false;
    const modalTitle = document.querySelector('#m-expense .modal-title');
    if(modalTitle) modalTitle.textContent = 'Edit Expense';
    const saveBtn = $('expense-save-btn');
    if(saveBtn) saveBtn.textContent = 'Save Changes';
  }, 50);
}

export async function saveExpense() {
  const desc = $('e-desc')?.value.trim();
  const amount = parseFloat($('e-amount')?.value);
  const cat = $('e-category')?.value;
  const date = $('e-date')?.value;
  const status = $('e-status')?.value || 'pending';
  if(!desc||!amount||!cat||!date){ toast('Fill all required fields','fail'); return; }

  const vendorSel = $('e-vendor-select');
  const vendorNew = $('e-vendor-new');
  let vendor = $('e-vendor')?.value.trim() || '';
  if(vendorSel?.value === '__new__' && vendorNew?.value.trim()) {
    vendor = vendorNew.value.trim();
  } else if(vendorSel?.value && vendorSel.value !== '__new__') {
    vendor = vendorSel.value;
  }

  const isRecurring = $('e-recurring')?.checked;
  if(isRecurring && !can('expenseRecurring', state.plan)) {
    toast('Recurring expenses require Growth plan','fail');
    document.dispatchEvent(new CustomEvent('upgrade:open'));
    return;
  }

  const payload = {
    business_id: state.bizId,
    date, description: desc, category: cat, amount,
    vendor: vendor || null,
    status,
    notes: $('e-notes')?.value.trim() || null,
    is_recurring: isRecurring || false,
    recurring_interval: isRecurring ? ($('e-rec-interval')?.value || 'monthly') : null,
  };

  let error;
  if(editingId) {
    ({ error } = await db.from('expenses').update(payload).eq('id', editingId));
  } else {
    ({ error } = await db.from('expenses').insert(payload));
  }
  if(error){ toast('Error: '+error.message,'fail'); return; }

  await logActivity('expense', `${editingId?'Updated':'Added'} expense: ${desc} — ${money(amount)}`);
  editingId = null;
  closeModal('m-expense');
  toast(editingId ? 'Expense updated!' : 'Expense added!');
  await loadExpenses();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

export async function deleteExpense(id) {
  if(!confirm('Delete this expense?')) return;
  await db.from('expenses').delete().eq('id', id);
  toast('Deleted');
  await loadExpenses();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

function openAddCategoryModal() {
  const name = prompt('Enter new category name:');
  if(!name?.trim()) return;
  const custom = state.biz?.expense_categories || [];
  if(!custom.includes(name.trim())) {
    const updated = [...custom, name.trim()];
    db.from('businesses').update({ expense_categories: updated }).eq('id', state.bizId);
    state.biz.expense_categories = updated;
    toast(`Category "${name.trim()}" added!`);
    loadExpenses();
  }
}

export function openExpenseModal() {
  if(!editingId) {
    ['e-desc','e-amount','e-vendor','e-notes','e-vendor-new'].forEach(id => {
      const el=$(id); if(el) el.value='';
    });
    if($('e-date')) $('e-date').value = today();
    if($('e-category')) $('e-category').value = '';
    if($('e-status')) $('e-status').value = 'pending';
    if($('e-recurring')) $('e-recurring').checked = false;
    const recWrap = $('e-rec-interval-wrap');
    if(recWrap) recWrap.style.display = 'none';
    const vendorNewWrap = $('e-vendor-new-wrap');
    if(vendorNewWrap) vendorNewWrap.style.display = 'none';
    const modalTitle = document.querySelector('#m-expense .modal-title');
    if(modalTitle) modalTitle.textContent = 'Add Expense';
    const saveBtn = $('expense-save-btn');
    if(saveBtn) saveBtn.textContent = 'Add Expense';
  }

  const recCheck = $('e-recurring');
  const recInterval = $('e-rec-interval-wrap');
  if(recCheck && recInterval) {
    recCheck.onchange = () => {
      recInterval.style.display = recCheck.checked ? 'block' : 'none';
      if(recCheck.checked && !can('expenseRecurring', state.plan)) {
        toast('Recurring requires Growth plan','fail');
        recCheck.checked = false;
        recInterval.style.display = 'none';
      }
    };
  }
  openModal('m-expense');
}

const setEl = (id, val) => { const el=$(id); if(el) el.textContent=val; };

window.__expenses = { deleteExpense, sortExpenses, filterExpenses, prevPage, nextPage, togglePaid, editExpense };
