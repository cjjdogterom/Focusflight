import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { useStore } from './store'
import App from './App'
import './index.css'

// offline shell + map-tile cache; a new version applies via reload, but never
// while a flight is on the map — retry until the user is off the flight screen
registerSW({
  immediate: true,
  onNeedReload() {
    const tryReload = () => {
      if (useStore.getState().screen !== 'flying') window.location.reload()
      else window.setTimeout(tryReload, 15_000)
    }
    tryReload()
  },
})

// NOTE: StrictMode's double-mount tears down the MapLibre instance before its
// style finishes loading (dev-only). We render without it to keep map init stable;
// this has no effect on production behaviour.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
