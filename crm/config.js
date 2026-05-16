// config.js — App-wide constants and Supabase client
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://tddpgxnyxqrchlmjdcmf.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZHBneG55eHFyY2hsbWpkY21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMjE1NTMsImV4cCI6MjA5MzU5NzU1M30.0D0CtHHI4NhpwdnjPaEDUVpZf5snXeFvdNyIsiH2AvA';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  }
});

// App state — single source of truth
export const state = {
  user: null,
  biz: null,
  bizId: null,
  plan: 'trial',
  clients: [],
  currentTab: 'dashboard',
  lang: 'en',
  theme: 'light',
};

// Helpers
export const $ = id => document.getElementById(id);
export const $$ = sel => document.querySelectorAll(sel);

export const COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#84CC16'];
export const getColor = s => { if(!s) return COLORS[0]; let h=0; for(let c of s) h=c.charCodeAt(0)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };
export const initials = s => s ? s.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) : '?';
export const today = () => new Date().toISOString().split('T')[0];
export const fdate = d => { if(!d) return '—'; try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch(e){ return d; }};
export const money = (n, cur) => {
  const c = cur || state.biz?.currency || 'USD';
  const sym = {USD:'$',EUR:'€',ARS:'$',MXN:'$',COP:'$',BRL:'R$'}[c]||'$';
  return sym + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:0});
};

const badgeMap = {
  active:'bg', follow_up:'bb', pending:'by', inactive:'bgr',
  customer:'bb', provider:'bpu',
  paid:'bg', overdue:'br', sent:'bb', draft:'bgr',
  scheduled:'bb', completed:'bg', cancelled:'br',
  lead:'bb', proposal:'bpu', negotiation:'by', won:'bg',
  todo:'bgr', 'in-progress':'bb', done:'bg', blocked:'br',
};
export const badge = (s, label) => `<span class="badge ${badgeMap[s]||'bgr'}">${label||s?.replace(/_/g,' ')||s}</span>`;

// Toast
export function toast(msg, type='ok') {
  const el = $('toast');
  if(!el) return;
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.className='toast', 3500);
}

// Upgrade prompt
export function promptUpgrade(feature, unlocksAt) {
  const planLabel = unlocksAt ? (unlocksAt.charAt(0).toUpperCase()+unlocksAt.slice(1)) : 'Growth';
  toast(`This feature requires the ${planLabel} plan. Upgrade to unlock it.`, 'upgrade');
  // Optionally open upgrade modal
  const upgradeModal = $('m-upgrade');
  if(upgradeModal) upgradeModal.classList.add('open');
}
