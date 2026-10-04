// Evaluated in the Jellyfin tab (over its own DevTools socket, so the tab
// never has to be in front). Uses the web client's logged-in ApiClient for
// everything: library data from the REST API, and control through Jellyfin's
// remote-control commands addressed to this very browser session.
// Installs window.__jfr; guarded by VERSION.
(() => {
  const VERSION = 7;
  if (window.__jfr && window.__jfr.version === VERSION) return;

  const TICKS = 10000000; // Jellyfin times are in 100ns ticks.
  const FOCUS_ATTR = 'data-jfr-focus';
  const FOCUS_STYLE = `
    [${FOCUS_ATTR}] {
      outline: 4px solid #00a4dc !important;
      outline-offset: 3px !important;
      border-radius: 10px !important;
      box-shadow: 0 0 0 8px rgba(0,164,220,.25), 0 0 26px rgba(0,164,220,.5) !important;
      position: relative;
      z-index: 2;
    }
    .card[${FOCUS_ATTR}] { outline: none !important; box-shadow: none !important; }
    .card[${FOCUS_ATTR}] .cardBox {
      outline: 4px solid #00a4dc !important;
      outline-offset: 2px;
      border-radius: 10px;
      box-shadow: 0 0 26px rgba(0,164,220,.55) !important;
      transform: scale(1.04);
      transition: transform .12s;
    }
  `;

  const api = () => window.ApiClient;
  const userId = () => api().getCurrentUserId();
  // ApiClient rejects with a bare Response; turn that into a readable error.
  const explain = (r) => {
    throw new Error(r && r.status ? `Jellyfin said ${r.status} ${r.statusText || ''}`.trim() : String(r && r.message || r));
  };
  const get = (path, params) => api().getJSON(api().getUrl(path, params)).catch(explain);
  const post = (path, params, body) => api().ajax({
    type: 'POST',
    url: api().getUrl(path, params),
    data: body ? JSON.stringify(body) : undefined,
    contentType: 'application/json',
  }).catch(explain);
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

  function injectStyle() {
    let s = document.getElementById('jfr-style');
    if (s && s.dataset.v === String(VERSION)) return;
    if (!s) {
      s = document.createElement('style');
      s.id = 'jfr-style';
      document.head.appendChild(s);
    }
    s.dataset.v = String(VERSION);
    s.textContent = FOCUS_STYLE;
  }

  // ------------------------------------------------------------------ session

  let sessionId = null;

  async function mySession() {
    const list = await get('Sessions', { DeviceId: api().deviceId() });
    const me = list.find((s) => s.DeviceId === api().deviceId()) || list[0] || null;
    sessionId = me ? me.Id : null;
    return me;
  }

  async function sid() {
    if (!sessionId) await mySession();
    if (!sessionId) throw new Error('This Jellyfin tab has no session yet');
    return sessionId;
  }

  const command = async (Name, Arguments) => post(`Sessions/${await sid()}/Command`, null, Arguments ? { Name, Arguments } : { Name });
  const playstate = async (cmd, params) => post(`Sessions/${await sid()}/Playing/${cmd}`, params);

  // ------------------------------------------------------------------ items

  function imageUrl(item, height = 300) {
    const base = api().serverAddress();
    const q = `fillHeight=${height}&quality=85`;
    if (item.ImageTags && item.ImageTags.Primary) return `${base}/Items/${item.Id}/Images/Primary?${q}&tag=${item.ImageTags.Primary}`;
    if (item.SeriesPrimaryImageTag && item.SeriesId) return `${base}/Items/${item.SeriesId}/Images/Primary?${q}&tag=${item.SeriesPrimaryImageTag}`;
    if (item.ParentThumbItemId && item.ParentThumbImageTag) return `${base}/Items/${item.ParentThumbItemId}/Images/Thumb?${q}&tag=${item.ParentThumbImageTag}`;
    return null;
  }

  function slim(item) {
    const ud = item.UserData || {};
    return {
      id: item.Id,
      name: item.Name,
      type: item.Type,
      folder: !!item.IsFolder,
      collectionType: item.CollectionType || null,
      year: item.ProductionYear || null,
      childCount: item.ChildCount ?? item.RecursiveItemCount ?? null,
      unplayed: ud.UnplayedItemCount || 0,
      played: !!ud.Played,
      progress: ud.PlayedPercentage ? Math.round(ud.PlayedPercentage) : 0,
      resumeTicks: ud.PlaybackPositionTicks || 0,
      runtime: item.RunTimeTicks ? Math.round(item.RunTimeTicks / TICKS / 60) : null,
      index: item.IndexNumber ?? null,
      season: item.ParentIndexNumber ?? null,
      series: item.SeriesName || null,
      rating: item.CommunityRating ? Math.round(item.CommunityRating * 10) / 10 : null,
      image: imageUrl(item),
      wide: item.Type === 'Episode' || item.Type === 'CollectionFolder' || item.Type === 'UserView',
    };
  }

  const FIELDS = 'ChildCount,RecursiveItemCount,PrimaryImageAspectRatio,ProductionYear,CommunityRating,UserData';

  // ------------------------------------------------------------------ page

  function pageType() {
    const h = location.hash;
    if (h.startsWith('#/video')) return 'player';
    if (h.startsWith('#/details')) return 'detail';
    if (h.startsWith('#/search')) return 'search';
    if (h.startsWith('#/home') || h === '' || h === '#/') return 'home';
    if (h.startsWith('#/login') || h.startsWith('#/selectserver')) return 'login';
    return 'browse';
  }

  // ------------------------------------------------------------------ D-pad
  // Jellyfin's own Move commands step through every focusable part of a card
  // (poster, hidden menu button, title link), so one card took several taps.
  // We move between whole items instead: cards, episode rows, the buttons on
  // a details page, tabs, and menu entries when a popup menu is open.

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    if (el.closest('.hide, [hidden]')) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  }

  function openDialog() {
    const dialogs = [...document.querySelectorAll('.dialog.opened, .dialogContainer .dialog, .actionSheet')].filter(isVisible);
    return dialogs[dialogs.length - 1] || null;
  }

  function candidates() {
    const dialog = openDialog();
    const root = dialog || document.querySelector('.page:not(.hide)') || document.body;
    const sel = dialog
      ? '.actionSheetMenuItem, .listItem, button.emby-button, .btnOption'
      : [
          '.card',
          '.listItem',
          '.detailButton',
          '.mainDetailButtons button',
          '.emby-tab-button',
          '.sectionTitleContainer a',
          '.btnPlay, .btnResume',
        ].join(',');
    const seen = new Set();
    return [...root.querySelectorAll(sel)].filter((el) => {
      // One stop per card: skip anything inside a card that's already a stop.
      const card = el.closest('.card');
      const stop = card || el;
      if (seen.has(stop)) return false;
      seen.add(stop);
      return isVisible(card ? card.querySelector('.cardBox') || card : el);
    }).map((el) => el.closest('.card') || el);
  }

  // A card's own element can be zero-size; its .cardBox is what you see.
  const visibleBox = (el) => (el.matches('.card') ? el.querySelector('.cardBox') || el : el);

  function current() {
    const el = document.querySelector(`[${FOCUS_ATTR}]`);
    if (el && el.isConnected && isVisible(visibleBox(el))) return el;
    if (el) el.removeAttribute(FOCUS_ATTR);
    return null;
  }

  function rectOf(el) {
    const box = el.matches('.card') ? el.querySelector('.cardBox') || el : el;
    const r = box.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function setFocus(el) {
    document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((n) => n.removeAttribute(FOCUS_ATTR));
    if (!el) return;
    el.setAttribute(FOCUS_ATTR, '');
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }

  function initialFocus(cands) {
    const inView = cands
      .map((el) => ({ el, r: rectOf(el) }))
      .filter(({ r }) => r.y + r.h > 60 && r.y < innerHeight - 20);
    inView.sort((a, b) => (Math.abs(a.r.y - b.r.y) > 20 ? a.r.y - b.r.y : a.r.x - b.r.x));
    return (inView[0] && inView[0].el) || cands[0] || null;
  }

  // Positions are in viewport space; rows scroll sideways inside their own
  // scrollers, so this also finds cards just off-screen in the same row.
  function bestInDirection(cur, cands, dir) {
    const c = rectOf(cur);
    let best = null;
    let bestScore = Infinity;
    for (const el of cands) {
      if (el === cur) continue;
      const r = rectOf(el);
      const tol = Math.min(c.w, c.h, r.w, r.h) * 0.3;
      let primary, gap, centerDiff;
      if (dir === 'down' || dir === 'up') {
        primary = dir === 'down' ? r.y - (c.y + c.h) : c.y - (r.y + r.h);
        gap = Math.max(0, Math.max(r.x, c.x) - Math.min(r.x + r.w, c.x + c.w));
        centerDiff = Math.abs(r.x + r.w / 2 - (c.x + c.w / 2));
      } else {
        primary = dir === 'right' ? r.x - (c.x + c.w) : c.x - (r.x + r.w);
        gap = Math.max(0, Math.max(r.y, c.y) - Math.min(r.y + r.h, c.y + c.h));
        centerDiff = Math.abs(r.y + r.h / 2 - (c.y + c.h / 2));
        // Sideways moves stay in the same row.
        if (gap > 0) continue;
      }
      if (primary < -tol) continue;
      const score = Math.max(0, primary) + gap * 3 + centerDiff * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function move(dir) {
    injectStyle();
    const cands = candidates();
    const cur = current();
    if (!cur) {
      setFocus(initialFocus(cands));
      return { moved: true };
    }
    const next = bestInDirection(cur, cands, dir);
    if (next) {
      setFocus(next);
      return { moved: true };
    }
    if (dir === 'down') window.scrollBy({ top: innerHeight * 0.6, behavior: 'smooth' });
    if (dir === 'up') window.scrollBy({ top: -innerHeight * 0.6, behavior: 'smooth' });
    return { moved: false, edge: true };
  }

  // OK: open the highlighted item through its main link / button.
  function select() {
    const cur = current();
    if (!cur) {
      setFocus(initialFocus(candidates()));
      return { action: 'focused' };
    }
    const target = cur.matches('.card')
      ? cur.querySelector('a.cardImageContainer, .cardContent-button, [data-action="link"], button.cardImageContainer') || cur
      : cur;
    cur.removeAttribute(FOCUS_ATTR);
    target.click();
    return { action: 'click' };
  }

  function describeFocus() {
    const a = current();
    if (!a) return null;
    if (a.matches('.card')) {
      const lines = [...a.querySelectorAll('.cardText')].map((n) => clean(n.textContent)).filter(Boolean);
      return { kind: 'title', title: lines[0] || clean(a.getAttribute('aria-label')) || 'Item', sub: lines.slice(1).join(' · ') };
    }
    if (a.matches('.listItem')) {
      const lines = [...a.querySelectorAll('.listItemBodyText')].map((n) => clean(n.textContent)).filter(Boolean);
      return { kind: 'episode', title: lines[0] || clean(a.textContent).slice(0, 80), sub: lines.slice(1).join(' · ') };
    }
    const label = clean(a.getAttribute('aria-label') || a.getAttribute('title') || a.textContent);
    return label ? { kind: 'button', title: label.slice(0, 80) } : null;
  }

  // Jellyfin's "Skip Intro" / segment skip button in the video OSD.
  function skipButton() {
    return [...document.querySelectorAll('.skip-button, button')].find((b) => {
      const t = clean(b.textContent);
      const r = b.getBoundingClientRect();
      return /^skip/i.test(t) && r.width > 0 && r.height > 0 && !b.classList.contains('hide');
    }) || null;
  }

  async function playerState(session) {
    const item = session && session.NowPlayingItem;
    if (!item) return null;
    const ps = session.PlayState || {};
    const skip = skipButton();
    let subtitle = '';
    if (item.Type === 'Episode') {
      subtitle = [item.SeriesName, item.ParentIndexNumber != null ? `S${item.ParentIndexNumber}:E${item.IndexNumber}` : '', item.Name]
        .filter(Boolean).join(' · ');
    } else if (item.ProductionYear) {
      subtitle = String(item.ProductionYear);
    }
    return {
      id: item.Id,
      title: item.Type === 'Episode' ? (item.SeriesName || item.Name) : item.Name,
      subtitle,
      currentTime: (ps.PositionTicks || 0) / TICKS,
      duration: (item.RunTimeTicks || 0) / TICKS,
      paused: !!ps.IsPaused,
      volume: ps.VolumeLevel ?? 100,
      muted: !!ps.IsMuted,
      audioIndex: ps.AudioStreamIndex ?? null,
      subtitleIndex: ps.SubtitleStreamIndex ?? -1,
      skipLabel: skip ? clean(skip.textContent) : null,
      hasNext: true,
      image: imageUrl(item, 200),
      fullscreen: !!document.fullscreenElement,
    };
  }

  // ------------------------------------------------------------------ title page
  // When the TV is on an item's details page, the phone gets Play / Resume
  // and (for shows) seasons and episodes to play straight away.

  // Lives outside __jfr so it survives the script being re-installed.
  const sel = (window.__jfrSel = window.__jfrSel || { item: null, season: null });
  let detailCache = { key: null, at: 0, value: null };
  const DETAIL_TTL = 5000;

  const clock = (ticks) => {
    const s = Math.round(ticks / TICKS);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  function detailId() {
    if (pageType() !== 'detail') return null;
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    return q.get('id');
  }

  const resumeOf = (it) => {
    const ud = it.UserData || {};
    return !ud.Played && ud.PlaybackPositionTicks > 0 ? ud.PlaybackPositionTicks : 0;
  };

  function entry(it) {
    const ud = it.UserData || {};
    const resume = resumeOf(it);
    const left = resume && it.RunTimeTicks ? Math.max(1, Math.round((it.RunTimeTicks - resume) / TICKS / 60)) : null;
    return {
      id: it.Id,
      title: it.Name,
      number: it.IndexNumber ?? null,
      season: it.ParentIndexNumber ?? null,
      runtime: it.RunTimeTicks ? `${Math.round(it.RunTimeTicks / TICKS / 60)} min` : null,
      left: ud.Played ? 'Watched' : left ? `${left} min left` : null,
      played: !!ud.Played,
      progress: resume && ud.PlayedPercentage ? Math.round(ud.PlayedPercentage) : 0,
      year: it.ProductionYear || null,
    };
  }

  const epCode = (e) => (e.ParentIndexNumber != null && e.IndexNumber != null ? `S${e.ParentIndexNumber}:E${e.IndexNumber}` : e.Name);

  async function buildDetail(id) {
    const it = await get(`Users/${userId()}/Items/${id}`);
    const out = { id: it.Id, type: it.Type, title: it.Name, year: it.ProductionYear || null, seasons: [], episodes: [] };
    // What the big button plays: { id, resume ticks } and its label.
    let target = null;
    let label = null;

    if (it.Type === 'Series' || it.Type === 'Season') {
      const seriesId = it.Type === 'Series' ? it.Id : it.SeriesId;
      if (it.Type === 'Season') out.title = `${it.SeriesName || ''} · ${it.Name}`.replace(/^ · /, '');
      const [seasons, nextUp] = await Promise.all([
        get(`Shows/${seriesId}/Seasons`, { UserId: userId(), Fields: 'UserData' }),
        get('Shows/NextUp', { UserId: userId(), SeriesId: seriesId, Limit: 1, Fields: 'UserData', EnableResumable: true }),
      ]);
      const next = nextUp.Items[0] || null;
      // Which season's episodes to list: the one picked on the phone, the
      // season page the TV is on, next up's season, or the first.
      let seasonId = sel.item === id && sel.season ? sel.season : null;
      if (!seasonId && it.Type === 'Season') seasonId = it.Id;
      if (!seasonId && next) seasonId = next.SeasonId || next.ParentId;
      if (!seasons.Items.some((s) => s.Id === seasonId)) seasonId = seasons.Items[0] ? seasons.Items[0].Id : null;
      out.seasons = seasons.Items.map((s) => ({
        id: s.Id,
        label: s.Name,
        selected: s.Id === seasonId,
        unplayed: (s.UserData && s.UserData.UnplayedItemCount) || 0,
      }));
      if (seasonId) {
        const eps = await get(`Shows/${seriesId}/Episodes`, { UserId: userId(), SeasonId: seasonId, Fields: 'UserData' });
        out.episodes = eps.Items.map(entry);
      }
      let first = next;
      if (!first && it.Type === 'Season' && out.episodes.length) first = (await get(`Users/${userId()}/Items/${out.episodes[0].id}`));
      if (!first) {
        const r = await get(`Users/${userId()}/Items`, {
          ParentId: seriesId, Recursive: true, IncludeItemTypes: 'Episode', SortBy: 'ParentIndexNumber,IndexNumber', Limit: 1, Fields: 'UserData',
        });
        first = r.Items[0] || null;
      }
      if (first) {
        const r = resumeOf(first);
        target = { id: first.Id, resume: r, item: first };
        label = `${r ? 'Resume' : 'Play'} ${epCode(first)}`;
        out.nextEpisode = { id: first.Id, title: first.Name, code: epCode(first) };
      }
    } else if (it.Type === 'BoxSet' || it.Type === 'Playlist' || (it.IsFolder && it.Type !== 'CollectionFolder' && it.Type !== 'UserView')) {
      const kids = await get(`Users/${userId()}/Items`, {
        ParentId: it.Id, Fields: 'UserData', SortBy: it.Type === 'BoxSet' ? 'ProductionYear,SortName' : 'SortName', Limit: 100,
      });
      out.episodes = kids.Items.filter((k) => !k.IsFolder).map((k) => ({ ...entry(k), number: null }));
      const firstUnwatched = kids.Items.find((k) => !k.IsFolder && !(k.UserData && k.UserData.Played)) || kids.Items.find((k) => !k.IsFolder);
      if (firstUnwatched) {
        const r = resumeOf(firstUnwatched);
        target = { id: firstUnwatched.Id, resume: r, item: firstUnwatched };
        label = `${r ? 'Resume' : 'Play'} ${firstUnwatched.Name}`;
      }
      out.listLabel = 'Titles';
    } else if (!it.IsFolder) {
      const r = resumeOf(it);
      target = { id: it.Id, resume: r, item: it };
      label = r ? 'Resume' : 'Play';
      if (it.Type === 'Episode') out.title = `${it.SeriesName ? `${it.SeriesName} · ` : ''}${epCode(it)} ${it.Name}`;
    }

    if (target) {
      out.playId = target.id;
      out.playLabel = label;
      out.canResume = target.resume > 0;
      out.resumeAt = target.resume ? clock(target.resume) : null;
      const ud = target.item.UserData || {};
      out.progress = target.resume ? Math.round(ud.PlayedPercentage || 0) : 0;
    }
    out.runtime = it.RunTimeTicks ? `${Math.round(it.RunTimeTicks / TICKS / 60)} min` : null;
    return out;
  }

  async function detailState() {
    const id = detailId();
    if (!id) return null;
    const key = `${id}|${sel.item === id ? sel.season : ''}`;
    if (detailCache.key === key && Date.now() - detailCache.at < DETAIL_TTL) return detailCache.value;
    const value = await buildDetail(id).catch(() => null);
    detailCache = { key, at: Date.now(), value };
    return value;
  }

  // ------------------------------------------------------------------ public

  window.__jfr = {
    version: VERSION,

    async state() {
      injectStyle();
      if (!api() || !api().getCurrentUserId || !api().getCurrentUserId()) {
        return { pageType: 'login', url: location.href };
      }
      const [session, detail] = await Promise.all([mySession(), detailState()]);
      return {
        pageType: pageType(),
        url: location.href,
        server: api().serverAddress(),
        layout: localStorage.getItem('layout') || 'auto',
        focus: describeFocus(),
        player: await playerState(session),
        detail,
      };
    },

    // Phone picked a season on the title page: list its episodes.
    pickSeason(seasonId) {
      sel.item = detailId();
      sel.season = seasonId;
      detailCache.at = 0;
      return seasonId;
    },

    // Something was played or watched; re-read the title page next time.
    forgetDetail() {
      detailCache.at = 0;
      return true;
    },

    // D-pad and friends: Jellyfin's own remote-control commands.
    move(dir) { return move(dir); },
    select() { return select(); },

    async command(name, args) {
      injectStyle();
      await command(name, args);
      return name;
    },

    async playstate(cmd, params) {
      await playstate(cmd, params);
      return cmd;
    },

    async seekBy(seconds) {
      const s = await mySession();
      const pos = (s && s.PlayState && s.PlayState.PositionTicks) || 0;
      const dur = (s && s.NowPlayingItem && s.NowPlayingItem.RunTimeTicks) || Infinity;
      const target = Math.max(0, Math.min(dur - TICKS, pos + seconds * TICKS));
      await playstate('Seek', { SeekPositionTicks: Math.round(target) });
      return target / TICKS;
    },

    async seekTo(fraction) {
      const s = await mySession();
      const dur = s && s.NowPlayingItem && s.NowPlayingItem.RunTimeTicks;
      if (!dur) return false;
      await playstate('Seek', { SeekPositionTicks: Math.round(dur * Math.max(0, Math.min(0.999, fraction))) });
      return true;
    },

    async play(itemId, fromStart) {
      const item = await get(`Users/${userId()}/Items/${itemId}`);
      const params = { playCommand: 'PlayNow', itemIds: itemId };
      const resume = item.UserData && item.UserData.PlaybackPositionTicks;
      if (!fromStart && resume) params.startPositionTicks = resume;
      if (item.IsFolder) {
        // Series / season / collection: play its first unwatched episode or item.
        const kids = await get(`Users/${userId()}/Items`, {
          ParentId: itemId, Recursive: true, IsFolder: false, SortBy: 'ParentIndexNumber,IndexNumber,SortName',
          Filters: fromStart ? undefined : 'IsUnplayed', Limit: 1, Fields: 'UserData',
          IncludeItemTypes: 'Movie,Episode,Video',
        });
        if (!kids.Items.length) throw new Error('Nothing to play in there');
        params.itemIds = kids.Items[0].Id;
        const r = kids.Items[0].UserData && kids.Items[0].UserData.PlaybackPositionTicks;
        if (!fromStart && r) params.startPositionTicks = r; else delete params.startPositionTicks;
      }
      await post(`Sessions/${await sid()}/Playing`, params);
      return params.itemIds;
    },

    async display(itemId) {
      const item = await get(`Users/${userId()}/Items/${itemId}`);
      await command('DisplayContent', { ItemId: item.Id, ItemType: item.Type, ItemName: item.Name });
      return item.Name;
    },

    // Library for the phone: home shelves, a folder's children, an item's
    // details, search.
    async home() {
      const [views, resume, nextUp] = await Promise.all([
        get(`Users/${userId()}/Views`),
        get(`Users/${userId()}/Items/Resume`, { Limit: 16, Fields: FIELDS, MediaTypes: 'Video' }),
        get('Shows/NextUp', { UserId: userId(), Limit: 16, Fields: FIELDS }),
      ]);
      return {
        server: api().serverAddress(),
        libraries: views.Items.map(slim),
        resume: resume.Items.map(slim),
        nextUp: nextUp.Items.map(slim),
      };
    },

    async browse(parentId, start = 0) {
      const parent = await get(`Users/${userId()}/Items/${parentId}`);
      const params = { ParentId: parentId, StartIndex: start, Limit: 60, Fields: FIELDS };
      if (parent.Type === 'Series' || parent.Type === 'Season') {
        params.SortBy = 'ParentIndexNumber,IndexNumber,SortName';
      } else if (parent.Type === 'BoxSet') {
        params.SortBy = 'ProductionYear,SortName';
      } else {
        params.SortBy = 'IsFolder,SortName';
        // Movie and show libraries list every title (like Jellyfin's own
        // library view); plain folders stay browsable via the Folders library.
        if (parent.CollectionType === 'movies') params.IncludeItemTypes = 'Movie,BoxSet';
        if (parent.CollectionType === 'tvshows') params.IncludeItemTypes = 'Series';
        if (parent.CollectionType === 'movies' || parent.CollectionType === 'tvshows') params.Recursive = true;
      }
      const kids = await get(`Users/${userId()}/Items`, params);
      return { parent: slim(parent), items: kids.Items.map(slim), total: kids.TotalRecordCount, start };
    },

    async item(itemId) {
      const it = await get(`Users/${userId()}/Items/${itemId}`);
      const streams = ((it.MediaSources && it.MediaSources[0] && it.MediaSources[0].MediaStreams) || it.MediaStreams || []);
      return {
        ...slim(it),
        overview: it.Overview || '',
        genres: it.Genres || [],
        officialRating: it.OfficialRating || null,
        tagline: (it.Taglines || [])[0] || null,
        audio: streams.filter((s) => s.Type === 'Audio').map((s) => ({ index: s.Index, label: s.DisplayTitle || s.Language || `Track ${s.Index}` })),
        subtitles: streams.filter((s) => s.Type === 'Subtitle').map((s) => ({ index: s.Index, label: s.DisplayTitle || s.Language || `Subtitle ${s.Index}` })),
        backdrop: it.BackdropImageTags && it.BackdropImageTags.length
          ? `${api().serverAddress()}/Items/${it.Id}/Images/Backdrop?fillWidth=800&quality=80&tag=${it.BackdropImageTags[0]}` : null,
      };
    },

    async search(query) {
      const r = await get(`Users/${userId()}/Items`, {
        searchTerm: query, Recursive: true, Limit: 60, Fields: FIELDS,
        IncludeItemTypes: 'Movie,Series,Episode,BoxSet,Season,Folder,Video',
      });
      return { items: r.Items.map(slim), total: r.TotalRecordCount };
    },

    skip() {
      const b = skipButton();
      if (b) b.click();
      return !!b;
    },

    // Jellyfin's TV layout is built for remote control (big focusable cards).
    setLayout(layout) {
      localStorage.setItem('layout', layout);
      location.reload();
      return layout;
    },
  };
})();
