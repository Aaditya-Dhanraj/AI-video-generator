import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import VideoGallery from './components/VideoGallery';
import Login from './components/Login';
import Register from './components/Register';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for token when the app first loads
    const checkAuth = () => {
      const token = sessionStorage.getItem('token');
      const currentPath = location.pathname;
      
      // If we have a token and we're at login or register, redirect to VideoGallery
      if (token) {
        if (currentPath === '/' || currentPath === '/login') {
          navigate('/videoFeed');
        }
      } 
      // If we don't have a token and we're trying to access protected routes
      else if (!token && currentPath === '/videoFeed') {
        navigate('/login');
      }
      
      // Mark as loaded after checking
      setLoading(false);
    };

    checkAuth();
  }, [navigate, location.pathname]);

  // Show a loading indicator while determining route
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="ml-3">Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Register />} />
      <Route path="/videoFeed" element={<VideoGallery />} />
      {/* Catch-all redirect to prevent white screens on invalid routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;