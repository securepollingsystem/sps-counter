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
      <GetInfo
      url="http://stemgrid.org:8994/info"
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

render(<App />, document.getElementById('app'));
