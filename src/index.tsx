import { render } from 'preact';

import sps_logo from './assets/secure polling.svg';
import './style.css';

export function App() {
	return (
		<div>
			<a href="https://securepollingsystem.org" target="_blank">
				<img src={sps_logo} alt="Secure Polling System" height="160" width="160" />
			</a>
			<h1>Manage counting and collating data from an SPS central server</h1>
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

function Resource(props) {
	return (
		<a href={props.href} target="_blank" class="resource">
			<h2>{props.title}</h2>
			<p>{props.description}</p>
		</a>
	);
}

render(<App />, document.getElementById('app'));
