import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { stationsPlugin } from './server/stations.mjs'

export default defineConfig({ plugins: [react(), stationsPlugin()] })
