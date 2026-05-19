// dashboard.js — Dashboard module

import { db, state, $, money, fdate, getColor, initials, badge, toast } from './config.js';
import { can } from './permissions.js';

export async function loadDashboard() {
  if(!state.bizId) return;

  const [cr, inv, dl, exp, apts, acts] = await Promise.all([
    db.from('clients').select('*').eq('business_id', state.bizId),
    db.from('invoices').select('*').eq('business_id', state.bizId),
    db.from('deals').select('*').eq('business_id', state.bizId),
    db.from('expenses').select('*').eq('business_id', state.bizId),
    db.from('appointments').select('*').eq('business_id', state.bizId).gte('date', new Date().toISOString().split('T')[0]).limit(5),
    db.from('activities').select('*, clients(full_name)').eq('business_id', state.bizId).order('created_at', { ascending: false }).limit(8),
  ]);

  state.clients = cr.data || [];
  const invs = inv.data || [], deals = dl.data || [], exps = exp.data || [];
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();

  // ── KPIs ──
  const monthInvPaid = invs.filter(i => {
    const d = new Date(i.created_at);
    return d.getMonth()===m && d.getFullYear()===y && i.status==='paid';
  }).reduce((s,i) => s+(i.total||i.amount||0), 0);

  const monthExp = exps.filter(e => {
    const d = new Date(e.date);
    return d.getMonth()===m && d.getFullYear()===y;
  }).reduce((s,e) => s+(e.amount||0), 0);

  const newClientsMonth = state.clients.filter(c => {
    const d = new Date(c.created_at);
    return d.getMonth()===m && d.getFullYear()===y;
  }).length;

  const pipelineVal = deals.filter(d=>d.stage!=='won').reduce((s,d)=>s+(d.value||0),0);
  const totalInvoiced = invs.reduce((s,i)=>s+(i.total||i.amount||0),0);
  const pendingAmt = invs.filter(i=>i.status==='pending'||i.status==='overdue').reduce((s,i)=>s+(i.total||i.amount||0),0);
  const netProfit = monthInvPaid - monthExp;

  setKPI('s-clients',    state.clients.length,     'Active accounts');
  setKPI('s-pipeline',   money(pipelineVal),        'Potential revenue');
  setKPI('s-invoiced',   money(totalInvoiced),      'Total issued');
  setKPI('s-pending',    money(pendingAmt),         'Awaiting payment');
  setKPI('s-expenses',   money(monthExp),            'This month');
  setKPI('s-profit',     money(Math.abs(netProfit)), netProfit >= 0 ? 'Net profit' : 'Net loss');
  setKPI('s-newclients', newClientsMonth,            'This month');
  setKPI('s-apts',       (apts.data||[]).length,    'Upcoming');

  // Profit color
  const profitEl = $('s-profit');
  if(profitEl) profitEl.style.color = netProfit >= 0 ? '#16A34A' : '#DC2626';

  // ── REVENUE BAR CHART ──
  renderRevenueChart(invs);

  // ── RECENT ACTIVITY ──
  renderRecentActivity(acts.data || []);

  // ── OVERDUE INVOICES ALERT ──
  const overdue = invs.filter(i => i.status === 'overdue').length;
  const overdueEl = $('overdue-alert');
  if(overdueEl) {
    overdueEl.style.display = overdue > 0 ? 'flex' : 'none';
    overdueEl.textContent = `⚠️ ${overdue} overdue invoice${overdue!==1?'s':''}`;
  }
}

function setKPI(id, value, sub) {
  const numEl = $(`${id}`);
  const subEl = $(`${id}-sub`);
  if(numEl) numEl.textContent = value;
  if(subEl && sub) subEl.textContent = sub;
}

function renderRevenueChart(invs) {
  const el = $('revenue-chart');
  if(!el) return;
  const months = state.lang === 'es'
    ? ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const data = [];
  for(let i=5; i>=0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mo = d.getMonth(), yr = d.getFullYear();
    const revenue = invs
      .filter(inv => { const id=new Date(inv.created_at); return id.getMonth()===mo && id.getFullYear()===yr && inv.status==='paid'; })
      .reduce((s,inv) => s+(inv.total||inv.amount||0), 0);
    const expenses_total = 0; // Could add expenses by month here
    data.push({ month: months[mo], revenue, expenses: expenses_total });
  }
  const maxVal = Math.max(...data.map(d=>d.revenue), 1);
  el.innerHTML = data.map(d => `
    <div class="bar-col">
      <div class="bar-tip">${money(d.revenue)}</div>
      <div class="bar-fill" style="height:${Math.max((d.revenue/maxVal)*90,3)}px;background:var(--green)"></div>
      <span class="bar-lbl">${d.month}</span>
    </div>`).join('');
}

function renderRecentActivity(acts) {
  const el = $('recent-activity');
  if(!el) return;
  if(!acts.length) {
    el.innerHTML = `<div class="empty">No activity yet.</div>`;
    return;
  }
  const typeColors = { invoice:'#2ECC71', client:'#3B82F6', expense:'#EF4444', deal:'#7C3AED', task:'#F59E0B', default:'#6B7280' };
  el.innerHTML = acts.map(a => `
    <div class="activity-row">
      <div class="activity-dot" style="background:${typeColors[a.type]||typeColors.default}"></div>
      <div class="activity-body">
        <p class="activity-text">${a.description||'Activity recorded'}</p>
        <p class="activity-meta">${a.clients?.full_name ? a.clients.full_name+' · ' : ''}${fdate(a.created_at?.split('T')[0])}</p>
      </div>
    </div>`).join('');
}

// Log activity helper — used by all modules
export async function logActivity(type, description, clientId=null) {
  if(!state.bizId) return;
  await db.from('activities').insert({
    business_id: state.bizId,
    client_id: clientId,
    type,
    description,
  });
}
