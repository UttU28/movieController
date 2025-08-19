// components/ButtonGroup.js
import React from 'react';
import { Box, Typography, Fade } from '@mui/material';
import NormalButton from "./NormalButton";

const ButtonGroup = ({ buttonData, whatContainer, title, variant = 'neuro', onButtonSelect }) => {

  return (
    <Fade in={true} timeout={800}>
      <Box
        sx={{
          marginBottom: 1,
          position: 'relative',
          width: '100%',
        }}
      >
        {/* Optional Title */}
        {title && (
          <Typography
            variant="h6"
            sx={{
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: 1.5,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              opacity: 0.8,
            }}
          >
            {title}
          </Typography>
        )}

        {/* Button Rows */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {buttonData.map((group, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 0.5,
                flexWrap: 'nowrap',
                width: '100%',
                maxWidth: '400px',
                overflow: 'hidden',
              }}
            >
              {group.map((button, secondIndex) => (
                <NormalButton
                  key={`${index}-${secondIndex}`}
                  buttonName={button.name}
                  icon={button.icon}
                  alias={button.alias}
                  iconColor={button.iconColor || 'var(--text-primary)'}
                  variant={button.variant || variant}
                  size={button.size || 'medium'}
                  onButtonSelect={onButtonSelect}
                />
              ))}
            </Box>
          ))}
        </Box>


      </Box>
    </Fade>
  );
};

export default ButtonGroup;
