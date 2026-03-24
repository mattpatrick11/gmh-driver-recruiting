// ====================================================
// GLOBALS & INIT
// ====================================================
let supabase = null;
let allDrivers = { company: [], owner_operator: [] };
let currentDriver = null;
let allTemplates = [];

const PIPELINE_STAGES = ['applied','contacted','docs_sent','offer_extended','hired','not_interested'];
const STAGE_LABELS = { applied:'Applied', contacted:'Contacted', docs_sent:'Docs Sent', offer_extended:'Offer Extended', hired:'Hired', not_interested:'Not Interested', inactive:'Inactive' };

const COMPANY_CHECKLIST = ['Application','MVR','PSP','Employment Verification','Drug Test Scheduled','Drug Test Passed','Orientation','Onboarding Complete'];
const OWNEROP_CHECKLIST = ['Application','Authority Verified','Insurance','W-9','Rate Agreement','Load Board Access','First Load Assigned'];

function init() {
  if (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    loadAll();
  } else {
    document.getElementById('dashSetupBanner').classList.remove('hidden');
    showSetupBanner();
    loadDemoData();
  }
  document.getElementById('tpDate').valueAsDate = new Date();
}

function showSetupBanner() {
  const banner = document.getElementById('setupBanner');
  if (banner) banner.style.display = 'block';
  document.getElementById('appRoot').style.paddingTop = '40px';
  document.querySelector('main').style.paddingTop = '28px';
}

async function loadAll() {
  await Promise.all([loadDrivers(), loadDashboard(), loadSMSHistory(), loadTemplates(), loadDocuments()]);
}

// ====================================================
// NAVIGATION
// ====================================================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  if (page === 'sms') { loadSMSHistory(); loadTemplates(); populateSMSTemplateSelect(); }
  if (page === 'docs') loadDocuments();
}

// ====================================================
// TOAST
// ====================================================
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ====================================================
// BADGE HELPER
// ====================================================
function badge(status) {
  return `<span class="badge badge-${status}">${STAGE_LABELS[status] || status}</span>`;
}

// ====================================================
// DRIVER LOADING & DISPLAY
// ====================================================
async function loadDrivers() {
  if (!supabase) return;
  const { data, error } = await supabase.from('drivers').select('*').order('created_at', { ascending: false });
  if (error) { toast('Error loading drivers: ' + error.message, 'error'); return; }
  allDrivers.company = data.filter(d => d.driver_type === 'company');
  allDrivers.owner_operator = data.filter(d => d.driver_type === 'owner_operator');
  renderDriverGrid('company');
  renderDriverGrid('owner_operator');
}

function filterDrivers(type) {
  const idPrefix = type === 'company' ? 'company' : 'ownerop';
  const search = document.getElementById(idPrefix + 'Search').value.toLowerCase();
  const status = document.getElementById(idPrefix + 'StatusFilter').value;
  const key = type === 'company' ? 'company' : 'owner_operator';
  const filtered = allDrivers[key].filter(d => {
    const matchSearch = !search || d.name?.toLowerCase().includes(search) || d.phone?.includes(search) || d.location?.toLowerCase().includes(search);
    const matchStatus = !status || d.status === status;
    return matchSearch && matchStatus;
  });
  renderDriverGrid(type === 'company' ? 'company' : 'owner_operator', filtered);
}

