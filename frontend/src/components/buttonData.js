// buttonData.js
import { faArrowLeft, faArrowRight, faCirclePlay, faExpand, faInfo, faPlay, faPowerOff, faRotateRight } from "@fortawesome/free-solid-svg-icons";

const getButtonData = (sendCommand) => [
    [
        {
            name: "on",
            icon: faPowerOff,
            alias: "On/Off",
            functionToCall: () => sendCommand("on"),
        },
    ],
    [
        {
            name: "previous",
            icon: faArrowLeft,
            alias: "PREV",
            functionToCall: () => sendCommand("previous"),
        },
        {
            name: "current",
            icon: faCirclePlay,
            alias: "Play",
            functionToCall: () => sendCommand("current"),
        },
        {
            name: "next",
            icon: faArrowRight,
            alias: "Next",
            functionToCall: () => sendCommand("next"),
        },
    ],
    [
        {
            name: "fullscreen",
            icon: faExpand,
            alias: "FLSCRN",
            functionToCall: () => sendCommand("pressButton?key=f"),
        },
        {
            name: "playPause",
            icon: faPlay,
            alias: "PL/USE",
            functionToCall: () => sendCommand("pressButton?key=k"),
        },
        {
            name: "playPause",
            icon: faInfo,
            alias: "pic-dwn",
            functionToCall: () => sendCommand("pressButton?key=i"),
        },
        {
            name: "reload",
            icon: faRotateRight,
            alias: "pic-dwn",
            functionToCall: () => sendCommand("reload"),
        },
    ],
];

export default getButtonData;
