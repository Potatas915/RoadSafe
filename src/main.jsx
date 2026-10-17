import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import App from './App.jsx'
import { loadPoliceStations } from './services/policeStations.js'
import { loadMedicalStations } from './services/medicalStations.js'

// Warm browser caches without blocking the application. Deploy can retry failures.
void Promise.allSettled([loadPoliceStations({ nationwide: true }), loadMedicalStations({ nationwide: true })])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