function renderDriverGrid(type, drivers) {
  const key = type === 'company' ? 'company' : 'owner_operator';
  const gridId = type === 'company' ? 'companyGrid' : 'owneropGrid';
  const list = drivers || allDrivers[key];
  const grid = document.getElementById(gridId);
  if (!list || list.length === 0) {
    grid.innerHTML = `<div class="text-center text-gray-400 py-12 col-span-3"><svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>No drivers found</div>`;
    return;
  }
  grid.innerHTML = list.map(d => `
    <div class="driver-card">
      <div class="flex items-start justify-between mb-3">
        <div>
          <div class="font-semibold text-gray-900">${escHtml(d.name)}</div>
          <div class="text-sm text-gray-500">${escHtml(d.location || '—')}</div>
        </div>
        ${badge(d.status)}
      </div>
      <div class="text-sm text-gray-600 space-y-1 mb-4">
        <div class="flex gap-2"><span class="text-gray-400">CDL:</span>${d.cdl_class || 'N/A'} · ${d.experience_years || 0} yrs exp</div>
        <div class="flex gap-2"><span class="text-gray-400">📞</span>${escHtml(d.phone || '—')}</div>
        <div class="flex gap-2 text-xs text-gray-400">Added ${formatDate(d.created_at)}</div>
      </div>
      <button class="btn-primary w-full text-sm" onclick="openProfile('${d.id}')">View Profile</button>
    </div>
  `).join('');
}

// ====================================================
// DASHBOARD
// ====================================================
async function loadDashboard() {
  if (!supabase) return;
  const { data: drivers } = await supabase.from('drivers').select('id, status');
  const today = new Date().toISOString().split('T')[0];
  const { data: overdue } = await supabase.from('touchpoints')
    .select('id, driver_id, follow_up_date, notes, drivers(name)')
    .lt('follow_up_date', today)
    .eq('follow_up_completed', false)
    .order('follow_up_date');
  const { data: recent } = await supabase.from('touchpoints')
    .select('id, date, method, notes, created_by, drivers(name)')
    .order('created_at', { ascending: false })
    .limit(10);

  const total = drivers?.length || 0;
  const hired = drivers?.filter(d => d.status === 'hired').length || 0;
  const pipeline = drivers?.filter(d => ['applied','contacted','docs_sent','offer_extended'].includes(d.status)).length || 0;
  const overdueCount = overdue?.length || 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statHired').textContent = hired;
  document.getElementById('statPipeline').textContent = pipeline;
  document.getElementById('statOverdue').textContent = overdueCount;
  document.getElementById('overdueCount').textContent = overdueCount;

  const tbody = document.getElementById('overdueTable');
  if (!overdue || overdue.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-6">No overdue follow-ups 🎉</td></tr>';
  } else {
    tbody.innerHTML = overdue.map(o => `
      <tr>
        <td class="font-medium">${escHtml(o.drivers?.name || '—')}</td>
        <td class="text-red-600 font-medium">${formatDate(o.follow_up_date)}</td>
        <td class="text-gray-500 text-sm">${escHtml(o.notes || '—')}</td>
        <td><button class="text-blue-600 text-sm hover:underline" onclick="openProfile('${o.driver_id}')">View</button></td>
      </tr>`).join('');
  }

  const feed = document.getElementById('recentFeed');
  if (!recent || recent.length === 0) {
    feed.innerHTML = '<div class="text-sm text-gray-400 text-center py-4">No activity yet</div>';
  } else {
    feed.innerHTML = recent.map(r => `
      <div class="touchpoint-item">
        <div class="text-sm font-medium text-gray-800">${escHtml(r.drivers?.name || '—')} <span class="text-gray-400 font-normal">via ${r.method}</span></div>
        <div class="text-xs text-gray-500 mt-0.5">${formatDate(r.date)} ${r.created_by ? '· ' + escHtml(r.created_by) : ''}</div>
        ${r.notes ? `<div class="text-xs text-gray-600 mt-1">${escHtml(r.notes)}</div>` : ''}
      </div>`).join('');
  }
}

// ====================================================
// ADD DRIVER MODAL
// ====================================================
function openAddDriver(type) {
  document.getElementById('addDriverType').value = type;
  document.getElementById('addDriverTitle').textContent = type === 'company' ? 'Add Company Driver' : 'Add Owner Operator';
  ['addName','addPhone','addEmail','addLocation','addNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addCdl').value = '';
  document.getElementById('addExp').value = '';
  document.getElementById('addDriverModal').classList.add('open');
}
function closeAddDriver() { document.getElementById('addDriverModal').classList.remove('open'); }
function closeAddDriverOnBg(e) { if (e.target === document.getElementById('addDriverModal')) closeAddDriver(); }

