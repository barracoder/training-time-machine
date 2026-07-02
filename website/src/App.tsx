import { NavLink, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import Trends from './pages/Trends';
import CalendarPage from './pages/CalendarPage';
import Activities from './pages/Activities';
import ActivityDetail from './pages/ActivityDetail';
import HeatmapPage from './pages/HeatmapPage';
import Records from './pages/Records';
import { apiGet } from './api';

interface Athlete {
  first_name?: string;
  last_name?: string;
  city?: string;
}

const NAV = [
  { to: '/', icon: '▦', label: 'Dashboard' },
  { to: '/trends', icon: '↗', label: 'Trends' },
  { to: '/calendar', icon: '▤', label: 'Calendar' },
  { to: '/activities', icon: '≡', label: 'Activities' },
  { to: '/heatmap', icon: '◎', label: 'Heatmap' },
  { to: '/records', icon: '★', label: 'Records' },
];

export default function App() {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  useEffect(() => {
    apiGet<Athlete>('/athlete').then(setAthlete).catch(() => setAthlete(null));
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="bolt">&#9889;</span>
          <span>
            Strava Time Machine
            <small>ride history explorer</small>
          </span>
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <span className="icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-footer">
          {athlete?.first_name ? (
            <>
              {athlete.first_name} {athlete.last_name}
              {athlete.city ? <div>{athlete.city}</div> : null}
            </>
          ) : (
            'Local Strava archive'
          )}
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/activities/:id" element={<ActivityDetail />} />
          <Route path="/heatmap" element={<HeatmapPage />} />
          <Route path="/records" element={<Records />} />
        </Routes>
      </main>
    </div>
  );
}
