// AppTray.js
"use client";

import React from 'react';
import { Box, Typography, Fade, Grow } from '@mui/material';
import { faFilm, faN } from '@fortawesome/free-solid-svg-icons';
import { faYoutube, faGoogle, faAmazon } from '@fortawesome/free-brands-svg-icons';
import { faRocket } from '@fortawesome/free-solid-svg-icons';
import { useAppState } from '../context/AppStateContext';
import NormalButton from "./NormalButton";

const appTray = [
    { 
        name: "youTubeButton", 
        icon: faYoutube, 
        contentColor: "#FF0000", 
        contentID: "youTube", 
        alias: "YouTube",
        size: "medium"
    },
    { 
        name: "fMoviesButton", 
        icon: faFilm, 
        contentColor: "var(--accent-info)", 
        contentID: "fMovies", 
        alias: "FMovies",
        size: "medium"
    },
    { 
        name: "iBommaButton", 
        icon: faFilm, 
        contentColor: "var(--accent-secondary)", 
        contentID: "iBomma", 
        alias: "IBomma",
        size: "medium"
    },
    { 
        name: "googleChromeButton", 
        icon: faGoogle, 
        contentColor: "var(--accent-info)", 
        contentID: "googleChrome", 
        alias: "Chrome",
        size: "medium"
    },
    { 
        name: "primeVideosButton", 
        icon: faAmazon, 
        contentColor: "var(--accent-secondary)", 
        contentID: "primeVideos", 
        alias: "Prime",
        size: "medium"
    },
    { 
        name: "netflixButton", 
        icon: faN, 
        contentColor: "#E50914", 
        contentID: "netflix", 
        alias: "Netflix",
        size: "medium"
    }
];

export default function AppTray({ showButtons = true }) {
    const { showApp } = useAppState();

    return (
        <Fade in={true} timeout={1000}>
            <Box
                sx={{
                    marginBottom: 2,
                    position: 'relative',
                }}
            >
                {/* Title */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                        }}
                    >
                        <Box
                            sx={{
                                width: 40,
                                height: 2,
                                background: 'linear-gradient(90deg, transparent 0%, var(--accent-primary) 100%)',
                                borderRadius: '1px',
                            }}
                        />
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: 'var(--accent-primary)',
                                    animation: 'pulse 2s infinite',
                                }}
                            />
                            <Typography
                                variant="h6"
                                sx={{
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    opacity: 0.8,
                                }}
                                                            >
                                    Launch Apps
                                </Typography>
                            <Box
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: 'var(--accent-secondary)',
                                    animation: 'pulse 2s infinite 1s',
                                }}
                            />
                        </Box>
                        
                        <Box
                            sx={{
                                width: 40,
                                height: 2,
                                background: 'linear-gradient(90deg, var(--accent-secondary) 0%, transparent 100%)',
                                borderRadius: '1px',
                            }}
                        />
                    </Box>
                </Box>

                {/* App Buttons - Conditional Rendering */}
                {showButtons && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                        <Grow in={true} timeout={1000} style={{ transformOrigin: 'center center' }}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    flexWrap: 'nowrap',
                                    width: '100%',
                                    maxWidth: '400px',
                                }}
                            >
                                {appTray.map((button, index) => (
                                    <Grow
                                        key={index}
                                        in={true}
                                        timeout={1200 + (index * 100)}
                                        style={{ transformOrigin: 'center center' }}
                                    >
                                        <Box>
                                            <NormalButton
                                                buttonName={button.name}
                                                whatToDoOnClick={() => showApp(button.contentID)}
                                                icon={button.icon}
                                                alias={button.alias}
                                                iconColor={button.contentColor}
                                                size={button.size || 'medium'}
                                            />
                                        </Box>
                                    </Grow>
                                ))}
                            </Box>
                        </Grow>
                    </Box>
                )}


            </Box>
        </Fade>
    );
}
