from utils.input_control import py

def searchIBomma(searchData):
    py.keyDown('ctrl')
    py.press('l')
    py.keyUp('ctrl')
    py.typewrite(f'https://search-v2.ibomma.support/?label=telugu&q={"+".join(searchData.strip().split(" "))}')
    py.press('enter')
    # py.typewrite(searchData)

def newTabIB():
    py.keyDown('ctrl')
    py.press('t')
    py.keyUp('ctrl')
    py.typewrite('https://com.ibomma.lol/telugu-movies/')
    py.press('enter')

def skipIntroIB():
    py.click(950, 665)

def startIB():
    py.press('0')
