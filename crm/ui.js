// ui.js — Shared UI components and navigation

import { $, $$, state, toast } from './config.js';
import { can, getLimit, PLANS, featureState, lockedBadge } from './permissions.js';

// ── TAB NAVIGATION ──
const TAB_CONFIG = {
  dashboard:    { title: { en:'Dashboard', es:'Panel' },          add: null },
  contacts:     { title: { en:'Contacts', es:'Contactos' },       add: { en:'+ Add Contact', es:'+ Agregar' } },
  pipeline:     { title: { en:'Pipeline', es:'Pipeline' },        add: { en:'+ Add Deal', es:'+ Agregar Deal' } },
  invoices:     { title: { en:'Invoices', es:'Facturas' },        add: { en:'+ New Invoice', es:'+ Nueva Factura' } },
  expenses:     { title: { en:'Expenses', es:'Gastos' },          add: { en:'+ Add Expense', es:'+ Agregar Gasto' } },
  reports:      { title: { en:'Reports', es:'Reportes' },         add: null },
  tasks:        { title: { en:'Tasks', es:'Tareas' },             add: { en:'+ New Task', es:'+ Nueva Tarea' } },
  calendar:     { title: { en:'Calendar', es:'Calendario' },      add: { en:'+ New Event', es:'+ Nuevo Evento' } },
  chat:         { title: { en:'Team Chat', es:'Chat del Equipo' },add: null },
  settings:     { title: { en:'Settings', es:'Configuración' },   add: null },
};

export function go(tab) {
  state.currentTab = tab;
  // Hide all tabs
  $$('[data-tab]').forEach(el => el.classList.remove('active'));
  // Show target
  const target = $(`tab-${tab}`);
  if(target) target.classList.add('active');
  // Update sidebar
  $$('.sb-item').forEach(el => el.classList.remove('active'));
  const navEl = document.querySelector(`.sb-item[data-goto="${tab}"]`);
  if(navEl) navEl.classList.add('active');
  // Update topbar
  const cfg = TAB_CONFIG[tab];
  if(cfg) {
    const titleEl = $('page-title');
    if(titleEl) titleEl.textContent = cfg.title[state.lang] || cfg.title.en;
    const addBtn = $('add-btn');
    if(addBtn) {
      if(cfg.add) {
        addBtn.textContent = cfg.add[state.lang] || cfg.add.en;
        addBtn.style.display = 'block';
      } else {
        addBtn.style.display = 'none';
      }
    }
  }
  // Search visibility
  const searchBox = $('search-box');
  if(searchBox) searchBox.style.display = ['contacts','invoices','expenses'].includes(tab) ? 'block' : 'none';
  // Dispatch event so modules can react
  document.dispatchEvent(new CustomEvent('tab:change', { detail: tab }));
}

// ── SIDEBAR RENDER ──
export function renderSidebar() {
  const plan = state.plan;
  const lang = state.lang;

  // Plan badge
  const pb = $('plan-badge');
  if(pb) { pb.textContent = PLANS[plan]?.label || plan; pb.className = `sb-plan ${plan}`; }

  // Trial bar
  if(state.biz) {
    const trialBar = $('trial-bar');
    if(trialBar && plan === 'trial') {
      const daysLeft = Math.max(0, Math.ceil((new Date(state.biz.trial_ends_at) - new Date()) / 86400000));
      $('trial-days').textContent = `${daysLeft} day${daysLeft!==1?'s':''} left`;
      trialBar.style.display = 'block';
    } else if(trialBar) {
      trialBar.style.display = 'none';
    }
  }

  // Upgrade button
  const upgradeBtn = $('sidebar-upgrade-btn');
  if(upgradeBtn) upgradeBtn.style.display = can('showUpgrade', plan) ? 'block' : 'none';

  // Lock nav items that require higher plan
  document.querySelectorAll('.sb-item[data-feature]').forEach(el => {
    const feature = el.dataset.feature;
    const { locked, unlocksAt } = featureState(feature, plan);
    el.classList.toggle('locked', locked);
    el.title = locked ? `Requires ${PLANS[unlocksAt]?.label||'higher'} plan` : '';
  });
}

// ── MODAL SYSTEM ──
export function openModal(id) { const el=$(id); if(el) el.classList.add('open'); }
export function closeModal(id) { const el=$(id); if(el) el.classList.remove('open'); }
export function closeAllModals() { $$('.overlay.open').forEach(el => el.classList.remove('open')); }

// ── LOCKED FEATURE UI ──
export function renderLockedOverlay(feature, plan) {
  const { unlocksAt } = featureState(feature, plan);
  return `<div class="locked-overlay">
    <div class="locked-content">
      <div class="locked-icon">🔒</div>
      <p class="locked-title">${PLANS[unlocksAt]?.label || 'Higher'} Plan Required</p>
      <p class="locked-desc">Upgrade to unlock this feature.</p>
      ${can('showUpgrade', plan) ? `<button class="btn btn-dark" onclick="document.dispatchEvent(new CustomEvent('upgrade:open'))">Upgrade Now</button>` : ''}
    </div>
  </div>`;
}

// ── WELCOME MESSAGE ──
export function renderWelcome() {
  const el = $('welcome-msg');
  if(!el || !state.user) return;
  const name = state.biz?.owner_name || state.user.email.split('@')[0];
  const greeting = state.lang === 'es' ? 'Bienvenido' : 'Welcome';
  el.innerHTML = `<span class="welcome-greeting">${greeting},</span> <span class="welcome-name">${name}!</span>`;
}

// ESC to close modals
document.addEventListener('keydown', e => { if(e.key==='Escape') closeAllModals(); });
