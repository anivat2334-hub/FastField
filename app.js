/* ════════════════════════════════════════════════
   FASTFIELD — Secure Frontend Logic (Client)
   ════════════════════════════════════════════════ */

(() => {
  'use strict';

  const API_URL = ''; // Same origin
  const TIME_SLOTS = [
    '08:00 – 09:00', '09:00 – 10:00', '10:00 – 11:00',
    '11:00 – 12:00', '12:00 – 13:00', '13:00 – 14:00',
    '14:00 – 15:00', '15:00 – 16:00', '16:00 – 17:00',
    '17:00 – 18:00', '18:00 – 19:00', '19:00 – 20:00',
    '20:00 – 21:00', '21:00 – 22:00',
  ];

  let selectedSlot = null;
  let paymentSlipFile = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const navbar        = $('#navbar');
  const navToggle     = $('#nav-toggle');
  const navLinks      = $('#nav-links');
  const slotDatePicker = $('#slot-date-picker');
  const slotsGrid     = $('#slots-grid');
  const bookingForm   = $('#booking-form');
  const bookingDate   = $('#booking-date');
  const bookingTime   = $('#booking-time');
  const customerName  = $('#customer-name');
  const customerPhone = $('#customer-phone');
  const paymentSlip   = $('#payment-slip');
  const fileZone      = $('#file-upload-zone');
  const uploadContent = $('#upload-content');
  const uploadPreview = $('#upload-preview');
  const previewImg    = $('#preview-img');
  const removeFile    = $('#remove-file');
  const submitBtn     = $('#submit-booking');
  const confModal     = $('#confirmation-modal');
  const confDetails   = $('#confirmation-details');
  const modalCloseBtn = $('#modal-close-btn');

  /* ── API Helpers ───────────────────────────── */
  async function fetchBookedSlots(date) {
    try {
      const res = await fetch(`${API_URL}/api/slots/${date}`);
      return await res.json();
    } catch { return []; }
  }

  /* ── UI Helpers ────────────────────────────── */
  function formatDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }); }
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
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

  /* ── Navbar & Reveal ───────────────────────── */
  window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 60), { passive: true });
  navToggle.addEventListener('click', () => { navToggle.classList.toggle('open'); navLinks.classList.toggle('open'); });
  $$('.nav-link').forEach(link => link.addEventListener('click', () => { navToggle.classList.remove('open'); navLinks.classList.remove('open'); }));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.1 });
  $$('.feature-card, .section-header, .booking-slots-panel, .booking-form-panel').forEach(el => { el.classList.add('reveal'); observer.observe(el); });

  /* ── Slots System ──────────────────────────── */
  slotDatePicker.min = todayISO();
  bookingDate.min = todayISO();

  async function renderSlots(date) {
    if (!date) { slotsGrid.innerHTML = `<div class="slots-placeholder"><span class="material-symbols-outlined">event_available</span><p>Pick a date above to see time slots</p></div>`; return; }
    
    slotsGrid.innerHTML = `<div class="slots-placeholder"><div class="spinner"></div><p>Checking availability...</p></div>`;
    const booked = await fetchBookedSlots(date);
    
    slotsGrid.innerHTML = '';
    TIME_SLOTS.forEach(slot => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'slot-btn'; btn.textContent = slot;
      if (booked.includes(slot)) { btn.classList.add('booked'); btn.disabled = true; }
      else {
        btn.addEventListener('click', () => {
          selectedSlot = slot;
          $$('.slot-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          if (slotDatePicker.value) bookingDate.value = slotDatePicker.value;
          bookingTime.value = slot;
        });
        if (selectedSlot === slot) btn.classList.add('selected');
      }
      slotsGrid.appendChild(btn);
    });
  }

  slotDatePicker.addEventListener('change', (e) => { selectedSlot = null; bookingTime.value = ''; renderSlots(e.target.value); });
  bookingDate.addEventListener('change', (e) => { slotDatePicker.value = e.target.value; selectedSlot = null; bookingTime.value = ''; renderSlots(e.target.value); });

  /* ── File Handling ─────────────────────────── */
  fileZone.addEventListener('click', () => paymentSlip.click());
  fileZone.addEventListener('dragover', (e) => { e.preventDefault(); fileZone.classList.add('dragover'); });
  fileZone.addEventListener('dragleave', () => fileZone.classList.remove('dragover'));
  fileZone.addEventListener('drop', (e) => { e.preventDefault(); fileZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  paymentSlip.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) { showToast('Only image files are allowed', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('File size must be under 5MB', 'error'); return; }
    paymentSlipFile = file;
    const reader = new FileReader();
    reader.onload = (e) => { previewImg.src = e.target.result; uploadContent.style.display = 'none'; uploadPreview.style.display = 'block'; };
    reader.readAsDataURL(file);
  }
  removeFile.addEventListener('click', (e) => { e.stopPropagation(); paymentSlipFile = null; paymentSlip.value = ''; uploadContent.style.display = ''; uploadPreview.style.display = 'none'; });

  /* ── Booking Submission ────────────────────── */
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Simple frontend validation
    const fields = [customerName, customerPhone, bookingDate, bookingTime];
    let valid = true;
    fields.forEach(f => {
      if (!f.value.trim()) { f.classList.add('error'); valid = false; }
      else f.classList.remove('error');
    });
    if (!paymentSlipFile) { $('#slip-error').textContent = 'Please upload payment slip'; valid = false; }
    else $('#slip-error').textContent = '';

    if (!valid) { showToast('Please check all fields', 'error'); return; }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('name', customerName.value.trim());
      formData.append('phone', customerPhone.value.trim());
      formData.append('date', bookingDate.value);
      formData.append('time', bookingTime.value);
      formData.append('note', $('#booking-note').value.trim());
      formData.append('slip', paymentSlipFile);

      const res = await fetch('/api/booking', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Server error');

      showConfirmation(data.booking);
      bookingForm.reset();
      paymentSlipFile = null;
      selectedSlot = null;
      uploadContent.style.display = '';
      uploadPreview.style.display = 'none';
      renderSlots(slotDatePicker.value);
      showToast('Booking success! Notification sent.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  });

  function showConfirmation(b) {
    confDetails.innerHTML = `
      <div class="conf-row"><span class="conf-label">Name</span><span class="conf-value">${escapeHtml(b.name)}</span></div>
      <div class="conf-row"><span class="conf-label">Phone</span><span class="conf-value">${escapeHtml(b.phone)}</span></div>
      <div class="conf-row"><span class="conf-label">Date</span><span class="conf-value">${formatDate(b.date)}</span></div>
      <div class="conf-row"><span class="conf-label">Time</span><span class="conf-value">${b.time}</span></div>
      <p style="font-size: 0.8rem; margin-top: 10px; opacity: 0.7;">An email notification has been sent to the admin.</p>`;
    confModal.classList.add('active');
  }
  
  modalCloseBtn.addEventListener('click', () => confModal.classList.remove('active'));

})();
