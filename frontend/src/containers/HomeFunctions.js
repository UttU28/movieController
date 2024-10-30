// components/HomeFunctions.js
import ButtonGroup from "../components/ButtonGroup";
import { faBackward, faForward, faPlus, faMinus, faPause, faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons';

export default function HomeFunctions() {
  const homeFunctions = [
    [
      { name: "volumeIncrease", icon: faPlus, alias: "VOL" }
    ],
    [
      { name: "previousTrack", icon: faBackward, alias: "PREV" },
      { name: "backSeek", icon: faRotateLeft, alias: "SEEK" },
      { name: "pause", icon: faPause, alias: "PLAY" },
      { name: "forwardSeek", icon: faRotateRight, alias: "SEEK" },
      { name: "nextTrack", icon: faForward, alias: "NEXT" }
    ],
    [
      { name: "volumeDecrease", icon: faMinus, alias: "VOL" },
    ]
  ];

  return (
    <ButtonGroup buttonData={homeFunctions} whatContainer="homeFunctions" />
  );
}
