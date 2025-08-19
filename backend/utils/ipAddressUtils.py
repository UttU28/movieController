import socket
import os
import re

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
    
    print(f"Updated .env file with NEXT_PUBLIC_DEVICE_IP={ipAddress}")

def initializeDeviceIp():
    ipAddress = getIpv4Address()
    if ipAddress:
        print(f"Device IPv4 Address: {ipAddress}")
        updateEnvFile(ipAddress)
        return ipAddress
    else:
        print("Could not retrieve IPv4 address")
        return None
