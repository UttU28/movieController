// TrackPad.js
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Box, Slider, Typography, Fade } from "@mui/material";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMousePointer, faGaugeHigh, faHandPointer } from '@fortawesome/free-solid-svg-icons';
import ScrollBar from "./ScrollBar";
import ButtonContainer from "./ButtonContainer";
import { sendMovement, sendScroll, sendClick } from "../../context/apiRequests";

export default function TrackPad() {
  const [startX, setStartX] = useState(null);
  const [startY, setStartY] = useState(null);
  const [scrollStartY, setScrollStartY] = useState(null);
  const [multiplier, setMultiplier] = useState(1);
  const [isActive, setIsActive] = useState(false);
  const [touchIndicator, setTouchIndicator] = useState({ x: 0, y: 0, show: false });

  const deltaXRef = useRef(0);
  const deltaYRef = useRef(0);
  const requestIdRef = useRef(null);
  const trackpadRef = useRef(null);

  const sendMovementRequest = useCallback(async () => {
    if (deltaXRef.current === 0 && deltaYRef.current === 0) {
      requestIdRef.current = requestAnimationFrame(sendMovementRequest);
      return;
    }

    const dx = deltaXRef.current;
    const dy = deltaYRef.current;

    deltaXRef.current = 0;
    deltaYRef.current = 0;

    await sendMovement(dx, dy);
    requestIdRef.current = requestAnimationFrame(sendMovementRequest);
  }, []);

  useEffect(() => {
    requestIdRef.current = requestAnimationFrame(sendMovementRequest);
    return () => {
      if (requestIdRef.current) cancelAnimationFrame(requestIdRef.current);
    };
  }, [sendMovementRequest]);

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
    setIsActive(true);
    
    if (trackpadRef.current) {
      const rect = trackpadRef.current.getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 100;
      const y = ((touch.clientY - rect.top) / rect.height) * 100;
      setTouchIndicator({ x, y, show: true });
    }
  };

  const handleTouchMove = (e) => {
    if (startX === null || startY === null) return;

    const touch = e.touches[0];
    const deltaX = (touch.clientX - startX) * multiplier;
    const deltaY = (touch.clientY - startY) * multiplier;

    deltaXRef.current += deltaX;
    deltaYRef.current += deltaY;

    setStartX(touch.clientX);
    setStartY(touch.clientY);
    
    if (trackpadRef.current) {
      const rect = trackpadRef.current.getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 100;
      const y = ((touch.clientY - rect.top) / rect.height) * 100;
      setTouchIndicator({ x, y, show: true });
    }
  };

  const handleTouchEnd = () => {
    setStartX(null);
    setStartY(null);
    setIsActive(false);
    setTouchIndicator({ x: 0, y: 0, show: false });
  };

  const handleScrollStart = (e) => {
    const touch = e.touches[0];
    setScrollStartY(touch.clientY);
  };

  const handleScrollMove = async (e) => {
    if (scrollStartY === null) return;

    const touch = e.touches[0];
    const deltaY = (touch.clientY - scrollStartY) * (0.5 * multiplier);

    await sendScroll(deltaY);
    setScrollStartY(touch.clientY);
  };

  const handleScrollEnd = () => {
    setScrollStartY(null);
  };

  const handleLeftClick = () => {
    sendClick("left");
  };

  const handleRightClick = () => {
    sendClick("right");
  };

  return (
    <Fade in={true} timeout={1000}>
      <Box sx={{ marginBottom: 2, position: 'relative' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
          <FontAwesomeIcon 
            icon={faMousePointer} 
            style={{ color: 'var(--accent-primary)', fontSize: '1rem' }} 
          />
          <Typography
            variant="h6"
            sx={{
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              opacity: 0.8,
            }}
          >
            TrackPad Control
          </Typography>
        </Box>

        <Box sx={{ display: "flex", height: "240px", gap: 1, mb: 2 }}>
          <Box
            sx={{
              width: 40,
              height: '100%',
              background: 'linear-gradient(145deg, #1a1a1a, #0f0f0f)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: `
                inset 0 2px 8px rgba(0, 0, 0, 0.4),
                0 2px 12px rgba(0, 0, 0, 0.3)
              `,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Box
              onTouchStart={handleScrollStart}
              onTouchMove={handleScrollMove}
              onTouchEnd={handleScrollEnd}
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 1,
                cursor: 'ns-resize',
                touchAction: "none",
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent-primary)',
                  opacity: 0.8,
                  animation: 'pulse 2s infinite',
                }}
              />
              
              <Typography
                variant="caption"
                sx={{
                  color: 'var(--text-muted)',
                  fontSize: '0.6rem',
                  textAlign: 'center',
                  transform: 'rotate(-90deg)',
                  whiteSpace: 'nowrap',
                  opacity: 0.7,
                }}
              >
                SCROLL
              </Typography>
              
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent-secondary)',
                  opacity: 0.8,
                  animation: 'pulse 2s infinite 1s',
                }}
              />
            </Box>
          </Box>

          <Box
            ref={trackpadRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            sx={{
              flex: 1,
              position: 'relative',
              background: 'linear-gradient(145deg, #1a1a1a, #0f0f0f)',
              borderRadius: 'var(--radius-md)',
              border: '2px solid rgba(255, 255, 255, 0.08)',
              boxShadow: `
                inset 0 2px 10px rgba(0, 0, 0, 0.4),
                0 4px 20px rgba(0, 0, 0, 0.3)
              `,
              touchAction: "none",
              cursor: 'crosshair',
              transition: 'all var(--transition-smooth)',
              overflow: 'hidden',
              ...(isActive && {
                border: '2px solid var(--accent-primary)',
                boxShadow: `
                  inset 0 2px 10px rgba(0, 0, 0, 0.4),
                  0 4px 20px rgba(0, 0, 0, 0.3),
                  0 0 20px rgba(255, 51, 51, 0.25)
                `,
              }),
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0.1,
                background: `
                  linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                  linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)
                `,
                backgroundSize: '20px 20px',
                pointerEvents: 'none',
              }}
            />

            {touchIndicator.show && (
              <Box
                sx={{
                  position: 'absolute',
                  left: `${touchIndicator.x}%`,
                  top: `${touchIndicator.y}%`,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--accent-primary)',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 20px var(--accent-primary)',
                  animation: 'pulse 1s infinite',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
            )}

            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 2,
                height: 40,
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '1px',
                pointerEvents: 'none',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 40,
                height: 2,
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '1px',
                pointerEvents: 'none',
              }}
            />

            <Box
              sx={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: 'var(--text-muted)',
                fontSize: '0.7rem',
                pointerEvents: 'none',
              }}
            >
              <FontAwesomeIcon icon={faHandPointer} />
              <Typography variant="caption">
                {isActive ? 'Tracking...' : 'Touch to control'}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: 'column',
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              minWidth: 40,
            }}
          >
            <FontAwesomeIcon 
              icon={faGaugeHigh} 
              style={{ color: 'var(--accent-secondary)', fontSize: '0.8rem' }} 
            />
            
            <Slider
              orientation="vertical"
              min={0.1}
              max={5}
              step={0.1}
              value={multiplier}
              onChange={(e, newValue) => setMultiplier(newValue)}
              sx={{ 
                height: "50%", 
                width: 6,
                color: 'var(--accent-secondary)',
                '& .MuiSlider-thumb': {
                  width: 12,
                  height: 12,
                  backgroundColor: 'var(--accent-secondary)',
                  boxShadow: '0 0 8px rgba(243, 156, 18, 0.5)',
                  '&:hover': {
                    boxShadow: '0 0 12px rgba(243, 156, 18, 0.7)',
                  }
                },
                '& .MuiSlider-track': {
                  backgroundColor: 'var(--accent-secondary)',
                  border: 'none',
                },
                '& .MuiSlider-rail': {
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                }
              }}
            />
            
            <Typography
              variant="caption"
              sx={{
                color: 'var(--text-muted)',
                fontSize: '0.5rem',
                textAlign: 'center',
                transform: 'rotate(-90deg)',
                whiteSpace: 'nowrap',
                opacity: 0.8,
              }}
            >
              {multiplier.toFixed(1)}x
            </Typography>
          </Box>
        </Box>

        <ButtonContainer onLeftClick={handleLeftClick} onRightClick={handleRightClick} />
      </Box>
    </Fade>
  );
}
