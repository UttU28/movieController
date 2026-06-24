// components/SearchBar.js
"use client";

import React, { useState, useEffect } from 'react';
import { Container, TextField, IconButton, Box } from "@mui/material";
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
        // Reset search query whenever the visibleContentId changes
        setSearchQuery('');
    }, [visibleContentId]);

    return (
        <Container>
            <Box 
                sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    width: '90%', 
                    margin: '0 auto', 
                    backgroundColor: 'black', 
                    padding: 1,
                    borderRadius: 2 
                }}
            >
                <TextField
                    id="filled-search"
                    label="Search field"
                    type="search"
                    variant="filled" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    slotProps={{
                        input: {
                            style: {
                                color: 'white',
                                backgroundColor: 'black',
                            },
                        },
                    }}
                    sx={{
                        flex: 1,
                        height: '40px', 
                        '& .MuiFilledInput-root': {
                            borderRadius: 5, 
                        },
                    }}
                />
                <IconButton 
                    aria-label="search" 
                    onClick={handleSearch} 
                    sx={{ 
                        width: 40, 
                        height: 40,
                        backgroundColor: 'white', 
                        color: 'black', 
                        marginLeft: 1, 
                        '&:hover': {
                            backgroundColor: 'lightgray', 
                        },
                    }}
                >
                    <SearchIcon />
                </IconButton>
            </Box>
        </Container>
    );
}
