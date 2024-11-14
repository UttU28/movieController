// components/ButtonGroup.js
import { Grid, Box, Container } from '@mui/material';
import { Button, Typography } from '@mui/material';
import NormalButton from "./NormalButton";

const ButtonGroup = ({ buttonData, whatContainer }) => {
  return (
    <Container className={whatContainer}>
      <Grid container spacing={0} mb={1}>
        {buttonData.map((group, index) => (
          <Grid item xs={12} key={index}>
            <Box display="flex" justifyContent="center" mb={1}>
              {group.map((button, secondIndex) => (
                <Box mx={0} key={secondIndex}>
                  <NormalButton 
                    buttonName={button.name} 
                    icon={button.icon} 
                    alias={button.alias} 
                    // Pass `whatToDoOnClick` only if `functionToCall` exists
                    {...(button.functionToCall && { whatToDoOnClick: button.functionToCall })}
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
