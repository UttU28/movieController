from utils.input_control import py

def volumeIncrease():
    py.press('volumeup')
    py.press('volumeup')

def previousTrack():
    py.keyDown('alt')
    py.press('left')
    py.keyUp('alt')

def backSeek():
    py.press('left')

def pause():
    py.press('space')

def forwardSeek():
    py.press('right')

def nextTrack():
    py.keyDown('shift')
    py.press('n')
    py.keyUp('shift')

def volumeDecrease():
    py.press('volumedown')
    py.press('volumedown')