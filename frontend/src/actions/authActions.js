// authActions.js
import axios from 'axios';

export const loginUser = (userData) => async (dispatch) => {
  try {
    // const response = await axios.post('https://google-drive-clone-server.vercel.app/api/auth/login', userData);
    const response = await axios.post('http://localhost:8080/api/auth/login', userData);
    const { token } = response.data;

    sessionStorage.setItem('token', token);

    dispatch({ type: 'USER_LOGIN', payload: token });

    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
};

export const logoutUser = () => () => {
    sessionStorage.removeItem('token');
  };
  
