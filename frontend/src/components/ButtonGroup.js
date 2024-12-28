import styled from 'styled-components';
import { motion } from 'framer-motion';
import NormalButton from './NormalButton';

const NeumorphicContainer = styled(motion.div)`
  background: var(--background);
  border-radius: 20px;
  margin-bottom: 2rem;
  padding: 1rem;
`;

const ButtonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  gap: 0rem;
  justify-items: center;
  display: flex;
  justify-content: center;
`;

const ButtonGroup = ({ buttonData, whatContainer }) => {
  return (
    <NeumorphicContainer
      className="neomorphic-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {buttonData.map((group, index) => (
        <ButtonGrid key={index}>
          {group.map((button, secondIndex) => (
            <NormalButton
              key={secondIndex}
              buttonName={button.name}
              icon={button.icon}
              alias={button.alias}
              whatToDoOnClick={button.functionToCall}
            />
          ))}
        </ButtonGrid>
      ))}
    </NeumorphicContainer>
  );
};

export default ButtonGroup;