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
    boxShadow: `
      4px 4px 8px rgba(0, 0, 0, 0.5),
      -4px -4px 8px rgba(255, 255, 255, 0.03)
    `,
    transition: 'all var(--transition-smooth)',
    '&:hover': {
      background: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      transform: 'translateY(-1px)',
      boxShadow: `
        6px 6px 12px rgba(0, 0, 0, 0.6),
        -6px -6px 12px rgba(255, 255, 255, 0.04)
      `,
    },
    '&:active': {
      transform: 'scale(0.98)',
      boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.5)',
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
