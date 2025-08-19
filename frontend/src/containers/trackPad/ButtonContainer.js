// ButtonContainer.js
"use client";

import { Box, Button } from "@mui/material";

export default function ButtonContainer({ onLeftClick, onRightClick }) {
  const buttonStyle = {
    flex: 1,
    height: 40,
    color: 'var(--text-primary)',
    background: 'linear-gradient(145deg, #1a1a1a, #0f0f0f)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    transition: 'all var(--transition-smooth)',
    '&:hover': {
      background: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      transform: 'translateY(-1px)',
    },
    '&:active': {
      transform: 'scale(0.98)',
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 1,
        width: "100%",
        margin: 0,
        padding: 0,
      }}
    >
      <Button onClick={onLeftClick} sx={buttonStyle}>
        LEFT CLICK
      </Button>
      <Button onClick={onRightClick} sx={buttonStyle}>
        RIGHT CLICK
      </Button>
    </Box>
  );
}
