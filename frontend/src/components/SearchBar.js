// components/SearchBar.js
"use client";

import React, { useState, useEffect } from 'react';
import { Box } from "@mui/material";
import SearchIcon from '@mui/icons-material/Search'; 
import { sendSearchQuery } from '../context/apiRequests'; 

export default function SearchBar({ visibleContentId }) { 
    const [searchQuery, setSearchQuery] = useState(''); 

    const handleSearch = async () => {
        if (searchQuery.trim() === '') return; 
        await sendSearchQuery(searchQuery, visibleContentId); 
        setSearchQuery(''); 
    };

    useEffect(() => {
        setSearchQuery('');
    }, [visibleContentId]);

    return (
        <Box 
            sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                width: '100%',
                padding: { xs: 1, sm: 2 },
                marginTop: 1,
            }}
        >
            <Box 
                sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    width: '100%',
                    maxWidth: '500px',
                    position: 'relative',
                }}
            >
                <Box
                    sx={{
                        flex: 1,
                        position: 'relative',
                        background: 'linear-gradient(145deg, #1a1a1a, #0f0f0f)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: `
                            6px 6px 12px rgba(0, 0, 0, 0.5),
                            -6px -6px 12px rgba(255, 255, 255, 0.03)
                        `,
                        overflow: 'hidden',
                        transition: 'all var(--transition-smooth)',
                        '&:focus-within': {
                            border: '1px solid var(--accent-primary)',
                            boxShadow: `
                                8px 8px 16px rgba(0, 0, 0, 0.6),
                                -8px -8px 16px rgba(255, 255, 255, 0.04),
                                0 0 20px rgba(255, 51, 51, 0.2)
                            `,
                        },
                    }}
                >
                    <input
                        type="text"
                        placeholder="Search anything..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        style={{
                            width: '100%',
                            padding: '16px 20px',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                        }}
                    />
                </Box>

                <Box
                    onClick={handleSearch}
                    sx={{
                        width: 48,
                        height: 48,
                        marginLeft: 1,
                        background: 'linear-gradient(145deg, var(--accent-primary), #d6457a)',
                        borderRadius: 'var(--radius-lg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: `
                            6px 6px 12px rgba(0, 0, 0, 0.5),
                            -6px -6px 12px rgba(255, 255, 255, 0.03)
                        `,
                        transition: 'all var(--transition-smooth)',
                        '&:hover': {
                            transform: 'translateY(-2px) scale(1.02)',
                            boxShadow: `
                                8px 8px 16px rgba(0, 0, 0, 0.6),
                                -8px -8px 16px rgba(255, 255, 255, 0.04),
                                0 0 25px rgba(255, 51, 51, 0.3)
                            `,
                        },
                        '&:active': {
                            transform: 'translateY(0) scale(0.98)',
                        },
                    }}
                >
                    <SearchIcon 
                        sx={{ 
                            color: 'white',
                            fontSize: '1.2rem',
                        }} 
                    />
                </Box>
            </Box>
        </Box>
    );
}
