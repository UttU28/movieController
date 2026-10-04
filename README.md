# Phone Remote: Laptop, YouTube, Prime Video, Netflix, Jellyfin

Phone remote for this PC with an app switcher at the top:

- **Laptop**: trackpad (move, tap, scroll, right-click, drag), keyboard typing,
  Windows/browser shortcuts, system volume and media keys, and app launching.
- **YouTube**, **Prime Video** and **Netflix**: TV-style control of the site in
  Chrome. A D-pad moves a highlight between tiles and OK opens the highlighted
  one. The phone shows what's selected and what's playing.

Each app has its own colour theme on the phone, and the app switcher stays
pinned at the top. Picking YouTube, Prime or Netflix also switches Chrome to
that app's tab (opening it if needed) and brings it forward. Every app page
has the laptop's own volume in its audio row: **PC + · App + · PC Mute · App − · PC −**.

| Service | Port | Folder |
|---------|------|--------|
| Backend (FastAPI + Selenium + pyautogui) | **9282** | `backend/` |
| Frontend (Next.js phone UI) | **9283** | `frontend/` |
| Chrome remote-debugging | 9222 | (local only) |

The old pyautogui controller (`../backend`, `../frontend`, ports 9280/9281) is untouched.

## Run

```powershell
# Backend
cd new\backend
python -m venv venv                        # first time only
venv\Scripts\pip install -r requirements.txt
copy .env.example .env                     # first time only
venv\Scripts\python app.py

# Frontend (second terminal)
cd new\frontend
npm install                                # first time only
npm run dev
```

Open `http://<this-PC's-LAN-IP>:9283` on your phone (same Wi-Fi), or just scan
the QR code in Chrome's last tab (the backend also prints the address when it
starts). The frontend calls the backend on the same host at port 9282
automatically. The phone remembers which app you used last.

## Chrome's tabs

The backend keeps the remote's Chrome tabs in this order:
**YouTube · Prime Video · Netflix · Jellyfin · Remote QR**.

- If you close one, it's reopened in its place within a couple of seconds.
  Chrome can only add tabs at the end, so the tabs after it are reopened too,
  at the same pages (e.g. closing Prime reloads Netflix and the QR tab; closing
  the QR tab touches nothing else). Tabs you open yourself are left alone.
- If Chrome itself is closed, it isn't relaunched by this; the next phone
  command (or a backend restart) starts it again with all four tabs.
- The QR tab is `http://127.0.0.1:9282/qr`, built from
  `backend/templates/qr.html`. Edit that file freely: `{{QR}}` becomes the QR
  code and `{{URL}}` the remote's address. Set `FRONTEND_URL` in `.env` to put a
  different address in the code (by default it's this PC's Wi-Fi IP on port
  9283).

## How the Chrome part works

- On start the backend attaches to Chrome on port 9222. If nothing is running
  there, it starts a normal Chrome window with that port and its own profile
  (`%LOCALAPPDATA%\YouTubeRemote\chrome-profile`), then attaches.
- That Chrome is a regular browser, not a chromedriver-launched one. It has no
  "controlled by automated software" bar, sign-ins work, and it **keeps
  running when the backend stops**. Restarting the backend just re-attaches.
- Sign in to YouTube, Prime Video and Netflix in that window once.
- Chrome won't allow remote control of your *default* profile (Chrome 136+), so
  this has to be a separate profile. You can keep using your normal Chrome
  alongside it.
- YouTube, Prime and Netflix share that one Chrome. The remote works on the tab of the
  app you picked on the phone, in the background: it never pulls Chrome forward
  on its own. Only picking an app, **Focus**, or "Show … in Chrome" does.
- If you switch tabs by hand in Chrome, the matching app on the phone picks it
  up (even while Chrome is behind other windows). The other apps' pages show
  "Chrome is showing another tab" with a button to switch back.

## Laptop controls

| Phone | What it does |
|-------|--------------|
| Trackpad | One finger moves the pointer (faster swipes go further), tap = left click, two fingers = scroll, two-finger tap = right click |
| Scroll strip | Drag up/down to scroll |
| Pointer speed | Trackpad sensitivity (remembered on the phone) |
| Left / Double / Right / Drag | Mouse buttons. Drag holds the left button until pressed again, and is released automatically if the phone disconnects. |
| Type | Types the text on the laptop (non-English text is pasted via the clipboard) |
| Keys | Esc, Tab, arrows, Backspace, Enter |
| Shortcuts | Alt+Tab, Win+D, Start, Task view, Alt+F4, new/close/reopen/prev/next tab, browser back/forward, refresh, F11, copy, paste, undo, select all, snip, space |
| Sound & media | System volume and mute, media previous / play-pause / next |
| Open apps | Chrome, File Explorer, Notepad, Calculator, Settings, Task Manager, or any app by name through Start search |

The trackpad streams over a WebSocket (`/ws/pointer`) for low latency.

## YouTube controls

| Phone | What it does |
|-------|--------------|
| D-pad | Move the highlight between videos, shorts, channels, filter chips and the player. Hold to repeat. Pressing down at the bottom loads more. |
| OK | Open the highlighted tile. On the player, it plays/pauses. |
| Back / Home / Reload | Browser back (also exits fullscreen), YouTube home, reload |
| Focus | Bring the YouTube tab and Chrome in front of other tabs, apps and popups |
| Mini ("i") | YouTube's `i` shortcut: shrink the video into the miniplayer, press again to expand it |
| Prev / -10s / Play / +10s / Next | Playback. Prev goes back in history (or to the previous video in a playlist). |
| Vol - / Mute / Vol + | YouTube player volume in 10% steps |
| Full / Theater / CC / Speed | Fullscreen video, theater mode, captions, cycle speed 1x→2x→0.75x |
| TV | Toggle the whole Chrome window fullscreen (F11) |
| Skip ad | Skippable ads are skipped automatically; the button is there too |

