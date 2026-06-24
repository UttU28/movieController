from utils.input_control import py

def searchGoogleChrome(searchData):
    py.press('esc')
    py.press('esc')
    py.press('f6')
    py.keyDown('ctrl')
    py.press('a')
    py.keyUp('ctrl')
    py.press('backspace')
    py.typewrite(searchData)
    py.press('enter')

def newTabGC():
    py.keyDown('ctrl')
    py.press('t')
    py.keyUp('ctrl')

def saveLinkGC():
    pass
