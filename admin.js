/* ════════════════════════════════════════════════
   FASTFIELD — Secure Admin Dashboard Logic (JWT)
   ════════════════════════════════════════════════ */

(() => {
  'use strict';

  const STORAGE_TOKEN_KEY = 'fastfield_admin_token';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const adminLoginGate = $('#admin-login-gate');
  const adminDashboard = $('#admin-dashboard');
  const adminLoginForm = $('#admin-login-form');
  const adminUsername = $('#admin-username');
  const adminPassword = $('#admin-password');
  const togglePasswordBtn = $('#toggle-password');
  const adminLogoutBtn = $('#admin-logout-btn');
  const adminGrid = $('#admin-grid');
  const adminEmpty = $('#admin-empty');
  const adminSearch = $('#admin-search');
  const adminDateFilter = $('#admin-date-filter');
  const clearAllBtn = $('#clear-all-btn');
  const exportBookingsBtn = $('#export-bookings-btn');
  const exportCustomersBtn = $('#export-customers-btn');
  const customerSearch = $('#customer-search');
  const customerTableBody = $('#customer-table-body');
  const customerEmpty = $('#customer-empty');
  const slipModal = $('#slip-modal');
  const slipModalClose = $('#slip-modal-close');
  const slipViewerImg = $('#slip-viewer-img');
  const customerDetailModal = $('#customer-detail-modal');
  const customerDetailClose = $('#customer-detail-close');

  /* ── API Helpers ───────────────────────────── */
  function getToken() { return sessionStorage.getItem(STORAGE_TOKEN_KEY); }
  function setToken(token) { sessionStorage.setItem(STORAGE_TOKEN_KEY, token); }
  function removeToken() { sessionStorage.removeItem(STORAGE_TOKEN_KEY); }

  async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });

    // Auto logout if unauthorized
    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error('Session expired. Please login again.');
    }

    return res;
  }

  /* ── UI Helpers ────────────────────────────── */
  function formatDateDetail(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }); }
  function formatDateSimple(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function getInitials(name) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function showToast(message, type = 'success') {
    let container = $('.toast-container');
    if (!container) { container = document.createElement('div'); container.className = 'toast-container'; document.body.appendChild(container); }
    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="material-symbols-outlined">${icons[type]}</span>${escapeHtml(message)}`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('hide'), 3200);
    setTimeout(() => toast.remove(), 3600);
  }

  /* ═══════════ LOGIN ═══════════ */
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = adminUsername.value.trim();
    const password = adminPassword.value;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Login failed');

      setToken(data.token);
      showDashboard();
      showToast('Authentication Successful', 'success');
    } catch (err) {
      showToast(err.message, 'error');
      adminPassword.classList.add('error');
      setTimeout(() => adminPassword.classList.remove('error'), 2000);
    }
  });

  togglePasswordBtn.addEventListener('click', () => {
    const isP = adminPassword.type === 'password';
    adminPassword.type = isP ? 'text' : 'password';
    togglePasswordBtn.querySelector('.material-symbols-outlined').textContent = isP ? 'visibility_off' : 'visibility';
  });

  function showDashboard() {
    adminLoginGate.style.display = 'none';
    adminDashboard.style.display = 'block';
    adminUsername.value = '';
    adminPassword.value = '';
    refreshData();
  }

  function logout() {
    removeToken();
    adminDashboard.style.display = 'none';
    adminLoginGate.style.display = '';
  }

  adminLogoutBtn.addEventListener('click', logout);

  /* ═══════════ DATA MANAGEMENT ═══════════ */
  let allBookings = [];

  async function refreshData() {
    try {
      const res = await apiFetch('/api/admin/bookings');
      allBookings = await res.json();
      updateStats();
      renderBookings();
      renderCustomers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function updateStats() {
    const td = todayISO();
    $('#stat-total-bookings').textContent = allBookings.length;
    $('#stat-total-customers').textContent = new Set(allBookings.map(b => b.phone)).size;
    $('#stat-today-bookings').textContent = allBookings.filter(b => b.date === td).length;

    // Simple weekly count
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    $('#stat-this-week').textContent = allBookings.filter(b => new Date(b.date) >= weekAgo).length;
  }

  /* ═══════════ TABS ═══════════ */
  $$('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(t => t.classList.remove('active'));
      $$('.admin-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $(`#tab-content-${tab.dataset.tab}`).classList.add('active');
    });
  });

  /* ═══════════ BOOKINGS ═══════════ */
  function renderBookings() {
    const search = adminSearch.value.toLowerCase();
    const dateFilter = adminDateFilter.value;

    let filtered = allBookings.filter(b =>
      (b.name.toLowerCase().includes(search) || b.phone.includes(search)) &&
      (!dateFilter || b.date === dateFilter)
    );

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    adminGrid.innerHTML = '';

    if (!filtered.length) { adminEmpty.style.display = 'block'; adminGrid.style.display = 'none'; return; }
    adminEmpty.style.display = 'none'; adminGrid.style.display = '';

    filtered.forEach(b => {
      const card = document.createElement('div'); card.className = 'admin-card';
      card.innerHTML = `
        <div class="admin-card-header">
          <h4><span class="material-symbols-outlined">person</span> ${escapeHtml(b.name)}</h4>
          <span class="admin-card-badge">Verified</span>
        </div>
        <div class="admin-card-body">
          <div class="admin-row"><span class="admin-row-label">Phone</span><span class="admin-row-value">${escapeHtml(b.phone)}</span></div>
          <div class="admin-row"><span class="admin-row-label">Date</span><span class="admin-row-value">${formatDateDetail(b.date)}</span></div>
          <div class="admin-row"><span class="admin-row-label">Time</span><span class="admin-row-value">${b.time}</span></div>
          ${b.note ? `<div class="admin-note"><div class="admin-note-text">${escapeHtml(b.note)}</div></div>` : ''}
        </div>
        <div class="admin-card-footer">
          <button class="btn-view-slip" data-slip="${b.slip}"><span class="material-symbols-outlined">image</span> Slip</button>
          <button class="btn-delete-booking" data-id="${b.id}"><span class="material-symbols-outlined">delete</span></button>
        </div>`;
      adminGrid.appendChild(card);
    });

    $$('.btn-view-slip').forEach(btn => btn.addEventListener('click', async () => {
      try {
        const res = await apiFetch(btn.dataset.slip);
        if (!res.ok) throw new Error('Could not load slip');
        const blob = await res.blob();
        slipViewerImg.src = URL.createObjectURL(blob);
        slipModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      } catch (err) { showToast(err.message, 'error'); }
    }));

    $$('.btn-delete-booking').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Delete this booking?')) return;
      try {
        await apiFetch(`/api/admin/bookings/${btn.dataset.id}`, { method: 'DELETE' });
        refreshData();
        showToast('Booking removed');
      } catch (err) { showToast(err.message, 'error'); }
    }));
  }

  adminSearch.addEventListener('input', renderBookings);
  adminDateFilter.addEventListener('change', renderBookings);

  clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Delete ALL bookings? This cannot be undone.')) return;
    try {
      await apiFetch('/api/admin/bookings-clear', { method: 'DELETE' });
      refreshData();
      showToast('All bookings cleared');
    } catch (err) { showToast(err.message, 'error'); }
  });

  /* ═══════════ SLIP MODAL ═══════════ */
  slipModalClose.addEventListener('click', () => { slipModal.classList.remove('active'); document.body.style.overflow = ''; });

  /* ═══════════ CUSTOMERS ═══════════ */
  function renderCustomers() {
    const search = customerSearch.value.toLowerCase();
    const map = {};
    allBookings.forEach(b => {
      if (!map[b.phone]) map[b.phone] = { name: b.name, phone: b.phone, bookings: [], last: b.createdAt };
      map[b.phone].bookings.push(b);
      if (new Date(b.createdAt) > new Date(map[b.phone].last)) { map[b.phone].last = b.createdAt; map[b.phone].name = b.name; }
    });

    const customers = Object.values(map).filter(c => c.name.toLowerCase().includes(search) || c.phone.includes(search));
    customerTableBody.innerHTML = '';

    if (!customers.length) { customerEmpty.style.display = 'block'; $('.admin-table-wrap').style.display = 'none'; return; }
    customerEmpty.style.display = 'none'; $('.admin-table-wrap').style.display = '';

    customers.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td><div class="customer-name-cell"><span class="customer-mini-avatar">${getInitials(c.name)}</span>${escapeHtml(c.name)}</div></td><td>${escapeHtml(c.phone)}</td><td><span class="customer-booking-count">${c.bookings.length}</span></td><td>${formatDateSimple(c.bookings[0].date)}</td><td><button class="btn-view-customer" data-phone="${c.phone}"><span class="material-symbols-outlined">visibility</span></button></td>`;
      customerTableBody.appendChild(tr);
    });

    $$('.btn-view-customer').forEach(btn => btn.addEventListener('click', () => {
      const c = map[btn.dataset.phone];
      $('#customer-avatar').textContent = getInitials(c.name);
      $('#customer-detail-name').textContent = c.name;
      $('#customer-detail-phone').textContent = c.phone;
      $('#cd-total-bookings').textContent = c.bookings.length;
      const list = $('#cd-history-list'); list.innerHTML = '';
      c.bookings.forEach(bk => list.innerHTML += `<div class="cd-history-item"><span>${formatDateSimple(bk.date)}</span><span>${bk.time}</span></div>`);
      customerDetailModal.classList.add('active');
    }));
  }

  customerSearch.addEventListener('input', renderCustomers);
  customerDetailClose.addEventListener('click', () => customerDetailModal.classList.remove('active'));

  /* ═══════════ CSV EXPORT ═══════════ */
  function downloadCSV(name, csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }

  exportBookingsBtn.addEventListener('click', () => {
    if (!allBookings.length) return;
    const csv = 'Name,Phone,Date,Time,Created\n' + allBookings.map(x => `"${x.name}","${x.phone}","${x.date}","${x.time}","${x.createdAt}"`).join('\n');
    downloadCSV('bookings.csv', csv);
  });

  // Check login state on load
  if (getToken()) showDashboard();

})();
