// ScrollBar.js
"use client";

import { Box, Typography } from "@mui/material";

export default function ScrollBar({ onTouchStart, onTouchMove, onTouchEnd }) {
  return (
    <Box
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      sx={{
        flex: 0.1,
        height: "25vh",
        backgroundColor: "#1a1a1a",
        borderRadius: 2,
        touchAction: "none",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      <Typography
        sx={{
          transform: "rotate(-90deg)",
          position: "absolute",
          left: "-75%",
          top: "50%",
          transformOrigin: "center",
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
          fontSize: 10,
          fontWeight: 500,
        }}
      >
        &lt;-- SCROLL BAR --&gt;
      </Typography>
    </Box>
  );
}