In fullscreen video, the D-pad acts like a TV player: left/right seek 10s,
up/down change volume, OK plays/pauses. On Shorts, up/down go to the
previous/next short.

## Prime Video controls

| Phone | What it does |
|-------|--------------|
| D-pad / OK | Move the highlight between titles, the hero banner, the play button, episodes and the Episodes/Related tabs; OK opens a title or plays an episode |
| Back | Browser back; in the player, closes the player |
| Home / Focus / Movies / TV shows | Prime home, bring Chrome forward, jump to Movies or TV shows |
| Search | Prime Video search |
| Title card | On a show's page the phone lists its **seasons** (tap to switch) and **episodes** (tap to play), plus the big Play / Resume button |
| -10s / Play / +10s | Player controls (Play on a title page starts or resumes it) |
| Skip | Skip Intro / Skip Recap when Prime offers it (also appears as a button on the card) |
| Next ep | Next episode (also on the card when available) |
| Prime + / Prime − | Player volume (the audio row also has the PC volume and mute) |
| Subtitles / Full / Reload / TV | Subtitles, fullscreen, reload, whole-window fullscreen |

While a video is playing, the D-pad works like a TV: left/right seek 10s,
up/down change volume, OK plays/pauses. The phone shows the show, episode
(e.g. "S1 E1 …"), progress and time left.

## Netflix controls

Same layout as Prime Video, in Netflix red.

| Phone | What it does |
|-------|--------------|
| Who's watching? | On Netflix's profile screen the phone lists the profiles; tap one (or use the D-pad and OK) |
| D-pad / OK | Move between the billboard, cards, and (in a title's pop-up) Play, My List and episodes. Stepping past the last card in a row pages the row with Netflix's own arrows. |
| Back | Closes the title pop-up; in the player, returns to browsing |
| Home / Focus / Shows / Movies | Netflix home, bring Chrome forward, jump to Shows or Movies |
| Title card | A show's **seasons** (tap to switch) and **episodes** (tap to play), plus Play / Resume |
| -10s / Play / +10s / NF + / NF − | Playback and volume through Netflix's own player API (Netflix ignores simulated key presses) |
| Skip / Next ep | Skip Intro / Recap and next episode, clicked on Netflix's own buttons |
| Subtitles / Full | Opens Netflix's Audio & Subtitles menu; fullscreen (needs Chrome visible on screen) |

While a video is playing, the D-pad works like a TV: left/right seek 10s,
up/down change volume, OK plays/pauses.

Keyboard shortcuts also work when you open the remote on a desktop (YouTube,
Prime and Netflix pages): arrows, Enter, Backspace/Esc, Space, `h` home, `f` fullscreen,
`m` mute, `n` next, `j`/`l` seek, plus `i` miniplayer (YouTube) and `s` skip (Prime, Netflix).

## Jellyfin controls

For your Jellyfin server (`JELLYFIN_URL`, default `https://streaming.thatinsaneguy.com`).
Sign in once in the remote's Chrome. Unlike the other apps, Jellyfin has a real
remote-control protocol: the Chrome tab is a Jellyfin "session", and the remote
sends it commands through the tab's own login. D-pad, playback and volume work
even while another tab is showing; starting playback brings the Jellyfin tab
to the front.

The page has two views:

- **Remote**: what's highlighted in the Jellyfin UI, or what's playing (poster,
  title, S/E, progress; **tap the progress bar to jump**), Skip Intro when
  offered, and subtitle / audio track pickers. Buttons: Back · Home · Focus ·
  Menu · TV UI, D-pad, −10s · Play · +10s · Skip · Next, the audio row
  (PC + · JF + · PC Mute · JF − · PC −), Prev · Stop · Full · Reload · TV.
  **TV UI** switches Jellyfin's web client to its TV layout (big focusable
  cards, made for remotes); press again for the desktop layout.
- **Library**: Continue watching, Next up and every library; collections and
  sub-collections, folders, shows → seasons → episodes, with posters,
  watched ticks, unplayed counts and progress bars. An item's sheet shows the
  backdrop, year, runtime, rating, genres and overview, with **Play / Resume**,
  **From start**, **Show on TV** (opens its page in Jellyfin) and **Seasons /
  Open** for folders. The search box searches the whole library.

While a video is playing, the D-pad works like a TV: left/right seek 10s,
up/down change volume, OK plays/pauses.

## TV mode

The **TV** button on every app page toggles the whole Chrome window between
fullscreen and maximized. It reads the window's real state each time, so it
always gets you back out, even after the backend restarted.

## API

- `GET /state?app=youtube|prime|netflix|jellyfin` returns the page type, highlighted item (`focus`), title/seasons/episodes (Prime `detail`), player info, and whether Chrome is running / showing that app
- `POST /app {"app": "laptop|youtube|prime|netflix|jellyfin"}` switches Chrome to that app's tab and brings it forward
- `POST /action {"app": "...", "action": "...", "value": ...}` runs an action (action `playPause` runs `_doPlayPause` in `youtubeRemote.py` / `primeRemote.py` / `netflixRemote.py` / `vikiRemote.py` / `jellyfinRemote.py`; laptop actions are in `LaptopControl.run` in `laptop.py`)
- `POST /search {"app": "youtube|prime|netflix|jellyfin", "query": "..."}`
- `WS /ws/pointer` trackpad stream: `{"t":"m",dx,dy}`, `{"t":"s",dy}`, `{"t":"c",b,double}`, `{"t":"d",on}`
- `GET /screenshot?app=...` returns a PNG of that app's tab (this activates the tab)

Every web-app action response includes the fresh `state`.
