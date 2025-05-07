// authActions.js
import axiosInstance from '../axiosInstance';

export const loginUser = (userData) => async (dispatch) => {
  try {
    // Using the axios instance for consistent API calls
    const response = await axiosInstance.post('/auth/login', userData);
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