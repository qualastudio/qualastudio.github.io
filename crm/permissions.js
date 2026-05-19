// permissions.js — Single source of truth for plan features
// All modules reference this. Never hardcode plan limits elsewhere.

const PLANS = {
  trial:   { label: 'Free Trial',  color: '#F59E0B', badge: 'by' },
  starter: { label: 'Starter',     color: '#3B82F6', badge: 'bb' },
  growth:  { label: 'Growth',      color: '#7C3AED', badge: 'bpu' },
  pro:     { label: 'Pro',         color: '#2ECC71', badge: 'bg' },
};

const LIMITS = {
  trial:   { contacts: 50,  users: 3,  chatGroups: 1 },
  starter: { contacts: 50,  users: 3,  chatGroups: 1 },
  growth:  { contacts: Infinity, users: 10, chatGroups: Infinity },
  pro:     { contacts: Infinity, users: Infinity, chatGroups: Infinity },
};

const FEATURES = {
  // Contacts
  contactsUnlimited:    { growth: true, pro: true },
  contactEmail:         { trial: true, starter: true, growth: true, pro: true },
  contactDocuments:     { trial: true, starter: true, growth: true, pro: true },

  // Invoices
  invoiceCreate:        { trial: true, starter: true, growth: true, pro: true },
  invoiceSend:          { growth: true, pro: true },
  invoiceRecurring:     { growth: true, pro: true },
  invoiceRemind:        { growth: true, pro: true },

  // Expenses
  expenseCreate:        { trial: true, starter: true, growth: true, pro: true },
  expenseRecurring:     { growth: true, pro: true },
  expenseReceiptCapture:{ pro: true },

  // Reports
  reportsBasic:         { trial: true, starter: true, growth: true, pro: true },
  reportsAdvanced:      { growth: true, pro: true },
  chartOfAccounts:      { growth: true, pro: true },
  bankReconciliation:   { growth: true, pro: true },

  // Pipeline
  pipeline:             { trial: true, starter: true, growth: true, pro: true },

  // Tasks
  tasksBasic:           { trial: true, starter: true, growth: true, pro: true },
  tasksAdvanced:        { growth: true, pro: true },

  // Calendar
  calendarBasic:        { trial: true, starter: true, growth: true, pro: true },
  calendarSync:         { growth: true, pro: true },

  // Chat
  chatBasic:            { trial: true, starter: true, growth: true, pro: true },
  chatGroupsUnlimited:  { growth: true, pro: true },

  // Settings / Users
  accountantAccess:     { starter: true, growth: true, pro: true },
  teamUsers:            { trial: true, starter: true, growth: true, pro: true },
  whiteLabel:           { growth: true, pro: true },
  timeTracking:         { pro: true },
  projects:             { pro: true },

  // Export
  exportPDF:            { trial: true, starter: true, growth: true, pro: true },
  exportExcel:          { trial: true, starter: true, growth: true, pro: true },

  // Upgrade CTA
  showUpgrade:          { trial: true, starter: true, growth: true },
};

// Core permission checker
function can(feature, plan) {
  const rule = FEATURES[feature];
  if (!rule) return false;
  return !!rule[plan];
}

// Get limit for a plan
function getLimit(plan, key) {
  return LIMITS[plan]?.[key] ?? 0;
}

// Check if user is at or over a limit
function atLimit(plan, key, currentCount) {
  const limit = getLimit(plan, key);
  return currentCount >= limit;
}

// Returns locked state info for UI rendering
function featureState(feature, plan) {
  const allowed = can(feature, plan);
  return {
    allowed,
    locked: !allowed,
    // Which plan unlocks this
    unlocksAt: allowed ? null : Object.keys(FEATURES[feature] || {}).find(p => FEATURES[feature][p]) || 'growth',
  };
}

// UI helper — renders a locked overlay badge
function lockedBadge(unlocksAt) {
  const planLabel = PLANS[unlocksAt]?.label || 'Growth';
  return `<span class="locked-badge" title="Available on ${planLabel} plan">
    🔒 ${planLabel}+
  </span>`;
}

export { PLANS, LIMITS, FEATURES, can, getLimit, atLimit, featureState, lockedBadge };
