// app/page.js
"use client";

import React, { useState, useEffect } from 'react';
import { Box, Typography, Fade, Slide, IconButton } from "@mui/material";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket, faWifi } from '@fortawesome/free-solid-svg-icons';
import AppTray from "../components/AppTray";
import HomeFunctions from "../containers/HomeFunctions";
import HotKeys from "../containers/HotKeys";
import YouTube from "../containers/appFunctions/YouTube";
import AmazonPrime from "../containers/appFunctions/AmazonPrime";
import IBomma from "../containers/appFunctions/IBomma";
import Netflix from "../containers/appFunctions/Netflix";
import FMovies from "../containers/appFunctions/FMovies";
import GoogleChrome from "../containers/appFunctions/GoogleChrome";
import { useAppState } from '../context/AppStateContext';
import { checkBackendHealth, setConnectionStatusCallback } from '../context/apiRequests';
import TrackPad from "../containers/trackPad/TrackPad";
import SearchBar from "../components/SearchBar";

export default function Home() {
    const { visibleContentID } = useAppState();
    const [loaded, setLoaded] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('checking');
    const [connectionError, setConnectionError] = useState(null);

    useEffect(() => {
        setLoaded(true);
        
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
    }, []); // Only run once on mount

    // Function to manually trigger reconnection
    const handleManualReconnect = async () => {
        setConnectionStatus('checking');
        await checkBackendConnection();
    };

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
                            BAAP KA CONTROLLER
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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <HomeFunctions />
            <HotKeys />
                    </Box>

                                        {/* App Tray Section - Title Always Stable, Only Buttons Animate */}
                    <Box>
                        {/* Always show the title - No animation wrapper */}
                        <AppTray showButtons={!visibleContentID} />
                        
                        {/* App-specific content with smooth transitions - Only buttons animate */}
                        {visibleContentID === "youTube" && (
                            <Fade in={true} timeout={600}>
                                <Box><YouTube /></Box>
                            </Fade>
                        )}
                        {visibleContentID === "fMovies" && (
                            <Fade in={true} timeout={600}>
                                <Box><FMovies /></Box>
                            </Fade>
                        )}
                        {visibleContentID === "iBomma" && (
                            <Fade in={true} timeout={600}>
                                <Box><IBomma /></Box>
                            </Fade>
                        )}
                        {visibleContentID === "googleChrome" && (
                            <Fade in={true} timeout={600}>
                                <Box><GoogleChrome /></Box>
                            </Fade>
                        )}
                        {visibleContentID === "primeVideos" && (
                            <Fade in={true} timeout={600}>
                                <Box><AmazonPrime /></Box>
                            </Fade>
                        )}
                        {visibleContentID === "netflix" && (
                            <Fade in={true} timeout={600}>
                                <Box><Netflix /></Box>
                            </Fade>
                        )}
                    </Box>

                    {/* TrackPad Section */}
                    <Slide direction="up" in={loaded} timeout={1400}>
                        <Box>
            <TrackPad />
                        </Box>
                    </Slide>

                    {/* Search Bar */}
                    <Slide direction="up" in={loaded} timeout={1600}>
                        <Box>
            <SearchBar visibleContentId={visibleContentID} />
                        </Box>
                    </Slide>
                </Box>
            </Slide>


        </Box>
    );
}
