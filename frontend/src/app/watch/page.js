// app/watch/page.js
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Fade, Slide, IconButton } from "@mui/material";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket, faWifi } from '@fortawesome/free-solid-svg-icons';
import { useAppState } from '../../context/AppStateContext';
import { checkBackendHealth, setConnectionStatusCallback, sendButtonAction } from '../../context/apiRequests';
import ButtonGroup from "../../components/ButtonGroup";
import { faBackward, faForward, faPlus, faMinus, faPause, faRotateLeft, faRotateRight, faPlay } from '@fortawesome/free-solid-svg-icons';

export default function WatchPage() {
  const [loaded, setLoaded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [connectionError, setConnectionError] = useState(null);
  const [selectedButton, setSelectedButton] = useState('');
  const [selectedControl, setSelectedControl] = useState('');
  const [scrollDirection, setScrollDirection] = useState('');
  
  // Use ref to track current selectedControl for scroll handler
  const selectedControlRef = useRef('');
  const touchStartRef = useRef(null);

  // Function to handle bezel direction and make API calls
  const handleBezelAction = async (direction) => {
    if (selectedControlRef.current === 'VOLUME') {
      try {
        if (direction === 'LEFT') {
          // Volume LEFT = Increase
          await sendButtonAction('volumeIncrease');
          console.log('VOLUME - Increased (LEFT bezel)');
        } else if (direction === 'RIGHT') {
          // Volume RIGHT = Decrease
          await sendButtonAction('volumeDecrease');
          console.log('VOLUME - Decreased (RIGHT bezel)');
        }
      } catch (error) {
        console.error('Volume control error:', error);
      }
    } else if (selectedControlRef.current === 'SEEK') {
      try {
        if (direction === 'LEFT') {
          // Seek LEFT = Forward
          await sendButtonAction('forwardSeek');
          console.log('SEEK - Forward (LEFT bezel)');
        } else if (direction === 'RIGHT') {
          // Seek RIGHT = Back
          await sendButtonAction('backSeek');
          console.log('SEEK - Back (RIGHT bezel)');
        }
      } catch (error) {
        console.error('Seek control error:', error);
      }
    }
  };

  // Function to handle button selection
  const handleButtonSelect = (buttonName) => {
    setSelectedButton(buttonName);
    
    // Set the selected control type
    if (buttonName === 'volumeControl') {
      setSelectedControl('VOLUME');
      selectedControlRef.current = 'VOLUME';
      setScrollDirection('');
    } else if (buttonName === 'seekControl') {
      setSelectedControl('SEEK');
      selectedControlRef.current = 'SEEK';
      setScrollDirection('');
    } else {
      setSelectedControl('');
      selectedControlRef.current = '';
      setScrollDirection('');
    }
  };

  // Function to handle scroll events for bezel controls
  const handleScroll = useCallback(async (event) => {
    console.log('Scroll event detected:', event.deltaY, 'Selected control:', selectedControlRef.current); // Debug log
    
    if (selectedControlRef.current === 'VOLUME' || selectedControlRef.current === 'SEEK') {
      const delta = event.deltaY;
      console.log(`Current control: ${selectedControlRef.current}, Delta: ${delta}`); // Debug log
      
      if (delta > 0) {
        setScrollDirection('RIGHT');
        await handleBezelAction('RIGHT');
      } else if (delta < 0) {
        setScrollDirection('LEFT');
        await handleBezelAction('LEFT');
      }
    } else {
      console.log('No control selected, ignoring scroll');
    }
  }, []);

  // Function to handle touch events for watch bezel/crown
  const handleTouchStart = useCallback((event) => {
    if (selectedControlRef.current === 'VOLUME' || selectedControlRef.current === 'SEEK') {
      const touch = event.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      console.log('Touch start detected:', touchStartRef.current);
    }
  }, []);

  const handleTouchMove = useCallback(async (event) => {
    if (selectedControlRef.current === 'VOLUME' || selectedControlRef.current === 'SEEK' && touchStartRef.current) {
      event.preventDefault(); // Prevent default scrolling
      const touch = event.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      
      console.log('Touch move detected:', { deltaX, deltaY });
      
      // Use both X and Y movement to detect rotation direction
      const totalDelta = deltaX + deltaY;
      
      if (Math.abs(totalDelta) > 10) { // Threshold to avoid small movements
        if (totalDelta > 0) {
          setScrollDirection('RIGHT');
          await handleBezelAction('RIGHT');
        } else {
          setScrollDirection('LEFT');
          await handleBezelAction('LEFT');
        }
        
        // Reset touch start for next movement
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
    console.log('Touch end detected');
  }, []);

  // Function to handle keyboard events (for watch crown button presses)
  const handleKeyDown = useCallback(async (event) => {
    if (selectedControlRef.current === 'VOLUME' || selectedControlRef.current === 'SEEK') {
      console.log('Key pressed:', event.key, 'Code:', event.code);
      
      // Common watch crown/bezel key mappings
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === '+' || 
          event.code === 'DigitalCrown' || event.code === 'RotaryEncoder') {
        event.preventDefault();
        setScrollDirection('RIGHT');
        await handleBezelAction('RIGHT');
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === '-') {
        event.preventDefault();
        setScrollDirection('LEFT');
        await handleBezelAction('LEFT');
      }
    }
  }, []);

  // Function to handle pointer events (for smartwatch pointer/stylus)
  const handlePointerMove = useCallback(async (event) => {
    if (selectedControlRef.current === 'VOLUME' || selectedControlRef.current === 'SEEK') {
      console.log('Pointer move detected:', event.movementX, event.movementY);
      
      // Detect circular motion for bezel simulation
      const movement = event.movementX + event.movementY;
      if (Math.abs(movement) > 2) {
        if (movement > 0) {
          setScrollDirection('RIGHT');
          await handleBezelAction('RIGHT');
        } else {
          setScrollDirection('LEFT');
          await handleBezelAction('LEFT');
        }
      }
    }
  }, []);

  useEffect(() => {
    setLoaded(true);
    
    console.log('Adding all event listeners for watch controls'); // Debug log
    
    // Add scroll event listener for bezel control (laptop/desktop)
    window.addEventListener('wheel', handleScroll, { passive: false });
    
    // Add touch event listeners for watch bezel/crown
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Add keyboard event listeners for watch crown buttons
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    
    // Add pointer event listeners for smartwatch stylus/pointer
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    
    // Set up connection status callback for real-time monitoring
    setConnectionStatusCallback((isConnected) => {
      if (isConnected && connectionStatus !== 'connected') {
        setConnectionStatus('connected');
        setConnectionError(null);
      } else if (!isConnected && connectionStatus !== 'disconnected') {
        setConnectionStatus('disconnected');
        setConnectionError('Connection lost during operation');
        
        // Start polling when connection is lost during operation
        const pollInterval = setInterval(async () => {
          const reconnected = await checkBackendConnection();
          if (reconnected) {
            clearInterval(pollInterval);
          }
        }, 3000);
        
        // Cleanup after 60 seconds to prevent infinite polling
        setTimeout(() => clearInterval(pollInterval), 60000);
      }
    });
    
    // Function to check backend connection
    const checkBackendConnection = async () => {
      try {
        const isHealthy = await checkBackendHealth();
        if (isHealthy) {
          setConnectionStatus('connected');
          setConnectionError(null);
          return true; // Success
        } else {
          throw new Error('Backend unhealthy');
        }
      } catch (error) {
        console.error('Backend connection failed:', error);
        setConnectionStatus('disconnected');
        setConnectionError(error.message);
        return false; // Failed
      }
    };

    // Initial connection check - just once
    checkBackendConnection();

    // Cleanup all event listeners
    return () => {
      console.log('Removing all event listeners'); // Debug log
      window.removeEventListener('wheel', handleScroll);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [handleScroll, handleTouchStart, handleTouchMove, handleTouchEnd, handleKeyDown, handlePointerMove]); // Depend on all handlers

    // Function to manually trigger reconnection
    const handleManualReconnect = async () => {
        setConnectionStatus('checking');
        await checkBackendConnection();
    };

  // Media Controls Data - Exactly the same as HomeFunctions
  const mediaControls = [
    [
      { 
        name: "previousTrack", 
        icon: faBackward, 
        alias: "PREV",
        iconColor: "var(--accent-info)",
        size: "medium"
      },
      { 
        name: "volumeControl", 
        icon: faRotateLeft, 
        alias: "- VOL +",
        iconColor: "var(--accent-secondary)",
        size: "medium"
      },
      { 
        name: "pause", 
        icon: faPause, 
        alias: "PAUSE",
        iconColor: "white",
        size: "medium"
      },
      { 
        name: "seekControl", 
        icon: faRotateRight, 
        alias: "- SEEK +",
        iconColor: "var(--accent-secondary)",
        size: "medium"
      },
      { 
        name: "nextTrack", 
        icon: faForward, 
        alias: "NEXT",
        iconColor: "var(--accent-info)",
        size: "medium"
      }
    ]
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        padding: { xs: 2, sm: 3, md: 4 },
        maxWidth: '100vw',
      }}
    >
      {/* Header Section */}
      <Fade in={loaded} timeout={1000}>
        <Box
          sx={{
            padding: 2,
            marginBottom: 2,
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Main Title */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 0.5 }}>
                        <FontAwesomeIcon 
                            icon={faRocket} 
                            className="glow pulse"
                            style={{ 
                                color: 'var(--accent-primary)', 
                                fontSize: '1.8rem',
                            }} 
                        />
            <Typography
              variant="h4"
                            className="text-gradient"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.6rem', sm: '2rem', md: '2.3rem' },
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              WATCH CONTROLS
            </Typography>
                        <FontAwesomeIcon 
                            icon={faRocket} 
                            className="glow pulse"
                            style={{ 
                                color: 'var(--accent-secondary)', 
                                fontSize: '1.8rem',
                                transform: 'scaleX(-1)'
                            }} 
                        />
          </Box>

                    {/* Subtitle and Connection Status Row */}
                    <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'end', 
                        alignItems: 'end',
                        width: '100%',
                        px: 1
                    }}>
                        {/* Connection Status - Right Aligned */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box
            sx={{
                                    width: 4,
                                    height: 4,
                                    mb: 0.15,
                                    borderRadius: '50%',
                                    backgroundColor: 
                                        connectionStatus === 'connected' ? 'var(--accent-success)' : 
                                        connectionStatus === 'checking' ? 'var(--accent-info)' : 
                                        'var(--accent-primary)',
                                    animation: 
                                        connectionStatus === 'connected' ? 'none' : 
                                        connectionStatus === 'checking' ? 'pulse 2s infinite' : 
                                        'pulse 1s infinite',
                                    boxShadow: '0 0 0px currentColor',
                                }}
                            />
            <Typography
                                variant="caption"
              sx={{
                                    color: 
                                        connectionStatus === 'connected' ? 'var(--accent-success)' : 
                                        connectionStatus === 'checking' ? 'var(--accent-info)' : 
                                        'var(--accent-primary)',
                                    fontSize: '0.6rem',
                                    fontWeight: 800,
                textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
              }}
            >
                                {connectionStatus === 'connected' ? 'CONNECTED' : 
                                 connectionStatus === 'checking' ? 'CHECKING' : 'DISCONNECTED'}
            </Typography>

                            {/* Manual Reconnect Button for Disconnected State */}
                            {connectionStatus === 'disconnected' && (
              <Box
                                    onClick={handleManualReconnect}
                sx={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        background: 'var(--accent-primary)',
                  cursor: 'pointer',
                                        opacity: 0.8,
                                        transition: 'all 0.2s ease',
                                        ml: 0.5,
                  '&:hover': {
                                            opacity: 1,
                                            transform: 'scale(1.2)',
                                        }
                                    }}
                                />
                            )}
              </Box>
            </Box>
          </Box>
            </Fade>

            {/* Main Content Area */}
            <Slide direction="up" in={loaded} timeout={1200}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Media Controls Section - Exactly the same as HomeFunctions */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <ButtonGroup 
                            buttonData={mediaControls} 
                            whatContainer="watchMediaControls" 
                            title="Media Controls"
                            onButtonSelect={handleButtonSelect}
                        />
                        
                        {/* Selected Button Display */}
                        {(selectedButton || selectedControl) && (
                          <Box sx={{ 
                            textAlign: 'center', 
                            mt: 1,
                            p: 2,
                            borderRadius: 'var(--radius-md)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                          }}>
                            <Typography
                              variant="body2"
                sx={{
                                color: 'var(--accent-secondary)',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                mb: 1
                              }}
                            >
                              {selectedControl ? `Selected: ${selectedControl}` : `Selected: ${selectedButton}`}
                            </Typography>
                            
                                                        {selectedControl && scrollDirection && (
                              <Typography
                                variant="body2"
                                sx={{
                                  color: 'var(--accent-primary)',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                {selectedControl === 'VOLUME' 
                                  ? (scrollDirection === 'LEFT' ? 'Volume UP' : 'Volume DOWN')
                                  : (scrollDirection === 'LEFT' ? 'Seek FORWARD' : 'Seek BACK')
                                }
                              </Typography>
                            )}
                            
                            {selectedControl && !scrollDirection && (
                              <Typography
                                variant="body2"
                                sx={{
                                  color: 'var(--text-secondary)',
                                  fontSize: '0.7rem',
                                  fontWeight: 400,
                                  fontStyle: 'italic',
                                  opacity: 0.7
                                }}
                              >
                                Scroll to control {selectedControl.toLowerCase()}
                </Typography>
                            )}
                          </Box>
                        )}
              </Box>
        </Box>
      </Slide>
    </Box>
  );
} 
