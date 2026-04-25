import { useEffect } from 'preact/hooks';
import { Sidebar } from './components/Sidebar.jsx';
import { Editor } from './components/Editor.jsx';
import { Modal } from './components/Modal.jsx';
import { load, selected } from './store/programmes.js';

export function App() {
    useEffect(() => { load(); }, []);

    return (
        <div class="layout">
            <Sidebar />
            <main class="main">
                {selected.value
                    ? <Editor prog={selected.value} />
                    : <div class="empty-state"><p>Select a programme or create a new one.</p></div>
                }
            </main>
            <Modal />
        </div>
    );
}
