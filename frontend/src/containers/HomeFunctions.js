// containers/HomeFunctions.js
import ButtonGroup from "../components/ButtonGroup";
import { faBackward, faForward, faPlus, faMinus, faPause, faRotateLeft, faRotateRight, faPlay } from '@fortawesome/free-solid-svg-icons';

export default function HomeFunctions() {
  const homeFunctions = [
    [
      { 
        name: "volumeIncrease", 
        icon: faPlus, 
        alias: "VOL +", 
        iconColor: "var(--accent-primary)",
        size: "medium"
      }
    ],
    [
      { 
        name: "previousTrack", 
        icon: faBackward, 
        alias: "PREV",
        iconColor: "var(--accent-info)",
        size: "medium"
      },
      { 
        name: "backSeek", 
        icon: faRotateLeft, 
        alias: "SEEK",
        iconColor: "var(--accent-secondary)",
        size: "medium"
      },
      { 
        name: "pause", 
        icon: faPause, 
        alias: "PAUSE",
        iconColor: "white",
        size: "medium"
      },
      { 
        name: "forwardSeek", 
        icon: faRotateRight, 
        alias: "SEEK",
        iconColor: "var(--accent-secondary)",
        size: "medium"
      },
      { 
        name: "nextTrack", 
        icon: faForward, 
        alias: "NEXT",
        iconColor: "var(--accent-info)",
        size: "medium"
      }
    ],
    [
      { 
        name: "volumeDecrease", 
        icon: faMinus, 
        alias: "VOL -", 
        iconColor: "var(--accent-primary)",
        size: "medium"
      }
    ]
  ];

  return (
    <ButtonGroup 
      buttonData={homeFunctions} 
      whatContainer="homeFunctions" 
      title="Media Controls"
    />
  );
}
