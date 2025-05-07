import axios from 'axios';

const instance = axios.create({
  // baseURL: 'https://ai-video-generator-server.vercel.app/api'
  // baseURL: 'http://localhost:8080/api'
  baseURL: 'http://18.212.38.93:8080/api'
});

// Interceptor to attach token
instance.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default instance;
