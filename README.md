# Movie Controller

Remote trackpad / media hotkey control for a desktop machine.

## Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend (Next.js) | **9280** | https://control.thatinsaneguy.com |
| Backend (FastAPI) | **9281** | http://192.168.0.53:9281 (LAN only) |

See `~/Desktop/PORTS.md` for the full desktop port registry.

## Deploy

```bash
sudo bash ~/Desktop/movieController/deploy.sh      # interactive: 0=all, 1=frontend, 2=backend
sudo bash ~/Desktop/movieController/deploy.sh 1    # frontend + nginx only
```
