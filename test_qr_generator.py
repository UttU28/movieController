import qrcode
import os

def getLocalhostIp():
    return "192.168.1.167"

def getFrontendPort():
    try:
        batchFilePath = os.path.join(os.path.dirname(os.path.dirname(__file__)), "start_services.bat")
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

def generateFrontendQrConsole():
    ip = getLocalhostIp()
    frontendPort = getFrontendPort()
    
    frontendUrl = f"http://{ip}:{frontendPort}"
    
    print(f"Frontend URL: {frontendUrl}")
    print(f"IP: {ip}")
    print(f"Port: {frontendPort}")
    print()
    
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

if __name__ == "__main__":
    try:
        import qrcode
        print("QR Code Generator")
        print("=" * 30)
        print()
        
        frontendUrl = generateFrontendQrConsole()
        print(f"✅ Generated: {frontendUrl}")
        
    except ImportError:
        print("Install: pip install qrcode")
        exit(1)
    except Exception as e:
        print(f"Error: {e}")
