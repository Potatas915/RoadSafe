# RoadSafe Admin (React)

Admin command center for the Web and Mobile-Based Road Accident Reporting System.

## Run
```
npm install
npm run dev
```
Build for production: `npm run build`

## Stack
React 18, Vite, Tailwind CSS 3, Chart.js (react-chartjs-2), Font Awesome.

## Structure
- `src/App.jsx` – view switching and report modal state
- `src/components/` – Sidebar, TopBar, MapView, DashboardView, ReportsView, OfficersView, AnalyticsView, ReportModal
- `src/data/mock.js` – sample reports and officers (replace with your API calls)
