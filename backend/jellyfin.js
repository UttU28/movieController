// Evaluated in the Jellyfin tab (over its own DevTools socket, so the tab
// never has to be in front). Uses the web client's logged-in ApiClient for
// everything: library data from the REST API, and control through Jellyfin's
// remote-control commands addressed to this very browser session.
// Installs window.__jfr; guarded by VERSION.
(() => {
  const VERSION = 3;
  if (window.__jfr && window.__jfr.version === VERSION) return;

  const TICKS = 10000000; // Jellyfin times are in 100ns ticks.
  const FOCUS_STYLE = `
    .card:focus .cardBox, .card:focus-within .cardBox,
    .listItem:focus, .button-flat:focus, .emby-button:focus, .MuiButtonBase-root:focus-visible,
    .MuiButtonBase-root.Mui-focusVisible, button:focus-visible, a:focus-visible {
      outline: 4px solid #00a4dc !important;
      outline-offset: 2px !important;
      border-radius: 8px;
      box-shadow: 0 0 22px rgba(0,164,220,.55) !important;
    }
    .card:focus .cardBox, .card:focus-within .cardBox { transform: scale(1.04); transition: transform .12s; }
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
    if (document.getElementById('jfr-style')) return;
    const s = document.createElement('style');
    s.id = 'jfr-style';
    s.textContent = FOCUS_STYLE;
    document.head.appendChild(s);
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

  function describeFocus() {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    const card = a.closest('.card');
    if (card) {
      const lines = [...card.querySelectorAll('.cardText')].map((n) => clean(n.textContent)).filter(Boolean);
      return { kind: 'title', title: lines[0] || clean(card.getAttribute('aria-label')) || 'Item', sub: lines.slice(1).join(' · ') };
    }
    const item = a.closest('.listItem');
    if (item) {
      const lines = [...item.querySelectorAll('.listItemBodyText')].map((n) => clean(n.textContent)).filter(Boolean);
      return { kind: 'episode', title: lines[0] || clean(item.textContent).slice(0, 80), sub: lines.slice(1).join(' · ') };
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

  // ------------------------------------------------------------------ public

  window.__jfr = {
    version: VERSION,

    async state() {
      injectStyle();
      if (!api() || !api().getCurrentUserId || !api().getCurrentUserId()) {
        return { pageType: 'login', url: location.href };
      }
      const session = await mySession();
      return {
        pageType: pageType(),
        url: location.href,
        server: api().serverAddress(),
        layout: localStorage.getItem('layout') || 'auto',
        focus: describeFocus(),
        player: await playerState(session),
      };
    },

    // D-pad and friends: Jellyfin's own remote-control commands.
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