async function saveNewDriver() {
  const name = document.getElementById('addName').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const type = document.getElementById('addDriverType').value;
  const checklist = {};
  const items = type === 'company' ? COMPANY_CHECKLIST : OWNEROP_CHECKLIST;
  items.forEach(i => { checklist[i] = false; });

  if (!supabase) { toast('No database connection — set up Supabase first', 'error'); return; }
  const { error } = await supabase.from('drivers').insert({
    name,
    phone: document.getElementById('addPhone').value.trim(),
    email: document.getElementById('addEmail').value.trim(),
    cdl_class: document.getElementById('addCdl').value || null,
    experience_years: parseInt(document.getElementById('addExp').value) || 0,
    location: document.getElementById('addLocation').value.trim(),
    notes: document.getElementById('addNotes').value.trim(),
    driver_type: type,
    status: 'applied',
    checklist
  });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Driver added!');
  closeAddDriver();
  await loadDrivers();
  await loadDashboard();
}

// ====================================================
// DRIVER PROFILE MODAL
// ====================================================
async function openProfile(driverId) {
  if (!supabase) { toast('No database connection', 'error'); return; }
  const { data: driver, error } = await supabase.from('drivers').select('*').eq('id', driverId).single();
  if (error || !driver) { toast('Could not load driver', 'error'); return; }
  currentDriver = driver;

  document.getElementById('profileName').textContent = driver.name;
  document.getElementById('profileMeta').textContent = `${driver.driver_type === 'company' ? 'Company Driver' : 'Owner Operator'} · ${driver.location || 'No location'} · ${driver.phone || 'No phone'}`;

  // Pipeline
  const pipeline = document.getElementById('pipelineStages');
  pipeline.innerHTML = PIPELINE_STAGES.map(s => `
    <button class="pipeline-stage ${driver.status === s ? 'active' : ''}" onclick="setStatus('${s}')">${STAGE_LABELS[s]}</button>
  `).join('');

  // Profile fields
  document.getElementById('pName').value = driver.name || '';
  document.getElementById('pPhone').value = driver.phone || '';
  document.getElementById('pEmail').value = driver.email || '';
  document.getElementById('pCdl').value = driver.cdl_class || '';
  document.getElementById('pExp').value = driver.experience_years || 0;
  document.getElementById('pLocation').value = driver.location || '';
  document.getElementById('pNotes').value = driver.notes || '';

  // Checklist
  const items = driver.driver_type === 'company' ? COMPANY_CHECKLIST : OWNEROP_CHECKLIST;
  const checklist = driver.checklist || {};
  document.getElementById('checklistItems').innerHTML = items.map(item => `
    <div class="checklist-item">
      <input type="checkbox" id="chk_${slugify(item)}" ${checklist[item] ? 'checked' : ''} onchange="toggleChecklist('${item}', this.checked)" />
      <label for="chk_${slugify(item)}" class="text-sm text-gray-700 cursor-pointer">${item}</label>
    </div>
  `).join('');

  // Touchpoints
  await loadTouchpoints(driverId);

  document.getElementById('tpDate').valueAsDate = new Date();
  document.getElementById('profileModal').classList.add('open');
}

function closeProfile() {
  document.getElementById('profileModal').classList.remove('open');
  currentDriver = null;
  loadDrivers();
  loadDashboard();
}
function closeProfileOnBg(e) { if (e.target === document.getElementById('profileModal')) closeProfile(); }

async function setStatus(status) {
  if (!currentDriver || !supabase) return;
  const { error } = await supabase.from('drivers').update({ status }).eq('id', currentDriver.id);
  if (error) { toast('Error updating status', 'error'); return; }
  currentDriver.status = status;
  document.querySelectorAll('.pipeline-stage').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim() === STAGE_LABELS[status]);
  });
  toast('Status updated to ' + STAGE_LABELS[status]);
}

