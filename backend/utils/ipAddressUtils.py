import socket
import os
import re
import qrcode

def getIpv4Address():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ipAddress = s.getsockname()[0]
        s.close()
        return ipAddress
    except Exception as e:
        print(f"Error getting IP address: {e}")
        return None

def updateEnvFile(ipAddress):
    envFile = "../frontend/.env"
    
    if os.path.exists(envFile):
        with open(envFile, 'r', encoding='utf-8') as file:
            content = file.read()
        
        if "NEXT_PUBLIC_DEVICE_IP=" in content:
            newContent = re.sub(
                r'NEXT_PUBLIC_DEVICE_IP=.*',
                f'NEXT_PUBLIC_DEVICE_IP={ipAddress}',
                content
            )
        else:
            newContent = content + f'\nNEXT_PUBLIC_DEVICE_IP={ipAddress}'
    else:
        newContent = f'NEXT_PUBLIC_DEVICE_IP={ipAddress}'
    
    with open(envFile, 'w', encoding='utf-8') as file:
        file.write(newContent)

def getFrontendPort():
    try:
        batchFilePath = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "start_services.bat")
        if os.path.exists(batchFilePath):
            with open(batchFilePath, 'r') as f:
                content = f.read()
                if "Frontend will be available at: http://localhost:8008" in content:
                    return 8008
                elif "Frontend will be available at: http://localhost:3000" in content:
                    return 3000
    except:
        pass
    
    return 8008

def generateFrontendQrCode(ipAddress, port=None):
    if port is None:
        port = getFrontendPort()
        
    try:
        frontendUrl = f"http://{ipAddress}:{port}"
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=1,
            border=1,
        )
        
        qr.add_data(frontendUrl)
        qr.make(fit=True)
        
        print("Frontend QR Code:")
        print("=" * 50)
        
        matrix = qr.get_matrix()
        for row in matrix:
            for cell in row:
                if cell:
                    print('██', end='')
                else:
                    print('  ', end='')
            print()
        
        print("=" * 50)
        print(f"Scan to access: {frontendUrl}")
        
        return frontendUrl
    except Exception as e:
        return None

def initializeDeviceIp():
    ipAddress = getIpv4Address()
    if ipAddress:
        print(f"Device IPv4 Address: {ipAddress}")
        updateEnvFile(ipAddress)
        
        print()
        print("=" * 60)
        print("🎯 MOVIE CONTROLLER FRONTEND ACCESS")
        print("=" * 60)
        print()
        
        generateFrontendQrCode(ipAddress)
        
        return ipAddress
    else:
        print("Could not retrieve IPv4 address")
        return None

def showFrontendQrCode():
    ipAddress = getIpv4Address()
    if ipAddress:
        generateFrontendQrCode(ipAddress)
        return ipAddress
    else:
        print("Could not retrieve IPv4 address")
        return None
