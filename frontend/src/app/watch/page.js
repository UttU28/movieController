"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Grid, Box, Container, Typography, TextField } from '@mui/material';
import {
    faVolumeHigh,
    faPause,
    faRotateRight
} from '@fortawesome/free-solid-svg-icons';
import { useAppState } from '../../context/AppStateContext';
import NormalButton from '../../components/NormalButton';

export default function HomeFunctions({ logMessage }) {
    const { showApp } = useAppState(); // Use context to get showApp function

    const homeFunctions = [
        [
            { name: "volumeControl", icon: faVolumeHigh, alias: "VOLUME" },
            { name: "pause", icon: faPause, alias: "PLAY/PAUSE" },
            { name: "seekControl", icon: faRotateRight, alias: "SEEK" },
        ],
    ];

    const handleButtonClick = (buttonName) => {
        logMessage(`🖲️ Button Pressed: ${buttonName}`);
        showApp(buttonName); // Call showApp with the button name
    };

    return (
        <div>
            {homeFunctions.map((group, index) => (
                <div item xs={12} key={index}>
                    <Box display="flex" justifyContent="center">
                        {group.map((button, secondIndex) => (
                            <Box mx={1} key={secondIndex}>
                                <NormalButton
                                    buttonName={button.name}
                                    whatToDoOnClick={() => handleButtonClick(button.name)}
                                    icon={button.icon}
                                    alias={button.alias}
                                />
                            </Box>
                        ))}
                    </Box>
                </div>
            ))}
        </div>
    );
}
