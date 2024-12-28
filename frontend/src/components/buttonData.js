// buttonData.js
import { faArrowLeft, faArrowRight, faCirclePlay, faExpand, faInfo, faPlay, faPlus, faPowerOff, faBackward, faRotateLeft, faPause, faRotateRight, faForward, faMinus } from "@fortawesome/free-solid-svg-icons";

const getButtonData = (sendCommand) => [
    [
    ],
    [
        {
            name: "newTab",
            icon: faPlus,
            alias: "+ TAB",
            functionToCall: () => sendCommand("previous"),
        },
        {
            name: "volumeIncrease",
            icon: faPlus,
            alias: "VOL",
            functionToCall: () => sendCommand("previous"),
        },
        {
            name: "on",
            icon: faPowerOff,
            alias: "On/Off",
            functionToCall: () => sendCommand("on"),
        },
    ],
    [
        {
            name: "reload",
            icon: faRotateRight,
            alias: "RLoD",
            functionToCall: () => sendCommand("reload"),
        },
        {
            name: "backSeek",
            icon: faRotateLeft,
            alias: "SEEK",
            functionToCall: () => sendCommand("pressButton?key=j"),
        },
        {
            name: "playPause",
            icon: faPause,
            alias: "PL/USE",
            functionToCall: () => sendCommand("pressButton?key=k"),
        },
        {
            name: "forwardSeek",
            icon: faRotateRight,
            alias: "SEEK",
            functionToCall: () => sendCommand("pressButton?key=l"),
        },
        {
            name: "fullscreen",
            icon: faExpand,
            alias: "FlScrn",
            functionToCall: () => sendCommand("pressButton?key=f"),
        },
    ],
    [
        {
            name: "volumeDecrease",
            icon: faMinus,
            alias: "VOL",
            functionToCall: () => sendCommand("previous"),
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
            alias: "PLAY",
            functionToCall: () => sendCommand("current"),
        },
        {
            name: "next",
            icon: faArrowRight,
            alias: "Next",
            functionToCall: () => sendCommand("next"),
        },
        {
            name: "playPause",
            icon: faInfo,
            alias: "i-Btn",
            functionToCall: () => sendCommand("pressButton?key=i"),
        },
    ],
];

export default getButtonData;