async function saveProfile() {
  if (!currentDriver || !supabase) return;
  const { error } = await supabase.from('drivers').update({
    name: document.getElementById('pName').value.trim(),
    phone: document.getElementById('pPhone').value.trim(),
    email: document.getElementById('pEmail').value.trim(),
    cdl_class: document.getElementById('pCdl').value || null,
    experience_years: parseInt(document.getElementById('pExp').value) || 0,
    location: document.getElementById('pLocation').value.trim(),
    notes: document.getElementById('pNotes').value.trim(),
  }).eq('id', currentDriver.id);
  if (error) { toast('Error saving: ' + error.message, 'error'); return; }
  toast('Profile saved!');
  currentDriver.name = document.getElementById('pName').value.trim();
  document.getElementById('profileName').textContent = currentDriver.name;
}

async function toggleChecklist(item, checked) {
  if (!currentDriver || !supabase) return;
  const checklist = currentDriver.checklist || {};
  checklist[item] = checked;
  currentDriver.checklist = checklist;
  await supabase.from('drivers').update({ checklist }).eq('id', currentDriver.id);
}

async function loadTouchpoints(driverId) {
  const { data, error } = await supabase.from('touchpoints').select('*').eq('driver_id', driverId).order('date', { ascending: false });
  const list = document.getElementById('touchpointList');
  if (!data || data.length === 0) {
    list.innerHTML = '<div class="text-sm text-gray-400 text-center py-4">No touchpoints yet</div>';
    return;
  }
  list.innerHTML = data.map(t => `
    <div class="touchpoint-item">
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium text-gray-800">${formatDate(t.date)} · <span class="capitalize">${t.method}</span></div>
        <div class="flex items-center gap-2">
          ${t.follow_up_date ? `<span class="text-xs text-blue-600">Follow-up: ${formatDate(t.follow_up_date)}</span>` : ''}
          ${!t.follow_up_completed && t.follow_up_date ? `<button class="text-xs text-green-600 hover:underline" onclick="markFollowupDone('${t.id}', this)">✓ Done</button>` : ''}
        </div>
      </div>
      ${t.notes ? `<div class="text-xs text-gray-600 mt-1">${escHtml(t.notes)}</div>` : ''}
      ${t.created_by ? `<div class="text-xs text-gray-400 mt-0.5">by ${escHtml(t.created_by)}</div>` : ''}
    </div>
  `).join('');
}

async function logTouchpoint() {
  if (!currentDriver || !supabase) return;
  const date = document.getElementById('tpDate').value;
  const method = document.getElementById('tpMethod').value;
  const notes = document.getElementById('tpNotes').value.trim();
  const created_by = document.getElementById('tpCreatedBy').value.trim();
  const follow_up_date = document.getElementById('tpFollowup').value || null;
  if (!date || !method) { toast('Date and method required', 'error'); return; }
  const { error } = await supabase.from('touchpoints').insert({ driver_id: currentDriver.id, date, method, notes, created_by, follow_up_date, follow_up_completed: false });
  if (error) { toast('Error logging: ' + error.message, 'error'); return; }
  toast('Touchpoint logged!');
  document.getElementById('tpNotes').value = '';
  document.getElementById('tpFollowup').value = '';
  await loadTouchpoints(currentDriver.id);
}

async function markFollowupDone(touchpointId, btn) {
  if (!supabase) return;
  await supabase.from('touchpoints').update({ follow_up_completed: true }).eq('id', touchpointId);
  btn.parentElement.innerHTML = '<span class="text-xs text-green-600">✓ Completed</span>';
  toast('Follow-up marked complete!');
}

