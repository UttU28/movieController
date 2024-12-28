"use client";

import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import styled from 'styled-components';

const NeumorphicButton = styled(motion.button)`
  width: 60px;
  height: 60px;
  border: none;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
  background: var(--button-bg);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.3s ease;
  margin: 8px;
  padding: 8px;

  &:hover {
    color: var(--accent);
  }

  .icon {
    font-size: 1.3rem;
    margin-bottom: 3px;
  }

  .label {
    font-size: 0.7rem;
    font-weight: 600;
  }
`;

export default function NormalButton({ buttonName, icon, alias, whatToDoOnClick }) {
  return (
    <NeumorphicButton
      className="neomorphic-button"
      onClick={whatToDoOnClick}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
    >
      <FontAwesomeIcon icon={icon} className="icon" />
      <span className="label">{alias}</span>
    </NeumorphicButton>
  );
}