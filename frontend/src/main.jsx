import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import '@fontsource-variable/figtree'
import '@fontsource-variable/fraunces'
import './styles/scales.css'
import './index.css'

document.documentElement.className = ''

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
