from utils.input_control import py

def searchPrime(searchData):
    py.click(1710, 110)
    py.keyDown('ctrl')
    py.press('a')
    py.keyUp('ctrl')
    py.press('backspace')
    py.typewrite(searchData)
    py.press('enter')

def newTabAP():
    py.keyDown('ctrl')
    py.press('t')
    py.keyUp('ctrl')
    py.typewrite('https://www.primevideo.com/')
    py.press('enter')

def startAP():
    py.press('0')
