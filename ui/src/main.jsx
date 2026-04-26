import { render } from 'preact';
import { App } from './app.jsx';
import { JoinPage } from './pages/JoinPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import './style.css';

const path = window.location.pathname;
const joinMatch = path.match(/^\/join\/([^/]+)/);

let root;
if (joinMatch) {
    root = <JoinPage channelId={joinMatch[1]} />;
} else if (path === '/register') {
    root = <RegisterPage />;
} else {
    root = <App />;
}

render(root, document.getElementById('app'));
