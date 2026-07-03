import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// NOTE: StrictMode's double-mount tears down the MapLibre instance before its
// style finishes loading (dev-only). We render without it to keep map init stable;
// this has no effect on production behaviour.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
