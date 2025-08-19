// components/NormalButton.js
"use client";

import React, { useState, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useAppState } from '../context/AppStateContext'; 
import { sendButtonAction } from '../context/apiRequests'; 

export default function NormalButton({ 
  buttonName, 
  icon, 
  alias, 
  iconColor = 'var(--text-primary)', 
  whatToDoOnClick,
  variant = 'neuro',
  size = 'medium'
}) {
  const { goBack } = useAppState();
  const [isLoading, setIsLoading] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const rippleRef = useRef(null);

  const sizeConfig = {
    small: { width: 56, height: 56, iconSize: '1.2rem', fontSize: '0.65rem' },
    medium: { width: 56, height: 56, iconSize: '1.2rem', fontSize: '0.65rem' },
    large: { width: 56, height: 56, iconSize: '1.2rem', fontSize: '0.65rem' }
  };

  const config = sizeConfig[size];

  const defaultHandleButtonClick = async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      setIsPressed(true);
      
      if (rippleRef.current) {
        const ripple = document.createElement('span');
        ripple.classList.add('ripple');
        rippleRef.current.appendChild(ripple);
        
        setTimeout(() => {
          if (ripple.parentNode) {
            ripple.parentNode.removeChild(ripple);
          }
        }, 600);
      }
      
      if (buttonName === 'goBack') {
        goBack();
      } else {
        await sendButtonAction(buttonName);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setIsPressed(false);
      }, 300);
    }
  };

  const getVariantStyles = () => {
    return {
      background: 'linear-gradient(145deg, #1a1a1a, #0f0f0f)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: `
        6px 6px 12px rgba(0, 0, 0, 0.5),
        -6px -6px 12px rgba(255, 255, 255, 0.03)
      `,
      '&:hover': {
        background: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        transform: 'translateY(-2px) scale(1.02)',
        boxShadow: `
          8px 8px 16px rgba(0, 0, 0, 0.6),
          -8px -8px 16px rgba(255, 255, 255, 0.04)
        `,
      }
    };
  };

  return (
    <Box
      ref={rippleRef}
      onClick={whatToDoOnClick || defaultHandleButtonClick}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      sx={{
        width: config.width,
        height: config.height,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: isLoading ? 'wait' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
        margin: '0 1px',
        transition: 'all var(--transition-spring)',
        userSelect: 'none',
        touchAction: 'manipulation',
        '-webkit-tap-highlight-color': 'transparent',
        '-webkit-touch-callout': 'none',
        ...getVariantStyles(),
        ...(isPressed && {
          transform: 'scale(0.95)',
          boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.5), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
        }),
        '&:active': {
          transform: 'scale(0.92)',
        },
        '& .ripple': {
          position: 'absolute',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.3)',
          transform: 'scale(0)',
          animation: 'ripple-animation 0.6s linear',
          pointerEvents: 'none',
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
        },
        '@keyframes ripple-animation': {
          to: {
            transform: 'scale(2)',
            opacity: 0,
          }
        }
      }}
    >
      {isLoading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 'inherit',
            zIndex: 2,
          }}
        >
          <CircularProgress 
            size={16} 
            sx={{ 
              color: 'var(--accent-primary)',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              }
            }} 
          />
        </Box>
      )}

      <Box
        sx={{
          transition: 'all var(--transition-smooth)',
          transform: isPressed ? 'scale(0.9)' : 'scale(1)',
          opacity: isLoading ? 0.5 : 1,
        }}
      >
        <FontAwesomeIcon 
          icon={icon} 
          style={{ 
            color: alias === 'HOME' ? '#ff3333' : iconColor, 
            fontSize: config.iconSize,
          }} 
        />
      </Box>

      <Typography
        variant="caption"
        sx={{
          marginTop: 0.5,
          color: alias === 'HOME' ? '#ff3333' : iconColor,
          fontWeight: 600,
          fontSize: config.fontSize,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          opacity: isLoading ? 0.5 : 0.9,
          transition: 'all var(--transition-smooth)',
          transform: isPressed ? 'scale(0.9)' : 'scale(1)',
        }}
      >
        {alias}
      </Typography>
    </Box>
  );
}
