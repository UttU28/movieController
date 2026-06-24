from utils.input_control import py

def searchNetflix(searchData):
    py.click(1630, 115)
    py.keyDown('ctrl')
    py.press('a')
    py.keyUp('ctrl')
    py.press('backspace')
    py.typewrite(searchData)
    py.press('enter')

def newTabN():
    py.keyDown('ctrl')
    py.press('t')
    py.keyUp('ctrl')
    py.typewrite('https://www.netflix.com/browse')
    py.press('enter')

def skipIntroN():
    py.moveTo(1815, 915, 0.5, py.easeInQuad)
    py.click()

def startN():
    py.press('f')
