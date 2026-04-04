import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

import sps_logo from './assets/secure polling.svg';
import './style.css';

export function App() {
  return (
    <div>
      <a href="https://securepollingsystem.org" target="_blank">
        <img src={sps_logo} alt="Secure Polling System" height="160" width="160" />
      </a>
      <h1>Manage counting and collating data from an SPS central server</h1>
      <Login />
      <Logout />
      <GetInfo
      url={"http://localhost:8994/info" /* window.location.href+"info" */}
      />
      <section>
        <Resource
          title="Learn Preact"
          description="If you're new to Preact, try the interactive tutorial to learn important concepts"
          href="https://preactjs.com/tutorial"
        />
        <Resource
          title="Differences to React"
          description="If you're coming from React, you may want to check out our docs to see where Preact differs"
          href="https://preactjs.com/guide/v10/differences-to-react"
        />
        <Resource
          title="Learn Vite"
          description="To learn more about Vite and how you can customize it to fit your needs, take a look at their excellent documentation"
          href="https://vitejs.dev"
        />
      </section>
    </div>
  );
}

function GetIpv4(props) {
  const [ipv4, setIpv4] = useState(['unset']);
  //const ipaddress = fetch('/ipv4').catch((e) => { console.log(e); });

  useEffect(() => {
    fetch(`http://stemgrid.org:8994/ipv4`)
      .then((res) => {
        res.json().then( (j) => {
          setIpv4( j["message"]);
        });
      });
  }, []);
  return (<h2>{ipv4}</h2>);
}

function GetInfo(props) {
  const [value, setValue] = useState(['unser']);

  useEffect(() => {
    fetch(props.url)
      .then((res) => {
        res.json().then( (j) => {
          setValue(j);
        });
      });
  }, []);
  return (
    <div>
    {Object.entries(value).map( ([key, keyVal]) => (
      (<h2>{key}: {keyVal}</h2>)
    ))}
    </div>
  );
}

function Resource(props) {
  return (
    <a href={props.href} target="_blank" class="resource">
      <h2>{props.title}</h2>
      <p>{props.description}</p>
    </a>
  );
}

function Login(props) {
  return (
  <div id="login-box">
    <h3>Login</h3>
    <div id="error" class="error"></div>
    <input type="text" id="user" placeholder="Username (alice)" autocomplete="username" />
    <input type="password" id="pass" placeholder="Password (secret123)" autocomplete="current-password" />
    <button onClick={login}>Sign In</button>
  </div>
  );
}

function Logout(props) {
  return (
  <div id="app-box" class="hidden">
    <p>Welcome, <strong id="username"></strong></p>
    <button onClick={logout}>Logout</button>
  </div>
  );
}

async function login() {
  const username = document.getElementById('user').value;
  const password = document.getElementById('pass').value;

  try {
    const res = await fetch('http://localhost:8994/api/login', {
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
    document.getElementById('error').textContent = e.toString;
  }
}

async function logout() {
  await fetch('http://localhost:8994/api/logout', {method: 'POST'});
  document.getElementById('login-box').classList.remove('hidden');
  document.getElementById('app-box').classList.add('hidden');
}

async function showApp() {
  const res = await fetch('http://localhost:8994/api/me');
  if (res.ok) {
    const data = await res.json();
    document.getElementById('username').textContent = data.user;
    document.getElementById('login-box').classList.add('hidden');
    //document.getElementById('app-box').classList.remove('hidden');
  }
}

render(<App />, document.getElementById('app'));
