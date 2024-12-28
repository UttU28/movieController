import { motion, useAnimation } from 'framer-motion';
import styled from 'styled-components';
import { useState, useRef, useEffect } from 'react';

const NeumorphicCard = styled(motion.div)`
  background: var(--card-bg);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
`;

const MarqueeContainer = styled.div`
  position: relative;
  width: 100%;
  overflow: hidden;
  margin-bottom: 0.5rem;
`;

const MarqueeText = styled(motion.div)`
  white-space: nowrap;
  display: inline-block;
  color: var(--accent);
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
`;

const Channel = styled.p`
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
`;

const Link = styled.div`
  color: var(--accent);
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  &:hover {
    opacity: 0.8;
  }
`;

const CopyMessage = styled(motion.span)`
  color: var(--text-secondary);
  font-size: 0.8rem;
`;

const TextGroup = ({ textData, whatContainer }) => {
  const { title, link, channel } = textData;
  const controls = useAnimation();
  const textRef = useRef(null);
  const containerRef = useRef(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [copied, setCopied] = useState(false);

  const animateText = async () => {
    if (isAnimating) return;
    
    const textWidth = textRef.current?.offsetWidth || 0;
    const containerWidth = containerRef.current?.offsetWidth || 0;
    
    if (textWidth > containerWidth) {
      setIsAnimating(true);
      
      await controls.start({
        x: -(textWidth - containerWidth),
        transition: {
          duration: (textWidth / 100) * 0.5,
          ease: "linear"
        }
      });

      await new Promise(resolve => setTimeout(resolve, 400));

      await controls.start({
        x: 0,
        transition: {
          duration: 0.8,
          type: "spring",
          stiffness: 100,
          damping: 15
        }
      });

      setIsAnimating(false);
    }
  };

  useEffect(() => {
    const checkAndAnimate = async () => {
      const textWidth = textRef.current?.offsetWidth || 0;
      const containerWidth = containerRef.current?.offsetWidth || 0;
      
      if (textWidth > containerWidth) {
        await animateText();
      }
    };
    
    checkAndAnimate();
  }, [title]);

  const handleLinkClick = async () => {
    const fullLink = `https://www.youtube.com${link}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullLink);
      } else {
        // Fallback copy method
        const textArea = document.createElement('textarea');
        textArea.value = fullLink;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          textArea.remove();
        } catch (err) {
          console.error('Fallback: Oops, unable to copy', err);
          textArea.remove();
          return;
        }
      }
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <NeumorphicCard
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="neomorphic-container"
    >
      <MarqueeContainer ref={containerRef}>
        <MarqueeText
          ref={textRef}
          animate={controls}
          onClick={animateText}
        >
          {title || "No Title"}
        </MarqueeText>
      </MarqueeContainer>
      
      <Channel>{channel || "No Channel"}</Channel>
      
      {link && (
        <Link onClick={handleLinkClick}>
          <span>{copied ? "Link copied!" : link}</span>
          {copied && (
            <CopyMessage
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              ✓
            </CopyMessage>
          )}
        </Link>
      )}
    </NeumorphicCard>
  );
};

export default TextGroup;