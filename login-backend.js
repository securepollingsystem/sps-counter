const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static('public')); // Serve the HTML

// Session middleware (stores session ID in cookie)
app.use(session({
  secret: 'change-this-to-a-random-string-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    httpOnly: true,    // Prevents XSS access to cookie
    secure: false,     // Set to true if using HTTPS
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));

// Fake database with one hardcoded user
// Password is "secret123" - hash generated with: await bcrypt.hash('secret123', 10)
const users = new Map([
  ['alice', '$2a$10$zYwXz8XqI5OQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'] 
]);

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const hash = users.get(username);
  
  if (!hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // bcrypt.compare extracts the salt from the stored hash automatically
  const valid = await bcrypt.compare(password, hash);
  
  if (valid) {
    req.session.userId = username;
    res.json({ username });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Check auth status
app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ user: req.session.userId });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('connect.sid');
  res.json({ success: true });
});

app.listen(3000, () => {
  console.log('Server: http://localhost:3000');
  console.log('Login with alice / secret123');
});