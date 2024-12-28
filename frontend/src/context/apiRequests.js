import axios from 'axios';

const BASE_URL = "http://192.168.0.132:5000";

export const sendMovement = async (dx, dy) => {
  try {
    const response = await axios.post(`${BASE_URL}/move`, { dx, dy });
    console.log("Movement response:", response.data);
  } catch (error) {
    console.error("Error sending motion data:", error);
  }
};

export const sendScroll = async (dy) => {
  try {
    const response = await axios.post(`${BASE_URL}/scroll`, { dy });
    console.log("Scroll response:", response.data);
  } catch (error) {
    console.error("Error sending scroll data:", error);
  }
};

export const sendClick = async (button) => {
  try {
    const response = await axios.post(`${BASE_URL}/click`, { button });
    console.log(`Click response:`, response.data);
  } catch (error) {
    console.error(`Error sending ${button} click:`, error);
  }
};

export const sendButtonAction = async (action) => {
  try {
    const response = await axios.post(`${BASE_URL}/action`, { action });
    console.log("Action response:", response.data);
  } catch (error) {
    console.error('Error sending button action:', error);
  }
};

export const sendSearchQuery = async (query, visibleContentId) => {
  try {
    const response = await axios.post(`${BASE_URL}/search`, { query, visibleContentId });
    console.log("Search response:", response.data);
  } catch (error) {
    console.error('Error sending search query:', error);
  }
};
