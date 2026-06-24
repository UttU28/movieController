from utils.input_control import py

def refreshPage():
    py.press('f5')

def altTab():
    py.keyDown('alt')
    py.press('tab')
    py.keyUp('alt')

def desktop():
    py.keyDown('win')
    py.press('d')
    py.keyUp('win')

def openChrome():
    py.keyDown('win')
    py.press('1')
    py.keyUp('win')

def reviveTabs():
    py.hotkey('ctrl','shift','t')

def prevTab():
    py.keyDown('ctrl')
    py.keyDown('shift')
    py.press('tab')
    py.keyUp('shift')
    py.keyUp('ctrl')

def nextTab():
    py.keyDown('ctrl')
    py.press('tab')
    py.keyUp('ctrl')

def closeTab():
    py.keyDown('ctrl')
    py.press('w')
    py.keyUp('ctrl')

def goBackTab():
    py.keyDown('alt')
    py.press('left')
    py.keyUp('alt')

def goAheadTab():
    py.keyDown('alt')
    py.press('right')
    py.keyUp('alt')

def volumeDown():
    py.press('down')

def volumeUp():
    py.press('up')

def fullScreen():
    py.press('f')
