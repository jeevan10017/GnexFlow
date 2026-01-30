import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom"; 
import React, { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { AppProvider, useApi } from "./context/AppContext";
import Profile from "./pages/Profile";
import CanvasPage from "./pages/CanvasPage";
import Login from "./pages/Login";
import Register from "./pages/Register";
import GuestDashboard from "./pages/GuestDashboard"; 
import ProtectedRoute from "./components/ProtectedRoute";
import { ServerStatusProvider, useServerStatus } from './context/ServerStatusContext';
import ServerWakeupModal from './components/ServerWakeupModal';
import { setupResponseInterceptor } from './api/apiClient'; 
import apiClient from "./api/apiClient";

const AppInterceptors = () => {
  const { startWakeupProcess } = useServerStatus();
  useEffect(() => {
    setupResponseInterceptor(startWakeupProcess);
  }, [startWakeupProcess]);
  return null;
};

function AppContent() {
  const { isAuthenticated } = useApi();
  const { isWakingUp, countdown } = useServerStatus();
  const location = useLocation(); 

  useEffect(() => {
    const isGuestRoute = location.pathname === '/guest' || (location.pathname === '/' && !isAuthenticated);

    if (!isGuestRoute) {
      const checkServerStatus = async () => {
        try {
          console.log("Pinging server to check status...");
          await apiClient.get('/api/health');
          console.log("Server is awake and ready.");
        } catch (error) {
          if (error.config?._isRetry) {
            console.error("Failed to connect to the server after the wakeup attempt.", error);
          }
        }
      };
      checkServerStatus();
    } else {
      console.log("On a guest route, skipping initial server health check.");
    }
  }, [location.pathname, isAuthenticated]); // 👈 4. UPDATE DEPENDENCIES

  return (
    <>
      <ServerWakeupModal isWakingUp={isWakingUp} countdown={countdown} />
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            ) : (
              <GuestDashboard />
            )
          }
        />
        <Route
          path="/canvas/:id"
          element={
            <ProtectedRoute>
              <CanvasPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/guest"
          element={isAuthenticated ? <Navigate to="/" /> : <GuestDashboard />}
        />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppProvider>
        <ServerStatusProvider>
          <AppInterceptors />
          <Analytics />
          <AppContent />
        </ServerStatusProvider>
      </AppProvider>
    </Router>
  );
}

export default App;