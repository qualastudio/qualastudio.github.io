// expenses.js — Expenses module

import { db, state, $, money, fdate, badge, toast, today } from './config.js';
import { can } from './permissions.js';
import { openModal, closeModal } from './ui.js';
import { logActivity } from './dashboard.js';

let allExpenses = [];
let currentPage = 1;
const PAGE_SIZE = 25;
let sortKey = 'date';
let sortDir = 'desc';
let filterCategory = '';

// Default categories — user can add custom ones
const DEFAULT_CATEGORIES = [
  'Software & Tools','Marketing & Ads','Office & Supplies',
  'Travel & Transport','Meals & Entertainment','Rent & Utilities',
  'Payroll & Contractors','Insurance','Taxes & Fees','Equipment','Other'
];

export async function loadExpenses() {
  if(!state.bizId) return;
  // Load custom categories from biz settings
  const customCats = state.biz?.expense_categories || [];
  const allCats = [...new Set([...DEFAULT_CATEGORIES, ...customCats])];
  populateCategorySelects(allCats);

  let q = db.from('expenses')
    .select('*, clients(full_name)')
    .eq('business_id', state.bizId)
    .order(sortKey, { ascending: sortDir === 'asc' });
  if(filterCategory) q = q.eq('category', filterCategory);
  const { data, error } = await q;
  if(error) { toast('Error loading expenses', 'fail'); return; }
  allExpenses = data || [];
  renderExpenseSummary(allExpenses);
  renderExpensesTable(allExpenses);
}

function populateCategorySelects(cats) {
  const selects = ['e-category', 'filter-category'];
  selects.forEach(id => {
    const sel = $(id);
    if(!sel) return;
    const isFilter = id === 'filter-category';
    sel.innerHTML = (isFilter ? `<option value="">All categories</option>` : `<option value="">Select category...</option>`) +
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
  const total = exps.reduce((s,e)=>s+(e.amount||0),0);
  const {m,y} = getMonthYear();
  const monthTotal = exps.filter(e=>{ const d=new Date(e.date); return d.getMonth()===m&&d.getFullYear()===y; }).reduce((s,e)=>s+(e.amount||0),0);
  const catMap = {};
  exps.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + (e.amount||0); });
  const topCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
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
  if(pageInfo) pageInfo.textContent = `Page ${currentPage} of ${Math.max(totalPages,1)} (${exps.length} total)`;
  if(!paginated.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty">No expenses found.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = paginated.map(e => `
    <tr>
      <td>${fdate(e.date)}</td>
      <td>${e.description}</td>
      <td><span class="badge bgr">${e.category||'—'}</span></td>
      <td>${e.vendor||'—'}</td>
      <td>${e.clients?.full_name||'—'}</td>
      <td style="color:var(--red);font-weight:700">${money(e.amount)}</td>
      <td style="display:flex;gap:0.3rem">
        ${e.receipt_url?`<a href="${e.receipt_url}" target="_blank" class="btn btn-sm btn-outline">Receipt</a>`:''}
        <button class="btn btn-sm btn-red" onclick="window.__expenses.deleteExpense('${e.id}')">Del</button>
      </td>
    </tr>`).join('');

  // Pagination buttons
  const prevBtn = $('exp-prev'); const nextBtn = $('exp-next');
  if(prevBtn) prevBtn.disabled = currentPage <= 1;
  if(nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

// ── SORT & FILTER ──
export function sortExpenses(key) {
  if(sortKey === key) sortDir = sortDir==='asc'?'desc':'asc';
  else { sortKey = key; sortDir = 'asc'; }
  // Update sort indicators
  document.querySelectorAll('.sort-btn').forEach(el => {
    el.textContent = el.dataset.sort === key ? (sortDir==='asc'?'↑':'↓') : '↕';
  });
  loadExpenses();
}

export function filterExpenses() {
  filterCategory = $('filter-category')?.value || '';
  currentPage = 1;
  loadExpenses();
}

export function prevPage() { if(currentPage>1){ currentPage--; renderExpensesTable(allExpenses); } }
export function nextPage() { currentPage++; renderExpensesTable(allExpenses); }

// ── SAVE EXPENSE ──
export async function saveExpense() {
  const desc = $('e-desc')?.value.trim();
  const amount = parseFloat($('e-amount')?.value);
  const cat = $('e-category')?.value;
  const date = $('e-date')?.value;
  if(!desc||!amount||!cat||!date){ toast('Fill all required fields','fail'); return; }

  const isRecurring = $('e-recurring')?.checked;
  const recInterval = $('e-rec-interval')?.value;
  if(isRecurring && !can('expenseRecurring', state.plan)) {
    toast('Recurring expenses require Growth plan','fail');
    document.dispatchEvent(new CustomEvent('upgrade:open'));
    return;
  }
  const { error } = await db.from('expenses').insert({
    business_id: state.bizId,
    client_id: $('e-client')?.value || null,
    date, description: desc, category: cat, amount,
    vendor: $('e-vendor')?.value.trim() || null,
    notes: $('e-notes')?.value.trim() || null,
    is_recurring: isRecurring,
    recurring_interval: isRecurring ? recInterval : null,
  });
  if(error){ toast('Error: '+error.message,'fail'); return; }
  await logActivity('expense', `Expense: ${desc} — ${money(amount)}`);
  closeModal('m-expense');
  toast('Expense added!');
  await loadExpenses();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

// ── DELETE EXPENSE ──
export async function deleteExpense(id) {
  if(!confirm('Delete this expense?')) return;
  await db.from('expenses').delete().eq('id',id);
  toast('Deleted');
  await loadExpenses();
  document.dispatchEvent(new CustomEvent('dashboard:refresh'));
}

// ── ADD CUSTOM CATEGORY ──
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

// ── OPEN EXPENSE MODAL ──
export function openExpenseModal() {
  ['e-desc','e-amount','e-vendor','e-notes'].forEach(id => { const el=$(id); if(el) el.value=''; });
  if($('e-date')) $('e-date').value = today();
  if($('e-category')) $('e-category').value = '';
  if($('e-recurring')) $('e-recurring').checked = false;
  if($('e-rec-interval')) $('e-rec-interval').style.display = 'none';

  // Client select
  const clientSel = $('e-client');
  if(clientSel) {
    clientSel.innerHTML = `<option value="">— Not billable —</option>` +
      state.clients.map(c=>`<option value="${c.id}">${c.full_name}</option>`).join('');
  }

  // Recurring toggle visibility
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

// Helpers
const setEl = (id, val) => { const el=$(id); if(el) el.textContent=val; };
const getMonthYear = () => { const d=new Date(); return {m:d.getMonth(),y:d.getFullYear()}; };

window.__expenses = { deleteExpense, sortExpenses, filterExpenses, prevPage, nextPage };
