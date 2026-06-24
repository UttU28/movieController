// AppTray.js
"use client";

import React from 'react';
import { Grid, Box, Container } from '@mui/material';
import { faFilm, faN } from '@fortawesome/free-solid-svg-icons';
import { faYoutube, faGoogle, faAmazon } from '@fortawesome/free-brands-svg-icons';
import { useAppState } from '../context/AppStateContext'; // Import the context
import NormalButton from "./NormalButton";

const appTray = [
    [
        { name: "youTubeButton", icon: faYoutube, contentColor: "red", contentID: "youTube", alias: "YouTube" },
        { name: "fMoviesButton", icon: faFilm, contentColor: "lightblue", contentID: "fMovies", alias: "FMovies" },
        { name: "iBommaButton", icon: faFilm, contentColor: "white", contentID: "iBomma", alias: "IBomma" },
        { name: "googleChromeButton", icon: faGoogle, contentColor: "white", contentID: "googleChrome", alias: "Chrome" },
        { name: "primeVideosButton", icon: faAmazon, contentColor: "lightblue", contentID: "primeVideos", alias: "Prime" },
        { name: "netflixButton", icon: faN, contentColor: "red", contentID: "netflix", alias: "Netflix" }
    ]
];

export default function AppTray() {
    const { showApp } = useAppState(); // Use context to handle state

    return (
        <Container>
            <Grid container spacing={0}>
                {appTray.map((group, index) => (
                    <Grid size={12} key={index}>
                        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                            {group.map((button, secondIndex) => (
                                <Box mx={0} key={secondIndex}>
                                    <NormalButton
                                        buttonName={button.name}
                                        whatToDoOnClick={() => showApp(button.contentID)} // Use whatToDoOnClick to call showApp from context
                                        icon={button.icon}
                                        alias={button.alias}
                                        iconColor={button.contentColor}
                                    />
                                </Box>
                            ))}
                        </Box>
                    </Grid>
                ))}
            </Grid>
        </Container>
    );
}
