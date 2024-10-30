"use client";

import React from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter for navigation
import { Container, Typography, Button } from "@mui/material";
import AppTray from "../components/AppTray";
import HomeFunctions from "../containers/HomeFunctions";
import HotKeys from "../containers/HotKeys";
import YouTube from "../containers/appFunctions/YouTube";
import AmazonPrime from "../containers/appFunctions/AmazonPrime";
import IBomma from "../containers/appFunctions/IBomma";
import Netflix from "../containers/appFunctions/Netflix";
import FMovies from "../containers/appFunctions/FMovies";
import GoogleChrome from "../containers/appFunctions/GoogleChrome";
import { useAppState } from '../context/AppStateContext'; // Import context
import TrackPad from "../containers/trackPad/TrackPad";
import SearchBar from "../components/SearchBar";

export default function Home() {
    const router = useRouter(); // Initialize useRouter
    const { visibleContentID } = useAppState(); // Get visible content from context

    // Function to navigate to /watch
    const goToWatch = () => {
        router.push('/watch'); // Redirect to /watch
    };

    return (
        <Container>
            <Typography variant="h5" component="h5" gutterBottom>
                APNE BAAP KA CONTROLLER 2.0
            </Typography>
            <HomeFunctions />
            <HotKeys />
            {!visibleContentID && <AppTray />}

            {/* Render selected content */}
            {visibleContentID === "youTube" && <YouTube />}
            {visibleContentID === "fMovies" && <FMovies />}
            {visibleContentID === "iBomma" && <IBomma />}
            {visibleContentID === "googleChrome" && <GoogleChrome />}
            {visibleContentID === "primeVideos" && <AmazonPrime />}
            {visibleContentID === "netflix" && <Netflix />}

            <TrackPad />
            <SearchBar visibleContentId={visibleContentID} />

            {/* Add Button to redirect to /watch */}
            <Button 
                variant="contained" 
                color="primary" 
                onClick={goToWatch}
                sx={{ marginTop: 2, marginBottom: 5}}
            >
                Go to Watch
            </Button>
        </Container>
    );
}
