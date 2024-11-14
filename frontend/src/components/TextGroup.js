// components/TextGroup.js
import { Grid, Box, Container, Typography } from '@mui/material';

const TextGroup = ({ textData, whatContainer, iconColor = 'black' }) => {
  const { title, link, channel } = textData;

  return (
    <Container className={whatContainer}>
      <Grid container spacing={0} mb={1}>
        <Box mb={1}>
          <Typography variant="h6" sx={{ color: iconColor, fontWeight: 'bold' }}>
            {title || "No Title"}
          </Typography>
          <Typography variant="body2" sx={{ color: iconColor, fontWeight: 'bold' }}>
            {channel || "No Channel"}
          </Typography>
          <Typography variant="caption" sx={{ color: iconColor }}>
            <a href={`https://www.youtube.com${link}`} target="_blank" rel="noopener noreferrer">
              {link || "No Link"}
            </a>
          </Typography>
        </Box>
      </Grid>
    </Container>
  );
};

export default TextGroup;
