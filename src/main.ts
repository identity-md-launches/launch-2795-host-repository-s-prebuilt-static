import '@fontsource/barlow-condensed/latin-200.css';
import '@fontsource/barlow-condensed/latin-300.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/quicksand/latin-600.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/stage.css';
import './ui/styles/crank.css';
import './ui/styles/editor.css';
import './ui/styles/queue.css';
import './ui/styles/sheet.css';
import { mountApp } from './ui/app';
import { mountOverlay } from './ui/overlay';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

const params = new URLSearchParams(window.location.search);
const sim = params.get('sim') === '1';

if (params.get('overlay') === '1') mountOverlay(root, sim);
else mountApp(root, sim, params.get('renderer') === '2d');
