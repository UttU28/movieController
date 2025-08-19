import axios from 'axios';

const BASE_URL = `http://${process.env.NEXT_PUBLIC_DEVICE_IP || '192.168.1.167'}:5000`;

// Helper function to check if backend is reachable
export const checkBackendHealth = async () => {
  try {
    // Add cache-busting parameter to prevent caching
    const timestamp = Date.now();
    const response = await fetch(`${BASE_URL}/health?t=${timestamp}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
      signal: AbortSignal.timeout(3000),
    });
    
    // Check if response is actually valid
    if (response.ok) {
      try {
        const data = await response.json();
        return data.status === 'healthy';
      } catch (parseError) {
        console.error('Failed to parse health response:', parseError);
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
};

// Connection status callback for real-time monitoring
let connectionStatusCallback = null;

export const setConnectionStatusCallback = (callback) => {
  connectionStatusCallback = callback;
};

// Helper to update connection status from API calls
const updateConnectionStatus = (isConnected) => {
  if (connectionStatusCallback) {
    connectionStatusCallback(isConnected);
  }
};



export const sendMovement = async (dx, dy) => {
  try {
    const response = await axios.post(`${BASE_URL}/move`, { dx, dy });
    console.log("Movement response:", response.data);
    updateConnectionStatus(true); // Success - backend is connected
  } catch (error) {
    console.error("Error sending motion data:", error);
    updateConnectionStatus(false); // Failed - backend is disconnected
  }
};

export const sendScroll = async (dy) => {
  try {
    const response = await axios.post(`${BASE_URL}/scroll`, { dy });
    console.log("Scroll response:", response.data);
    updateConnectionStatus(true);
  } catch (error) {
    console.error("Error sending scroll data:", error);
    updateConnectionStatus(false);
  }
};

export const sendClick = async (button) => {
  try {
    const response = await axios.post(`${BASE_URL}/click`, { button });
    console.log(`Click response:`, response.data);
    updateConnectionStatus(true);
  } catch (error) {
    console.error(`Error sending ${button} click:`, error);
    updateConnectionStatus(false);
  }
};

export const sendButtonAction = async (action) => {
  try {
    const response = await axios.post(`${BASE_URL}/action`, { action });
    console.log("Action response:", response.data);
    updateConnectionStatus(true);
  } catch (error) {
    console.error('Error sending button action:', error);
    updateConnectionStatus(false);
  }
};

export const sendSearchQuery = async (query, visibleContentId) => {
  try {
    const response = await axios.post(`${BASE_URL}/search`, { query, visibleContentId });
    console.log("Search response:", response.data);
    updateConnectionStatus(true);
  } catch (error) {
    console.error('Error sending search query:', error);
    updateConnectionStatus(false);
  }
};
