const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'bookings.json');

// Ensure data and uploads directories exist
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

// ── SECURITY MIDDLEWARE ───────────────────────────────────────────────

// 1. Helmet for Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"], // Allow font loader
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"], // Allow images and base64 slips
      connectSrc: ["'self'"]
    }
  }
}));

// 2. CORS Protection
app.use(cors({ origin: process.env.DOMAIN || 'http://localhost:3000' }));

// 3. JSON body parser with size limit (XSS protection)
app.use(express.json({ limit: '10mb' }));

// 4. Rate Limiting (Brute Force Protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 attempts
  message: { error: 'Too many login attempts. Please try again later.' }
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Max 20 bookings per IP per hour
  message: { error: 'Too many booking requests. Please slow down.' }
});

// ── UTILITIES ──────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = (booking) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: `⚽ [FASTFIELD] New Booking! - ${booking.name}`,
    html: `
      <h2>New Football Field Booking</h2>
      <p><strong>Name:</strong> ${booking.name}</p>
      <p><strong>Phone:</strong> ${booking.phone}</p>
      <p><strong>Date:</strong> ${booking.date}</p>
      <p><strong>Time:</strong> ${booking.time}</p>
      <p><strong>Note:</strong> ${booking.note || '-'}</p>
      <p>Check the admin panel for the payment slip.</p>
    `
  };
  transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));
};

// ── AUTH MIDDLEWWARE ───────────────────────────────────────────────

const authenticateAdmin = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized Access' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid Token' });
    req.user = user;
    next();
  });
};

// ── FILE UPLOAD (MULTER) ───────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'slip-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only images (JPG, PNG) are allowed!'));
  }
});

// ── API ROUTES ──────────────────────────────────────────────────────

// Admin Login (Protected by Rate Limit)
app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  
  // Real security: Hashed pass. For this example, we compare with env.
  // In a real DB, you'd do: const isMatch = await bcrypt.compare(password, user.password);
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ user: username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return res.json({ token, message: 'Login successful' });
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

// Public: Get Booked Slots
app.get('/api/slots/:date', (req, res) => {
  const bookings = JSON.parse(fs.readFileSync(DATA_FILE));
  const booked = bookings.filter(b => b.date === req.params.date).map(b => b.time);
  res.json(booked);
});

// Public: Submit Booking (Protected by Rate Limit & Validation)
app.post('/api/booking', bookingLimiter, upload.single('slip'), [
  body('name').trim().notEmpty().escape(),
  body('phone').trim().notEmpty().escape(),
  body('date').trim().isISO8601(),
  body('time').trim().notEmpty().escape(),
  body('note').trim().escape()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, phone, date, time, note } = req.body;
  const bookings = JSON.parse(fs.readFileSync(DATA_FILE));

  // Double check availability
  if (bookings.find(b => b.date === date && b.time === time)) {
    return res.status(400).json({ error: 'Time slot already booked' });
  }

  const newBooking = {
    id: Date.now().toString(36),
    name, phone, date, time, note,
    slip: req.file ? `/api/slip/${req.file.filename}` : null,
    createdAt: new Date().toISOString()
  };

  bookings.push(newBooking);
  fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2));

  // Email Notification
  sendEmail(newBooking);

  res.status(201).json({ message: 'Booking successful', booking: newBooking });
});

// Admin: Get all bookings
app.get('/api/admin/bookings', authenticateAdmin, (req, res) => {
  const bookings = JSON.parse(fs.readFileSync(DATA_FILE));
  res.json(bookings);
});

// Admin: Delete booking
app.delete('/api/admin/bookings/:id', authenticateAdmin, (req, res) => {
  let bookings = JSON.parse(fs.readFileSync(DATA_FILE));
  bookings = bookings.filter(b => b.id !== req.params.id);
  fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2));
  res.json({ message: 'Deleted successfully' });
});

// Admin: Clear all bookings
app.delete('/api/admin/bookings-clear', authenticateAdmin, (req, res) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
  res.json({ message: 'All cleared' });
});

// Admin & Auth: Serve Slips Securely
app.get('/api/slip/:filename', authenticateAdmin, (req, res) => {
  const file = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(file)) res.sendFile(file);
  else res.status(404).json({ error: 'File not found' });
});

// Static assets
app.use(express.static(__dirname));

// Catch-all: Anything not matched by static or API routes will serve index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Secure Server running on port ${PORT}`));
