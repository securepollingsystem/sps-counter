<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Login</title>
  <style>
    body { font-family: system-ui; max-width: 300px; margin: 50px auto; }
    input, button { width: 100%; padding: 10px; margin: 5px 0; box-sizing: border-box; }
    .hidden { display: none; }
    .error { color: #d32f2f; font-size: 14px; }
  </style>
</head>
<body>

<div id="login-box">
  <h3>Login</h3>
  <div id="error" class="error"></div>
  <input type="text" id="user" placeholder="Username (alice)" autocomplete="username">
  <input type="password" id="pass" placeholder="Password (secret123)" autocomplete="current-password">
  <button onclick="login()">Sign In</button>
</div>

<div id="app-box" class="hidden">
  <p>Welcome, <strong id="username"></strong></p>
  <button onclick="logout()">Logout</button>
</div>

<script>
async function login() {
  const username = document.getElementById('user').value;
  const password = document.getElementById('pass').value;
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password})
    });
    
    if (res.ok) {
      showApp();
    } else {
      document.getElementById('error').textContent = 'Invalid username or password';
    }
  } catch (e) {
    document.getElementById('error').textContent = 'Network error';
  }
}

async function logout() {
  await fetch('/api/logout', {method: 'POST'});
  document.getElementById('login-box').classList.remove('hidden');
  document.getElementById('app-box').classList.add('hidden');
}

async function showApp() {
  const res = await fetch('/api/me');
  if (res.ok) {
    const data = await res.json();
    document.getElementById('username').textContent = data.user;
    document.getElementById('login-box').classList.add('hidden');
    document.getElementById('app-box').classList.remove('hidden');
  }
}

// Check if already logged in when page loads
showApp();
</script>

</body>
</html>