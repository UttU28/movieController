// components/ButtonGroup.js
import { Grid, Box, Container } from '@mui/material';
import NormalButton from "./NormalButton";

const ButtonGroup = ({ buttonData, whatContainer }) => {
  return (
    <Container className={whatContainer}>
      <Grid container spacing={0} mb={1}>
        {buttonData.map((group, index) => (
          <Grid size={12} key={index}>
            <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
              {group.map((button, secondIndex) => (
                <Box mx={0} key={secondIndex}>
                  <NormalButton 
                    buttonName={button.name} 
                    icon={button.icon} 
                    alias={button.alias} // Pass the alias
                  />
                </Box>
              ))}
            </Box>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default ButtonGroup;