// ====================================================
// SMS CENTER
// ====================================================
function smsTab(tab, btn) {
  ['send','history','templates'].forEach(t => document.getElementById('smsTab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('smsTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');
  btn.classList.add('active');
  if (tab === 'history') loadSMSHistory();
  if (tab === 'templates') loadTemplates();
}

let selectedDriverId = null;
function smsDriverSearch() {
  const q = document.getElementById('smsDriverSearch').value.toLowerCase();
  const dd = document.getElementById('smsDriverDropdown');
  if (!q || q.length < 2) { dd.classList.add('hidden'); return; }
  const all = [...allDrivers.company, ...allDrivers.owner_operator];
  const matches = all.filter(d => d.name.toLowerCase().includes(q)).slice(0, 8);
  if (matches.length === 0) { dd.classList.add('hidden'); return; }
  dd.innerHTML = matches.map(d => `<div class="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm" onclick="selectSMSDriver('${d.id}','${escAttr(d.name)}','${escAttr(d.phone || '')}')">${escHtml(d.name)} <span class="text-gray-400">${escHtml(d.phone || '')}</span></div>`).join('');
  dd.classList.remove('hidden');
}
function selectSMSDriver(id, name, phone) {
  selectedDriverId = id;
  document.getElementById('smsDriverSearch').value = name;
  document.getElementById('smsPhone').value = phone;
  document.getElementById('smsDriverDropdown').classList.add('hidden');
}

async function populateSMSTemplateSelect() {
  const sel = document.getElementById('smsTemplate');
  sel.innerHTML = '<option value="">— Select a template —</option>';
  allTemplates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    opt.dataset.msg = t.message;
    sel.appendChild(opt);
  });
}

function applyTemplate() {
  const sel = document.getElementById('smsTemplate');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.msg) document.getElementById('smsMessage').value = opt.dataset.msg;
}

async function sendSMS() {
  const to = document.getElementById('smsPhone').value.trim();
  const message = document.getElementById('smsMessage').value.trim();
  const btn = document.getElementById('smsSendBtn');
  if (!to || !message) { toast('Phone and message required', 'error'); return; }
  if (!supabase) { toast('No database connection', 'error'); return; }
  const sel = document.getElementById('smsTemplate');
  const template_name = sel.options[sel.selectedIndex]?.text || null;
  btn.innerHTML = '<span class="spinner"></span> Sending…';
  btn.disabled = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ to, message, driver_id: selectedDriverId || null, template_name })
    });
    const data = await res.json();
    if (data.success) {
      toast('SMS sent!');
      document.getElementById('smsMessage').value = '';
      document.getElementById('smsPhone').value = '';
      document.getElementById('smsDriverSearch').value = '';
      selectedDriverId = null;
      loadSMSHistory();
    } else {
      toast('Failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    toast('Network error: ' + e.message, 'error');
  }
  btn.innerHTML = 'Send Message';
  btn.disabled = false;
}

