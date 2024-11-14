"use client";

import React, { useState, useEffect } from 'react';
import { Container, Typography, TextField, Button } from "@mui/material";
import ButtonGroup from "../components/ButtonGroup";
import TextGroup from "../components/TextGroup"; // Import TextGroup
import getButtonData from "../components/buttonData";

export default function Home() {
    const [searchTerm, setSearchTerm] = useState("");
    const [errorMessage, setErrorMessage] = useState(""); 
    const [responseObject, setResponseObject] = useState(null); 
    const [defaultItem, setDefaultItem] = useState(null); 

// Unified function to send commands
const sendCommand = async (command, query = "") => {
    try {
        const isGetRequest = command === "current";
        const url = query
            ? `http://192.168.208.1:5000/${command}?query=${encodeURIComponent(query)}`
            : `http://192.168.208.1:5000/${command}`;
        const response = await fetch(url, {
            method: isGetRequest ? "GET" : "POST",
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        setResponseObject(data);
        setErrorMessage("");
    } catch (error) {
        setErrorMessage(`Error sending ${command} command: ${error.message}`);
        setResponseObject(null);
    }
};

    const fetchDefaultItem = async () => {
        try {
            const response = await fetch("http://192.168.208.1:5000/get_default", {
                method: "POST",
            });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            setDefaultItem(data); 
        } catch (error) {
            setErrorMessage(`Error fetching default item: ${error.message}`);
        }
    };

    useEffect(() => {
        fetchDefaultItem();
    }, []);

    // Function to handle search button click
    const handleSearch = () => {
        sendCommand("search", searchTerm);
    };

    return (
        <Container>
            <Typography variant="h5" component="h5" gutterBottom>
                APNE BAAP KA CONTROLLER 2.0
            </Typography>

            {errorMessage && <Typography color="error">{errorMessage}</Typography>}


            {/* Render ButtonGroup with JSON button data */}
            <ButtonGroup buttonData={getButtonData(sendCommand)} whatContainer="youtubeControls" />
            {defaultItem && (
                <TextGroup 
                    textData={defaultItem} 
                    whatContainer="defaultItemContainer" 
                    iconColor="blue" 
                />
            )}

            {responseObject && (
                <TextGroup 
                    textData={responseObject} 
                    whatContainer="responseObjectContainer" 
                    iconColor="green" 
                />
            )}

            {/* Search Input and Button */}
            <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center' }}>
                <TextField 
                    label="Search" 
                    variant="outlined" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    sx={{ marginRight: 1 }}
                />
                <Button variant="contained" color="primary" onClick={handleSearch}>
                    Execute Search
                </Button>
            </div>
        </Container>
    );
}
