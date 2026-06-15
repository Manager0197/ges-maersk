import React from 'react';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import BLTable from './pages/BLTable';
import Virements from './pages/Virements';
import Dettes from './pages/Dettes';
import ActivityLog from './pages/ActivityLog';
import { BLProvider } from './context/BLContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BLProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="bls" element={<BLTable />} />
                  <Route path="virements" element={<Virements />} />
                  <Route path="dettes" element={<Dettes />} />
                  <Route path="activities" element={<ActivityLog />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </BLProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

