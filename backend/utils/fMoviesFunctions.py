from utils.input_control import py

def searchFMovies(searchData):
    py.keyDown('ctrl')
    py.press('l')
    py.keyUp('ctrl')
    py.typewrite(f'https://fmoviesz.to/filter?keyword={"+".join(searchData.strip().split(" "))}')
    py.press('enter')
    # py.typewrite(searchData)

def newTabFM():
    py.keyDown('ctrl')
    py.press('t')
    py.keyUp('ctrl')
    py.typewrite('https://fmoviesz.to/home')
    py.press('enter')

def click1FM():
    py.click(950, 665)

def startFM():
    py.press('0')

def skipIntroFM():
    py.click(950, 665)