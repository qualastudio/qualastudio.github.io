// auth.js — Authentication, registration, session management

import { db, state, $, toast } from './config.js';

// ── SESSION RECOVERY ──
export async function initSession() {
  // Listen for auth state changes first
  db.auth.onAuthStateChange(async (event, session) => {
    if(event === 'SIGNED_IN' && session?.user) {
      await loadUserContext(session.user);
      showApp();
    }
    if(event === 'SIGNED_OUT') {
      showAuth();
    }
  });

  // Then check for existing session
  const { data: { session } } = await db.auth.getSession();
  if(session?.user) {
    await loadUserContext(session.user);
    return true;
  }
  return false;
}

async function loadUserContext(user) {
  state.user = user;
  // Load business
  const { data } = await db.from('businesses').select('*').eq('owner_id', user.id);
  let biz = data?.[0] || null;
  if(!biz) {
    const { data: nb } = await db.from('businesses')
      .insert({ owner_id: user.id, name: user.email.split('@')[0], email: user.email })
      .select().single();
    biz = nb;
  }
  if(!biz) { toast('Error loading account', 'fail'); return; }
  state.biz = biz;
  state.bizId = biz.id;
  state.plan = biz.plan || 'trial';
  state.lang = biz.language || 'en';
  state.theme = biz.theme || 'light';
  return biz;
}

// ── LOGIN ──
export async function doLogin() {
  const email = $('login-email')?.value.trim();
  const pass  = $('login-pass')?.value;
  const errEl = $('auth-err');
  if(errEl) errEl.style.display = 'none';
  if(!email || !pass) {
    showErr('Please fill in all fields.');
    return;
  }
  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if(error) showErr(error.message);
}

// ── REGISTER ──
export async function doRegister() {
  const name     = $('reg-name')?.value.trim();
  const bizName  = $('reg-biz')?.value.trim();
  const email    = $('reg-email')?.value.trim();
  const pass     = $('reg-pass')?.value;
  const industry = $('reg-industry')?.value;
  const errEl    = $('auth-err');
  if(errEl) errEl.style.display = 'none';

  if(!name || !bizName || !email || !pass) { showErr('Please fill in all required fields.'); return; }
  if(pass.length < 8) { showErr('Password must be at least 8 characters.'); return; }

  const { data, error } = await db.auth.signUp({
    email, password: pass,
    options: { data: { full_name: name } }
  });
  if(error) { showErr(error.message); return; }

  if(data.user) {
    await db.from('businesses').insert({
      owner_id: data.user.id,
      owner_name: name,
      name: bizName,
      email,
      industry,
      plan: 'trial',
      trial_ends_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
    });
    toast('Account created! Signing you in...');
  }
}

// ── PASSWORD RESET ──
export async function doResetPassword() {
  const email = $('reset-email')?.value.trim();
  if(!email) { showErr('Enter your email address.'); return; }
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/crm/index.html`
  });
  if(error) { showErr(error.message); return; }
  toast('Password reset email sent. Check your inbox.');
  switchAuthTab('login');
}

// ── LOGOUT ──
export async function doLogout() {
  await db.auth.signOut({ scope: 'local' });
  state.user = null; state.biz = null; state.bizId = null;
  state.clients = []; state.plan = 'trial';
  showAuth();
}

// ── UI HELPERS ──
export function showAuth() {
  $('auth-screen').style.display = 'flex';
  $('app').style.display = 'none';
  $('upgrade-screen').style.display = 'none';
}

export function showApp() {
  $('auth-screen').style.display = 'none';
  $('upgrade-screen').style.display = 'none';
  $('app').style.display = 'block';
  document.dispatchEvent(new CustomEvent('app:ready'));
}

export function showUpgrade() {
  $('app').style.display = 'none';
  $('upgrade-screen').style.display = 'flex';
}

export function switchAuthTab(tab) {
  ['login','register','reset'].forEach(t => {
    const form = $(`form-${t}`);
    const btn = document.querySelector(`.auth-tab[data-tab="${t}"]`);
    if(form) form.classList.toggle('active', t === tab);
    if(btn) btn.classList.toggle('active', t === tab);
  });
  const errEl = $('auth-err');
  if(errEl) errEl.style.display = 'none';
}

function showErr(msg) {
  const el = $('auth-err');
  if(el) { el.textContent = msg; el.style.display = 'block'; }
}

// ── PASSWORD VISIBILITY TOGGLE ──
export function togglePasswordVisibility(inputId, iconEl) {
  const input = $(inputId);
  if(!input) return;
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  if(iconEl) {
    // SVG eye / eye-slash icons
    iconEl.innerHTML = isText
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  }
}
