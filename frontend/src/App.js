import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import VideoGallery from './components/VideoGallery';
import Login from './components/Login';
import Register from './components/Register';
import { useNavigate } from 'react-router-dom';

function App() {
  const navigate = useNavigate();
  useEffect(()=>{
    const token = sessionStorage.getItem('token') || null;
  
    if (!token) {
      navigate('/');
      return;
    }

    navigate('/VideoGallery');
  }, []);
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Register />} />
      <Route path="/VideoGallery" element={<VideoGallery />} />
    </Routes>
  );
}

export default App;
