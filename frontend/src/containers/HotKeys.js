// containers/HotKeys.js
import ButtonGroup from "../components/ButtonGroup";
import { faMinimize, faDownload, faGlobe, faArrowsRotate, faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
import { faArrowLeft, faArrowRight, faXmark, faChevronRight, faChevronLeft, faVolumeLow } from '@fortawesome/free-solid-svg-icons';
import { faRev } from '@fortawesome/free-brands-svg-icons';

export default function HotKeys() {
  const hotKeys = [[
    { 
      name: "refreshPage", 
      icon: faArrowsRotate, 
      alias: "REFRESH",
      iconColor: "var(--accent-success)",
      size: "medium"
    },
    { 
      name: "altTab", 
      icon: faMinimize, 
      alias: "ALT+TAB",
      iconColor: "var(--accent-info)",
      size: "medium"
    },
    { 
      name: "desktop", 
      icon: faDownload, 
      alias: "WIN+D",
      iconColor: "var(--accent-secondary)",
      size: "medium"
    },
    { 
      name: "openChrome", 
      icon: faGlobe, 
      alias: "CHROME",
      iconColor: "var(--accent-info)",
      size: "medium"
    },
    { 
      name: "reviveTabs", 
      icon: faRev, 
      alias: "C+S+T",
      iconColor: "var(--accent-success)",
      size: "medium"
    },
    { 
      name: "volumeUp", 
      icon: faVolumeHigh, 
      alias: "VOL +",
      iconColor: "var(--accent-primary)",
      size: "medium"
    },
  ],
  [
    { 
      name: "prevTab", 
      icon: faArrowLeft, 
      alias: "PREV TAB",
      iconColor: "var(--accent-secondary)",
      size: "medium"
    },
    { 
      name: "nextTab", 
      icon: faArrowRight, 
      alias: "NEXT TAB",
      iconColor: "var(--accent-secondary)",
      size: "medium"
    },
    { 
      name: "closeTab", 
      icon: faXmark, 
      alias: "CLS TAB",
      iconColor: "var(--accent-primary)",
      size: "medium"
    },
    { 
      name: "goBackTab", 
      icon: faChevronLeft, 
      alias: "TAB BACK",
      iconColor: "var(--accent-info)",
      size: "medium"
    },
    { 
      name: "goAheadTab", 
      icon: faChevronRight, 
      alias: "TAB NEXT",
      iconColor: "var(--accent-info)",
      size: "medium"
    },
    { 
      name: "volumeDown", 
      icon: faVolumeLow, 
      alias: "VOL -",
      iconColor: "var(--accent-primary)",
      size: "medium"
    },
  ]
  ];

  return (
    <ButtonGroup 
      buttonData={hotKeys} 
      whatContainer="hotKeys" 
      title="System Shortcuts"
    />
  );
}
