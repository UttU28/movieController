from utils.input_control import py

def searchYouTube(searchData):
    py.press('/')
    py.keyDown('ctrl')
    py.press('a')
    py.keyUp('ctrl')
    py.press('backspace')
    py.typewrite(searchData)
    py.press('enter')

def newTabYT():
    py.keyDown('ctrl')
    py.press('t')
    py.keyUp('ctrl')
    py.typewrite('https://www.youtube.com/')
    py.press('enter')

def escapeYT():
    py.press('esc')

def startYT():
    py.press('0')

def iButtonYT():
    py.press('i')
