window.addEventListener('DOMContentLoaded', function() {

  // ──────────────────────────────────────────────────────────────
  // Supabase client
  // ──────────────────────────────────────────────────────────────
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ──────────────────────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────────────────────
  var currentPage = 'dashboard';
  var currentDriverType = 'company';  // 'company' | 'owner_operator'
  var currentDriverId = null;
  var currentDriverData = null;
  var editingTemplateId = null;
  var allDrivers = [];   // cached for SMS autocomplete
  var toastTimer = null;

  // ──────────────────────────────────────────────────────────────
  // Toast
  // ──────────────────────────────────────────────────────────────
  function showToast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3500);
  }

  // ──────────────────────────────────────────────────────────────
  // Navigation
  // ──────────────────────────────────────────────────────────────
  var navLinks = document.querySelectorAll('#sidebar nav a[data-page]');

  navLinks.forEach(function(link) {
    link.addEventListener('click', function() {
      var page = this.getAttribute('data-page');
      navigateTo(page);
    });
  });

  function navigateTo(page) {
    currentPage = page;

    // Update sidebar active state
    navLinks.forEach(function(l) {
      l.classList.toggle('active', l.getAttribute('data-page') === page);
    });

    // Show/hide pages
    document.querySelectorAll('.page').forEach(function(p) {
      p.classList.remove('active');
    });
    var target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    // Load page data
    if (page === 'dashboard') loadDashboard();
    else if (page === 'company-drivers') loadDrivers('company');
    else if (page === 'owner-operators') loadDrivers('owner_operator');
    else if (page === 'sms-center') loadSmsCenter();
    else if (page === 'documents') loadDocuments();
  }

  // ──────────────────────────────────────────────────────────────
  // Modal helpers
  // ──────────────────────────────────────────────────────────────
  function openModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  // Close on backdrop click or data-close buttons
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  document.querySelectorAll('[data-close]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      closeModal(this.getAttribute('data-close'));
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Tab switching (profile modal)
  // ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tabId = this.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('active'); });
      this.classList.add('active');
      var pane = document.getElementById('tab-' + tabId);
      if (pane) pane.classList.add('active');

      if (tabId === 'profile-touchpoints' && currentDriverId) {
        loadTouchpoints(currentDriverId);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DASHBOARD
  // ──────────────────────────────────────────────────────────────
  function loadDashboard() {
    loadDashboardStats();
    loadOverdueFollowups();
    loadRecentTouchpoints();
  }

  function loadDashboardStats() {
    sb.from('drivers').select('status').then(function(res) {
      if (res.error) return;
      var rows = res.data || [];
      var total = rows.length;
      var hired = rows.filter(function(r) { return r.status === 'hired'; }).length;
      var active = rows.filter(function(r) {
        return r.status !== 'hired' && r.status !== 'not_interested' && r.status !== 'inactive';
      }).length;

      document.getElementById('stat-total').textContent = total;
      document.getElementById('stat-hired').textContent = hired;
      document.getElementById('stat-pipeline').textContent = active;

      loadOverdueCount();
    });
  }

  function loadOverdueCount() {
    var today = new Date().toISOString().split('T')[0];
    sb.from('touchpoints')
      .select('id')
      .lt('follow_up_date', today)
      .eq('follow_up_completed', false)
      .then(function(res) {
        var count = res.data ? res.data.length : 0;
        document.getElementById('stat-overdue').textContent = count;
        var card = document.getElementById('stat-overdue-card');
        if (count > 0) card.classList.add('danger');
        else card.classList.remove('danger');
      });
  }

  function loadOverdueFollowups() {
    var today = new Date().toISOString().split('T')[0];
    var wrap = document.getElementById('overdue-table-wrap');
    wrap.innerHTML = '<p class="loading">Loading…</p>';

    sb.from('touchpoints')
      .select('*, drivers(name, driver_type)')
      .lt('follow_up_date', today)
      .eq('follow_up_completed', false)
      .order('follow_up_date', { ascending: true })
      .then(function(res) {
        if (res.error || !res.data || res.data.length === 0) {
          wrap.innerHTML = '<p class="empty-state">No overdue follow-ups 🎉</p>';
          return;
        }
        var html = '<table><thead><tr><th>Driver</th><th>Type</th><th>Method</th><th>Due</th><th>Notes</th></tr></thead><tbody>';
        res.data.forEach(function(row) {
          var name = row.drivers ? row.drivers.name : 'Unknown';
          var type = row.drivers ? row.drivers.driver_type : '';
          html += '<tr>';
          html += '<td>' + esc(name) + '</td>';
          html += '<td>' + formatDriverType(type) + '</td>';
          html += '<td>' + esc(row.method || '') + '</td>';
          html += '<td style="color:#e53e3e;font-weight:600;">' + esc(row.follow_up_date || '') + '</td>';
          html += '<td>' + esc(row.notes || '') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
        wrap.innerHTML = html;
      });
  }

  function loadRecentTouchpoints() {
    var wrap = document.getElementById('recent-touchpoints-wrap');
    wrap.innerHTML = '<p class="loading">Loading…</p>';

    sb.from('touchpoints')
      .select('*, drivers(name)')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(function(res) {
        if (res.error || !res.data || res.data.length === 0) {
          wrap.innerHTML = '<p class="empty-state">No touchpoints yet.</p>';
          return;
        }
        var html = '<div style="display:flex;flex-direction:column;gap:10px;">';
        res.data.forEach(function(row) {
          var name = row.drivers ? row.drivers.name : 'Unknown';
          html += '<div class="touchpoint-item">';
          html += '<strong>' + esc(name) + '</strong> — ' + esc(row.method || '') + ': ' + esc(row.notes || '');
          html += '<div class="tp-meta">' + esc(row.date || '') + (row.created_by ? ' · ' + esc(row.created_by) : '') + '</div>';
          html += '</div>';
        });
        html += '</div>';
        wrap.innerHTML = html;
      });
  }

  // ──────────────────────────────────────────────────────────────
  // DRIVERS (Company / Owner Operator)
  // ──────────────────────────────────────────────────────────────
  function loadDrivers(type) {
    currentDriverType = type;
    var gridId = type === 'company' ? 'company-drivers-grid' : 'oo-drivers-grid';
    var grid = document.getElementById(gridId);
    grid.innerHTML = '<p class="loading">Loading…</p>';

    sb.from('drivers')
      .select('*')
      .eq('driver_type', type)
      .order('created_at', { ascending: false })
      .then(function(res) {
        if (res.error) {
          grid.innerHTML = '<p class="empty-state">Error loading drivers.</p>';
          return;
        }
        allDrivers = allDrivers.filter(function(d) { return d.driver_type !== type; })
          .concat(res.data || []);
        renderDriverGrid(type, res.data || []);
      });
  }

  function renderDriverGrid(type, drivers) {
    var searchId = type === 'company' ? 'company-search' : 'oo-search';
    var statusId = type === 'company' ? 'company-status-filter' : 'oo-status-filter';
    var search = (document.getElementById(searchId).value || '').toLowerCase();
    var status = document.getElementById(statusId).value;

    var filtered = drivers.filter(function(d) {
      var matchSearch = !search ||
        (d.name || '').toLowerCase().includes(search) ||
        (d.phone || '').toLowerCase().includes(search) ||
        (d.location || '').toLowerCase().includes(search);
      var matchStatus = !status || d.status === status;
      return matchSearch && matchStatus;
    });

    var gridId = type === 'company' ? 'company-drivers-grid' : 'oo-drivers-grid';
    var grid = document.getElementById(gridId);

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="empty-state">No drivers found.</p>';
      return;
    }

    var html = '';
    filtered.forEach(function(d) {
      html += '<div class="driver-card" data-driver-id="' + d.id + '">';
      html += '<div class="name">' + esc(d.name) + '</div>';
      html += '<div>' + badgeHtml(d.status) + '</div>';
      html += '<div class="meta">';
      if (d.location) html += '📍 ' + esc(d.location) + '<br>';
      if (d.cdl_class) html += '🪪 CDL ' + esc(d.cdl_class) + '<br>';
      if (d.phone) html += '📞 ' + esc(d.phone) + '<br>';
      html += '</div>';
      html += '<div class="actions"><button class="btn btn-sm btn-primary view-profile-btn" data-driver-id="' + d.id + '">View Profile</button></div>';
      html += '</div>';
    });
    grid.innerHTML = html;

    // Bind view profile buttons
    grid.querySelectorAll('.view-profile-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openDriverProfile(this.getAttribute('data-driver-id'));
      });
    });
  }

  // Search/filter listeners
  function bindDriverFilters(type) {
    var searchId = type === 'company' ? 'company-search' : 'oo-search';
    var statusId = type === 'company' ? 'company-status-filter' : 'oo-status-filter';

    document.getElementById(searchId).addEventListener('input', function() {
      var drivers = allDrivers.filter(function(d) { return d.driver_type === type; });
      renderDriverGrid(type, drivers);
    });
    document.getElementById(statusId).addEventListener('change', function() {
      var drivers = allDrivers.filter(function(d) { return d.driver_type === type; });
      renderDriverGrid(type, drivers);
    });
  }
  bindDriverFilters('company');
  bindDriverFilters('owner_operator');

  // Add driver buttons
  document.getElementById('add-company-driver-btn').addEventListener('click', function() {
    currentDriverType = 'company';
    clearAddDriverForm();
    document.getElementById('add-driver-modal-title').textContent = 'Add Company Driver';
    openModal('add-driver-modal');
  });

  document.getElementById('add-oo-driver-btn').addEventListener('click', function() {
    currentDriverType = 'owner_operator';
    clearAddDriverForm();
    document.getElementById('add-driver-modal-title').textContent = 'Add Owner Operator';
    openModal('add-driver-modal');
  });

  function clearAddDriverForm() {
    document.getElementById('driver-form-name').value = '';
    document.getElementById('driver-form-phone').value = '';
    document.getElementById('driver-form-email').value = '';
    document.getElementById('driver-form-cdl').value = '';
    document.getElementById('driver-form-exp').value = '';
    document.getElementById('driver-form-location').value = '';
    document.getElementById('driver-form-notes').value = '';
  }

  document.getElementById('add-driver-save-btn').addEventListener('click', function() {
    var name = document.getElementById('driver-form-name').value.trim();
    if (!name) { showToast('Name is required', true); return; }

    var payload = {
      name: name,
      phone: document.getElementById('driver-form-phone').value.trim(),
      email: document.getElementById('driver-form-email').value.trim(),
      cdl_class: document.getElementById('driver-form-cdl').value,
      experience_years: parseInt(document.getElementById('driver-form-exp').value) || null,
      location: document.getElementById('driver-form-location').value.trim(),
      notes: document.getElementById('driver-form-notes').value.trim(),
      driver_type: currentDriverType,
      status: 'applied',
      checklist: {}
    };

    sb.from('drivers').insert([payload]).then(function(res) {
      if (res.error) { showToast('Error: ' + res.error.message, true); return; }
      showToast('Driver added!');
      closeModal('add-driver-modal');
      loadDrivers(currentDriverType);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DRIVER PROFILE MODAL
  // ──────────────────────────────────────────────────────────────
  function openDriverProfile(driverId) {
    currentDriverId = driverId;

    sb.from('drivers').select('*').eq('id', driverId).single().then(function(res) {
      if (res.error || !res.data) { showToast('Could not load driver', true); return; }
      currentDriverData = res.data;
      populateProfileModal(res.data);
      openModal('profile-modal');

      // Reset to first tab
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('active'); });
      document.querySelector('.tab-btn[data-tab="profile-edit"]').classList.add('active');
      document.getElementById('tab-profile-edit').classList.add('active');
    });
  }

  function populateProfileModal(d) {
    document.getElementById('profile-modal-name').textContent = d.name;

    // Form fields
    document.getElementById('profile-form-name').value = d.name || '';
    document.getElementById('profile-form-phone').value = d.phone || '';
    document.getElementById('profile-form-email').value = d.email || '';
    document.getElementById('profile-form-cdl').value = d.cdl_class || '';
    document.getElementById('profile-form-exp').value = d.experience_years || '';
    document.getElementById('profile-form-location').value = d.location || '';
    document.getElementById('profile-form-notes').value = d.notes || '';

    // Pipeline
    document.querySelectorAll('.pipeline-btn').forEach(function(btn) {
      var s = btn.getAttribute('data-status');
      btn.className = 'pipeline-btn' + (d.status === s ? ' active-' + s : '');
    });

    // Checklist
    populateChecklist(d.driver_type, d.checklist || {});
  }

  // Pipeline buttons
  document.getElementById('pipeline-btns').addEventListener('click', function(e) {
    var btn = e.target.closest('.pipeline-btn');
    if (!btn || !currentDriverId) return;
    var newStatus = btn.getAttribute('data-status');
    sb.from('drivers').update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', currentDriverId)
      .then(function(res) {
        if (res.error) { showToast('Error: ' + res.error.message, true); return; }
        currentDriverData.status = newStatus;
        document.querySelectorAll('.pipeline-btn').forEach(function(b) {
          var s = b.getAttribute('data-status');
          b.className = 'pipeline-btn' + (newStatus === s ? ' active-' + s : '');
        });
        showToast('Status updated to ' + newStatus.replace('_', ' '));
        // Refresh grid in background
        loadDrivers(currentDriverData.driver_type);
      });
  });

  // Profile save
  document.getElementById('profile-save-btn').addEventListener('click', function() {
    if (!currentDriverId) return;
    var name = document.getElementById('profile-form-name').value.trim();
    if (!name) { showToast('Name is required', true); return; }

    var payload = {
      name: name,
      phone: document.getElementById('profile-form-phone').value.trim(),
      email: document.getElementById('profile-form-email').value.trim(),
      cdl_class: document.getElementById('profile-form-cdl').value,
      experience_years: parseInt(document.getElementById('profile-form-exp').value) || null,
      location: document.getElementById('profile-form-location').value.trim(),
      notes: document.getElementById('profile-form-notes').value.trim(),
      updated_at: new Date().toISOString()
    };

    sb.from('drivers').update(payload).eq('id', currentDriverId).then(function(res) {
      if (res.error) { showToast('Error: ' + res.error.message, true); return; }
      document.getElementById('profile-modal-name').textContent = name;
      showToast('Profile saved!');
      loadDrivers(currentDriverData.driver_type);
    });
  });

  // ── Checklist ────────────────────────────────────────────────
  var CHECKLIST_COMPANY = [
    'Application', 'MVR', 'PSP', 'Employment Verification',
    'Drug Test Scheduled', 'Drug Test Passed', 'Orientation', 'Onboarding Complete'
  ];
  var CHECKLIST_OO = [
    'Application', 'Authority Verified', 'Insurance', 'W-9',
    'Rate Agreement', 'Load Board Access', 'First Load Assigned'
  ];

  function populateChecklist(driverType, checklist) {
    var items = driverType === 'owner_operator' ? CHECKLIST_OO : CHECKLIST_COMPANY;
    var container = document.getElementById('profile-checklist');
    var html = '';
    items.forEach(function(item) {
      var key = item.toLowerCase().replace(/\s+/g, '_');
      var checked = checklist[key] ? 'checked' : '';
      html += '<label class="checklist-item">';
      html += '<input type="checkbox" data-key="' + esc(key) + '" ' + checked + '> ' + esc(item);
      html += '</label>';
    });
    container.innerHTML = html;
  }

  document.getElementById('checklist-save-btn').addEventListener('click', function() {
    if (!currentDriverId) return;
    var checkboxes = document.querySelectorAll('#profile-checklist input[type=checkbox]');
    var checklist = {};
    checkboxes.forEach(function(cb) {
      checklist[cb.getAttribute('data-key')] = cb.checked;
    });
    sb.from('drivers').update({ checklist: checklist, updated_at: new Date().toISOString() })
      .eq('id', currentDriverId)
      .then(function(res) {
        if (res.error) { showToast('Error: ' + res.error.message, true); return; }
        showToast('Checklist saved!');
      });
  });

  // ── Touchpoints ──────────────────────────────────────────────
  function loadTouchpoints(driverId) {
    var list = document.getElementById('touchpoints-list');
    list.innerHTML = '<p class="loading">Loading…</p>';

    sb.from('touchpoints')
      .select('*')
      .eq('driver_id', driverId)
      .order('date', { ascending: false })
      .then(function(res) {
        if (res.error || !res.data || res.data.length === 0) {
          list.innerHTML = '<p class="empty-state">No touchpoints yet.</p>';
          return;
        }
        var html = '';
        res.data.forEach(function(tp) {
          html += '<div class="touchpoint-item">';
          html += '<strong>' + esc(tp.method || '') + '</strong>: ' + esc(tp.notes || '');
          html += '<div class="tp-meta">';
          html += esc(tp.date || '');
          if (tp.created_by) html += ' · by ' + esc(tp.created_by);
          if (tp.follow_up_date) html += ' · Follow-up: ' + esc(tp.follow_up_date);
          html += '</div></div>';
        });
        list.innerHTML = html;
      });
  }

  // Set default date for touchpoint form
  document.getElementById('tp-date').value = new Date().toISOString().split('T')[0];

  document.getElementById('tp-log-btn').addEventListener('click', function() {
    if (!currentDriverId) return;
    var notes = document.getElementById('tp-notes').value.trim();
    var date = document.getElementById('tp-date').value;
    if (!date) { showToast('Date is required', true); return; }

    var payload = {
      driver_id: currentDriverId,
      date: date,
      method: document.getElementById('tp-method').value,
      notes: notes,
      created_by: document.getElementById('tp-created-by').value.trim(),
      follow_up_date: document.getElementById('tp-followup').value || null,
      follow_up_completed: false
    };

    sb.from('touchpoints').insert([payload]).then(function(res) {
      if (res.error) { showToast('Error: ' + res.error.message, true); return; }
      showToast('Touchpoint logged!');
      document.getElementById('tp-notes').value = '';
      document.getElementById('tp-followup').value = '';
      document.getElementById('tp-date').value = new Date().toISOString().split('T')[0];
      loadTouchpoints(currentDriverId);
      // Refresh dashboard if visible
      if (currentPage === 'dashboard') loadDashboard();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // SMS CENTER
  // ──────────────────────────────────────────────────────────────
  function loadSmsCenter() {
    loadSmsHistory();
    loadSmsTemplates();
    loadTemplatesForPicker();
  }

  function loadSmsHistory() {
    var wrap = document.getElementById('sms-history-wrap');
    wrap.innerHTML = '<p class="loading">Loading…</p>';

    sb.from('sms_log')
      .select('*, drivers(name)')
      .order('sent_at', { ascending: false })
      .limit(50)
      .then(function(res) {
        if (res.error || !res.data || res.data.length === 0) {
          wrap.innerHTML = '<p class="empty-state">No SMS history.</p>';
          return;
        }
        var html = '<table><thead><tr><th>Driver</th><th>Phone</th><th>Message</th><th>Template</th><th>Sent</th><th>Status</th></tr></thead><tbody>';
        res.data.forEach(function(row) {
          var name = row.drivers ? row.drivers.name : '—';
          html += '<tr>';
          html += '<td>' + esc(name) + '</td>';
          html += '<td>' + esc(row.phone || '') + '</td>';
          html += '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(row.message || '') + '</td>';
          html += '<td>' + esc(row.template_name || '') + '</td>';
          html += '<td>' + esc(formatDate(row.sent_at)) + '</td>';
          html += '<td>' + esc(row.status || '') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
        wrap.innerHTML = html;
      });
  }

  function loadSmsTemplates() {
    var wrap = document.getElementById('templates-list-wrap');
    wrap.innerHTML = '<p class="loading">Loading…</p>';

    sb.from('sms_templates')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function(res) {
        if (res.error || !res.data || res.data.length === 0) {
          wrap.innerHTML = '<p class="empty-state">No templates yet.</p>';
          return;
        }
        var html = '<div class="templates-list">';
        res.data.forEach(function(tmpl) {
          html += '<div class="template-item">';
          html += '<div class="t-name">' + esc(tmpl.name) + ' <span style="font-size:11px;font-weight:400;color:#a0aec0;">(' + formatDriverType(tmpl.driver_type) + ')</span></div>';
          html += '<div class="t-msg">' + esc(tmpl.message) + '</div>';
          html += '<div class="t-actions">';
          html += '<button class="btn btn-xs btn-secondary edit-template-btn" data-id="' + tmpl.id + '">Edit</button>';
          html += '<button class="btn btn-xs btn-danger delete-template-btn" data-id="' + tmpl.id + '">Delete</button>';
          html += '</div></div>';
        });
        html += '</div>';
        wrap.innerHTML = html;

        wrap.querySelectorAll('.edit-template-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            editTemplate(this.getAttribute('data-id'), res.data);
          });
        });
        wrap.querySelectorAll('.delete-template-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            deleteTemplate(this.getAttribute('data-id'));
          });
        });
      });
  }

  function loadTemplatesForPicker() {
    sb.from('sms_templates').select('*').order('name').then(function(res) {
      var picker = document.getElementById('sms-template-picker');
      picker.innerHTML = '<option value="">— Select template —</option>';
      if (!res.data) return;
      res.data.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t.message;
        opt.textContent = t.name;
        picker.appendChild(opt);
      });
    });
  }

  document.getElementById('sms-template-picker').addEventListener('change', function() {
    if (this.value) {
      document.getElementById('sms-message').value = this.value;
    }
  });

  // SMS driver search autocomplete
  var smsSearchTimeout = null;
  document.getElementById('sms-driver-search').addEventListener('input', function() {
    var query = this.value.trim();
    var results = document.getElementById('sms-driver-results');
    if (!query) { results.innerHTML = ''; return; }

    clearTimeout(smsSearchTimeout);
    smsSearchTimeout = setTimeout(function() {
      sb.from('drivers').select('id, name, phone')
        .ilike('name', '%' + query + '%')
        .limit(8)
        .then(function(res) {
          if (!res.data || res.data.length === 0) { results.innerHTML = ''; return; }
          var html = '<div style="position:absolute;background:#fff;border:1px solid #cbd5e0;border-radius:6px;width:100%;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.12);">';
          res.data.forEach(function(d) {
            html += '<div class="sms-autocomplete-item" data-id="' + d.id + '" data-phone="' + esc(d.phone || '') + '" data-name="' + esc(d.name) + '" style="padding:9px 13px;cursor:pointer;border-bottom:1px solid #edf2f7;font-size:14px;">' + esc(d.name) + ' — ' + esc(d.phone || '') + '</div>';
          });
          html += '</div>';
          results.innerHTML = html;

          results.querySelectorAll('.sms-autocomplete-item').forEach(function(item) {
            item.addEventListener('click', function() {
              document.getElementById('sms-driver-search').value = this.getAttribute('data-name');
              document.getElementById('sms-phone').value = this.getAttribute('data-phone');
              results.innerHTML = '';
            });
          });
        });
    }, 300);
  });

  document.getElementById('sms-send-btn').addEventListener('click', function() {
    var phone = document.getElementById('sms-phone').value.trim();
    var message = document.getElementById('sms-message').value.trim();
    var templateName = '';

    var picker = document.getElementById('sms-template-picker');
    var selectedOption = picker.options[picker.selectedIndex];
    if (picker.value) templateName = selectedOption.textContent;

    if (!phone) { showToast('Phone number is required', true); return; }
    if (!message) { showToast('Message is required', true); return; }

    // Log to sms_log (actual SMS sending would require backend/Twilio)
    var payload = {
      phone: phone,
      message: message,
      template_name: templateName,
      status: 'sent',
      sent_at: new Date().toISOString()
    };

    sb.from('sms_log').insert([payload]).then(function(res) {
      if (res.error) { showToast('Error: ' + res.error.message, true); return; }
      showToast('SMS logged!');
      document.getElementById('sms-message').value = '';
      loadSmsHistory();
    });
  });

  // Template add/edit
  document.getElementById('add-template-btn').addEventListener('click', function() {
    editingTemplateId = null;
    document.getElementById('template-modal-title').textContent = 'Add Template';
    document.getElementById('tmpl-name').value = '';
    document.getElementById('tmpl-message').value = '';
    document.getElementById('tmpl-driver-type').value = 'both';
    openModal('template-modal');
  });

  function editTemplate(id, allTemplates) {
    var tmpl = allTemplates.find(function(t) { return t.id == id; });
    if (!tmpl) return;
    editingTemplateId = id;
    document.getElementById('template-modal-title').textContent = 'Edit Template';
    document.getElementById('tmpl-name').value = tmpl.name;
    document.getElementById('tmpl-message').value = tmpl.message;
    document.getElementById('tmpl-driver-type').value = tmpl.driver_type || 'both';
    openModal('template-modal');
  }

  document.getElementById('template-save-btn').addEventListener('click', function() {
    var name = document.getElementById('tmpl-name').value.trim();
    var message = document.getElementById('tmpl-message').value.trim();
    if (!name || !message) { showToast('Name and message are required', true); return; }

    var payload = {
      name: name,
      message: message,
      driver_type: document.getElementById('tmpl-driver-type').value
    };

    var op = editingTemplateId
      ? sb.from('sms_templates').update(payload).eq('id', editingTemplateId)
      : sb.from('sms_templates').insert([payload]);

    op.then(function(res) {
      if (res.error) { showToast('Error: ' + res.error.message, true); return; }
      showToast(editingTemplateId ? 'Template updated!' : 'Template added!');
      closeModal('template-modal');
      loadSmsTemplates();
      loadTemplatesForPicker();
    });
  });

  function deleteTemplate(id) {
    if (!confirm('Delete this template?')) return;
    sb.from('sms_templates').delete().eq('id', id).then(function(res) {
      if (res.error) { showToast('Error: ' + res.error.message, true); return; }
      showToast('Template deleted!');
      loadSmsTemplates();
      loadTemplatesForPicker();
    });
  }

  // ──────────────────────────────────────────────────────────────
  // DOCUMENTS
  // ──────────────────────────────────────────────────────────────
  function loadDocuments() {
    var wrap = document.getElementById('doc-list-wrap');
    wrap.innerHTML = '<p class="loading">Loading…</p>';

    sb.from('documents')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function(res) {
        if (res.error || !res.data || res.data.length === 0) {
          wrap.innerHTML = '<p class="empty-state">No documents yet.</p>';
          return;
        }
        var html = '<div class="doc-list">';
        res.data.forEach(function(doc) {
          html += '<div class="doc-item">';
          html += '<div class="doc-info">';
          html += '<div class="doc-name">' + esc(doc.name) + '</div>';
          html += '<div class="doc-meta">' + formatDriverType(doc.driver_type || '') + (doc.description ? ' — ' + esc(doc.description) : '') + '</div>';
          html += '</div>';
          html += '<div class="doc-actions">';
          html += '<button class="btn btn-sm btn-secondary copy-doc-btn" data-url="' + esc(doc.url || '') + '">Copy Link</button>';
          html += '<button class="btn btn-sm btn-danger delete-doc-btn" data-id="' + doc.id + '">Delete</button>';
          html += '</div></div>';
        });
        html += '</div>';
        wrap.innerHTML = html;

        wrap.querySelectorAll('.copy-doc-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var url = this.getAttribute('data-url');
            navigator.clipboard.writeText(url).then(function() {
              showToast('Link copied!');
            });
          });
        });
        wrap.querySelectorAll('.delete-doc-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            deleteDocument(this.getAttribute('data-id'));
          });
        });
      });
  }

  document.getElementById('doc-add-btn').addEventListener('click', function() {
    var name = document.getElementById('doc-name').value.trim();
    var url = document.getElementById('doc-url').value.trim();
    if (!name) { showToast('Name is required', true); return; }
    if (!url) { showToast('URL is required', true); return; }

    var payload = {
      name: name,
      url: url,
      driver_type: document.getElementById('doc-driver-type').value,
      description: document.getElementById('doc-description').value.trim()
    };

    sb.from('documents').insert([payload]).then(function(res) {
      if (res.error) { showToast('Error: ' + res.error.message, true); return; }
      showToast('Document added!');
      document.getElementById('doc-name').value = '';
      document.getElementById('doc-url').value = '';
      document.getElementById('doc-description').value = '';
      loadDocuments();
    });
  });

  function deleteDocument(id) {
    if (!confirm('Delete this document?')) return;
    sb.from('documents').delete().eq('id', id).then(function(res) {
      if (res.error) { showToast('Error: ' + res.error.message, true); return; }
      showToast('Document deleted!');
      loadDocuments();
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function badgeHtml(status) {
    var s = status || 'applied';
    return '<span class="badge badge-' + esc(s) + '">' + esc(s.replace('_', ' ')) + '</span>';
  }

  function formatDriverType(type) {
    if (type === 'company') return 'Company Driver';
    if (type === 'owner_operator') return 'Owner Operator';
    if (type === 'both') return 'Both';
    return type || '';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ──────────────────────────────────────────────────────────────
  // Boot — load dashboard on start
  // ──────────────────────────────────────────────────────────────
  loadDashboard();

});
