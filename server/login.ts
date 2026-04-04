import bcrypt from 'bcryptjs';
import session from 'express-session';
import express from 'express';

// Fake database with one hardcoded user
// Password is "secret123" - hash generated with: await bcrypt.hash('secret123', 10)
const users = new Map([
  ['alice', '$2b$10$zehfeaWayx2wSigq8pj6uuH8bNC6D65rH.E1ACThZS0AkLhdjG7s6']
// '$2a$10$zYwXz8XqI5OQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi']
]);

export function setupLoginApi(app) {
  app.use(express.json());
  app.use(session({ // Session middleware (stores session ID in cookie)
    secret: 'change-this-to-a-random-string-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,    // Prevents XSS access to cookie
      secure: false,     // Set to true if using HTTPS
      maxAge: 30 // 1000 * 60 * 60 * 24 // 24 hours
    }
  }));

  app.post('/api/login', async (req, res) => {
    console.log(req.body);
    const { username, password } = req.body;
    const hash = users.get(username);
    console.log(await bcrypt.hash('secret123',0));

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

  app.get('/api/me', (req, res) => {  // Check auth status
    if (req.session.userId) {
      res.json({ user: req.session.userId });
    } else {
      res.status(401).json({ error: 'Not logged in' });
    }
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
}
