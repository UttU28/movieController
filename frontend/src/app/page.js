"use client";

import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import ButtonGroup from "../components/ButtonGroup";
import TextGroup from "../components/TextGroup";
import getButtonData from "../components/buttonData";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { Toaster } from 'react-hot-toast';
import { showToast } from '../utils/toast';

const PageContainer = styled(motion.div)`
  min-height: 100vh;
  padding: 1rem;
  background: var(--background);
`;

const Title = styled(motion.h1)`
  text-align: center;
  margin-bottom: 2rem;
  font-size: 2rem;
  font-weight: 700;
`;

const SearchContainer = styled(motion.div)`
  max-width: 600px;
  margin: 2rem auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 1rem;
  border: none;
  border-radius: 12px;
  background: var(--card-bg);
  color: var(--text-primary);
  font-size: 1rem;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent);
  }
`;

const SearchButton = styled(motion.button)`
  padding: 0.75rem;
  border: none;
  border-radius: 12px;
  background: var(--accent);
  color: var(--background);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;

  &:hover {
    opacity: 0.9;
  }

  svg {
    font-size: 1.2rem;
  }
`;

export default function Home() {
    const [searchTerm, setSearchTerm] = useState("");
    const [responseObject, setResponseObject] = useState(null);
    const [defaultItem, setDefaultItem] = useState(null);

    const sendCommand = async (command, query = "") => {
        try {
            const isGetRequest = command === "current";
            const url = query
                ? `http://192.168.0.132:5000/${command}?query=${encodeURIComponent(query)}`
                : `http://192.168.0.132:5000/${command}`;
            const response = await fetch(url, {
                method: isGetRequest ? "GET" : "POST",
            });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            setResponseObject(data);
        } catch (error) {
            showToast.error(`Error: ${error.message}`);
        }
    };

    const fetchDefaultItem = async () => {
        try {
            const response = await fetch("http://192.168.0.132:5000/get_default", {
                method: "POST",
            });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            setDefaultItem(data);
        } catch (error) {
            showToast.error(`Error fetching default item: ${error.message}`);
        }
    };

    useEffect(() => {
        fetchDefaultItem();
    }, []);

    const handleSearch = () => {
        sendCommand("search", searchTerm);
    };

    return (
        <PageContainer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <Toaster 
                position="top-center"
                toastOptions={{
                    style: {
                        background: 'var(--card-bg)',
                        color: 'var(--text-primary)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    },
                }}
            />

            <Title className="gradient-text">
                APNE BAAP KA CONTROLLER 2.0
            </Title>

            <div className="controlsContainer w-[100%]">
                <ButtonGroup buttonData={getButtonData(sendCommand)} whatContainer="youtubeControls" />

                {defaultItem && (
                    <TextGroup
                        textData={defaultItem}
                        whatContainer="defaultItemContainer"
                    />
                )}

                {responseObject && (
                    <TextGroup
                        textData={responseObject}
                        whatContainer="responseObjectContainer"
                    />
                )}

                <SearchContainer>
                    <SearchInput
                        className="neomorphic-input"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <SearchButton
                        className="neomorphic-button"
                        onClick={handleSearch}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <FontAwesomeIcon icon={faSearch} />
                    </SearchButton>
                </SearchContainer>
            </div>
        </PageContainer>
    );
}