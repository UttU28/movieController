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
                        overflow: 'hidden',
                        transition: 'all var(--transition-smooth)',
                        '&:focus-within': {
                            border: '1px solid var(--accent-primary)',
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
                        background: 'linear-gradient(145deg, #1a1a1a, #0f0f0f)',
                        borderRadius: 'var(--radius-lg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        transition: 'all var(--transition-smooth)',
                        '&:hover': {
                            background: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            transform: 'translateY(-2px) scale(1.02)',
                        },
                        '&:active': {
                            transform: 'translateY(0) scale(0.98)',
                        },
                    }}
                >
                    <SearchIcon 
                        sx={{ 
                            color: 'var(--accent-primary)',
                            fontSize: '1.2rem',
                        }} 
                    />
                </Box>
            </Box>
        </Box>
    );
}