async function loadSMSHistory() {
  if (!supabase) return;
  const { data } = await supabase.from('sms_log').select('*, drivers(name)').order('sent_at', { ascending: false }).limit(50);
  const tbody = document.getElementById('smsHistoryTable');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">No messages sent yet</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(s => `
    <tr>
      <td><div class="font-medium">${escHtml(s.drivers?.name || '—')}</div><div class="text-xs text-gray-400">${escHtml(s.phone)}</div></td>
      <td class="max-w-xs"><div class="text-sm truncate" title="${escAttr(s.message)}">${escHtml(s.message)}</div></td>
      <td class="text-sm text-gray-500">${escHtml(s.template_name || '—')}</td>
      <td class="text-sm text-gray-500 whitespace-nowrap">${formatDateTime(s.sent_at)}</td>
      <td><span class="badge ${s.status === 'sent' ? 'badge-hired' : 'badge-not_interested'}">${s.status}</span></td>
    </tr>`).join('');
}

async function loadTemplates() {
  if (!supabase) return;
  const { data } = await supabase.from('sms_templates').select('*').order('created_at');
  allTemplates = data || [];
  const tbody = document.getElementById('templatesTable');
  if (!allTemplates.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-6">No templates</td></tr>';
    return;
  }
  tbody.innerHTML = allTemplates.map(t => `
    <tr>
      <td class="font-medium">${escHtml(t.name)}</td>
      <td><span class="badge badge-applied">${t.driver_type}</span></td>
      <td class="max-w-xs text-sm text-gray-500 truncate" title="${escAttr(t.message)}">${escHtml(t.message.slice(0, 60))}…</td>
      <td class="whitespace-nowrap">
        <button class="text-blue-600 text-sm hover:underline mr-3" onclick="editTemplate('${t.id}')">Edit</button>
        <button class="btn-danger" onclick="deleteTemplate('${t.id}')">Delete</button>
      </td>
    </tr>`).join('');
  populateSMSTemplateSelect();
}

async function saveTemplate() {
  const id = document.getElementById('tplEditId').value;
  const name = document.getElementById('tplName').value.trim();
  const message = document.getElementById('tplMessage').value.trim();
  const driver_type = document.getElementById('tplType').value;
  if (!name || !message) { toast('Name and message required', 'error'); return; }
  if (!supabase) { toast('No database connection', 'error'); return; }
  if (id) {
    const { error } = await supabase.from('sms_templates').update({ name, message, driver_type }).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Template updated!');
  } else {
    const { error } = await supabase.from('sms_templates').insert({ name, message, driver_type });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Template created!');
  }
  clearTemplateForm();
  loadTemplates();
}

function editTemplate(id) {
  const t = allTemplates.find(t => t.id === id);
  if (!t) return;
  document.getElementById('tplEditId').value = t.id;
  document.getElementById('tplName').value = t.name;
  document.getElementById('tplMessage').value = t.message;
  document.getElementById('tplType').value = t.driver_type;
  document.getElementById('tplFormTitle').textContent = 'Edit Template';
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await supabase.from('sms_templates').delete().eq('id', id);
  toast('Template deleted');
  loadTemplates();
}

function clearTemplateForm() {
  document.getElementById('tplEditId').value = '';
  document.getElementById('tplName').value = '';
  document.getElementById('tplMessage').value = '';
  document.getElementById('tplType').value = 'both';
  document.getElementById('tplFormTitle').textContent = 'New Template';
}

// ====================================================
// DOCUMENTS
// ====================================================
async function addDocument() {
  const name = document.getElementById('docName').value.trim();
  const url = document.getElementById('docUrl').value.trim();
  const driver_type = document.getElementById('docType').value;
  const description = document.getElementById('docDesc').value.trim();
  if (!name || !url) { toast('Name and URL required', 'error'); return; }
  if (!supabase) { toast('No database connection', 'error'); return; }
  const { error } = await supabase.from('documents').insert({ name, url, driver_type, description });
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Document added!');
  document.getElementById('docName').value = '';
  document.getElementById('docUrl').value = '';
  document.getElementById('docDesc').value = '';
  loadDocuments();
}

async function loadDocuments() {
  if (!supabase) return;
  const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
  const tbody = document.getElementById('docsTable');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">No documents yet</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(d => `
    <tr>
      <td><a href="${escAttr(d.url)}" target="_blank" class="text-blue-600 hover:underline font-medium">${escHtml(d.name)}</a></td>
      <td><span class="badge badge-applied">${d.driver_type}</span></td>
      <td class="text-sm text-gray-500">${escHtml(d.description || '—')}</td>
      <td class="whitespace-nowrap">
        <button class="text-blue-600 text-sm hover:underline mr-3" onclick="copyLink('${escAttr(d.url)}')">Copy Link</button>
        <button class="btn-danger" onclick="deleteDocument('${d.id}')">Delete</button>
      </td>
    </tr>`).join('');
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(() => toast('Link copied!')).catch(() => toast('Could not copy', 'error'));
}

async function deleteDocument(id) {
  if (!confirm('Delete this document?')) return;
  await supabase.from('documents').delete().eq('id', id);
  toast('Document deleted');
  loadDocuments();
}

// ====================================================
// DEMO DATA (when no Supabase configured)
// ====================================================
function loadDemoData() {
  allDrivers.company = [
    { id: 'demo1', name: 'John Mitchell', phone: '(555) 123-4567', email: 'john@example.com', cdl_class: 'A', location: 'Nashville, TN', experience_years: 8, driver_type: 'company', status: 'contacted', notes: 'Strong candidate', created_at: new Date().toISOString() },
    { id: 'demo2', name: 'Sarah Johnson', phone: '(555) 234-5678', email: 'sarah@example.com', cdl_class: 'A', location: 'Memphis, TN', experience_years: 5, driver_type: 'company', status: 'applied', notes: '', created_at: new Date().toISOString() },
    { id: 'demo3', name: 'Mike Davis', phone: '(555) 345-6789', email: 'mike@example.com', cdl_class: 'B', location: 'Louisville, KY', experience_years: 12, driver_type: 'company', status: 'hired', notes: 'Starts Monday', created_at: new Date().toISOString() },
  ];
  allDrivers.owner_operator = [
    { id: 'demo4', name: 'Carlos Rivera', phone: '(555) 456-7890', email: 'carlos@example.com', cdl_class: 'A', location: 'Atlanta, GA', experience_years: 15, driver_type: 'owner_operator', status: 'docs_sent', notes: 'Has own Peterbilt', created_at: new Date().toISOString() },
    { id: 'demo5', name: 'Linda Thompson', phone: '(555) 567-8901', email: 'linda@example.com', cdl_class: 'A', location: 'Charlotte, NC', experience_years: 10, driver_type: 'owner_operator', status: 'offer_extended', notes: '', created_at: new Date().toISOString() },
  ];
  renderDriverGrid('company');
  renderDriverGrid('owner_operator');
  document.getElementById('statTotal').textContent = 5;
  document.getElementById('statHired').textContent = 1;
  document.getElementById('statPipeline').textContent = 3;
  document.getElementById('statOverdue').textContent = 0;
  document.getElementById('overdueCount').textContent = 0;
  document.getElementById('overdueTable').innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-6">Connect Supabase to see live data</td></tr>';
  document.getElementById('recentFeed').innerHTML = '<div class="text-sm text-gray-400 text-center py-4">Connect Supabase to see activity</div>';
}

// ====================================================
// UTILITIES
// ====================================================
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g,'_');
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Close SMS dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#smsDriverSearch') && !e.target.closest('#smsDriverDropdown')) {
    document.getElementById('smsDriverDropdown').classList.add('hidden');
  }
});

// Expose all functions to global window scope for onclick handlers
window.showPage = showPage;
window.openAddDriver = openAddDriver;
window.closeAddDriver = closeAddDriver;
window.closeAddDriverOnBg = closeAddDriverOnBg;
window.saveNewDriver = saveNewDriver;
window.openProfile = openProfile;
window.closeProfile = closeProfile;
window.closeProfileOnBg = closeProfileOnBg;
window.setStatus = setStatus;
window.saveProfile = saveProfile;
window.toggleChecklist = toggleChecklist;
window.logTouchpoint = logTouchpoint;
window.markFollowupDone = markFollowupDone;
window.filterDrivers = filterDrivers;
window.smsTab = smsTab;
window.smsDriverSearch = smsDriverSearch;
window.selectSMSDriver = selectSMSDriver;
window.applyTemplate = applyTemplate;
window.sendSMS = sendSMS;
window.saveTemplate = saveTemplate;
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;
window.clearTemplateForm = clearTemplateForm;
window.addDocument = addDocument;
window.deleteDocument = deleteDocument;
window.copyLink = copyLink;

// Init — wait for DOM to be fully ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
