/**
 * @local/dsh-anime — Client half.
 *
 * Registers one complete page in the Harness shell:
 *   - `sidebar.panellist` id `dsh-anime`  → the sidebar icon
 *   - `main` key `dsh-anime`              → the page that icon opens
 *
 * Every byte of data comes from the plugin's own Host routes under
 * `/dsh-anime/api/*` (same origin), because the upstream APIs refuse browser
 * calls (no CORS, POST-only GraphQL, a required User-Agent).
 *
 * Tabs: 本季新番 / 放送表 / 搜索 / 我的追番 / 片源.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-anime',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'dsh-anime'
    const PANEL_ID = 'dsh-anime'
    const PANEL_ORDER = 36
    const STORAGE_KEY = 'dsh-anime:watchlist:v1'
    /** Must match PLUGIN_BUILD in index.js; a mismatch means the host is stale. */
const EXPECTED_BUILD = '2026-10-25.99'
// One line in DevTools so "did the page actually reload?" is answerable without
// guessing: the browser half only refreshes when the shell re-reads this module.
console.info('[dsh-anime] client build', EXPECTED_BUILD)
const SOURCE_KEY = 'dsh-anime:source:v1'
    const API = '/dsh-anime/api'

    /**
     * The desktop shell serves this page from dsh-app://, so `new URL(path,
     * location.href)` would hand mpv a dsh-app://… url it cannot open. Health
     * reports the real server origin (from the request Host header); until it
     * arrives we fall back to the page origin, which is right in a normal
     * browser.
     */
    let HOST_ORIGIN = null
    function realUrl(input) {
      const text = String(input ?? '')
      if (text === '') return text
      if (/^(https?|blob|data|file):/i.test(text)) return text
      const pageOrigin =
        typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? location.origin : ''
      const base = pageOrigin !== '' ? pageOrigin : HOST_ORIGIN ?? ''
      if (base === '') return text
      try {
        return new URL(text, base).href
      } catch {
        return text
      }
    }

    /**
     * The three anime databases this page can be driven by. The choice is a
     * page-wide setting (header toggle, remembered in localStorage) because it
     * decides where 本季新番 / 放送表 / 搜索 all read from — mixing them inside
     * one grid made the same show appear twice with two different ids.
     */
    const SOURCE_OPTIONS = [
      ['anilist', 'AniList'],
      ['bangumi', 'Bangumi'],
      ['animeko', 'Animeko'],
      ['anich', 'AniCh'],
    ]

    /* ------------------------------------------------------------------ *
     * Locale
     * ------------------------------------------------------------------ */

    const ZH = {
    setGroupAll: '全部',
    setGroupPlayback: '播放',
    setGroupPlayer: '桌面播放器',
    setGroupTorrent: '种子流',
    setGroupStorage: '下载与数据',
    setGroupSources: '数据源',
    setGroupUi: '界面',
    setGroupAccount: '账号',
      nav: '追番',
      title: '追番',
      subtitle: '本季新番 · 放送表 · 我的追番',
      tabSeason: '本季新番',
      tabAiring: '放送表',
      tabSearch: '搜索',
      tabMine: '我的追番',
      tabSources: '片源',
      refresh: '刷新',
      today: '今天',
      tomorrow: '明天',
      weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
      winter: '冬季',
      spring: '春季',
      summer: '夏季',
      fall: '秋季',
      sortPopular: '热度',
      sortScore: '评分',
      sortNewest: '最新',
      sortTitle: '名称',
      loadMore: '加载更多',
      loading: '加载中…',
      retry: '重试',
      emptySeason: '这个季度没有匹配的番剧。',
      emptyAiring: '这一天没有排播记录。',
      emptySearch: '输入番名开始搜索（支持中/日/英）。',
      emptyMine: '还没有追番。在本季新番或搜索里点「追番」就会出现在这里。',
      emptySources: '没有匹配的片源。',
      follow: '追番',
      following: '已追',
      unfollow: '取消追番',
      remove: '移除',
      episodes: '话',
      score: '评分',
      nextEpisode: '下一话',
      airingNow: '放送中',
      finished: '已完结',
      notYetAired: '未放送',
      cancelled: '已取消',
      progress: '进度',
      plusOne: '看完一话',
      minusOne: '撤回一话',
      all: '全部',
      online: '在线播放',
      torrent: '种子',
      sourcesTitle: '社区片源目录',
      sourcesHint: '来自 Seanime Marketplace 的在线播放 / 种子片源清单。这里列出目录、作者与清单地址；点开可在浏览器里查看该片源的 manifest。',
      openManifest: '查看 manifest',
      byAuthor: '作者',
      updated: '更新',
      stars: '星',
      anilistPage: 'AniList 页面',
      bangumiPage: 'Bangumi 页面',
      anichPage: 'AniCh 页面',
      searchBangumi: '同时在 Bangumi 搜索',
      searchAnimeko: '同时在 Animeko 搜索',
      bangumiResults: 'Bangumi 结果',
      animekoResults: 'Animeko 结果',
      bangumiDown: 'Bangumi（番组计划）当前不可达，已跳过这个数据源。',
      animekoDown: 'Animeko 当前不可达，已跳过这个数据源。',
      anilistDown: 'AniList 当前不可达。',
      source: '数据源',
      dataSource: '数据源',
      switchSource: '切换数据源',
      hostStale: '这个数据源的宿主路由还没注册：到插件市场把「追番」关一次再打开，然后点重试。',
      daySchedule: '放送时间',
      searchPlaceholder: '搜索番名：如 葬送的芙莉莲 / frieren / フリーレン',
      bgmPlaceholder: '在 Bangumi 搜索…',
      watchedEps: '已看',
      ofEps: '共',
      addedOn: '加入于',
      close: '关闭',
      minuteShort: '分',
      hourShort: '小时',
      dayShort: '天',
      soonAiring: '即将放送',
      alreadyAired: '已放送',
      catalogueOnly: '目录',
      weeklyFrom: 'Bangumi 每周放送',
      loadFailed: '加载失败',
      noCover: '无封面',
      browseTitle: '番名',
      browseTitlePh: '标题…',
      browseFormat: '格式',
      browseGenre: '类型',
      browseTag: '标签',
      browseSeason: '季度',
      browseYear: '年份',
      browseStatus: '状态',
      browseScore: '评分',
      browseSort: '排序',
      browseAdult: '成人内容',
      browseClear: '清空筛选',
      browseMore: '加载更多',
      browseOther: '其他数据库',
      browseTagPh: '标签，如 time travel',
      browseEmpty: '没有符合这些条件的番剧，放宽一两个筛选再试。',
      browseCount: '共',
      any: '不限',
      anyGenres: '所有类型',
      anyTags: '所有标签',
      anyFormats: '所有格式',
      anySeasons: '所有季度',
      anyYears: '所有年份',
      anyStatuses: '所有状态',
      anyScores: '所有评分',
      sortPopular: '人气最高',
      sortScore: '评分最高',
      sortTrending: '近期热度',
      sortNewest: '最新开播',
      sortName: '名称排序',
      sortRelevance: '相关度优先',
      fmtTv: 'TV',
      fmtMovie: '剧场版',
      fmtOva: 'OVA',
      fmtOna: 'ONA',
      fmtSpecial: '特别篇',
      stAiring: '连载中',
      stFinished: '已完结',
      stNotYet: '未开播',
      stHiatus: '暂停',
      stCancelled: '已取消',
    }

    const EN = {
    setGroupAll: 'All',
    setGroupPlayback: 'Playback',
    setGroupPlayer: 'Desktop player',
    setGroupTorrent: 'Torrent streaming',
    setGroupStorage: 'Downloads & data',
    setGroupSources: 'Sources',
    setGroupUi: 'Interface',
    setGroupAccount: 'Accounts',
      nav: 'Anime',
      title: 'Anime Tracker',
      subtitle: 'This season · airing schedule · your list',
      tabSeason: 'Season',
      tabAiring: 'Airing',
      tabSearch: 'Search',
      tabMine: 'My list',
      tabSources: 'Sources',
      refresh: 'Refresh',
      today: 'Today',
      tomorrow: 'Tomorrow',
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      winter: 'Winter',
      spring: 'Spring',
      summer: 'Summer',
      fall: 'Fall',
      sortPopular: 'Popular',
      sortScore: 'Score',
      sortNewest: 'Newest',
      sortTitle: 'Title',
      loadMore: 'Load more',
      loading: 'Loading…',
      retry: 'Retry',
      emptySeason: 'No anime matches this season.',
      emptyAiring: 'Nothing airs on this day.',
      emptySearch: 'Type a title to search (Chinese, Japanese or English).',
      emptyMine: 'Your list is empty. Follow an anime from the season or search tab.',
      emptySources: 'No source matches.',
      follow: 'Follow',
      following: 'Following',
      unfollow: 'Unfollow',
      remove: 'Remove',
      episodes: 'eps',
      score: 'Score',
      nextEpisode: 'Next episode',
      airingNow: 'Airing',
      finished: 'Finished',
      notYetAired: 'Upcoming',
      cancelled: 'Cancelled',
      progress: 'Progress',
      plusOne: 'Watched one',
      minusOne: 'Undo one',
      all: 'All',
      online: 'Online',
      torrent: 'Torrent',
      sourcesTitle: 'Community source catalogue',
      sourcesHint: 'Online-stream and torrent providers from the Seanime Marketplace. This lists the catalogue, authors and manifest addresses; open one to read its manifest in the browser.',
      openManifest: 'Open manifest',
      byAuthor: 'by',
      updated: 'updated',
      stars: 'stars',
      anilistPage: 'AniList page',
      bangumiPage: 'Bangumi page',
      anichPage: 'AniCh page',
      searchBangumi: 'Also search Bangumi',
      searchAnimeko: 'Also search Animeko',
      bangumiResults: 'Bangumi results',
      animekoResults: 'Animeko results',
      bangumiDown: 'Bangumi is unreachable right now; that source is skipped.',
      animekoDown: 'Animeko is unreachable right now; that source is skipped.',
      anilistDown: 'AniList is unreachable right now.',
      source: 'Source',
      dataSource: 'Source',
      switchSource: 'Switch source',
      hostStale: 'This source is not wired up in the running Host yet: toggle the plugin off and on in the plugin market, then retry.',
      daySchedule: 'Airing time',
      searchPlaceholder: 'Search: frieren / 葬送的芙莉莲 / フリーレン',
      bgmPlaceholder: 'Search Bangumi…',
      watchedEps: 'Watched',
      ofEps: 'of',
      addedOn: 'Added',
      close: 'Close',
      minuteShort: 'min',
      hourShort: 'h',
      dayShort: 'd',
      soonAiring: 'Upcoming',
      alreadyAired: 'Aired',
      catalogueOnly: 'Catalogue',
      weeklyFrom: 'Bangumi weekly schedule',
      loadFailed: 'Failed to load',
      noCover: 'No cover',
      browseTitle: 'Title',
      browseTitlePh: 'Title…',
      browseFormat: 'Format',
      browseGenre: 'Genre',
      browseTag: 'Tag',
      browseSeason: 'Season',
      browseYear: 'Year',
      browseStatus: 'Status',
      browseScore: 'Score',
      browseSort: 'Sort',
      browseAdult: 'Adult',
      browseClear: 'Clear filters',
      browseMore: 'Load more',
      browseOther: 'Other databases',
      browseTagPh: 'Tag, e.g. time travel',
      browseEmpty: 'Nothing matches these filters — relax one or two.',
      browseCount: 'Total',
      any: 'Any',
      anyGenres: 'All genres',
      anyTags: 'All tags',
      anyFormats: 'All formats',
      anySeasons: 'All seasons',
      anyYears: 'All years',
      anyStatuses: 'All statuses',
      anyScores: 'All scores',
      sortPopular: 'Highest popularity',
      sortScore: 'Highest score',
      sortTrending: 'Trending now',
      sortNewest: 'Newest',
      sortName: 'Title A–Z',
      sortRelevance: 'Relevance first',
      fmtTv: 'TV',
      fmtMovie: 'Movie',
      fmtOva: 'OVA',
      fmtOna: 'ONA',
      fmtSpecial: 'Special',
      stAiring: 'Airing',
      stFinished: 'Finished',
      stNotYet: 'Not yet aired',
      stHiatus: 'Hiatus',
      stCancelled: 'Cancelled',
    }

    /* ------------------------------------------------------------------ *
     * Styles — one sheet, tokens only, so light and dark both follow.
     * ------------------------------------------------------------------ */

    Object.assign(ZH, {
      viewInfo: '信息',
      viewOnline: '在线流',
      viewTorrent: '种子流',
      viewCast: '角色与关联',
      back: '返回',
      biliSearchPlaceholder: '搜索哔哩哔哩番剧（可改标题）',
      biliResults: '哔哩哔哩 · 搜索结果',
      biliNoResult: '哔哩哔哩没有搜到这部番',
      biliPlaybackFailed: '这一话播不出来（可能只有大会员或地区限制才能看）',
      areaLimited: '版权受限',
      selected: '已选',
      open: '打开',
      closePlayer: '关闭播放器',
      providerAuto: '自动（AniBT → AnimeTosho）',
      refineTitle: '精确标题',
      episodeNumber: '集数',
      anyResolution: '任意分辨率',
      batchOnly: '只看合集',
      engine: '下载引擎',
      engineHint: '内置引擎已就绪',
      externalPlayers: '外部播放器',
      ready: '元数据就绪',
      fetchingMetadata: '正在获取元数据',
      codecHint: '浏览器解不了这个编码的话，用转码播放：',
      transcode: '转码播放',
      torrentIdle: '输入标题后搜索种子',
      torrentEmpty: '没有找到匹配的种子，换一个标题或放宽分辨率试试',
      torrentResults: '种子结果',
      scanned: '扫描',
      batch: '合集',
      streamHere: '在这里播放',
      openInPlayer: '用播放器打开',
      copyMagnet: '复制磁力',
      magnetCopied: '磁力链接已复制',
      playerFailed: '没能唤起播放器',
      playerOpened: '已交给播放器',
      noCast: '这部番没有角色或关联数据',
      characters: '角色',
      mainRole: '主角',
      supportRole: '配角',
      relations: '关联作品',
      watchOrder: '观看顺序',
      viewOrder: '观看顺序',
      watchCurrent: '本作',
      themes: '主题曲',
      viewThemes: '主题曲',
      themesEmpty: 'animethemes 里没有这部番的 OP/ED 记录。',
      themesFellBack: 'animethemes 取不到，已切到哔哩哔哩',
      biliSource: '哔哩哔哩',
      themesSearchPlaceholder: '搜歌名，或「番名 OP」',
      searchButton: '搜索',
      themesFailed: '主题曲查询失败',
      playTheme: '播放',
      stopTheme: '收起',
      trailer: '预告',
      nextEpisode: '下一话',
      loadingDetail: '正在加载详情',
      preparingStream: '加载中',
      studio: '制作',
      source: '原作',
      rank: '排名',
      episodeLength: '单集时长',
      stopStream: '停止播放',
      openInDetail: '点开看详情',
      hostStaleShort: '宿主需重启',
      search: '搜索',
      episode: '集',
      onlineSource: '在线片源',
      onlineOff: '已关闭',
      backToList: '返回列表',
      manualMatch: '手动匹配',
      manualSearch: '手动搜索',
      aspectMode: '画面比例',
      sizePanel: '画面尺寸',
      switchDub: '切换配音',
      noDubTrack: '这个片源没有另外一条配音轨',
      onlineServer: '线路',
      quality: '清晰度',
      qualityMirrors: '条同画质线路',
      qualitySeekable: '换线路后从当前位置续播',
      qualityRestart: '这条线路不能跳转，换过去会从片头重播',
      onlinePickEpisode: '从右边选一集开始播放',
      onlinePickAnime: '点「手动搜索」找一部片，结果会出现在弹窗里。',
      onlineCandidates: '也可以试试这些名字：',
      onlineNoneOn: '在线片源现在全部是关闭的。到「设置 → 片源」打开一个（哔哩哔哩或 FQDM）就能用。',
      onlineSearchPlaceholder: '搜片名（中文）',
      onlineLatest: '最近更新',
      onlinePlaybackFailed: '这个线路播不了，换一个线路试试。',
      clear: '清除',
      prevPage: '上一页',
      nextPage: '下一页',
      noResults: '没有找到内容',
      followed: '已追',
      modeBangumi: '番剧',
      modeVideo: '用户投稿',
      playerSettings: '播放器设置',
      subtitles: '字幕',
      audioTracks: '音轨',
      defaultAudio: '默认音轨',
      singleAudioHint: '当前片源只有一个音轨，字幕由片源自带。',
      noSubtitles: '这个片源没有附带字幕轨。',
      playbackSpeed: '播放速度',
      volumeBoost: '音量增强',
      autoPlay: '自动播放',
      autoNext: '自动连播',
      skipOpEd: '跳过片头',
      appearance: '播放器外观',
      preferences: '偏好设置',
      tabKeys: '快捷键',
      tabAudio: '字幕与音频',
      tabGeneral: '通用',
      seekFine: '快进快退（小）',
      seekCoarse: '快进快退（大）',
      speedStep: '调整速度',
      volumeStep: '音量步长',
      seconds: '秒',
      increment: '步进',
      percent: '百分比',
      keyForward: '快进',
      keyBack: '快退',
      keyForwardBig: '大幅快进',
      keyBackBig: '大幅快退',
      keySpeedUp: '加速',
      keySpeedDown: '减速',
      keyNext: '下一集',
      keyFullscreen: '全屏',
      keyPip: '画中画',
      keyMute: '静音',
      keyStats: '播放信息',
      subtitleDelay: '字幕延迟',
      resetAll: '重置全部',
      cancel: '取消',
      save: '保存',
      videoSearchPlaceholder: '搜哔哩哔哩用户投稿（UP 主上传的视频）',
      videoResults: '哔哩哔哩 · 用户投稿',
      videoNoResult: '没有搜到相关视频，换个关键词试试',
      videoViews: '播放',
      uploader: 'UP 主',
      parts: '分 P',
      watchOnBili: '在哔哩哔哩打开',
      videoPicked: '已选视频',
    })

    Object.assign(EN, {
      viewInfo: 'Info',
      viewOnline: 'Online',
      viewTorrent: 'Torrent',
      viewCast: 'Cast',
      back: 'Back',
      biliSearchPlaceholder: 'Search bilibili (title is editable)',
      biliResults: 'bilibili · results',
      biliNoResult: 'bilibili has no match for this show',
      biliPlaybackFailed: 'This episode will not play (members-only or region-locked)',
      areaLimited: 'region locked',
      selected: 'selected',
      open: 'open',
      closePlayer: 'Close player',
      providerAuto: 'Auto (AniBT → AnimeTosho)',
      refineTitle: 'Refine the title',
      episodeNumber: 'Episode',
      anyResolution: 'Any resolution',
      batchOnly: 'Batches only',
      engine: 'Engine',
      engineHint: 'built-in engine ready',
      externalPlayers: 'Players',
      ready: 'metadata ready',
      fetchingMetadata: 'fetching metadata',
      codecHint: 'If the browser cannot decode this codec, play it transcoded:',
      transcode: 'Transcode',
      torrentIdle: 'Search for a release first',
      torrentEmpty: 'Nothing matched — try another title or a wider resolution',
      torrentResults: 'Releases',
      scanned: 'scanned',
      batch: 'batch',
      streamHere: 'Stream here',
      openInPlayer: 'Open in player',
      copyMagnet: 'Copy magnet',
      magnetCopied: 'Magnet copied',
      playerFailed: 'Could not launch a player',
      playerOpened: 'Handed to player',
      noCast: 'No cast or relations for this show',
      characters: 'Characters',
      mainRole: 'main',
      supportRole: 'supporting',
      relations: 'Related',
      watchOrder: 'Watch order',
      viewOrder: 'Watch order',
      watchCurrent: 'This one',
      themes: 'Themes',
      viewThemes: 'Themes',
      themesEmpty: 'animethemes has no OP/ED listed for this title.',
      themesFellBack: 'animethemes unreachable — switched to bilibili',
      biliSource: 'bilibili',
      themesSearchPlaceholder: 'Song name, or "anime OP"',
      searchButton: 'Search',
      themesFailed: 'Theme lookup failed',
      playTheme: 'Play',
      stopTheme: 'Hide',
      trailer: 'Trailer',
      nextEpisode: 'Next episode',
      loadingDetail: 'Loading detail',
      preparingStream: 'Loading',
      studio: 'Studio',
      source: 'Source',
      rank: 'Rank',
      episodeLength: 'Episode length',
      stopStream: 'Stop',
      openInDetail: 'open detail',
      hostStaleShort: 'Restart host',
      search: 'Search',
      episode: 'Episode',
      onlineSource: 'Online source',
      onlineOff: 'off',
      backToList: 'Back to list',
      manualMatch: 'Manual match',
      manualSearch: 'Manual search',
      aspectMode: 'Picture fit',
      sizePanel: 'Picture size',
      switchDub: 'Switch to dub',
      noDubTrack: 'This source ships a single audio track',
      onlineServer: 'Server',
      quality: 'Quality',
      qualityMirrors: 'lines at this quality',
      qualitySeekable: 'Switching keeps your position',
      qualityRestart: 'This line cannot seek; it restarts from the beginning',
      onlinePickEpisode: 'Pick an episode on the right to start',
      onlinePickAnime: 'Hit “Manual search” to find a title — the results show up in the dialog.',
      onlineCandidates: 'Or try one of these names:',
      onlineNoneOn: 'Every online source is switched off. Turn one on in 设置 → 片源 (哔哩哔哩 or FQDM).',
      onlineSearchPlaceholder: 'Search a title (Chinese)',
      onlineLatest: 'Recently updated',
      onlinePlaybackFailed: 'This line could not play; try another one.',
      clear: 'Clear',
      prevPage: 'Previous',
      nextPage: 'Next',
      noResults: 'Nothing found',
      followed: 'Following',
      modeBangumi: 'Bangumi',
      modeVideo: 'Uploads',
      playerSettings: 'Settings',
      subtitles: 'Subtitles',
      audioTracks: 'Audio',
      defaultAudio: 'Default audio',
      singleAudioHint: 'This source only carries one audio track; subtitles come from the file itself.',
      noSubtitles: 'This source has no subtitle track.',
      playbackSpeed: 'Playback Speed',
      volumeBoost: 'Volume Boost',
      autoPlay: 'Auto Play',
      autoNext: 'Auto Next',
      skipOpEd: 'Skip OP/ED',
      appearance: 'Player Appearance',
      preferences: 'Preferences',
      tabKeys: 'Keyboard Shortcuts',
      tabAudio: 'Subtitles & Audio',
      tabGeneral: 'General',
      seekFine: 'Seek Forward (Fine)',
      seekCoarse: 'Seek Forward',
      speedStep: 'Increase Speed',
      volumeStep: 'Volume Up',
      seconds: 'Seconds',
      increment: 'Increment',
      percent: 'Percent',
      keyForward: 'Seek Forward',
      keyBack: 'Seek Backward',
      keyForwardBig: 'Seek Forward (Long)',
      keyBackBig: 'Seek Backward (Long)',
      keySpeedUp: 'Increase Speed',
      keySpeedDown: 'Decrease Speed',
      keyNext: 'Next Episode',
      keyFullscreen: 'Fullscreen',
      keyPip: 'Picture in Picture',
      keyMute: 'Mute',
      keyStats: 'Stats for Nerds',
      subtitleDelay: 'Subtitle Delay',
      resetAll: 'Reset all',
      cancel: 'Cancel',
      save: 'Save',
      videoSearchPlaceholder: 'Search bilibili user uploads',
      videoResults: 'bilibili · uploads',
      videoNoResult: 'No uploads matched, try another keyword',
      videoViews: 'views',
      uploader: 'Uploader',
      parts: 'Parts',
      watchOnBili: 'Open on bilibili',
      videoPicked: 'Picked',
    })

    // -----------------------------------------------------------------------
    // Player shell — modelled on Seanime's player: top info, bottom transport,
    // right-side drawers for settings / subtitles / audio, and preferences.
    // -----------------------------------------------------------------------

    const PLAYER_KEY = 'dsh-anime:player:v1'

    const DEFAULT_KEYS = {
      seekFine: 2,
      seekCoarse: 30,
      speedStep: 0.1,
      volumeStep: 5,
      keyForward: 'ArrowRight',
      keyBack: 'ArrowLeft',
      keyForwardBig: 'd',
      keyBackBig: 'a',
      keySpeedUp: 'j',
      keySpeedDown: 'i',
      keyNext: 'n',
      keyFullscreen: 'f',
      keyPip: 'p',
      keyMute: 'm',
      keyStats: 'z',
      keyPlayPause: ' ',
    }

    const DEFAULT_PREFS = {
      speed: 1,
      volume: 1,
      boost: 0,
      autoPlay: true,
      autoNext: true,
      skipIntro: 0,
      appearance: 'dark',
      subtitleDelay: 0,
      // How the picture fills the stage. Mirrors AnimeFlow's VideoFit
      // (contain/cover/fill) plus a couple of forced ratios.
      aspect: 'auto',
      keys: { ...DEFAULT_KEYS },
    }

    /**
     * Picture fit. `contain` is the honest default; `cover` crops to fill,
     * `fill` stretches, `width` keeps the width and lets the height overflow,
     * the two ratio entries stretch the frame into that shape (what mpv does
     * with --video-aspect-override), and `original` draws at native size.
     */
    // bilibili's own qn ladder, trimmed to what a music video actually offers.
    const BILI_THEME_QUALITIES = [
      { value: 80, label: '1080P' },
      { value: 64, label: '720P' },
      { value: 32, label: '480P' },
      { value: 16, label: '360P' },
    ]

    const ASPECT_MODES = [
      { value: 'auto', zh: '自动', en: 'Auto', fit: 'contain' },
      { value: 'cover', zh: '裁剪', en: 'Crop', fit: 'cover' },
      { value: 'fill', zh: '拉伸', en: 'Stretch', fit: 'fill' },
      { value: 'width', zh: '等宽', en: 'Fit width', fit: 'fill' },
      { value: '4:3', zh: '4:3', en: '4:3', ratio: 4 / 3 },
      { value: '16:9', zh: '16:9', en: '16:9', ratio: 16 / 9 },
      { value: 'original', zh: '原始', en: 'Original', fit: 'none' },
    ]

    function loadPrefs() {
      try {
        const raw = window.localStorage.getItem(PLAYER_KEY)
        if (raw === null) return { ...DEFAULT_PREFS, keys: { ...DEFAULT_KEYS } }
        const parsed = JSON.parse(raw)
        return {
          ...DEFAULT_PREFS,
          ...(parsed !== null && typeof parsed === 'object' ? parsed : {}),
          keys: { ...DEFAULT_KEYS, ...(parsed?.keys ?? {}) },
        }
      } catch {
        return { ...DEFAULT_PREFS, keys: { ...DEFAULT_KEYS } }
      }
    }

    function savePrefs(patch) {
      const next = { ...loadPrefs(), ...patch }
      try {
        window.localStorage.setItem(PLAYER_KEY, JSON.stringify(next))
      } catch {
        /* storage is optional */
      }
      return next
    }

    function usePlayerPrefs() {
      const [prefs, setPrefs] = React.useState(loadPrefs)
      const update = React.useCallback((patch) => {
        setPrefs((current) => ({ ...current, ...patch }))
        savePrefs(patch)
      }, [])
      return [prefs, update]
    }

    function clock(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
      const total = Math.floor(seconds)
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const rest = total % 60
      const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
      return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(rest).padStart(2, '0')}`
    }

    function prettyKey(key) {
      if (key === ' ') return 'Space'
      if (key === 'ArrowRight') return '→'
      if (key === 'ArrowLeft') return '←'
      if (key === 'ArrowUp') return '↑'
      if (key === 'ArrowDown') return '↓'
      if (key === 'Escape') return 'Esc'
      return String(key).toUpperCase()
    }

    /** One selectable line inside a drawer panel. */
    function TrackRow({ label, code, active, onClick }) {
      return h(
        'button',
        { className: 'dshan-pl-track', type: 'button', 'data-active': String(Boolean(active)), onClick },
        h('span', { className: 'dshan-pl-check', 'aria-hidden': 'true' }, active ? '✓' : ''),
        h('span', { className: 'dshan-pl-tracklabel' }, label),
        code === undefined || code === null ? null : h('span', { className: 'dshan-pl-trackcode' }, code),
      )
    }

    /** label + value row with a chevron, used by the settings panel. */
    function SettingRow({ label, value, icon, onClick }) {
      return h(
        'button',
        { className: 'dshan-pl-setting', type: 'button', onClick },
        icon === undefined || icon === null
          ? null
          : h('span', { className: 'dshan-pl-settingicon', 'aria-hidden': 'true' }, h(PlayerIcon, { name: icon })),
        h('span', { className: 'dshan-pl-tracklabel' }, label),
        h('span', { className: 'dshan-pl-settingvalue' }, value),
        h('span', { className: 'dshan-pl-chev', 'aria-hidden': 'true' }, '›'),
      )
    }

    const ICON_PATHS = {
      play: 'M8 5.2v13.6L19 12z',
      pause: 'M7 5h3.4v14H7zM13.6 5H17v14h-3.4z',
      next: 'M6 5.2v13.6L15 12zM16.6 5H19v14h-2.4z',
      volume: 'M4 9.2h3.2L12 5.5v13L7.2 14.8H4zM15.4 8.6a4.6 4.6 0 010 6.8M17.8 6.2a8 8 0 010 11.6',
      'volume-low': 'M4 9.2h3.2L12 5.5v13L7.2 14.8H4zM15.4 8.6a4.6 4.6 0 010 6.8',
      mute: 'M4 9.2h3.2L12 5.5v13L7.2 14.8H4zM15.6 9.4l4.4 5.2M20 9.4l-4.4 5.2',
      // A real gear, not a circle with rays: the old path read as a brightness
      // toggle, and this button opens 更多设置.
      settings: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82A1.65 1.65 0 003.4 14H3.3a2 2 0 110-4h.09A1.65 1.65 0 005 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6h.01A1.65 1.65 0 0010 3.09V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1zM15 12a3 3 0 10-6 0 3 3 0 006 0z',
      cc: 'M3.6 5.6h16.8v12.8H3.6zM9.6 10.4a2.2 2.2 0 100 3.2M16 10.4a2.2 2.2 0 100 3.2',
      audio: 'M4 12h2.2M8.8 8.4v7.2M13.2 5.6v12.8M17.6 9.4v5.2M21 11.2v1.6',
      pip: 'M3.6 5.6h16.8v12.8H3.6zM12.4 12h8v6.4h-8z',
      fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
      close: 'M6 6l12 12M18 6L6 18',
      download: 'M12 4v10M8 10.6l4 4 4-4M5 19h14',
      chevron: 'M7 15l5-5 5 5',
      speed: 'M12 12l4.2-4.2M12 21a9 9 0 110-18 9 9 0 010 18z',
      autoplay: 'M12 21a9 9 0 110-18 9 9 0 010 18zM10.4 8.8l5.2 3.2-5.2 3.2z',
      autonext: 'M12 21a9 9 0 110-18 9 9 0 010 18zM9.8 8.9l3.9 3.1-3.9 3.1zM15.7 9v6',
      skip: 'M4 12a8 8 0 0113.6-5.7L20 8M20 12a8 8 0 01-13.6 5.7L4 16M20 4.6V8h-3.4M4 19.4V16h3.4',
      outline: 'M5 5h14v14H5zM9.4 9.4h5.2v5.2H9.4z',
      shadow: 'M8 4h12v12H8zM4 8v12h12',
      palette: 'M12 21a9 9 0 110-18c4.6 0 8 3 8 6.4 0 2.4-1.8 3.6-3.6 3.6H15a1.6 1.6 0 00-1.2 2.6c.6.7.2 1.9-1.8 1.9zM9 8.6h.01M7.2 11.6h.01M13 7.6h.01',
      screen: 'M3.6 5.6h16.8v10.4H3.6zM9 20h6M12 16v4',
      sparkles: 'M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18.4 15.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
      sliders: 'M4 8h9M18 8h2M4 16h4M12.5 16H20M15.5 5.6v4.8M8 13.6v4.8',
      external: 'M14 4h6v6M20 4l-8.6 8.6M18 14v5.6H4.4V6h5.2',
    }

    function episodeDownloadTitle(series, label) {
      const name = String(series ?? '').trim()
      const part = String(label ?? '').trim()
      if (part === '') return name
      if (name === '' || part.startsWith(name)) return part
      return `${name} ${part}`
    }

    async function queueDownload(path, body) {
      // Same rule as postJson: the shell turns a page POST into a body-less
      // GET, so the payload goes in the query string.
      const name = String(path ?? '').replace(/^\//, '')
      const query = `payload=${encodeURIComponent(JSON.stringify(body ?? {}))}`
      for (const target of [`${API}/action?name=${encodeURIComponent(name)}&${query}`, `${API}/${name}?${query}`]) {
        try {
          const response = await fetch(target, { headers: { accept: 'application/json' } })
          const payload = await response.json().catch(() => null)
          if (payload !== null && payload.ok !== false) return payload.data ?? payload
          if (payload !== null) throw new Error(payload?.error?.message ?? 'request failed')
        } catch (error) {
          if (error instanceof Error && error.message !== 'request failed' && !/^HTTP \d+/.test(error.message)) {
            throw error
          }
        }
      }
      throw new Error(`${name} 失败`)
    }

    function PlayerIcon({ name }) {
      const path = ICON_PATHS[name] ?? ICON_PATHS.play
      return h(
        'svg',
        {
          width: 20,
          height: 20,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: path, fill: name === 'play' || name === 'pause' || name === 'next' ? 'currentColor' : 'none', stroke: name === 'play' || name === 'pause' || name === 'next' ? 'none' : 'currentColor' }),
      )
    }

    // Mirrors ANIME4K_OPTIONS in lib/torrent-engine.js (Seanime's 13 modes + off).
    const ANIME4K_OPTIONS = [
      { value: 'off', label: '关闭', description: '不处理', performance: 'light' },
      { value: 'mode-a', label: 'Mode A', description: '去压缩痕再放大', performance: 'light' },
      { value: 'mode-b', label: 'Mode B', description: '轻柔去痕再放大（最快）', performance: 'light' },
      { value: 'mode-c', label: 'Mode C', description: '降噪放大再放大', performance: 'light' },
      { value: 'mode-aa', label: 'Mode A+A', description: '双重还原', performance: 'medium' },
      { value: 'mode-bb', label: 'Mode B+B', description: '双次柔化还原', performance: 'medium' },
      { value: 'mode-ca', label: 'Mode C+A', description: '降噪 + 还原混合', performance: 'medium' },
      { value: 'cnn-2x-medium', label: 'CNN 2x M', description: '速度与画质平衡', performance: 'medium' },
      { value: 'cnn-2x-large', label: 'CNN 2x L', description: '更清晰，稍慢', performance: 'medium' },
      { value: 'cnn-2x-very-large', label: 'CNN 2x VL', description: '高质量网络，吃显卡', performance: 'heavy' },
      { value: 'denoise-cnn-2x-very-large', label: '降噪 CNN 2x VL', description: '边放大边去噪', performance: 'heavy' },
      { value: 'cnn-2x-ultra-large', label: 'CNN 2x UL', description: 'CNN 最高档', performance: 'heavy' },
      { value: 'gan-3x-large', label: 'GAN 3x L', description: '生成式，观感更锐', performance: 'heavy' },
      { value: 'gan-4x-ultra-large', label: 'GAN 4x UL', description: '最高规格，4K 才建议', performance: 'heavy' },
    ]
    // Rows bilibili's own quality popup shows: name, sub-label, right badge.
    const QUALITY_MENU = [
      { qn: 120, name: '4K 超清', sub: 'SDR', badge: '大会员' },
      { qn: 116, name: '1080P60 高帧率', sub: 'SDR', badge: '大会员' },
      { qn: 112, name: '1080P+ 高码率', sub: 'SDR', badge: '大会员' },
      { qn: 80, name: '1080P 高清', sub: 'SDR', badge: '登录' },
      { qn: 74, name: '720P60 高帧率', sub: 'SDR', badge: '登录' },
      { qn: 64, name: '720P 准高清', sub: '', badge: '登录' },
      { qn: 32, name: '480P 标清', sub: '', badge: '' },
      { qn: 16, name: '360P 流畅', sub: '', badge: '' },
    ]
    const QUALITY_LABEL = { 120: '4K', 116: '1080P60', 112: '1080P+', 80: '1080P', 74: '720P60', 64: '720P', 32: '480P', 16: '360P' }

    // Built-in player sharpening. The shader files we ship are mpv glsl hooks,
    // so the browser gets an equivalent edge-aware sharpen written for WebGL2:
    // it keeps edges, leaves flat areas alone, and costs one pass.
    const CAS_LEVELS = { light: 0.3, medium: 0.55, strong: 0.9 }
    function casStrength(preset) {
      const value = String(preset ?? 'off')
      if (value === 'off') return 0
      if (/gan|ultra|very-large|denoise/i.test(value)) return CAS_LEVELS.strong
      if (/mode-a{1,2}$|mode-b{1,2}$|mode-ca$|medium/i.test(value)) return CAS_LEVELS.medium
      return CAS_LEVELS.light
    }
    const CAS_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`
    const CAS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uSharp;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  vec3 n = texture(uTex, vUv + vec2(0.0, -uTexel.y)).rgb;
  vec3 s = texture(uTex, vUv + vec2(0.0, uTexel.y)).rgb;
  vec3 w = texture(uTex, vUv + vec2(-uTexel.x, 0.0)).rgb;
  vec3 e = texture(uTex, vUv + vec2(uTexel.x, 0.0)).rgb;
  vec3 blur = (n + s + w + e) * 0.25;
  // Contrast-adaptive: line art gets the full amount, gradients and noise get
  // less, so a soft 480P stream gains edges without turning into halos.
  vec3 lo = min(min(n, s), min(w, e));
  vec3 hi = max(max(n, s), max(w, e));
  vec3 weight = (hi - lo) / max(vec3(0.02), hi + lo);
  float edge = clamp((weight.r + weight.g + weight.b) / 3.0 * 6.0, 0.0, 1.0);
  vec3 detail = c - blur;
  vec3 sharp = c + detail * (uSharp * 5.0) * mix(0.35, 1.0, edge);
  // Stay near the local neighbourhood. Clamping to the exact min/max would
  // flatten every hard step back to the input (that is what made the pass look
  // like it did nothing), so a fraction of the local range is allowed through.
  vec3 span = max(hi - lo, vec3(0.02));
  vec3 low = min(lo, c) - span * 0.28;
  vec3 high = max(hi, c) + span * 0.28;
  outColor = vec4(clamp(sharp, low, high), 1.0);
}`
    /**
     * One WebGL2 program per canvas element.
     *
     * The old code built a fresh context for every `src` change, and a page that
     * switches episodes (online streaming, torrent streaming) burns through the
     * browser's ~16 context budget in a few clicks: the newest canvas then draws
     * nothing at all, which looks exactly like "the toggle does nothing".
     */
    const CAS_RENDERERS = new WeakMap()
    function createCasRenderer(canvas) {
      const cached = CAS_RENDERERS.get(canvas)
      if (cached !== undefined) return cached
      const gl = canvas.getContext('webgl2', { alpha: false, desynchronized: true })
      if (gl === null) {
        CAS_RENDERERS.set(canvas, null)
        return null
      }
      const compile = (type, source) => {
        const shader = gl.createShader(type)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
      }
      const vert = compile(gl.VERTEX_SHADER, CAS_VERT)
      const frag = compile(gl.FRAGMENT_SHADER, CAS_FRAG)
      if (vert === null || frag === null) {
        console.warn('[dsh-anime] enhancer: shader compile failed')
        CAS_RENDERERS.set(canvas, null)
        return null
      }
      const program = gl.createProgram()
      gl.attachShader(program, vert)
      gl.attachShader(program, frag)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('[dsh-anime] enhancer: program link failed')
        CAS_RENDERERS.set(canvas, null)
        return null
      }
      gl.useProgram(program)
      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(program, 'aPos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      const texture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0)
      const uTexel = gl.getUniformLocation(program, 'uTexel')
      const uSharp = gl.getUniformLocation(program, 'uSharp')
      let warned = false
      const renderer = {
        draw(video, sharp) {
          if (video.readyState < 2 || video.videoWidth === 0) return false
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
          }
          gl.viewport(0, 0, canvas.width, canvas.height)
          try {
            gl.bindTexture(gl.TEXTURE_2D, texture)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
          } catch (error) {
            // A tainted canvas throws here (cross-origin video): say so once
            // instead of silently leaving a black layer over the picture.
            if (!warned) {
              warned = true
              console.warn('[dsh-anime] enhancer: frame upload failed', error?.message ?? error)
            }
            return false
          }
          gl.uniform2f(uTexel, 1 / canvas.width, 1 / canvas.height)
          gl.uniform1f(uSharp, sharp)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
          return true
        },
        dispose() {
          const lose = gl.getExtension('WEBGL_lose_context')
          if (lose !== null) lose.loseContext()
          CAS_RENDERERS.delete(canvas)
        },
      }
      CAS_RENDERERS.set(canvas, renderer)
      return renderer
    }

    // The real Anime4K is shipped as WGSL compute shaders in
    // `assets/vendor/anime4k-webgpu` and served over `${API}/vendor/`. It runs
    // on WebGPU, so it is the first choice; the WebGL2 sharpener above is the
    // fallback when the renderer has no adapter (older Electron, no GPU).
    const A4K_PRESETS = new Set(['ModeA', 'ModeAA', 'ModeB', 'ModeBB', 'ModeC', 'ModeCA'])
    const A4K_MODES = {
      'mode-a': 'ModeA',
      'mode-aa': 'ModeAA',
      'mode-b': 'ModeB',
      'mode-bb': 'ModeBB',
      'mode-c': 'ModeC',
      'mode-ca': 'ModeCA',
      'cnn-2x-medium': 'CNNx2M',
      'cnn-2x-large': 'CNNx2VL',
      'cnn-2x-very-large': 'CNNx2VL',
      // The package ships M / VL / UL networks only: the last two options land
      // on the widest CNN it has instead of silently doing nothing.
      'cnn-2x-ultra-large': 'CNNx2UL',
      'denoise-cnn-2x-very-large': 'DenoiseCNNx2VL',
      'gan-3x-large': 'GANx3L',
      'gan-4x-ultra-large': 'GANx4UUL',
    }
    // WebGPU is the default path: this machine has Intel Arc graphics, and the
    // Anime4K networks are compute shaders that only run there. Ask for the
    // discrete/high-performance adapter first — the plain requestAdapter() call
    // can hand back nothing on a hybrid laptop even though the GPU is fine.
    let gpuProbe = null
    function gpuProbeOnce() {
      if (gpuProbe === null) {
        gpuProbe = (async () => {
          if (typeof navigator === 'undefined' || !navigator.gpu) {
            return { ok: false, reason: 'navigator.gpu is missing', adapter: null }
          }
          const preferences = [{ powerPreference: 'high-performance' }, { powerPreference: 'default' }, undefined]
          for (const options of preferences) {
            try {
              const adapter = options === undefined
                ? await navigator.gpu.requestAdapter()
                : await navigator.gpu.requestAdapter(options)
              if (adapter === null || adapter === undefined) continue
              const info = adapter.info ?? {}
              const label = [info.vendor, info.architecture].filter(Boolean).join(' ') || 'GPU'
              console.info(`[dsh-anime] webgpu adapter ${label} (${options?.powerPreference ?? 'default'})`)
              return { ok: true, reason: '', adapter, label }
            } catch (error) {
              console.warn('[dsh-anime] webgpu adapter failed', error?.message ?? error)
            }
          }
          return { ok: false, reason: 'no adapter', adapter: null }
        })()
      }
      return gpuProbe
    }

    /**
     * Anime4K through WebGPU.
     *
     * `render()` from the package keeps its own `requestVideoFrameCallback`
     * loop and hands back no cancel handle, so the loop is stopped by destroying
     * the device that `configure()` put on the canvas: the next frame submit
     * throws and the callback chain ends. That is also why the whole effect is
     * keyed on `src` — the input texture is created from `videoWidth` once.
     */
    /**
     * Loads the vendored anime4k-webgpu UMD bundle once.
     *
     * A plain `import()` of a UMD file yields an empty namespace (it assigns a
     * global, it does not export), so the bundle is pulled in with a <script>
     * tag and read off `window['anime4k-webgpu']`.
     */
    let anime4kWebgpuModule = null
    function loadAnime4kWebgpu() {
      if (anime4kWebgpuModule !== null) return anime4kWebgpuModule
      anime4kWebgpuModule = new Promise((resolve, reject) => {
        const existing = window['anime4k-webgpu']
        if (typeof existing !== 'undefined') {
          resolve(existing)
          return
        }
        const script = document.createElement('script')
        script.src = `${API}/vendor/anime4k-webgpu/lib/index.js?v=${EXPECTED_BUILD}`
        script.async = true
        script.onload = () => {
          const lib = window['anime4k-webgpu']
          if (typeof lib === 'undefined') reject(new Error('anime4k-webgpu 没有挂到 window'))
          else resolve(lib)
        }
        script.onerror = () => reject(new Error('anime4k-webgpu 加载失败'))
        document.head.appendChild(script)
      })
      return anime4kWebgpuModule
    }

    async function startAnime4k({ video, canvas, preset, alive }) {
      const lib = await loadAnime4kWebgpu()
      const name = A4K_MODES[preset] ?? 'ModeA'
      const probe = await gpuProbeOnce()
      if (probe.ok !== true) throw new Error('WebGPU 不可用')
      // `render()` asks for its own adapter and device; the probe above is only
      // here so the failure path has a reason and the log names the GPU.
      const builder = (deviceFromLib, inputTexture) => {
        const nativeDimensions = { width: video.videoWidth, height: video.videoHeight }
        const targetDimensions = { width: canvas.width, height: canvas.height }
        if (A4K_PRESETS.has(name)) {
          return [new lib[name]({ device: deviceFromLib, inputTexture, nativeDimensions, targetDimensions })]
        }
        const clamp = new lib.ClampHighlights({ device: deviceFromLib, inputTexture })
        return [clamp, new lib[name]({ device: deviceFromLib, inputTexture: clamp.getOutputTexture() })]
      }
      await lib.render({ video, canvas, pipelineBuilder: builder })
      if (!alive()) {
        canvas.style.display = 'none'
        return null
      }
      console.info(`[dsh-anime] anime4k gpu preset=${name} ${canvas.width}x${canvas.height}`)
      return canvas.getContext('webgpu')?.device ?? null
    }

    /**
     * Anime4K over WebGL1 when the renderer has no WebGPU.
     *
     * `anime4k.js` is monyone's port of the same Anime4K 4.0.1 GLSL shaders mpv
     * loads, built into one UMD file under assets/vendor: the network is a chain
     * of fragment shaders on float textures, so it runs on any Chromium. It only
     * upscales (2×), which is why the canvas is the display size and the video
     * element keeps its own box.
     */
    const A4K_WEBGL_PRESETS = {
      'mode-a': 'ANIME4KJS_SIMPLE_M_2X',
      'mode-b': 'ANIME4KJS_SIMPLE_M_2X',
      'mode-c': 'ANIME4KJS_SIMPLE_L_2X',
      'mode-aa': 'ANIME4KJS_SIMPLE_L_2X',
      'mode-bb': 'ANIME4KJS_SIMPLE_L_2X',
      'mode-ca': 'ANIME4KJS_SIMPLE_VL_2X',
      'cnn-2x-medium': 'ANIME4KJS_SIMPLE_S_2X',
      'cnn-2x-large': 'ANIME4KJS_SIMPLE_M_2X',
      'cnn-2x-very-large': 'ANIME4KJS_SIMPLE_M_2X',
      'cnn-2x-ultra-large': 'ANIME4KJS_SIMPLE_L_2X',
      'denoise-cnn-2x-very-large': 'ANIME4KJS_SIMPLE_M_2X',
      'gan-3x-large': 'ANIME4KJS_SIMPLE_VL_2X',
      'gan-4x-ultra-large': 'ANIME4KJS_SIMPLE_UL_2X',
    }

    /** The port needs float textures and half-float render targets. */
    function anime4kWebglSupported() {
      try {
        const probe = document.createElement('canvas')
        const gl = probe.getContext('webgl', { premultipliedAlpha: false })
        if (gl === null) return false
        const ok =
          gl.getExtension('OES_texture_float') !== null &&
          gl.getExtension('OES_texture_float_linear') !== null &&
          gl.getExtension('EXT_color_buffer_half_float') !== null
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        return ok
      } catch {
        return false
      }
    }

    /** Loads the vendored UMD bundle once; `window.Anime4KJS` is its export. */
    let anime4kWebglModule = null
    function loadAnime4kWebgl() {
      if (anime4kWebglModule !== null) return anime4kWebglModule
      anime4kWebglModule = new Promise((resolve, reject) => {
        if (typeof window.Anime4KJS !== 'undefined') {
          resolve(window.Anime4KJS)
          return
        }
        const script = document.createElement('script')
        // The build tag busts the week-long cache the host sets on vendored files.
        script.src = `${API}/vendor/anime4k.js/anime4k.js?v=${EXPECTED_BUILD}`
        script.async = true
        script.onload = () => {
          if (typeof window.Anime4KJS === 'undefined') reject(new Error('anime4k 没有挂到 window'))
          else resolve(window.Anime4KJS)
        }
        script.onerror = () => reject(new Error('anime4k.js 加载失败'))
        document.head.appendChild(script)
      })
      return anime4kWebglModule
    }

    // BiliPai's approach, browser edition: hand the two DASH tracks to the
    // player and let it merge them (MSE) instead of remuxing on the host.
    // Instant start, real duration, native seeking inside buffered ranges.

    /** Bytes per Range request while feeding MSE. */
    const MSE_WINDOW = 4 * 1024 * 1024
    /** Seconds of footage kept ahead of the playhead. */
    const MSE_LOOKAHEAD = 30

    /**
     * Feed one DASH manifest into MSE and resolve as soon as the element is
     * ready to play — never after the last byte.
     *
     * Two shapes have been tried here. Reading the whole episode as one HTTP
     * response and appending it in 1× real time meant that a response which
     * ended early (upstream drop, expired signature, any non-quota append
     * error) was indistinguishable from "the episode is over": the code called
     * `endOfStream()` and the picture froze at the edge of the ~45s buffer,
     * with nothing logged and no watchdog — because the watchdog was attached
     * to the promise that only resolved after the last byte.
     *
     * Now each track is pulled in contiguous `Range` windows with a ~30s
     * lookahead. A dropped window costs one retry from the same byte offset, so
     * playback resumes instead of stopping; `endOfStream()` happens only once
     * both tracks have reached the known duration.
     */
    async function attachDashMse(video, manifestUrl, signal) {
      const manifest = await fetch(manifestUrl, { signal, credentials: 'same-origin' }).then((response) => response.json())
      if (manifest?.ok !== true) throw new Error(manifest?.error?.message ?? 'dash manifest failed')
      if (typeof MediaSource === 'undefined') throw new Error('mse unavailable')
      const pickMime = (mime, fallback) => {
        if (MediaSource.isTypeSupported(mime)) return mime
        if (MediaSource.isTypeSupported(fallback)) return fallback
        return null
      }
      const videoMime = pickMime(manifest.videoMime, 'video/mp4')
      const audioMime = pickMime(manifest.audioMime, 'audio/mp4')
      if (videoMime === null) {
        console.warn(`[dsh-anime] mse codec rejected: ${manifest.videoMime}`)
        throw new Error('mse codec unsupported')
      }
      console.info(`[dsh-anime] mse start video=${videoMime} audio=${audioMime} dur=${manifest.duration}`)
      const media = new MediaSource()
      const objectUrl = URL.createObjectURL(media)
      video.src = objectUrl
      await new Promise((resolve, reject) => {
        media.addEventListener('sourceopen', resolve, { once: true })
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
      const videoBuffer = media.addSourceBuffer(videoMime)
      videoBuffer.addEventListener('error', () => {
        console.warn(`[dsh-anime] mse video buffer error (${videoMime})`)
      })
      const audioBuffer = audioMime === null ? null : media.addSourceBuffer(audioMime)
      if (audioBuffer !== null) {
        audioBuffer.addEventListener('error', () => {
          console.warn(`[dsh-anime] mse audio buffer error (${audioMime})`)
        })
      }
      video.addEventListener('error', () => {
        const code = video.error?.code ?? 0
        console.warn(`[dsh-anime] mse element error code=${code} message=${video.error?.message ?? ''}`)
      }, { once: true })
      const duration = Number(manifest.duration) > 0 ? Number(manifest.duration) : 0
      if (duration > 0) media.duration = duration

      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      // `updateend` never fires again once the buffer or the element is torn
      // down, and waiting on it forever used to freeze the whole pump.
      const waitFor = (buffer) =>
        new Promise((resolve) => {
          if (buffer.updating !== true) {
            resolve()
            return
          }
          let settled = false
          const done = () => {
            if (settled) return
            settled = true
            buffer.removeEventListener('updateend', done)
            window.clearTimeout(timer)
            resolve()
          }
          const timer = window.setTimeout(done, 5000)
          buffer.addEventListener('updateend', done)
        })
      // Only the range the playhead sits in matters: `buffered.end(last)` alone
      // reports 45s ahead even when a gap between ranges makes it useless.
      const rangeAhead = (buffer) => {
        const buffered = buffer.buffered
        const at = video.currentTime
        for (let index = 0; index < buffered.length; index += 1) {
          if (at >= buffered.start(index) - 0.5 && at <= buffered.end(index)) return buffered.end(index) - at
        }
        return 0
      }
      const rangeEnd = (buffer) => {
        const buffered = buffer.buffered
        return buffered.length === 0 ? 0 : buffered.end(buffered.length - 1)
      }
      const evict = async (buffer) => {
        const at = video.currentTime
        const from = buffer.buffered.length === 0 ? 0 : buffer.buffered.start(0)
        const keep = at > 12 ? at - 10 : 0
        if (keep <= from + 1) return
        try {
          buffer.remove(from, keep)
          await waitFor(buffer)
        } catch {
          /* the buffer is already gone */
        }
      }
      const push = async (buffer, chunk) => {
        if (buffer === null) return false
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (signal.aborted) return false
          try {
            if (buffer.updating === true) await waitFor(buffer)
            buffer.appendBuffer(chunk)
            await waitFor(buffer)
            return true
          } catch (error) {
            const name = String(error?.name ?? '')
            console.warn(
              `[dsh-anime] mse append failed attempt=${attempt + 1} name=${name} message=${error?.message ?? error}`,
            )
            // A quota overflow can be answered by dropping what has been played;
            // anything else (parse/state errors) is not helped by retrying.
            if (name !== 'QuotaExceededError') return false
            await evict(buffer)
          }
        }
        return false
      }
      const feedTrack = async (buffer, url) => {
        if (buffer === null) return
        let offset = 0
        let failures = 0
        while (!signal.aborted && failures < 10) {
          if (rangeAhead(buffer) >= MSE_LOOKAHEAD) {
            await delay(250)
            continue
          }
          let chunk = null
          try {
            const response = await fetch(url, {
              signal,
              credentials: 'same-origin',
              headers: { range: `bytes=${offset}-${offset + MSE_WINDOW - 1}` },
            })
            if (offset > 0 && response.status !== 206) {
              // The host (or a CDN behind it) ignored the range: the only way
              // forward is to start this track over from byte 0.
              console.warn(`[dsh-anime] mse range ignored status=${response.status}`)
              offset = 0
              failures += 1
              await delay(400)
              continue
            }
            if (response.ok !== true) {
              console.warn(`[dsh-anime] mse window status=${response.status} offset=${offset}`)
              failures += 1
              await delay(400)
              continue
            }
            chunk = new Uint8Array(await response.arrayBuffer())
          } catch (error) {
            if (signal.aborted) return
            console.warn(`[dsh-anime] mse fetch failed offset=${offset} message=${error?.message ?? error}`)
            failures += 1
            await delay(400)
            continue
          }
          if (chunk.byteLength === 0) break
          if ((await push(buffer, chunk)) !== true) {
            failures += 1
            await delay(400)
            continue
          }
          offset += chunk.byteLength
          failures = 0
          console.info(`[dsh-anime] mse window bytes=${offset}`)
          if (duration > 0 && rangeEnd(buffer) >= duration - 0.5) break
        }
        if (!signal.aborted) {
          console.warn(
            `[dsh-anime] mse track stopped bytes=${offset} buffered=${rangeEnd(buffer).toFixed(1)} dur=${duration}`,
          )
        }
      }
      void Promise.all([feedTrack(videoBuffer, manifest.video), feedTrack(audioBuffer, manifest.audio)])
        .then(() => {
          try {
            if (media.readyState === 'open') media.endOfStream()
          } catch {
            /* closed already */
          }
        })
        .catch(() => {})
      // Ready immediately: the caller's watchdog and `mseActive` must exist from
      // the first second, not after the last byte of the episode.
      return { objectUrl }
    }

    function Player({ src, onDownload, title, subtitle, hasNext, onNext, onClose, onFallback, errorHint, subtitleQuery, quality, onQuality, qualityOptions, parts, pickedCid, onPickPart, durationHint, playing: playingMeta, startAt, onTime, T: propT }) {
      const T = typeof propT === 'function' ? propT : (key) => (ZH[key] === undefined ? key : ZH[key])
      const [prefs, setPrefs] = usePlayerPrefs()
      const [panel, setPanel] = React.useState(null) // 'settings' | 'subtitles' | 'audio' | 'prefs' | null
      // Seanime opens a list instead of cycling a value on click.
      const [picker, setPicker] = React.useState(null)
      const [qualityOpen, setQualityOpen] = React.useState(false)
      // 在线片源（AniCh/FQDM）没有 bilibili 那套 qn 阶梯：它的“清晰度”就是站点给的
      // 线路说明（`全集(全高清-1080P) · 1080P`）。这类片源把选项直接传进来，同一个
      // 控制栏按钮、同一个浮层，只是换掉里面的行。
      const lineOptions = Array.isArray(qualityOptions) ? qualityOptions : []
      const [qualityMenu, setQualityMenu] = React.useState(null) // { ladder, loggedIn, vip }
      const [streamDuration, setStreamDuration] = React.useState(0)
      const [mseActive, setMseActive] = React.useState(false)
      const casCanvasRef = React.useRef(null)
      const a4kCanvasRef = React.useRef(null)
      // null = still probing, true = WebGPU Anime4K, false = WebGL sharpener.
      const [gpu, setGpu] = React.useState(null)
      const [gpuName, setGpuName] = React.useState('')
      const [gpuReason, setGpuReason] = React.useState('')
      // 'idle' | 'on' | 'unsupported' — the WebGL Anime4K pass on no-WebGPU runs.
      const [a4kGl, setA4kGl] = React.useState('idle')
      // "WxH" of the first decoded frame; the GPU shaders bake it in at start.
      const [videoDims, setVideoDims] = React.useState('')
      // Stage size, so a forced aspect ratio can be computed in pixels.
      const [stageBox, setStageBox] = React.useState({ w: 0, h: 0 })
      const aspectMode = ASPECT_MODES.find((mode) => mode.value === prefs.aspect) ?? ASPECT_MODES[0]
      const casSharp = casStrength(prefs.anime4k)
      const [playing, setPlaying] = React.useState(false)
      const [idle, setIdle] = React.useState(false)
      const [duration, setDuration] = React.useState(0)
      const [position, setPosition] = React.useState(0)
      // How far the element has actually buffered, in absolute seconds. The bar
      // draws it as a second, lighter segment so a slow line shows "已经下了这么
      // 多" instead of a bar that only ever knows the playhead.
      const [loaded, setLoaded] = React.useState(0)
      const [volume, setVolume] = React.useState(prefs.volume)
      const [muted, setMuted] = React.useState(false)
      const [toast, setToast] = React.useState('')
      const [enhance, setEnhance] = React.useState(null)
      const [stats, setStats] = React.useState(false)
      const [downloadBusy, setDownloadBusy] = React.useState(false)
      const [handoff, setHandoff] = React.useState(null) // detected desktop players
      const [handoffBusy, setHandoffBusy] = React.useState('')

      React.useEffect(() => {
        let alive = true
        fetchJson(`${API}/settings`)
          .then((payload) => {
            if (alive && payload?.ok !== false) setHandoff(Array.isArray(payload?.players) ? payload.players : [])
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [])

      const [embedded, setEmbedded] = React.useState(null) // { position, duration, paused, ... }
      const [embedBusy, setEmbedBusy] = React.useState(false)
      const stageRef = React.useRef(null)

      // Track the stage size so the forced ratios can be laid out in pixels.
      React.useEffect(() => {
        const element = stageRef.current
        if (element === null || typeof ResizeObserver !== 'function') return undefined
        const sync = () => {
          const box = element.getBoundingClientRect()
          setStageBox((current) =>
            Math.abs(current.w - box.width) < 1 && Math.abs(current.h - box.height) < 1
              ? current
              : { w: box.width, h: box.height },
          )
        }
        sync()
        const observer = new ResizeObserver(sync)
        observer.observe(element)
        return () => observer.disconnect()
      }, [])

      /**
       * Inline geometry for the picture. The two ratio modes centre a box of
       * that shape and stretch the frame into it — the same thing mpv does with
       * --video-aspect-override; everything else is plain object-fit.
       */
      const frameStyle = (() => {
        if (aspectMode.ratio !== undefined) {
          const ratio = aspectMode.ratio
          const width = stageBox.w > 0 ? stageBox.w : 0
          const height = stageBox.h > 0 ? stageBox.h : 0
          if (width > 0 && height > 0) {
            const fits = width / height > ratio
            const boxW = fits ? Math.round(height * ratio) : width
            const boxH = fits ? height : Math.round(width / ratio)
            return {
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${boxW}px`,
              height: `${boxH}px`,
              objectFit: 'fill',
            }
          }
        }
        if (aspectMode.value === 'width') {
          return {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '100%',
            height: 'auto',
            objectFit: 'fill',
          }
        }
        return { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: aspectMode.fit }
      })()

      /** The panel's stage rectangle in screen pixels, for mpv's --geometry. */
      const stageRect = () => {
        const element = stageRef.current
        if (element === null || typeof element.getBoundingClientRect !== 'function') return null
        const box = element.getBoundingClientRect()
        const borderX = Math.max(0, (window.outerWidth - window.innerWidth) / 2)
        const borderY = Math.max(0, window.outerHeight - window.innerHeight - borderX)
        return {
          x: Math.round(window.screenX + borderX + box.left),
          y: Math.round(window.screenY + borderY + box.top),
          width: Math.round(box.width),
          height: Math.round(box.height),
        }
      }

      const absoluteSource = () => realUrl(src)

      /**
       * seanime's "built-in player engine": HTML5 (VideoCore) or embedded mpv
       * (MpvCore). The setting decides what happens when an episode opens; the
       * gear menu can still switch for the current episode only.
       */
      // Chapters come from the container (ffprobe through the host) and only
      // exist for torrent/local playback; bilibili's DASH track has none.
      const [chapterMarks, setChapterMarks] = React.useState([])
      const [chapterPrefs, setChapterPrefs] = React.useState({ markers: true, highlight: true, skip: true })
      const highlightSkipped = chapterPrefs.highlight !== false
      const [engine, setEngine] = React.useState('builtin')
      // Subtitle look comes from the host settings (it is baked into the ASS the
      // host generates), so the gear menu edits the saved document, not a
      // page-local preference.
      const [subStyle, setSubStyle] = React.useState(null)
      const applySubStyle = (patch) => {
        const next = { ...(subStyle ?? {}), ...patch }
        setSubStyle(next)
        void postJson('settings/save', { player: { subtitle: next } }).catch(() => undefined)
      }
      // The picker labels below are chosen in JSX, so settle the language once.
      const langIsEn = T('search') === 'Search'
      // One line that says what the current subtitle look is, so the four
      // style rows can live behind a single entry instead of flooding the menu.
      const subtitleSummary = [
        `${subStyle?.size ?? 64}`,
        subStyle?.outline === false ? '无描边' : `描边${subStyle?.outlineSize ?? 3}`,
        subStyle?.shadow === true ? '阴影' : null,
        SUBTITLE_COLORS.find((entry) => entry.value === (subStyle?.color ?? '#FFFFFF'))?.label ?? '白',
      ]
        .filter(Boolean)
        .join(' · ')
      const engineTried = React.useRef(false)
      React.useEffect(() => {
        let alive = true
        fetchJson(`${API}/settings`)
          .then((data) => {
            if (!alive) return
            const player = data?.settings?.player ?? {}
            setEngine(player.engine === 'mpv' ? 'mpv' : 'builtin')
            setSubStyle(player.subtitle ?? null)
            setChapterPrefs({
              markers: player.chapterMarkers !== false,
              highlight: player.highlightSkipped !== false,
              skip: player.skipOpEd === true,
            })
            // The settings page owns the Anime4K preset; the player used to read
            // its own localStorage copy, so choosing a preset there did nothing.
            if (typeof player.anime4k === 'string' && player.anime4k !== '') {
              setPrefs({ anime4k: player.anime4k, shaderMode: player.anime4k === 'off' ? 'off' : 'anime4k' })            }
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [])

      // Drive the sharpening pass off the video frames; the canvas sits on top
      // of the element so the browser never re-lays-out anything.
      React.useEffect(() => {
        let alive = true
        gpuProbeOnce().then((result) => {
          if (!alive) return
          setGpu(result.ok)
          setGpuName(result.label ?? '')
          setGpuReason(result.reason ?? '')
        })
        return () => {
          alive = false
        }
      }, [])

      // Anime4K first: real WGSL compute shaders on WebGPU.
      React.useEffect(() => {
        const canvas = a4kCanvasRef.current
        const video = videoRef.current
        if (canvas === null || video === null) return undefined
        if (gpu !== true || casSharp <= 0 || embedded !== null || prefs.shaderMode === 'off') {
          canvas.style.display = 'none'
          return undefined
        }
        // Without a decoded frame there is nothing to texture from: the shader
        // pack would build 0x0 pipelines and never recover.
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          canvas.style.display = 'none'
          return undefined
        }
        let alive = true
        let device = null
        const box = stageRef.current?.getBoundingClientRect?.() ?? null
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        // The CNNs only upscale, so the canvas is the display size: a 480P
        // stream gets stretched to the stage in one GPU pass instead of by the
        // element's bilinear filter.
        const width = Math.max(640, Math.round((box?.width ?? 1280) * ratio))
        const height = Math.max(360, Math.round((box?.height ?? 720) * ratio))
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        startAnime4k({ video, canvas, preset: prefs.anime4k, alive: () => alive })
          .then((created) => {
            device = created
            if (created !== null) canvas.style.display = 'block'
          })
          .catch((error) => {
            // No adapter, no device, or the shader pack failed to load: drop back
            // to the WebGL sharpener instead of leaving the picture untouched.
            console.warn('[dsh-anime] anime4k gpu unavailable', error?.message ?? error)
            canvas.style.display = 'none'
            if (alive) setGpu(false)
          })
        return () => {
          alive = false
          canvas.style.display = 'none'
          try {
            device?.destroy()
          } catch {
            /* device already gone */
          }
        }
      }, [gpu, casSharp, prefs.anime4k, prefs.shaderMode, src, embedded, videoDims])

      // No WebGPU: the same Anime4K networks, as WebGL fragment passes.
      React.useEffect(() => {
        const canvas = a4kCanvasRef.current
        const video = videoRef.current
        if (canvas === null || video === null) return undefined
        const presetName = A4K_WEBGL_PRESETS[prefs.anime4k] ?? ''
        if (gpu !== false || presetName === '' || embedded !== null || prefs.shaderMode === 'off') {
          setA4kGl('idle')
          return undefined
        }
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          setA4kGl('idle')
          return undefined
        }
        let alive = true
        let upscaler = null
        loadAnime4kWebgl()
          .then((lib) => {
            if (!alive || upscaler !== null) return
            if (!anime4kWebglSupported()) {
              setA4kGl('unsupported')
              console.warn('[dsh-anime] anime4k webgl unsupported: float textures missing')
              return
            }
            const box = stageRef.current?.getBoundingClientRect?.() ?? null
            const ratio = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = Math.max(640, Math.round((box?.width ?? 1280) * ratio))
            canvas.height = Math.max(360, Math.round((box?.height ?? 720) * ratio))
            upscaler = new lib.VideoUpscaler(lib[presetName])
            upscaler.attachVideo(video, canvas)
            if (!upscaler.gl) {
              setA4kGl('unsupported')
              console.warn('[dsh-anime] anime4k webgl context rejected')
              return
            }
            upscaler.start()
            setA4kGl('on')
            console.info(`[dsh-anime] anime4k webgl preset=${presetName} ${canvas.width}x${canvas.height}`)
          })
          .catch((error) => {
            if (!alive) return
            setA4kGl('unsupported')
            console.warn('[dsh-anime] anime4k webgl failed', error?.message ?? error)
          })
        return () => {
          alive = false
          setA4kGl('idle')
          try {
            upscaler?.stop()
            upscaler?.detachVideo()
          } catch {
            /* already torn down */
          }
        }
      }, [gpu, prefs.anime4k, prefs.shaderMode, src, embedded, videoDims])

      React.useEffect(() => {
        const canvas = casCanvasRef.current
        const video = videoRef.current
        if (canvas === null || video === null || casSharp <= 0 || embedded !== null) return undefined
        if (gpu !== false || a4kGl === 'on') {
          canvas.style.display = 'none'
          return undefined
        }
        const renderer = createCasRenderer(canvas)
        if (renderer === null) {
          canvas.style.display = 'none'
          return undefined
        }
        let alive = true
        let drew = false
        let raf = 0
        let vfc = 0
        // A presented frame is the only moment worth uploading, and it also
        // covers the piped streams (`online/stream`, `torrent/transcode`) where
        // the element keeps decoding ahead of the paint.
        const canFrame = typeof video.requestVideoFrameCallback === 'function'
        const onFrame = () => {
          if (!alive) return
          const ok = renderer.draw(video, casSharp)
          // A WebGL canvas with `alpha:false` clears to black: never let it sit
          // on top of the video unless a real frame went in.
          if (ok !== drew) {
            drew = ok
            canvas.style.display = ok ? 'block' : 'none'
            if (ok) console.info('[dsh-anime] enhancer on', canvas.width, canvas.height, casSharp)
          }
          if (canFrame) vfc = video.requestVideoFrameCallback(onFrame)
          else raf = window.requestAnimationFrame(onFrame)
        }
        if (canFrame) vfc = video.requestVideoFrameCallback(onFrame)
        else raf = window.requestAnimationFrame(onFrame)
        return () => {
          alive = false
          if (raf !== 0) window.cancelAnimationFrame(raf)
          if (vfc !== 0 && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(vfc)
        }
      }, [casSharp, src, embedded])

      React.useEffect(() => {
        setStreamDuration(0)
        if (typeof src !== 'string' || src === '') return undefined
        const controller = new AbortController()
        fetch(src, { method: 'HEAD', signal: controller.signal, credentials: 'same-origin' })
          .then((response) => {
            const value = Number(response.headers.get('x-duration'))
            if (Number.isFinite(value) && value > 0) setStreamDuration(Math.round(value))
          })
          .catch(() => {
            /* piped streams carry no header; metadata fills in then */
          })
        return () => controller.abort()
      }, [src])

      const startEmbedded = async () => {
        // The embedded mpv surface is gone: the host routes behind it
        // (`player/embed*`) were deleted, and `player.engine` is pinned to
        // `builtin`, so nothing can reach this. The rest of the function stays
        // as the record of how it worked; the guard keeps a stray call from
        // turning into a 404 instead of a sentence the user can read.
        say('内嵌播放器已移除，需要外放时用「用播放器打开」')
        return
        if (embedBusy) return
        setEmbedBusy(true)
        try {
          const video = videoRef.current
          if (video !== null) video.pause()
          const box = stageRef.current?.getBoundingClientRect?.() ?? null
          const borderX = Math.max(0, (window.outerWidth - window.innerWidth) / 2)
          const borderY = Math.max(0, window.outerHeight - window.innerHeight - borderX)
          // mpv takes the two DASH tracks itself (`video --audio-file=audio`),
          // exactly like BiliPai hands the tracks to its player: no host-side
          // ffmpeg merge, so it starts at once.
          let mpvUrl = absoluteSource()
          let audioUrl = null
          try {
            const manifest = await fetchJson(`${streamSrc}${streamSrc.includes('?') ? '&' : '?'}format=manifest`)
            if (manifest?.ok === true && typeof manifest.video === 'string' && manifest.video !== '') {
              mpvUrl = typeof manifest.videoRaw === 'string' ? manifest.videoRaw : realUrl(manifest.video)
              if (typeof manifest.audioRaw === 'string' && manifest.audioRaw !== '') audioUrl = manifest.audioRaw
              else if (typeof manifest.audio === 'string' && manifest.audio !== '') audioUrl = realUrl(manifest.audio)
            }
          } catch {
            /* not a bilibili stream: give mpv the plain url */
          }
          const result = await postJson('player/embed', {
            url: mpvUrl,
            audioUrl,
            rect: {
              left: box === null ? 0 : box.left,
              top: box === null ? 0 : box.top,
              width: box === null ? 0 : box.width,
              height: box === null ? 0 : box.height,
            },
            origin: {
              x: window.screenX + borderX,
              y: window.screenY + borderY,
              dpr: window.devicePixelRatio || 1,
            },
            start: Math.round(position),
            title: title ?? '',
            speed: prefs.speed ?? 1,
            deband: prefs.deband === true,
          })
          setEmbedded({ running: true, position: Math.round(position), duration: 0, paused: false })
          say(result?.embedded === false ? 'mpv 已开始（未内嵌，窗口独立）' : 'mpv 已在面板里开始播放')
        } catch (error) {
          say(`内嵌播放失败：${error?.message ?? error}`)
        } finally {
          setEmbedBusy(false)
        }
      }


      // mpv is a real window: keep it exactly on the stage while the panel      // mpv is a real window: keep it exactly on the stage while the panel
      // scrolls, resizes or the window moves, so it never drifts outside.
      React.useEffect(() => {
        if (embedded === null) return undefined
        const pin = () => {
          const box = stageRef.current?.getBoundingClientRect?.() ?? null
          if (box === null) return
          const borderX = Math.max(0, (window.outerWidth - window.innerWidth) / 2)
          const borderY = Math.max(0, window.outerHeight - window.innerHeight - borderX)
          void postJson('player/embed/repin', {
            rect: { left: box.left, top: box.top, width: box.width, height: box.height },
            origin: { x: window.screenX + borderX, y: window.screenY + borderY, dpr: window.devicePixelRatio || 1 },
          }).catch(() => {})
        }
        pin()
        const timer = window.setInterval(pin, 1000)
        return () => window.clearInterval(timer)
      }, [embedded])

      React.useEffect(() => {
        if (engine !== 'mpv' || engineTried.current) return
        if (embedded !== null || embedBusy) return
        engineTried.current = true
        const timer = setTimeout(() => {
          void startEmbedded()
        }, 350)
        return () => clearTimeout(timer)
      }, [engine, embedded, embedBusy])

      const stopEmbedded = async () => {
        try {
          await postJson('player/embed/close', {})
        } catch {
          /* already gone */
        }
        setEmbedded(null)
      }

      const embeddedControl = async (action, value) => {
        try {
          const next = await postJson('player/embed/control', { action, value })
          if (next !== null && typeof next === 'object' && next.running === true) setEmbedded(next)
        } catch (error) {
          say(`mpv：${error?.message ?? error}`)
        }
      }

      React.useEffect(() => {
        if (embedded === null) return undefined
        let alive = true
        const tick = () => {
          fetchJson(`${API}/player/embed/status`)
            .then((next) => {
              if (!alive) return
              if (next?.running === true) setEmbedded(next)
              else setEmbedded(null)
            })
            .catch(() => {})
        }
        const timer = window.setInterval(tick, 1000)
        return () => {
          alive = false
          window.clearInterval(timer)
        }
      }, [embedded === null])

      React.useEffect(() => () => {
        // Closing the player must not leave an orphan mpv painting the window.
        void fetchJson(`${API}/player/embed/close`).catch(() => {})
      }, [])

      const openExternal = async (playerId) => {
        if (handoffBusy !== '') return
        setHandoffBusy(playerId ?? '')
        try {
          // `src` is a same-origin path; the host only hands absolute URLs to a
          // desktop player, so resolve it here where the origin is known.
          const absolute = (() => {
            try {
              return new URL(String(src ?? ''), window.location.href).href
            } catch {
              return String(src ?? '')
            }
          })()
          const result = await postJson('player/open', {
            url: absolute,
            start: Math.round(position),
            title: title ?? '',
            playerId: playerId ?? '',
          })
          const label = result?.player ?? playerId ?? ''
          say(`${label} · 已交给播放器（${Math.round(position)}s）`)
        } catch (error) {
          say(`打开失败：${error?.message ?? error}`)
        } finally {
          setHandoffBusy('')
        }
      }
      const startDownload = async () => {
        if (typeof onDownload !== 'function' || downloadBusy) return
        setDownloadBusy(true)
        try {
          const accepted = await onDownload()
          setToast(accepted ? T('downloadQueued') : T('downloadFailed'))
        } catch (error) {
          setToast(`${T('downloadFailed')}：${error?.message ?? error}`)
        } finally {
          setDownloadBusy(false)
          setIdle(false)
        }
      }
      const [scrub, setScrub] = React.useState(null)
      const scrubRef = React.useRef(null)
      // A piped DASH stream cannot be seeked: jumping restarts it at `start`.
      // `offset` is where the stream now in the element begins, so the position
      // shown is offset + currentTime and a jump is offset + delta.
      const [offset, setOffset] = React.useState(0)
      const offsetRef = React.useRef(0)
      // `startAt` is “where the user already was” when the caller swapped 清晰度/线路
      // on the same episode. It is applied once, through `seekTo`, so a plain file
      // gets a real in-element seek and a piped stream gets rebuilt at that second
      // — the same split the scrub bar already relies on.
      const startWantedRef = React.useRef(Math.max(0, Math.floor(Number(startAt) || 0)))
      const videoRef = React.useRef(null)
      const hostRef = React.useRef(null)
      const audioRef = React.useRef(null)
      const hideTimer = React.useRef(null)
      const toastTimer = React.useRef(null)

      const say = React.useCallback((text) => {
        setToast(text)
        if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
        toastTimer.current = window.setTimeout(() => setToast(''), 1500)
      }, [])

      // A piped DASH stream has no seek table, so a jump is a new stream that
      // starts at the target second; the element always plays from its own 0.
      const [rescue, setRescue] = React.useState(null)
      // Once the muxed file has taken over, the element owns a real index and MSE
      // must stay out of the way for the rest of the episode.
      const [muxedMode, setMuxedMode] = React.useState(false)
      // Re-seeking to the same second has to rebuild too, so the epoch is part of
      // the stream identity even when `start` does not change.
      const [seekEpoch, setSeekEpoch] = React.useState(0)
      const rootRef = React.useRef(null)
      // `start=` is what makes a jump possible on a piped DASH track: the host
      // re-emits from that second (`ffmpeg -ss`, fast input seek) and the element
      // plays the new segment from its own 0, with `offset` keeping the clock
      // absolute. Nothing here waits for a full file first.
      const streamSrc = React.useMemo(() => {
        if (muxedMode) return src
        if (offset <= 0) return src
        const glue = String(src ?? '').includes('?') ? '&' : '?'
        const epoch = seekEpoch > 0 ? `&_e=${seekEpoch}` : ''
        return `${src}${glue}start=${Math.floor(offset)}${epoch}`
      }, [src, offset, muxedMode, seekEpoch])

      React.useEffect(() => {
        const video = videoRef.current
        if (video === null || typeof streamSrc !== 'string' || streamSrc === '') return undefined
        const controller = new AbortController()
        let disposed = false
        let watchdog = 0
        const wasPlaying = !video.paused
        const fallback = () => {
          if (disposed || video.src === streamSrc) return
          video.src = streamSrc
        }
        if (!muxedMode && streamSrc.includes('/bili/stream')) {
          const separator = streamSrc.includes('?') ? '&' : '?'
          attachDashMse(video, `${streamSrc}${separator}format=manifest`, controller.signal)
            .then(() => {
              if (disposed) return
              setMseActive(true)
              if (wasPlaying) video.play().catch(() => {})
              // The feed retries on its own, so this only fires when nothing has
              // moved for ~6s: recover at the same second instead of sitting on a
              // dead stream.
              let lastAt = -1
              let frozen = 0
              watchdog = window.setInterval(() => {
                if (disposed || video.paused || video.ended) {
                  lastAt = video.currentTime
                  frozen = 0
                  return
                }
                if (Math.abs(video.currentTime - lastAt) < 0.25) frozen += 1
                else frozen = 0
                lastAt = video.currentTime
                if (frozen >= 3) {
                  window.clearInterval(watchdog)
                  watchdog = 0
                  const at = offsetRef.current + (Number(video.currentTime) || 0)
                  console.warn(`[dsh-anime] mse stalled at=${Math.round(at)} frozen=${frozen}`)
                  setRescue(Math.max(0, at))
                }
              }, 2000)
            })
            .catch(() => {
              if (disposed) return
              setMseActive(false)
              fallback()
            })
        } else {
          setMseActive(false)
          fallback()
        }
        return () => {
          disposed = true
          if (watchdog !== 0) window.clearInterval(watchdog)
          controller.abort()
          // Drop the MediaSource before the next segment builds its own: the old
          // blob url otherwise pins the whole appended buffer in memory, and the
          // abandoned SourceBuffers would keep appending behind the new stream.
          const current = video.src
          if (typeof current === 'string' && current.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(current)
            } catch {
              /* already revoked */
            }
          }
          try {
            video.pause()
            video.removeAttribute('src')
            video.load()
          } catch {
            /* the element is already detached */
          }
        }
      }, [streamSrc, muxedMode])

      // A stall means the fed stream stopped moving. The first answer is a fresh
      // segment at the same second (new connections, new signed URLs, host side
      // `ffmpeg -ss`); the merged file is only the terminal fallback, because it
      // has to be merged first and is not always on disk yet.
      const lastStall = React.useRef(0)
      const pendingJump = React.useRef(null)
      React.useEffect(() => {
        if (rescue === null) return undefined
        const target = Math.round(rescue)
        setRescue(null)
        if (typeof src !== 'string' || src === '') return undefined
        const now = Date.now()
        const repeated = now - lastStall.current < 40000
        lastStall.current = now
        setMseActive(false)
        if (repeated) {
          // Second stall within 40s: stop rebuilding and let the element own the
          // whole episode (real index, Range requests, native seek).
          setMuxedMode(true)
          offsetRef.current = 0
          setOffset(0)
          setPosition(target)
          pendingJump.current = target
          console.info(`[dsh-anime] stall fallback to muxed start=${target}`)
          say('连接反复中断，改用整片模式…')
          return undefined
        }
        offsetRef.current = target
        setOffset(target)
        setPosition(target)
        setSeekEpoch((value) => value + 1)
        console.info(`[dsh-anime] stall rebuild start=${target}`)
        say('连接中断，正在重连…')
        return undefined
      }, [rescue, src, say])

      // Restore the position once the muxed file reports its metadata.
      React.useEffect(() => {
        if (muxedMode !== true) return undefined
        const video = videoRef.current
        if (video === null) return undefined
        const jump = () => {
          const target = pendingJump.current
          pendingJump.current = null
          if (target === null) return
          try {
            video.currentTime = target
            video.play().catch(() => {})
          } catch {
            /* the element refused the seek; it still plays from the head */
          }
        }
        if (video.readyState >= 1) jump()
        else video.addEventListener('loadedmetadata', jump, { once: true })
        return () => video.removeEventListener('loadedmetadata', jump)
      }, [muxedMode, streamSrc])

      // A new episode must start at 00:00: the offset/scrub of the previous
      // stream would otherwise leak in and the slider would open mid-way.
      React.useEffect(() => {
        offsetRef.current = 0
        setOffset(0)
        setPosition(0)
        scrubRef.current = null
        setScrub(null)
        setRescue(null)
        setMuxedMode(false)
        setSeekEpoch(0)
      }, [src])

      React.useEffect(() => {
        if (chapterPrefs.markers === false) {
          setChapterMarks([])
          return undefined
        }
        const hash = typeof playingMeta?.hash === 'string' ? playingMeta.hash : null
        const bvid = typeof playingMeta?.bvid === 'string' ? playingMeta.bvid : null
        const epId = Number(playingMeta?.epId ?? 0) || 0
        const cid = Number(playingMeta?.cid ?? 0) || 0
        if (hash === null && bvid === null && epId <= 0) {
          setChapterMarks([])
          return undefined
        }
        let alive = true
        const index = Number(playingMeta?.index ?? 0) || 0
        // An upload needs its part cid (the chapters live on the player payload),
        // a PGC episode is addressed by ep_id and reads the OP/ED window instead.
        const source =
          hash !== null
            ? `${API}/torrent/chapters?hash=${hash}&index=${index}`
            : epId > 0
              ? `${API}/bili/chapters?ep_id=${epId}&cid=${cid}`
              : `${API}/bili/chapters?bvid=${bvid}&cid=${cid}`
        fetchJson(source)
          .then((data) => {
            if (!alive) return
            setChapterMarks(Array.isArray(data?.chapters) ? data.chapters : [])
          })
          .catch(() => {
            if (alive) setChapterMarks([])
          })
        return () => {
          alive = false
        }
      }, [playingMeta?.hash, playingMeta?.bvid, playingMeta?.epId, playingMeta?.cid, playingMeta?.index, chapterPrefs.markers])

      /**
       * Seek policy for a piped DASH track, which has no index of its own:
       *
       * - a plain file (torrent download, local copy, muxed rescue) is seeked in
       *   the element, because it really is addressable;
       * - a jump inside the stretch MSE already holds is a local `currentTime`
       *   write, which is instant;
       * - anything else tears the MediaSource down and asks the host for a new
       *   segment at that second (`?start=`, host side `ffmpeg -ss`), then keeps
       *   showing the absolute clock through `offset`.
       */
      const seekTo = React.useCallback(
        (seconds) => {
          const element = videoRef.current
          if (element === null) return
          const target = Math.max(0, Math.round(Number(seconds) || 0))
          const isDash = typeof src === 'string' && src.includes('/bili/stream')
          // A piped stream (`online/stream`, `torrent/transcode`) is produced on
          // demand and has no index of its own, so the element can only reach
          // what it has already been handed. Writing `currentTime` past that
          // parks the video on an empty buffer and it never resumes — which is
          // why the bar used to be undraggable. Those jumps are rebuilt at the
          // new second instead; a source that really is addressable (a plain mp4
          // the host now passes through with Range, so the container has a moov
          // and a finite duration) keeps the cheap in-element seek.
          const piped =
            typeof src === 'string' && (src.includes('/online/stream') || src.includes('/torrent/transcode'))
          const reachable = () => {
            if (piped === false) return true
            const total = Number(element.duration)
            if (Number.isFinite(total) === false || total <= 0) return false
            const seekable = element.seekable
            if (seekable === null || seekable.length === 0) return false
            for (let index = 0; index < seekable.length; index += 1) {
              if (target >= seekable.start(index) - 0.5 && target <= seekable.end(index) - 0.25) return true
            }
            return false
          }
          if ((!isDash || muxedMode) && reachable()) {
            const limit = Number.isFinite(element.duration) && element.duration > 0 ? element.duration - 0.2 : target
            try {
              element.currentTime = Math.max(0, Math.min(target, limit))
            } catch {
              /* the element refused the seek; the slider still shows the target */
            }
            offsetRef.current = 0
            setOffset(0)
            setPosition(target)
            return
          }
          const media = Number.isFinite(element.duration) ? element.duration : 0
          const absolute = media > 0 ? Math.min(target, Math.max(0, offsetRef.current + media - 0.4)) : target
          const current = Number(element.currentTime) || 0
          const nowAt = offsetRef.current + current
          // Whatever MSE has already appended is addressable: a jump inside that
          // buffer is a plain `currentTime` write (buffer ranges are in segment
          // coordinates, the episode clock is `offset + range`).
          if (mseActive) {
            const buffered = element.buffered
            let inside = false
            for (let index = 0; index < buffered.length; index += 1) {
              const from = offsetRef.current + buffered.start(index) + 0.2
              const to = offsetRef.current + buffered.end(index) - 0.3
              if (absolute >= from && absolute <= to) {
                inside = true
                break
              }
            }
            if (inside) {
              try {
                element.currentTime = Math.max(0, current + (absolute - nowAt))
                setPosition(absolute)
                return
              } catch {
                /* fall through to the rebuild */
              }
            }
          }
          offsetRef.current = absolute
          setOffset(absolute)
          setPosition(absolute)
          setSeekEpoch((value) => value + 1)
          console.info(`[dsh-anime] seek rebuild start=${absolute}`)
          say(`定位到 ${formatTime(absolute)}…`)
        },
        [mseActive, muxedMode, say, src],
      )

      const nudgeIdle = React.useCallback(() => {
        setIdle(false)
        if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
        hideTimer.current = window.setTimeout(() => {
          if (panel === null) setIdle(true)
        }, 3000)
      }, [panel])

      React.useEffect(() => {
        nudgeIdle()
        return () => {
          if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
          if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
        }
      }, [nudgeIdle])

      // WebAudio gain so 200%/300% really is louder than the element allows.
      const applyBoost = React.useCallback((value) => {
        const element = videoRef.current
        if (element === null) return
        if (value <= 0) {
          if (audioRef.current !== null) audioRef.current.gain.gain.value = 1
          return
        }
        try {
          if (audioRef.current === null) {
            const Context = window.AudioContext ?? window.webkitAudioContext
            if (Context === undefined) return
            const context = new Context()
            const source = context.createMediaElementSource(element)
            const gain = context.createGain()
            source.connect(gain)
            gain.connect(context.destination)
            audioRef.current = { context, gain }
          }
          audioRef.current.gain.gain.value = Math.max(1, value / 100)
          if (audioRef.current.context.state === 'suspended') void audioRef.current.context.resume()
        } catch {
          /* a second MediaElementSource for the same element throws — ignore */
        }
      }, [])

      React.useEffect(() => {
        applyBoost(prefs.boost)
      }, [applyBoost, prefs.boost])

      React.useEffect(() => {
        const element = videoRef.current
        if (element === null) return
        element.volume = volume
        element.muted = muted
      }, [volume, muted])

      React.useEffect(() => {
        const element = videoRef.current
        if (element === null) return
        element.playbackRate = prefs.speed
      }, [prefs.speed])

      // bilibili reports which rungs this very video can play; anything outside
      // that list is greyed out with the reason instead of failing on click.
      const qualityReason = (qn) => {
        if (qualityMenu === null) return null
        const ladder = Array.isArray(qualityMenu.ladder) ? qualityMenu.ladder.map(Number) : []
        if (ladder.length > 0 && ladder.includes(qn)) return null
        if (qn >= 112) return qualityMenu.vip === true ? '当前视频不可切换' : '需要大会员'
        if (qn >= 80) return qualityMenu.loggedIn === true ? '当前视频不可切换' : '登录后可用'
        return '当前视频不可切换'
      }

      // A fragmented stream carries no moov duration, so the episode length
      // comes from playurl and the scrub bar prefers it over element.duration.
      React.useEffect(() => {
        let alive = true
        let params = null
        try {
          params = new URL(src, 'http://dsh-anime.local').searchParams
        } catch {
          params = null
        }
        if (params === null || params.get('cid') === null) return () => {}
        const query = new URLSearchParams()
        for (const key of ['ep_id', 'bvid', 'cid', 'qn']) {
          const value = params.get(key)
          if (value !== null && value !== '') query.set(key, value)
        }
        fetchJson(`${API}/bili/qualities?${query.toString()}`)
          .then((data) => {
            if (!alive || data?.ok !== true) return
            setQualityMenu({
              ladder: data.ladder ?? [],
              loggedIn: data.loggedIn === true,
              vip: data.vip === true,
              duration: Number(data.duration) > 0 ? Number(data.duration) : null,
            })
          })
          .catch(() => undefined)
        return () => {
          alive = false
        }
      }, [src])

      const openQualityMenu = React.useCallback(() => {
        if (qualityOpen) {
          setQualityOpen(false)
          return
        }
        setQualityOpen(true)
        if (lineOptions.length > 0) return
        let params = null
        try {
          params = new URL(src, 'http://dsh-anime.local').searchParams
        } catch {
          params = null
        }
        const query = new URLSearchParams()
        if (params !== null) {
          for (const key of ['ep_id', 'bvid', 'cid', 'qn']) {
            const value = params.get(key)
            if (value !== null && value !== '') query.set(key, value)
          }
        }
        if (query.get('cid') === null) return
        fetchJson(`${API}/bili/qualities?${query.toString()}`)
          .then((data) => {
            if (data?.ok === true) {
              setQualityMenu({ ladder: data.ladder ?? [], loggedIn: data.loggedIn === true, vip: data.vip === true })
            } else {
              setQualityMenu({ ladder: [], loggedIn: false, vip: false })
            }
          })
          .catch(() => setQualityMenu({ ladder: [], loggedIn: false, vip: false }))
      }, [qualityOpen, src, lineOptions.length])

      const seek = React.useCallback(
        (delta) => {
          const element = videoRef.current
          if (element === null) return
          const before = offsetRef.current + (element.currentTime || 0)
          seekTo(before + delta)
          say(`${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))}s`)
        },
        [say, seekTo],
      )

      const togglePlay = React.useCallback(() => {
        const element = videoRef.current
        if (element === null) return
        if (element.paused) void element.play()
        else element.pause()
      }, [])

      const [cssFull, setCssFull] = React.useState(false)
      const goFullscreen = React.useCallback(() => {
        // Fullscreen the *player root*, not the <video>: fullscreening the video
        // itself makes Chromium swap our control bar for its own, but a wrapper
        // has no native controls. It also escapes any transformed ancestor,
        // which is why the CSS-only overlay only covered ~4/5 of the screen.
        const root = rootRef.current
        if (document.fullscreenElement !== null) {
          document.exitFullscreen?.().catch(() => {})
          setCssFull(false)
          return
        }
        if (root !== null && typeof root.requestFullscreen === 'function') {
          root.requestFullscreen().then(() => setCssFull(false)).catch(() => setCssFull((value) => !value))
          return
        }
        setCssFull((value) => !value)
      }, [])

      const unusedFullscreenApi = React.useCallback(() => {
        // Fullscreening the shell container does nothing when the webview
        // refuses it, so fall back to the media element (Electron accepts both
        // forms of the call) and say so when even that is rejected.
        const host = hostRef.current
        const video = videoRef.current
        if (document.fullscreenElement !== null) {
          void document.exitFullscreen?.()
          return
        }
        const ask = (element) =>
          element === null || typeof element?.requestFullscreen !== 'function'
            ? Promise.reject(new Error('no requestFullscreen'))
            : element.requestFullscreen().catch(() => element.webkitRequestFullscreen?.() ?? Promise.reject(new Error('refused')))
        ask(host)
          .catch(() => ask(video))
          .catch(() => {
            if (video !== null) video.webkitEnterFullscreen?.()
            else say('这个窗口不允许全屏')
          })
      }, [say])

      const goPip = React.useCallback(async () => {
        const element = videoRef.current
        if (element === null) return
        try {
          if (document.pictureInPictureElement === null) await element.requestPictureInPicture()
          else await document.exitPictureInPicture()
        } catch {
          say('画中画不可用')
        }
      }, [say])

      const changeSpeed = React.useCallback(
        (delta) => {
          const next = Math.min(3, Math.max(0.25, Math.round((prefs.speed + delta) * 100) / 100))
          setPrefs({ speed: next })
          say(`${next.toFixed(2)}×`)
        },
        [prefs.speed, setPrefs, say],
      )

      const jumpIntro = React.useCallback(() => {
        // Real skip data first: the OP window ends where the episode really
        // starts, which beats a guessed offset. Everything else keeps the
        // configured seconds.
        const op = chapterMarks.find((chapter) => chapter.skip === true && chapter.start <= 5)
        const target = op !== undefined ? op.end : prefs.skipIntro > 0 ? prefs.skipIntro : 85
        seekTo(target)
        say(op !== undefined ? '已跳过片头' : `跳过 ${Math.round(target)} 秒`)
      }, [chapterMarks, prefs.skipIntro, say, seekTo])

      React.useEffect(() => {
        const handler = (event) => {
          if (event.target instanceof HTMLInputElement) return
          const keys = loadPrefs().keys
          const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
          const is = (value) => String(value).toLowerCase() === key
          if (is(keys.keyPlayPause) || key === 'k') {
            event.preventDefault()
            togglePlay()
          } else if (is(keys.keyForward)) {
            event.preventDefault()
            seek(keys.seekFine)
          } else if (is(keys.keyBack)) {
            event.preventDefault()
            seek(-keys.seekFine)
          } else if (is(keys.keyForwardBig)) {
            event.preventDefault()
            seek(keys.seekCoarse)
          } else if (is(keys.keyBackBig)) {
            event.preventDefault()
            seek(-keys.seekCoarse)
          } else if (is(keys.keySpeedUp)) {
            event.preventDefault()
            changeSpeed(keys.speedStep)
          } else if (is(keys.keySpeedDown)) {
            event.preventDefault()
            changeSpeed(-keys.speedStep)
          } else if (is(keys.keyFullscreen)) {
            event.preventDefault()
            goFullscreen()
          } else if (is(keys.keyPip)) {
            event.preventDefault()
            void goPip()
          } else if (is(keys.keyMute)) {
            event.preventDefault()
            setMuted((value) => !value)
          } else if (is(keys.keyNext) && typeof onNext === 'function') {
            event.preventDefault()
            onNext()
          } else if (is(keys.keyStats)) {
            event.preventDefault()
            setStats((value) => !value)
          } else if (key === 'arrowup') {
            event.preventDefault()
            setVolume((value) => Math.min(1, value + 0.05))
          } else if (key === 'arrowdown') {
            event.preventDefault()
            setVolume((value) => Math.max(0, value - 0.05))
          } else if (key === 'escape') {
            setPanel(null)
          }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
      }, [changeSpeed, goFullscreen, goPip, onNext, seek, togglePlay])

      const headerDuration = Number(streamDuration) > 0 ? Math.round(Number(streamDuration)) : 0
      const hintedDuration =
        Number(durationHint) > 0
          ? Math.round(Number(durationHint))
          : headerDuration > 0
            ? headerDuration
            : Number(qualityMenu?.duration) > 0
              ? Number(qualityMenu.duration)
              : 0
      // A live transcoded response has no length in its container (fragmented
      // MP4 with an empty moov), so the element reports whatever it has buffered
      // — an 8 second "total" that keeps lying as playback advances. Only the
      // explicit hint counts there; otherwise the total is simply unknown.
      const liveSource = String(src ?? '').includes('/online/stream') || String(src ?? '').includes('/torrent/transcode')
      const baseDuration = liveSource
        ? hintedDuration
        : duration > 0 && Number.isFinite(duration) && (duration > 30 || hintedDuration === 0)
          ? duration
          : hintedDuration
      // For a DASH segment `duration` is the whole episode (the manifest carries
      // the real length), so the offset must not be added on top of it.
      const totalDuration = baseDuration > 0 ? baseDuration : liveSource ? 0 : offsetRef.current
      const knownTotal = totalDuration > 0 && Number.isFinite(totalDuration)
      const ratio = totalDuration > 0 ? Math.min(100, (position / totalDuration) * 100) : 0
      // The preload segment: everything the element has already fetched, drawn
      // between the playhead and the rest of the bar. It never sits behind the
      // playhead, and an unknown total means nothing to measure it against.
      const loadedRatio =
        totalDuration > 0 && Number.isFinite(totalDuration)
          ? Math.min(100, Math.max(ratio, (Math.max(loaded, position) / totalDuration) * 100))
          : ratio

      // MSE keeps buffered time relative to the segment it was fed, so the
      // absolute second is offset plus whatever the element reports.
      const readLoaded = React.useCallback((element) => {
        const buffer = element?.buffered
        if (buffer === undefined || buffer === null || buffer.length === 0) return
        const end = buffer.end(buffer.length - 1)
        if (Number.isFinite(end)) setLoaded(offsetRef.current + end)
      }, [])

      const commitScrub = () => {
        if (scrubRef.current === null) return
        const target = scrubRef.current
        scrubRef.current = null
        setScrub(null)
        seekTo(target)
      }

      const iconButton = (name, title, onClick) =>
        h(
          'button',
          { className: 'dshan-pl-icon', type: 'button', title, onClick, 'aria-label': title },
          h(PlayerIcon, { name }),
        )

      const drawer =
        panel === null || panel === 'prefs'
          ? null
          : h(
              'div',
              { className: 'dshan-pl-panel' },
              h(
                'div',
                { className: 'dshan-pl-panelhead' },
                panel === 'substyle' || panel === 'shaders' || panel === 'parts' || panel === 'size'
                  ? h(
                      'button',
                      {
                        className: 'dshan-pl-panelback',
                        type: 'button',
                        onClick: () => setPanel(panel === 'parts' ? null : 'settings'),
                        'aria-label': '返回',
                      },
                      '‹',
                    )
                  : null,
                h(
                  'span',
                  null,
                  panel === 'settings'
                    ? T('playerSettings')
                    : panel === 'quality'
                      ? '清晰度'
                      : panel === 'subtitles'
                        ? T('subtitles')
                        : panel === 'substyle'
                          ? '字幕样式'
                          : panel === 'size'
                            ? T('sizePanel')
                            : panel === 'shaders'
                              ? '画质增强'
                              : panel === 'parts'
                                ? T('parts')
                                : T('audioTracks'),
                ),
              ),
              panel === 'size'
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    h(
                      'div',
                      { className: 'dshan-pl-qualityhead' },
                      `${T('sizePanel')} · ${langIsEn ? aspectMode.en : aspectMode.zh}`,
                    ),
                    ASPECT_MODES.map((mode) =>
                      h(SettingRow, {
                        key: `aspect-${mode.value}`,
                        icon: 'screen',
                        label: langIsEn ? mode.en : mode.zh,
                        value: mode.value === aspectMode.value ? '✓' : '',
                        onClick: () => {
                          setPrefs({ aspect: mode.value })
                          say(`${T('sizePanel')}：${langIsEn ? mode.en : mode.zh}`)
                        },
                      }),
                    ),
                    h(
                      'div',
                      { className: 'dshan-pl-hint' },
                      langIsEn
                        ? 'Auto keeps the original shape; Crop fills and cuts; Stretch distorts; Fit width keeps the width. 4:3 and 16:9 force that shape.'
                        : '自动按原比例显示；裁剪铺满并切边；拉伸铺满但会变形；等宽只按宽度铺满。4:3 与 16:9 会把画面压成那个比例（和 mpv 的 aspect override 一致）。',
                    ),
                  )
                : null,
              panel === 'substyle'
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    h(SettingRow, {
                      icon: 'cc',
                      label: '字号',
                      value: `${subStyle?.size ?? 64}`,
                      onClick: () =>
                        setPicker({
                          title: '字幕字号',
                          current: String(subStyle?.size ?? 64),
                          options: [
                            { label: '小 · 48', value: '48' },
                            { label: '标准 · 64', value: '64' },
                            { label: '大 · 80', value: '80' },
                            { label: '超大 · 96', value: '96' },
                          ],
                          apply: (value) => {
                            const size = Number(value) || 64
                            applySubStyle({ size })
                            say(`字幕字号：${size}`)
                          },
                        }),
                    }),
                    h(SettingRow, {
                      icon: 'outline',
                      label: '描边',
                      value: subStyle?.outline === false ? 'Off' : `${subStyle?.outlineSize ?? 3}`,
                      onClick: () =>
                        setPicker({
                          title: '字幕描边',
                          current: subStyle?.outline === false ? 'off' : String(subStyle?.outlineSize ?? 3),
                          options: [
                            { label: 'Off', value: 'off' },
                            { label: '细 · 1', value: '1' },
                            { label: '中 · 2', value: '2' },
                            { label: '粗 · 3', value: '3' },
                            { label: '很粗 · 4', value: '4' },
                          ],
                          apply: (value) => {
                            if (value === 'off') {
                              applySubStyle({ outline: false })
                              say('字幕描边：关闭')
                              return
                            }
                            const outlineSize = Number(value) || 3
                            applySubStyle({ outline: true, outlineSize })
                            say(`字幕描边：${outlineSize}`)
                          },
                        }),
                    }),
                    h(SettingRow, {
                      icon: 'shadow',
                      label: '阴影',
                      value: subStyle?.shadow === true ? 'On' : 'Off',
                      onClick: () =>
                        setPicker({
                          title: '字幕阴影',
                          current: String(subStyle?.shadow === true),
                          options: [
                            { label: 'On', value: 'true' },
                            { label: 'Off', value: 'false' },
                          ],
                          apply: (value) => {
                            const shadow = value === 'true'
                            applySubStyle({ shadow })
                            say(`字幕阴影：${shadow ? 'On' : 'Off'}`)
                          },
                        }),
                    }),
                    h(SettingRow, {
                      icon: 'palette',
                      label: '颜色',
                      value:
                        SUBTITLE_COLORS.find((entry) => entry.value === (subStyle?.color ?? '#FFFFFF'))?.label ?? '白',
                      onClick: () =>
                        setPicker({
                          title: '字幕颜色',
                          current: subStyle?.color ?? '#FFFFFF',
                          options: SUBTITLE_COLORS.map((entry) => ({ label: entry.label, value: entry.value })),
                          apply: (value) => {
                            applySubStyle({ color: value })
                            say(`字幕颜色：${value}`)
                          },
                        }),
                    }),
                    h('div', { className: 'dshan-pl-hint' }, '字幕样式由宿主烧进 ASS，改完全站生效。'),
                  )
                : panel === 'shaders'
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    h(SettingRow, {
                      label: '去色带（Debanding）',
                      value: prefs.deband === true ? 'On' : 'Off',
                      onClick: () => setPrefs({ deband: prefs.deband !== true }),
                    }),
                    h(SettingRow, {
                      label: '着色器',
                      value:
                        prefs.shaderMode === 'custom'
                          ? '自定义'
                          : prefs.anime4k === 'off'
                            ? 'Off'
                            : 'Anime4K 预设',
                      onClick: () =>
                        setPrefs({
                          shaderMode:
                            prefs.shaderMode === 'custom' ? 'anime4k' : prefs.shaderMode === 'anime4k' ? 'off' : 'anime4k',
                        }),
                    }),
                    prefs.shaderMode === 'off'
                      ? null
                      : h(
                          'div',
                          { className: 'dshan-pl-quality' },
                          h(
                            'div',
                            { className: 'dshan-pl-qualityhead' },
                            gpu === true
                              ? `Anime4K 模式 · WebGPU${gpuName === '' ? '' : ` · ${gpuName}`}`
                              : a4kGl === 'on'
                                ? 'Anime4K 模式 · WebGL（本地 2×）'
                                : gpu === false
                                  ? `画质锐化 · CPU 兜底（${gpuReason === '' ? '无 WebGPU' : gpuReason}）`
                                  : 'Anime4K 模式',
                          ),
                          ANIME4K_OPTIONS.map((option) =>
                            h(TrackRow, {
                              key: option.value,
                              label: option.label,
                              code: option.performance === 'heavy' ? '吃显卡' : option.performance === 'medium' ? '中等' : '轻',
                              active: (prefs.anime4k ?? 'mode-a') === option.value,
                              onClick: () => {
                                setPrefs({ anime4k: option.value, shaderMode: option.value === 'off' ? 'off' : 'anime4k' })
                                // Keep the settings page in step: it is the copy
                                // that survives a page reload.
                                void postJson('settings/save', { player: { anime4k: option.value } }).catch(() => undefined)
                                say(`画质增强：${option.label} · ${option.description}`)
                              },
                            }),
                          ),
                        ),
                    h(
                      'div',
                      { className: 'dshan-pl-shaders' },
                      h('span', null, enhance === null ? '正在读取着色器…' : `检测到 ${enhance.count} 个着色器文件`),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dshan-pl-mini',
                          onClick: () => {
                            void fetchJson(`${API}/player/shaders/open`).catch(() => undefined)
                          },
                        },
                        '打开文件夹',
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dshan-pl-mini',
                          onClick: () => {
                            void fetchJson(`${API}/player/shaders`)
                              .then((data) => setEnhance(data ?? null))
                              .catch(() => setEnhance(null))
                          },
                        },
                        '刷新',
                      ),
                    ),
                    h(
                      'div',
                      { className: 'dshan-pl-hint' },
                      '这些着色器由外放 / 内嵌的 mpv 加载；浏览器内播放只能用去色带开关。',
                    ),
                  )
                : panel === 'parts'
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    h('div', { className: 'dshan-pl-qualityhead' }, `${T('parts')} · ${parts.length}`),
                    parts.map((part) =>
                      h('button', {
                        key: part.cid,
                        type: 'button',
                        className: 'dshan-qmenu-row',
                        'data-active': part.cid === pickedCid ? 'true' : 'false',
                        onClick: () => {
                          if (typeof onPickPart === 'function') onPickPart(part)
                          setPanel(null)
                        },
                      }, h('span', { className: 'dshan-qmenu-name' }, `P${part.page} · ${part.part}`)),
                    ),
                  )
                : (panel === 'settings' || panel === 'substyle') && picker !== null
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    h(SettingRow, {
                      label: `‹ ${picker.title}`,
                      value: '',
                      onClick: () => setPicker(null),
                    }),
                    (picker.options ?? []).map((option) =>
                      h(SettingRow, {
                        key: `pick-${option.value}`,
                        label: option.label,
                        value: String(option.value) === String(picker.current) ? '✓' : '',
                        onClick: () => {
                          picker.apply(option.value)
                          setPicker(null)
                        },
                      }),
                    ),
                  )
                : panel === 'settings'
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    h(SettingRow, {
                      icon: 'speed',
                      label: T('playbackSpeed'),
                      value: `${prefs.speed.toFixed(2)}×`,
                      onClick: () =>
                        setPicker({
                          title: T('playbackSpeed'),
                          current: String(prefs.speed),
                          options: ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'].map((value) => ({
                            label: `${Number(value).toFixed(2)}×`,
                            value,
                          })),
                          apply: (value) => changeSpeed(Number(value) - prefs.speed),
                        }),
                    }),
                    h(SettingRow, {
                      icon: 'volume',
                      label: T('volumeBoost'),
                      value: prefs.boost === 0 ? 'Off' : `${prefs.boost}%`,
                      onClick: () =>
                        setPicker({
                          title: T('volumeBoost'),
                          current: String(prefs.boost),
                          options: ['0', '100', '200', '300'].map((value) => ({
                            label: value === '0' ? 'Off' : `${value}%`,
                            value,
                          })),
                          apply: (value) => setPrefs({ boost: Number(value) }),
                        }),
                    }),
                    h(SettingRow, {
                      icon: 'autoplay',
                      label: T('autoPlay'),
                      value: prefs.autoPlay ? 'On' : 'Off',
                      onClick: () =>
                        setPicker({
                          title: T('autoPlay'),
                          current: String(prefs.autoPlay),
                          options: [
                            { label: 'On', value: 'true' },
                            { label: 'Off', value: 'false' },
                          ],
                          apply: (value) => setPrefs({ autoPlay: value === 'true' }),
                        }),
                    }),
                    h(SettingRow, {
                      icon: 'autonext',
                      label: T('autoNext'),
                      value: prefs.autoNext ? 'On' : 'Off',
                      onClick: () => setPrefs({ autoNext: !prefs.autoNext }),
                    }),
                    h(SettingRow, {
                      icon: 'skip',
                      label: T('skipOpEd'),
                      value: prefs.skipIntro === 0 ? 'Off' : `${prefs.skipIntro}s`,
                      onClick: () =>
                        setPrefs({ skipIntro: prefs.skipIntro === 0 ? 85 : prefs.skipIntro === 85 ? 90 : 0 }),
                    }),
                    h(SettingRow, {
                      icon: 'cc',
                      label: '字幕样式',
                      value: subtitleSummary,
                      onClick: () => setPanel('substyle'),
                    }),
                    h(SettingRow, {
                      icon: 'screen',
                      label: T('sizePanel'),
                      value: langIsEn ? aspectMode.en : aspectMode.zh,
                      onClick: () => setPanel('size'),
                    }),
                    h(SettingRow, {
                      icon: 'screen',
                      label: T('appearance'),
                      value:
                        prefs.appearance === 'dark' ? 'Dark' : prefs.appearance === 'light' ? 'Light' : 'Transparent',
                      onClick: () =>
                        setPrefs({
                          appearance:
                            prefs.appearance === 'dark'
                              ? 'light'
                              : prefs.appearance === 'light'
                                ? 'transparent'
                                : 'dark',
                        }),
                    }),
                    h(SettingRow, {
                      icon: 'sparkles',
                      label: '画质增强',
                      value:
                        prefs.deband === true
                          ? '去色带'
                          : prefs.shaderMode === 'custom'
                            ? '自定义'
                            : prefs.anime4k === 'off'
                              ? 'Off'
                              : String(prefs.anime4k).toUpperCase(),
                      onClick: () => setPanel('shaders'),
                    }),
                    handoff === null
                      ? null
                      : handoff.length === 0
                        ? h(SettingRow, { icon: 'external', label: T('externalPlayer'), value: T('setNoneDetected'), onClick: () => {} })
                        : handoff.map((entry) =>
                            h(SettingRow, {
                              key: entry.id,
                              icon: 'external',
                              label: `${T('externalPlayer')} · ${entry.label}`,
                              value: handoffBusy === entry.id ? '…' : `+${Math.round(position)}s`,
                              onClick: () => void openExternal(entry.id),
                            }),
                          ),
                    h(SettingRow, {
                      icon: 'sliders',
                      label: T('preferences'),
                      value: '',
                      onClick: () => setPanel('prefs'),
                    }),
                  )
                : null,
              panel === 'subtitles'
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    h('div', { className: 'dshan-pl-empty' }, T('noSubtitles')),
                  )
                : null,
              panel === 'quality'
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    typeof onQuality === 'function' && lineOptions.length > 0
                      ? lineOptions.map((option) =>
                          h(TrackRow, {
                            key: String(option.value),
                            label: option.label,
                            code: option.note === undefined ? '' : String(option.note),
                            active: String(option.value) === String(quality),
                            onClick: () => onQuality(option.value),
                          }),
                        )
                      : typeof onQuality === 'function'
                      ? [120, 116, 112, 80, 74, 64, 32, 16].map((value) =>
                          h(TrackRow, {
                            key: value,
                            label: QUALITY_LABEL[value] ?? `${value}P`,
                            code: `qn ${value}`,
                            active: Number(quality) === value,
                            onClick: () => {
                              onQuality(value)
                              setPanel('settings')
                              say(`清晰度：${QUALITY_LABEL[value] ?? `${value}P`}`)
                            },
                          }),
                        )
                      : h('div', { className: 'dshan-pl-empty' }, '当前源不支持切换清晰度'),
                  )
                : null,
              panel === 'audio'
                ? h(
                    'div',
                    { className: 'dshan-pl-panelbody' },
                    h(TrackRow, { label: T('defaultAudio'), code: 'AAC', active: true, onClick: () => say('音轨：默认') }),
                    h('div', { className: 'dshan-pl-empty' }, T('singleAudioHint')),
                  )
                : null,
            )

      return h(
        'div',
        {
          // One callback ref: the previous `ref` pair was a duplicate key, so
          // React silently kept only the last one and half the refs were null.
          ref: (node) => {
            rootRef.current = node
            hostRef.current = node
            stageRef.current = node
          },
          className: 'dshan-pl',
          'data-full': cssFull ? 'true' : 'false',
          'data-idle': String(idle && panel === null),
          'data-appearance': prefs.appearance,
          onMouseMove: nudgeIdle,
          onMouseLeave: () => {
            if (panel === null) setIdle(true)
          },
        },
        qualityOpen && lineOptions.length > 0 && typeof onQuality === 'function'
          ? h(
              'div',
              { className: 'dshan-qmenu', role: 'menu' },
              lineOptions.map((option) => {
                const selected = String(option.value) === String(quality)
                return h(
                  'button',
                  {
                    key: String(option.value),
                    type: 'button',
                    role: 'menuitem',
                    className: 'dshan-qmenu-row',
                    'data-active': selected ? 'true' : 'false',
                    'data-disabled': 'false',
                    disabled: selected,
                    title: String(option.note ?? ''),
                    onClick: () => {
                      onQuality(option.value)
                      setQualityOpen(false)
                      say(`${T('quality')}：${option.label}`)
                    },
                  },
                  h('span', { className: 'dshan-qmenu-name' }, option.label),
                  option.note === undefined ? null : h('span', { className: 'dshan-qmenu-sub' }, option.note),
                  h('span', { className: 'dshan-qmenu-badge' }, selected ? '✓' : ''),
                )
              }),
            )
          : null,
        qualityOpen && lineOptions.length === 0 && typeof onQuality === 'function'
          ? h(
              'div',
              { className: 'dshan-qmenu', role: 'menu' },
              QUALITY_MENU.map((item) => {
                const reason = qualityReason(item.qn)
                const selected = Number(quality) === item.qn
                return h(
                  'button',
                  {
                    key: item.qn,
                    type: 'button',
                    role: 'menuitem',
                    className: 'dshan-qmenu-row',
                    'data-active': selected ? 'true' : 'false',
                    'data-disabled': reason === null ? 'false' : 'true',
                    disabled: reason !== null || selected,
                    onClick: () => {
                      onQuality(item.qn)
                      setQualityOpen(false)
                      say(`清晰度：${item.name}`)
                    },
                  },
                  h('span', { className: 'dshan-qmenu-name' }, item.name),
                  item.sub === '' ? null : h('span', { className: 'dshan-qmenu-sub' }, item.sub),
                  h('span', { className: 'dshan-qmenu-badge' }, reason ?? item.badge),
                )
              }),
            )
          : null,
        duration > 0
          ? null
          : h('div', { className: 'dshan-pl-prep' }, T('preparingStream')),
        h('canvas', {
          ref: casCanvasRef,
          className: 'dshan-pl-cas',
          style: frameStyle,
          'data-on': String(casSharp > 0 && embedded === null && gpu === false && a4kGl !== 'on'),
        }),
        // WebGPU and the WebGL port each get their own canvas: a canvas element
        // can hand out one context type for its whole life, so they cannot share
        // one element.
        h('canvas', {
          ref: a4kCanvasRef,
          className: 'dshan-pl-a4k',
          style: frameStyle,
          'data-on': String(casSharp > 0 && embedded === null && (gpu === true || a4kGl === 'on')),
        }),
        h('video', {
          ref: videoRef,
          style: embedded === null ? frameStyle : { ...frameStyle, visibility: 'hidden' },
          className: 'dshan-pl-video',
          src: undefined,
          autoPlay: prefs.autoPlay,
          playsInline: true,
          onClick: () => {
            // A click on the picture dismisses whatever drawer or sheet is open
            // instead of toggling playback: that is what a settings panel that
            // floats over the video owes the user.
            if (panel !== null) {
              setPanel(null)
              return
            }
            togglePlay()
          },
          onDoubleClick: goFullscreen,
          onPlay: () => {
            setPlaying(true)
            if (prefs.boost > 0) applyBoost(prefs.boost)
          },
          onPause: () => setPlaying(false),
          onLoadedMetadata: (event) => {
            const element = event.currentTarget
            setDuration(element.duration || 0)
            setPosition(offsetRef.current)
            if (startWantedRef.current > 0) {
              const wanted = startWantedRef.current
              startWantedRef.current = 0
              seekTo(wanted)
            }
            // The Anime4K pipelines snapshot videoWidth/videoHeight once, so the
            // enhancer effects have to wait for the first frame's dimensions.
            setVideoDims(`${element.videoWidth}x${element.videoHeight}`)
            readLoaded(element)
          },
          onProgress: (event) => readLoaded(event.currentTarget),
          onTimeUpdate: (event) => {
            const absolute = offsetRef.current + (event.currentTarget.currentTime || 0)
            if (scrubRef.current === null) setPosition(absolute)
            if (typeof onTime === 'function') onTime(absolute)
            readLoaded(event.currentTarget)
            // seanime's Skip OP/ED: jump out of a chapter whose title says it is one.
            if (chapterPrefs.skip === true && chapterMarks.length > 0) {
              const inside = chapterMarks.find((chapter) => chapter.skip === true && absolute >= chapter.start && absolute < chapter.end - 1)
              if (inside !== undefined) {
                try {
                  event.currentTarget.currentTime = inside.end - offsetRef.current
                } catch {
                  /* element refused the seek; the mark still shows */
                }
              }
            }
          },
          onSeeked: (event) => {
            if (scrubRef.current === null) setPosition(offsetRef.current + (event.currentTarget.currentTime || 0))
            readLoaded(event.currentTarget)
          },
          onEnded: () => {
            if (prefs.autoNext && typeof onNext === 'function') onNext()
            else setPlaying(false)
          },
          onError: () => {
            if (typeof onFallback === 'function') onFallback()
            say(errorHint ?? '播放失败')
          },
        }),

        h(
          'div',
          { className: 'dshan-pl-top' },
          h(
            'div',
            { className: 'dshan-pl-heads' },
            h('div', { className: 'dshan-pl-title' }, title ?? ''),
            subtitle === undefined || subtitle === null || subtitle === ''
              ? null
              : h('div', { className: 'dshan-pl-sub' }, subtitle),
          ),
          typeof onClose === 'function' ? iconButton('close', '关闭', onClose) : null,
        ),

        h(
          'div',
          { className: 'dshan-pl-bottom' },
          h(
            'div',
            { className: 'dshan-pl-progress' },
            chapterMarks.length > 0
              ? h(
                  'div',
                  { className: 'dshan-pl-marks', 'aria-hidden': 'true' },
                  chapterMarks.map((chapter, index) =>
                    h('span', {
                      key: `ch-${index}`,
                      className: 'dshan-pl-mark',
                      'data-skip': chapter.skip ? 'true' : 'false',
                      'data-shown': chapter.skip ? String(highlightSkipped) : 'true',
                      style: {
                        left: `${(chapter.start / totalDuration) * 100}%`,
                        width: `${Math.max(0.4, ((chapter.end - chapter.start) / totalDuration) * 100)}%`,
                      },
                      title: `${chapter.title} · ${formatTime(chapter.start)}`,
                      // A jump on a piped DASH track has to rebuild the segment;
                      // writing currentTime here would only park on an empty buffer.
                      onClick: () => seekTo(chapter.start),
                    }),
                  ),
                )
              : null,
            h('input', {
              type: 'range',
              min: 0,
              max: Math.max(totalDuration > 0 && Number.isFinite(totalDuration) ? totalDuration : 0.1, 0.1),
              step: 0.1,
              value: scrub === null ? position : scrub,
              'aria-label': '进度',
              disabled: !(totalDuration > 0 && Number.isFinite(totalDuration)) || String(src ?? '').includes('/torrent/transcode'),
              onChange: (event) => {
                const next = Number(event.target.value)
                if (!Number.isFinite(next)) return
                scrubRef.current = next
                setScrub(next)
                // MSE only holds the stretch we fed it, so assigning currentTime
                // there parks the picture on an empty buffer. `commitScrub` moves
                // `offset`, which rebuilds the manifest at that second instead.
                if (mseActive) return
                const element = videoRef.current
                if (element !== null && Number.isFinite(element.duration) && element.duration > 0) {
                  try {
                    element.currentTime = Math.max(0, Math.min(next, element.duration - 0.15))
                  } catch {
                    /* the media element refuses oddly-typed seeks; keep the slider value */
                  }
                }
              },
              onPointerUp: () => commitScrub(),
              onKeyUp: () => commitScrub(),
              onBlur: () => commitScrub(),
              style: { '--dshan-pl-ratio': `${ratio}%`, '--dshan-pl-loaded': `${loadedRatio}%` },
            }),
          ),
          h(
            'div',
            { className: 'dshan-pl-controls' },
            iconButton(playing ? 'pause' : 'play', playing ? '暂停' : '播放', togglePlay),
            typeof onNext === 'function' && hasNext !== false ? iconButton('next', '下一集', onNext) : null,
            h(
              'div',
              { className: 'dshan-pl-volume' },
              iconButton(muted || volume === 0 ? 'mute' : volume > 0.5 ? 'volume' : 'volume-low', '静音', () =>
                setMuted((value) => !value),
              ),
              h('input', {
                type: 'range',
                min: 0,
                max: 1,
                step: 0.01,
                value: muted ? 0 : volume,
                'aria-label': '音量',
                onChange: (event) => {
                  const next = Number(event.target.value)
                  setVolume(next)
                  setMuted(next === 0)
                },
              }),
            ),
            h('span', { className: 'dshan-pl-time' }, knownTotal ? `${clock(position)} / ${clock(totalDuration)}` : `${clock(position)} / --:--`),
            h(
              'div',
              { className: 'dshan-pl-right' },
              typeof onDownload === 'function' ? iconButton('download', T('download'), startDownload) : null,
              Array.isArray(parts) && parts.length > 1
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshan-pl-qbtn',
                      title: `${T('parts')} ${parts.length}`,
                      onClick: () => setPanel(panel === 'parts' ? null : 'parts'),
                    },
                    `P${(parts.find((item) => item.cid === pickedCid)?.page ?? 1)}/${parts.length}`,
                  )
                : null,
              typeof onQuality === 'function' && (lineOptions.length > 0 || Number(quality) > 0)
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshan-pl-qbtn',
                      'data-open': qualityOpen ? 'true' : 'false',
                      title: T('quality'),
                      onClick: openQualityMenu,
                    },
                    lineOptions.length > 0
                      ? (lineOptions.find((option) => String(option.value) === String(quality))?.label ?? lineOptions[0].label)
                      : QUALITY_LABEL[quality] ?? `${quality}P`,
                  )
                : null,
              iconButton('settings', '更多设置', () => setPanel(panel === 'settings' ? null : 'settings')),
              iconButton('cc', T('subtitles'), () => setPanel(panel === 'subtitles' ? null : 'subtitles')),
              iconButton('audio', T('audioTracks'), () => setPanel(panel === 'audio' ? null : 'audio')),
              iconButton('pip', '画中画', () => void goPip()),
              iconButton('fullscreen', '全屏', goFullscreen),

            ),
          ),
        ),

        drawer,

        panel === 'prefs'
          ? h(PreferencesModal, { prefs, onChange: setPrefs, onClose: () => setPanel(null), say, T })
          : null,

        stats
          ? h(
              'div',
              { className: 'dshan-pl-stats' },
              `speed ${prefs.speed.toFixed(2)}× · vol ${Math.round(volume * 100)}% · boost ${prefs.boost}% · ${clock(position)}`,
            )
          : null,

        toast === '' ? null : h('div', { className: 'dshan-pl-toast' }, toast),
      )
    }

    function PreferencesModal({ prefs, onChange, onClose, say, T: propT }) {
      const T = typeof propT === 'function' ? propT : (key) => (ZH[key] === undefined ? key : ZH[key])
      const tab = 'keys'
      const [draft, setDraft] = React.useState(prefs)

      React.useEffect(() => setDraft(prefs), [prefs])

      const keyFields = [
        ['seekFine', T('seekFine'), 'number', T('seconds')],
        ['seekCoarse', T('seekCoarse'), 'number', T('seconds')],
        ['speedStep', T('speedStep'), 'number', T('increment'), 0.05],
        ['keyForward', T('keyForward'), 'key'],
        ['keyBack', T('keyBack'), 'key'],
        ['keyForwardBig', T('keyForwardBig'), 'key'],
        ['keyBackBig', T('keyBackBig'), 'key'],
        ['keySpeedUp', T('keySpeedUp'), 'key'],
        ['keySpeedDown', T('keySpeedDown'), 'key'],
        ['keyNext', T('keyNext'), 'key'],
        ['keyFullscreen', T('keyFullscreen'), 'key'],
        ['keyPip', T('keyPip'), 'key'],
        ['keyMute', T('keyMute'), 'key'],
        ['keyStats', T('keyStats'), 'key'],
      ]

      const bind = (field) => (event) => {
        event.preventDefault()
        const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key
        setDraft((current) => ({ ...current, keys: { ...current.keys, [field]: pressed } }))
      }

      const row = (key, label, control, unit) =>
        h(
          'div',
          { className: 'dshan-plprefs-row', key },
          h('div', { className: 'dshan-plprefs-rowlabel' }, label),
          unit === undefined || unit === null || unit === '' ? null : h('span', { className: 'dshan-plprefs-unit' }, unit),
          control,
        )

      const numberRow = ([field, label, , unit, step]) =>
        row(
          field,
          label,
          h('input', {
            className: 'dshan-plprefs-num',
            type: 'number',
            step: step ?? 1,
            // These numbers live in `prefs.keys` (the key handler reads
            // keys.seekFine), so the row has to read and write there too —
            // reading `draft[field]` showed an empty box and editing wrote to
            // a field nobody used.
            value: draft.keys?.[field] ?? '',
            onChange: (event) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              setDraft((current) => ({ ...current, keys: { ...current.keys, [field]: next } }))
            },
          }),
          unit ?? '',
        )

      const keyRow = ([field, label]) =>
        row(
          field,
          label,
          h('input', {
            className: 'dshan-plprefs-key',
            value: prettyKey(draft.keys?.[field]),
            readOnly: true,
            onKeyDown: bind(field),
            onFocus: (event) => event.target.select(),
          }),
        )

      const group = (title, rows) => [
        h('div', { className: 'dshan-plprefs-group', key: `g-${title}` }, title),
        h('div', { className: 'dshan-plprefs-grid', key: `r-${title}` }, rows),
      ]

      // Only the keyboard map lives here. Playback speed, volume boost,
      // autoplay/autonext, skip OP/ED, subtitle style and the shader switch are
      // already rows in the gear drawer, and listing them twice meant editing
      // the same setting from two places.

      // A click anywhere off the sheet closes it, exactly like a click on the
      // picture closes a drawer. The sheet itself swallows its own clicks.
      return h(
        'div',
        { className: 'dshan-plprefs-mask', onClick: onClose },
        h(
          'div',
          { className: 'dshan-plprefs', onClick: (event) => event.stopPropagation() },
          h(
            'div',
            { className: 'dshan-plprefs-head' },
            h('b', null, T('preferences')),
            h('button', { className: 'dshan-pl-icon', type: 'button', onClick: onClose, 'aria-label': '关闭' }, h(PlayerIcon, { name: 'close' })),
          ),
          h(
            'div',
            { className: 'dshan-plprefs-body' },
            tab === 'keys'
              ? [
                  ...group(
                    '数值',
                    keyFields.filter((entry) => entry[2] !== 'key').map(numberRow),
                  ),
                  ...group(
                    '键位',
                    keyFields.filter((entry) => entry[2] === 'key').map(keyRow),
                  ),
                ]
              : null,
          ),
          h(
            'div',
            { className: 'dshan-plprefs-foot' },
            h(
              'button',
              {
                type: 'button',
                className: 'dshan-plprefs-ghost',
                onClick: () => setDraft({ ...DEFAULT_PREFS, keys: { ...DEFAULT_KEYS } }),
              },
              T('resetAll'),
            ),
            h('div', { className: 'dshan-plprefs-grow' }),
            h('button', { type: 'button', className: 'dshan-plprefs-ghost', onClick: onClose }, T('cancel')),
            h(
              'button',
              {
                type: 'button',
                className: 'dshan-plprefs-primary',
                onClick: () => {
                  onChange(draft)
                  if (typeof say === 'function') say('已保存')
                  onClose()
                },
              },
              T('save'),
            ),
          ),
        ),
      )
    }

    const PLAYER_CSS = `
.dshan-pl[data-full="true"]{position:fixed;inset:0;z-index:2147483000;width:100vw;height:100vh;border-radius:0;background:#000;}
.dshan-pl[data-full="true"] .dshan-pl-stage{height:calc(100vh - 64px);}
.dshan-pl[data-full="true"] video{width:100%;height:100%;object-fit:contain;}
.dshan-pl:fullscreen{width:100vw;height:100vh;border-radius:0;background:#000;}
.dshan-pl:fullscreen video{width:100%;height:100%;object-fit:contain;}
.dshan-pl:fullscreen .dshan-pl-stage{height:calc(100vh - 56px);}
.dshan-pl{position:relative;width:100%;aspect-ratio:16/9;max-height:min(76vh,760px);margin:0 auto 12px;
  border-radius:12px;overflow:hidden;background:#04050a;box-shadow:0 10px 30px rgba(0,0,0,.35);
  --dshan-pl-chrome:rgba(14,16,22,.94);--dshan-pl-line:rgba(255,255,255,.13);--dshan-pl-fg:#f7f8fc;
  --dshan-pl-muted:rgba(255,255,255,.62);--dshan-pl-panel:rgba(13,15,21,.97)}
.dshan-pl[data-appearance="light"]{--dshan-pl-chrome:rgba(250,250,253,.95);--dshan-pl-line:rgba(18,20,28,.14);
  --dshan-pl-fg:#15171f;--dshan-pl-muted:rgba(21,23,31,.6);--dshan-pl-panel:rgba(252,252,255,.98)}
.dshan-pl[data-appearance="transparent"]{--dshan-pl-chrome:rgba(10,12,18,.4);--dshan-pl-panel:rgba(10,12,18,.72)}
.dshan-pl-shaders{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 2px 2px;font-size:11px;color:var(--dsw-alias-text-3,#9aa0b4);}
.dshan-pl-mini{font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,#2a2f3a);background:transparent;color:inherit;cursor:pointer;}
.dshan-pl-mini:hover{border-color:var(--dsw-alias-brand-primary,#4f6bff);color:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-pl-hint{padding:6px 2px 0;font-size:11px;line-height:1.5;color:var(--dsw-alias-text-3,#8b90a0);}
/* The enhancer canvases sit over the <video> (they come first in the DOM and
   the video paints on top otherwise), so they need both a stacking level and
   pointer-events:none or the click-to-pause handler stops working. */
.dshan-pl-cas{position:absolute;inset:0;z-index:2;width:100%;height:100%;object-fit:contain;pointer-events:none;display:none}
.dshan-pl-a4k{position:absolute;inset:0;z-index:2;width:100%;height:100%;object-fit:contain;pointer-events:none;display:none}
.dshan-pl-a4k[data-on="true"]{display:block}
.dshan-pl-cas[data-on="true"]{display:block}
.dshan-pl-video{display:block;width:100%;height:100%;object-fit:contain;background:#000;cursor:pointer}
.dshan-pl-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:flex-start;gap:10px;padding:14px 16px;
  color:#fff;transition:opacity .25s ease;text-shadow:0 1px 6px rgba(0,0,0,.6);pointer-events:none}
.dshan-pl-top .dshan-pl-icon{color:#fff;pointer-events:auto}
.dshan-pl-bottom{position:absolute;left:0;right:0;bottom:0;padding:6px 14px 10px;color:#fff;
  background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,.18) 62%,rgba(0,0,0,0));
  transition:opacity .25s ease}
.dshan-pl[data-idle="true"] .dshan-pl-top,.dshan-pl[data-idle="true"] .dshan-pl-bottom{opacity:0;pointer-events:none}
.dshan-pl-heads{min-width:0;flex:1}
.dshan-pl-title{font-size:13px;font-weight:500;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshan-pl-sub{font-size:15px;font-weight:600;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshan-pl-icon{appearance:none;border:0;background:transparent;color:#fff;cursor:pointer;min-width:34px;height:34px;
  border-radius:8px;font-size:15px;line-height:1;display:inline-flex;align-items:center;justify-content:center;
  transition:background .15s ease,opacity .15s ease}
.dshan-pl-icon:hover{background:rgba(255,255,255,.16)}
.dshan-pl-skip{appearance:none;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.28);color:#fff;
  cursor:pointer;height:24px;padding:0 8px;border-radius:6px;font-size:11px;font-weight:600;margin-left:2px}
.dshan-pl-skip:hover{background:rgba(255,255,255,.2)}
.dshan-pl-progress{margin:0 2px 2px;position:relative;}
.dshan-pl-progress input[type="range"]{-webkit-appearance:none;appearance:none;width:100%;height:14px;background:transparent;
  cursor:pointer;border:0;outline:none;margin:0;padding:0}
/* 播放进度：蓝＝已播、白＝已预加载、灰＝还没下，没有圆点（按参考图）。 */
.dshan-pl-progress input[type="range"]::-webkit-slider-runnable-track{height:4px;border-radius:999px;border:0;
  background:linear-gradient(to right,#2f6bff 0 var(--dshan-pl-ratio,0%),rgba(255,255,255,.55) var(--dshan-pl-ratio,0%) var(--dshan-pl-loaded,0%),rgba(255,255,255,.22) var(--dshan-pl-loaded,0%) 100%)}
.dshan-pl-progress input[type="range"]::-moz-range-track{height:4px;border-radius:999px;border:0;
  background:linear-gradient(to right,#2f6bff 0 var(--dshan-pl-ratio,0%),rgba(255,255,255,.55) var(--dshan-pl-ratio,0%) var(--dshan-pl-loaded,0%),rgba(255,255,255,.22) var(--dshan-pl-loaded,0%) 100%)}
.dshan-pl-progress input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:0;height:0;
  border:0;background:transparent;box-shadow:none;margin-top:0}
.dshan-pl-progress input[type="range"]::-moz-range-thumb{width:0;height:0;border:0;background:transparent}
.dshan-pl-progress:hover input[type="range"]::-webkit-slider-thumb{width:9px;height:9px;border-radius:50%;
  background:#fff;margin-top:-2.5px;box-shadow:0 1px 3px rgba(0,0,0,.45)}
.dshan-pl-progress input[type="range"]:disabled{cursor:default;opacity:.75}
.dshan-pl-marks{position:absolute;left:0;right:0;top:50%;height:7px;transform:translateY(-50%);pointer-events:none;}
.dshan-pl-mark{position:absolute;top:0;height:100%;border-radius:2px;background:rgba(255,255,255,.34);box-shadow:0 0 0 1.5px rgba(0,0,0,.45);}
.dshan-pl-mark[data-skip="true"][data-shown="true"]{background:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-pl-mark::after{content:"";position:absolute;left:-2px;top:-3px;width:7px;height:7px;background:rgba(255,255,255,.85);box-shadow:0 0 0 1.5px rgba(0,0,0,.5);transform:rotate(45deg);border-radius:1px;}
.dshan-pl-mark[data-skip="true"][data-shown="true"]::after{background:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-pl-controls{display:flex;align-items:center;gap:4px}
.dshan-pl-volume{display:flex;align-items:center;gap:2px}
.dshan-pl-volume input[type="range"]{-webkit-appearance:none;appearance:none;width:70px;height:16px;background:transparent;
  cursor:pointer;border:0;outline:none;margin:0;padding:0}
.dshan-pl-volume input[type="range"]::-webkit-slider-runnable-track{height:3px;border-radius:999px;background:rgba(255,255,255,.34)}
.dshan-pl-volume input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:10px;height:10px;
  border-radius:50%;background:#fff;border:0;margin-top:-1px}
.dshan-pl-time{font-size:12px;font-variant-numeric:tabular-nums;opacity:.9;margin-left:8px}
.dshan-pl-right{margin-left:auto;display:flex;align-items:center;gap:2px}
.dshan-pl-panel{position:absolute;right:14px;bottom:74px;width:min(300px,74%);max-height:min(430px,72%);z-index:3;
  display:flex;flex-direction:column;border-radius:12px;border:1px solid var(--dshan-pl-line,rgba(255,255,255,.13));
  background:var(--dshan-pl-panel,rgba(13,15,21,.97));color:var(--dshan-pl-fg,#f7f8fc);box-shadow:0 18px 42px rgba(0,0,0,.45);overflow:hidden}
.dshan-pl-panelhead{position:relative;padding:12px 14px 10px;text-align:center;font-size:13px;font-weight:600;letter-spacing:.02em}
.dshan-pl-panelback{position:absolute;left:6px;top:50%;transform:translateY(-50%);width:26px;height:26px;
  border:0;background:transparent;color:inherit;font:inherit;font-size:18px;line-height:1;cursor:pointer;border-radius:7px}
.dshan-pl-panelback:hover{background:rgba(255,255,255,.08)}
.dshan-pl-panelbody{overflow:auto;padding:0 6px 8px;display:flex;flex-direction:column;gap:1px}
.dshan-pl-track{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;display:flex;
  align-items:center;gap:8px;padding:9px 10px;border-radius:8px;font-size:13px;text-align:left;width:100%}
.dshan-pl-track:hover{background:rgba(255,255,255,.08)}
.dshan-pl-check{width:14px;flex:none;color:var(--dsw-alias-brand-primary,#6c8cff);font-size:13px}
.dshan-pl-tracklabel{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshan-pl-trackcode{font-size:11px;opacity:.5;font-variant-numeric:tabular-nums}
/* Quality popup: the dark list bilibili's own player shows. */
.dshan-qmenu{position:absolute;right:14px;bottom:58px;z-index:8;min-width:208px;max-width:300px;padding:6px;border-radius:12px;
background:rgba(20,20,22,.94);box-shadow:0 18px 40px rgba(0,0,0,.55);backdrop-filter:blur(10px);
display:flex;flex-direction:column;gap:2px;}
.dshan-qmenu-row{display:flex;align-items:center;gap:6px;width:100%;padding:11px 12px;border:0;border-radius:8px;
background:transparent;color:#f2f3f5;font-size:13.5px;line-height:1;text-align:left;cursor:pointer;}
.dshan-qmenu-row:hover{background:rgba(255,255,255,.08);}
.dshan-qmenu-row[data-active="true"]{background:rgba(255,255,255,.14);}
.dshan-qmenu-name{font-weight:600;}
.dshan-pl-qbtn{height:26px;padding:0 10px;border-radius:8px;border:1px solid var(--dshan-pl-line,rgba(255,255,255,.18));
background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:600;cursor:pointer;}
.dshan-pl-qbtn:hover,.dshan-pl-qbtn[data-open="true"]{background:rgba(255,255,255,.14);}
.dshan-qmenu-row[data-disabled="true"]{opacity:.45;cursor:default;}

.dshan-qmenu-sub{margin-left:2px;font-size:11px;color:rgba(255,255,255,.62);}
.dshan-qmenu-badge{margin-left:auto;font-size:11px;color:#f0c674;}
.dshan-pl-quality{display:flex;flex-direction:column;gap:2px;padding:4px 0 8px;}
.dshan-pl-qualityhead{padding:10px 12px 4px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#9aa0b4);}
.dshan-pl-quality .dshan-pl-track{padding-left:12px;}
.dshan-pl-setting{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;display:flex;
  align-items:center;gap:10px;padding:10px 10px;border-radius:8px;font-size:13px;text-align:left;width:100%}
.dshan-pl-setting:hover{background:rgba(255,255,255,.08)}
.dshan-pl-settingicon{display:inline-flex;flex:none;width:18px;height:18px;align-items:center;justify-content:center;
  color:var(--dshan-pl-fg,#f7f8fc);opacity:.78}
.dshan-pl-settingicon svg{width:16px;height:16px}
.dshan-pl-settingvalue{font-size:12px;color:var(--dshan-pl-muted,rgba(255,255,255,.62));font-variant-numeric:tabular-nums}
.dshan-pl-chev{opacity:.35;font-size:15px}
.dshan-pl-prep{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;font-size:13px;color:rgba(255,255,255,0.86);text-align:center;pointer-events:none}
.dshan-pl-empty{padding:10px 12px;font-size:12px;color:var(--dshan-pl-muted,rgba(255,255,255,.62));line-height:1.6}
.dshan-pl-toast{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:8px 14px;border-radius:10px;
  background:rgba(8,10,16,.82);color:#fff;font-size:13px;pointer-events:none;z-index:5}
.dshan-pl-stats{position:absolute;left:14px;top:70px;padding:6px 10px;border-radius:8px;background:rgba(6,8,14,.72);
  color:#d9deee;font-size:11px;font-family:var(--dsw-font-family,monospace);z-index:3}
/* Preferences sheet. Prefix dshan-plprefs on purpose: the page level already
   owns .dshan-prefs* for its own dialog, and a shared name let that rule set
   (position:fixed, translucent backdrop, 560px card) leak onto this sheet. */
.dshan-plprefs-mask{position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;
  padding:22px;background:rgba(6,8,13,.58);backdrop-filter:blur(3px)}
.dshan-plprefs{position:relative;width:min(940px,100%);max-height:100%;display:flex;flex-direction:column;
  border-radius:16px;border:1px solid rgba(255,255,255,.08);background:#12141c;color:#eef0f7;
  box-shadow:0 30px 80px rgba(0,0,0,.62);overflow:hidden}
.dshan-plprefs-head{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 0}
.dshan-plprefs-head b{font-size:18px;font-weight:650;letter-spacing:.01em}
.dshan-plprefs-head .dshan-pl-icon{color:rgba(255,255,255,.6)}
.dshan-plprefs-head .dshan-pl-icon:hover{color:#fff}
.dshan-plprefs-tabs{display:flex;gap:2px;margin:16px 24px 0;padding:3px;border-radius:11px;
  border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.05)}
.dshan-plprefs-tab{flex:1;appearance:none;border:0;background:transparent;color:inherit;opacity:.62;cursor:pointer;
  height:34px;font:inherit;font-size:13px;border-radius:9px;transition:background .16s ease,opacity .16s ease}
.dshan-plprefs-tab:hover{opacity:.88}
.dshan-plprefs-tab[data-active="true"]{opacity:1;font-weight:600;background:rgba(255,255,255,.11);
  box-shadow:0 1px 2px rgba(0,0,0,.35)}
.dshan-plprefs-body{flex:1;min-height:0;overflow:auto;padding:18px 24px 4px}
.dshan-plprefs-group{margin:2px 0 8px;font-size:11.5px;font-weight:650;letter-spacing:.06em;
  text-transform:uppercase;color:rgba(255,255,255,.42)}
.dshan-plprefs-group + .dshan-plprefs-grid{margin-bottom:14px}
.dshan-plprefs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:7px 12px;align-content:start}
.dshan-plprefs-row{display:flex;align-items:center;gap:10px;min-width:0;padding:9px 13px;border-radius:10px;
  background:rgba(255,255,255,.032);border:1px solid rgba(255,255,255,.055)}
.dshan-plprefs-row:hover{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.09)}
.dshan-plprefs-rowlabel{flex:1;min-width:0;font-size:13px;color:rgba(255,255,255,.88);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshan-plprefs-unit{flex:none;font-size:12px;color:rgba(255,255,255,.42)}
.dshan-plprefs-key{flex:none;width:76px;height:30px;box-sizing:border-box;border-radius:8px;
  border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.07);color:#fff;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:600;
  text-align:center;cursor:pointer;outline:none;text-transform:uppercase}
.dshan-plprefs-key:hover{background:rgba(255,255,255,.11)}
/* The badge is a read-only input that only listens for keys, so the caret and
   the selection highlight are pure noise on it. */
.dshan-plprefs-key{caret-color:transparent;user-select:none}
.dshan-plprefs-key::selection{background:transparent;color:#fff}
.dshan-plprefs-key:focus{border-color:#8fa8ff;background:rgba(143,168,255,.18);box-shadow:0 0 0 3px rgba(143,168,255,.16)}
.dshan-plprefs-num{flex:none;width:86px;height:30px;box-sizing:border-box;border-radius:8px;
  border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.06);color:#fff;
  font:inherit;font-size:13px;text-align:right;padding:0 10px;outline:none;
  font-variant-numeric:tabular-nums;-moz-appearance:textfield}
.dshan-plprefs-num:focus{border-color:#8fa8ff;background:rgba(143,168,255,.16)}
.dshan-plprefs-step{flex:none;display:flex;align-items:center;gap:8px}
.dshan-plprefs-stepbtn{width:26px;height:26px;border-radius:7px;line-height:1;padding:0;cursor:pointer;
  border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.06);color:#e7eaf3;font:inherit;font-size:13px}
.dshan-plprefs-stepbtn:hover{background:rgba(255,255,255,.12)}
.dshan-plprefs-stepval{min-width:58px;text-align:center;font-size:12.5px;color:rgba(255,255,255,.85);
  font-variant-numeric:tabular-nums}
.dshan-plprefs-switch{flex:none;position:relative;width:42px;height:23px;border-radius:999px;cursor:pointer;
  border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);transition:background .16s ease}
.dshan-plprefs-switch::after{content:'';position:absolute;top:2px;left:2px;width:17px;height:17px;border-radius:50%;
  background:#dfe3ee;transition:transform .16s ease}
.dshan-plprefs-switch[data-on="true"]{background:#6c8cff;border-color:transparent}
.dshan-plprefs-switch[data-on="true"]::after{transform:translateX(19px)}
.dshan-plprefs-foot{display:flex;align-items:center;gap:10px;margin-top:10px;padding:14px 24px 18px;
  border-top:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)}
.dshan-plprefs-ghost{height:34px;padding:0 15px;border-radius:9px;font:inherit;font-size:13px;cursor:pointer;
  border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(255,255,255,.8)}
.dshan-plprefs-ghost:hover{background:rgba(255,255,255,.07)}
.dshan-plprefs-primary{height:34px;padding:0 18px;border-radius:9px;border:0;cursor:pointer;
  font-family:inherit;font-size:13px;font-weight:650;background:#c8a06a;color:#1d1408}
.dshan-plprefs-primary:hover{background:#d6ae79}
.dshan-plprefs-grow{flex:1}
`

    const SETTINGS_CSS = `
.dshan-settings{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px}
.dshan-settings-title{margin:0;font-size:20px;font-weight:600;color:var(--dsw-alias-label-primary,#1b1d22)}
.dshan-settings-lead{margin:-6px 0 4px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#6b7280)}
.dshan-account{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:12px;
  background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.7));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.dshan-account-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dshan-account-title{font-size:14.5px;font-weight:600;color:var(--dsw-alias-label-primary,#1b1d22)}
.dshan-account-hint{margin-top:3px;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#6b7280)}
.dshan-account-badge{flex:none;padding:3px 9px;border-radius:999px;font-size:11.5px;
  color:var(--dsw-alias-label-secondary,#6b7280);background:var(--dsw-alias-bg-base,rgba(0,0,0,.04));
  border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.dshan-account-badge[data-on="true"]{color:var(--dsw-alias-state-success-primary,#16a34a);
  border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 40%,transparent)}
.dshan-account-row{display:flex;align-items:center;gap:8px}
.dshan-account-face{width:26px;height:26px;border-radius:50%;object-fit:cover}
.dshan-account-masked{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dshan-account-initial{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:600;background:var(--dsw-alias-bg-layer-3,#2a2f3d);color:var(--dsw-alias-label-primary,#e7e9ee)}
.dshan-account-meta{display:flex;flex-direction:column;gap:1px;min-width:0}
.dshan-account-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#e7e9ee);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;max-width:220px}
.dshan-account-row{gap:10px}
.dshan-account-or{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dshan-input{flex:1;min-width:0;height:32px;padding:0 10px;border-radius:8px;font-size:12.5px;
  color:var(--dsw-alias-label-primary,#1b1d22);background:var(--dsw-alias-bg-base,rgba(255,255,255,.9));
  border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12))}
.dshan-account-link{align-self:flex-start;font-size:12px;color:var(--dsw-alias-brand-primary,#3b6cff);text-decoration:none}
/* 账号密码登录（AniCh）：两行输入 + 一行注册 */
.dshan-account-col{display:flex;flex-direction:column;gap:8px}
.dshan-account-col .dshan-account-row .dshan-input{flex:1 1 0;min-width:120px}
.dshan-account-toggle{align-self:flex-start;padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary,#3b6cff);font-size:12px;cursor:pointer}
.dshan-account-toggle:hover{text-decoration:underline}
.dshan-account-link:hover{text-decoration:underline}
.dshan-account-note{font-size:12px;line-height:1.5}
.dshan-account-note[data-kind="ok"]{color:var(--dsw-alias-state-success-primary,#16a34a)}
.dshan-account-note[data-kind="error"]{color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshan-qr{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding-top:4px}
.dshan-oauth{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;
  border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));border-radius:10px;
  background:var(--dsw-alias-bg-layer-1,#161922);}
.dshan-oauth-body{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 260px}
.dshan-oauth-state{font-size:12px;color:var(--dsw-alias-label-secondary,#98a1b3)}
.dshan-qr-img{width:180px;height:180px;border-radius:10px;background:#fff;padding:8px}
.dshan-qr-state{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
`

    /* ------------------------------------------------------------------ *
     * Settings: everything the host keeps in settings.json, plus downloads
     * ------------------------------------------------------------------ */

    const SECTIONS_KEYS_ZH = {
      tabDownloads: '下载',
      setSaved: '已保存',
      setSave: '保存设置',
      setResetAsk: '恢复默认设置？',
      setReset: '恢复默认',
      setVideo: '视频播放',
      setVideoHint: '决定点开一集之后画面出现在哪里，以及默认向哔哩哔哩要什么清晰度。',
      setPlayerMode: '播放方式',
      setModeInline: '内嵌播放器',
      setModeExternal: '外部播放器',
      setQuality: '默认清晰度',
      setQualityHint: '未登录时哔哩哔哩通常只给到 480P 或更低，登录后才会按账号权限放行。',
      setAutoNext: '自动连播',
      setAutoNextHint: '一集放完自动接下一集（番剧按集号，用户投稿按分 P）。',
      setTranscode: '非 MP4 片源',
      setTranscodeAuto: '自动判断',
      setTranscodeRemux: '只重封装',
      setTranscodeTranscode: '必要时转码',
      setDesktop: '桌面播放器',
      setDesktopHint: '「用播放器打开」按钮会把地址交给这里的程序；本机没装时可以填一条自定义命令。',
      setDetected: '本机检测到',
      setNoneDetected: '没有检测到 mpv / VLC / PotPlayer',
      setExternal: '使用哪个播放器',
      setCommand: '自定义命令',
      setCommandHint: '留空则用上面选中的播放器；填了就用这条命令（可用 {url} 占位，否则地址追加在最后）。',
      setAnime4k: '画质增强（Anime4K）',
      setAnime4kHint: '播放器自带的边缘感知锐化：在线流与种子流也会实时叠加，线条更清楚，平面不放大噪点。',
      setAnime4kOff: '关闭',
      setAnime4kFast: '快速',
      setAnime4kBalanced: '均衡',
      setAnime4kQuality: '高质量',
      setResume: '记住进度',
      setResumeHint: '交给外部播放器时从当前所在的时间点开始播放。',
      externalPlayer: '用外部播放器打开',
      openWithDefault: '用默认播放器打开',
      embedMpv: '内嵌 mpv 播放',
      play: '播放',
      pause: '暂停',
      setTorrent: '种子流',
      setTorrentHint: '默认片源、上传限速，以及缓存文件放在哪里。',
      setProvider: '默认片源',
      setProviderAuto: '自动（AniBT → AnimeTosho）',
      setUploadLimit: '上传限速 (KB/s)',
      setUploadLimitHint: '0 表示不限制。',
      setAutoClean: '看完自动清理 (分钟)',
      setAutoCleanHint: '0 表示保留缓存，方便二次播放。',
      setCacheDir: '缓存目录',
      setCacheDirHint: '留空用默认位置；改动需要重新加载插件才生效。',
      setQb: 'qBittorrent',
      setQbHint: '不想用内置引擎时，可以交给本机的 qBittorrent Web API。',
      setEngine: '下载引擎',
      setEngineBuiltin: '内置引擎',
      setEngineQb: 'qBittorrent',
      setQbUrl: 'Web API 地址',
      setQbUser: '用户名',
      setQbPass: '密码',
      setQbPassHint: '留空表示沿用已保存的密码，不会清空。',
      setDownloads: '下载',
      setDownloadsHint: '在线流和种子流的下载都会写到这里。',
      setDownloadDir: '下载目录',
      setTitleLang: '标题语言',
      setTitleLangHint: '番剧名字显示成哪种写法。源里没有这一种时自动退回其它写法。',
      titleLangRomaji: '罗马音',
      titleLangNative: '日语原名',
      titleLangChinese: '中文',
      titleLangEnglish: '英语',
      setUiLocale: '插件界面语言',
      setUiLocaleHint: '「跟随应用」用 DeepSeek Harness 的语言设置；也可以只让这个插件用另一种语言。',
      uiLocaleAuto: '跟随应用',
      uiLocaleZh: '简体中文',
      uiLocaleEn: 'English',
      setDownloadDirHint: '默认是系统「下载」文件夹；也可以点「浏览…」自己选。',
      setBrowse: '浏览…',
      setUseDefault: '用默认',
      setCopyTorrents: '种子下载完成后复制到下载目录',
      setKeepHistory: '保留下载历史',
      setOpenDir: '打开下载目录',
      setSources: '数据源',
      setSourcesHint: '关掉的源不会再被页面请求，也不会出现在聚合结果里。',
      setSrcAnilist: 'AniList',
      setSrcBangumi: 'Bangumi',
      setSrcBilibili: '哔哩哔哩',
      setSrcAnibt: 'AniBT',
      setSrcAnimetosho: 'AnimeTosho',
      setUi: '界面',
      setVerboseRows: '种子结果显示详细信息',
      setVerboseRowsHint: '体积、分辨率、集号、字幕组等标签。',
      setData: '数据',
      setDataHint: '设置和账号都存在本机，卸载插件后这些文件仍留在 DSH_HOME 里。',
      setPaths: '落盘位置',
      setFfmpeg: 'ffmpeg',
      setFfmpegYes: '已找到',
      setFfmpegNo: '未找到，转码不可用',
      setFailed: '保存失败',
      setLoading: '读取设置…',
      dlTitle: '下载',
      dlEmpty: '还没有下载任务',
      dlHint: '在线流或种子流里点「下载」就会出现在这里，关掉页面也会继续。',
      dlCancel: '取消',
      dlRemove: '删除',
      dlReveal: '打开目录',
      dlClear: '清除已完成的',
      dlSpeed: '速度',
      dlStatusRunning: '下载中',
      dlStatusQueued: '排队中',
      dlStatusDone: '已完成',
      dlStatusError: '失败',
      dlStatusCancelled: '已取消',
      dlStatusInterrupted: '已中断',
      dlRunningCount: '进行中',
      dlDoneCount: '已完成',
      dlTotalSpeed: '总速度',
      dlEta: '剩余',
      dlReceived: '已收',
      dlCancelAll: '全部取消',
      dlOpenFile: '打开文件',
    }

    const SECTIONS_KEYS_EN = {
      tabDownloads: 'Downloads',
      setSaved: 'Saved',
      setSave: 'Save settings',
      setResetAsk: 'Restore defaults?',
      setReset: 'Restore defaults',
      setVideo: 'Playback',
      setVideoHint: 'Where an episode appears after you click it, and what quality to ask for.',
      setPlayerMode: 'Playback mode',
      setModeInline: 'Built-in player',
      setModeExternal: 'External player',
      setQuality: 'Default quality',
      setQualityHint: 'While logged out bilibili usually caps at 480P; logging in unlocks your plan.',
      setAutoNext: 'Auto next',
      setAutoNextHint: 'Continue with the next episode (or the next part of an upload).',
      setTranscode: 'Non-MP4 sources',
      setTranscodeAuto: 'Decide automatically',
      setTranscodeRemux: 'Remux only',
      setTranscodeTranscode: 'Transcode when needed',
      setDesktop: 'Desktop player',
      setDesktopHint: 'The “open in player” button hands the URL to this program.',
      setDetected: 'Detected on this machine',
      setNoneDetected: 'No mpv / VLC / PotPlayer found',
      setExternal: 'Which player',
      setCommand: 'Custom command',
      setCommandHint: 'Leave empty to use the player above; {url} is replaced if present.',
      setAnime4k: 'Anime4K enhancement',
      setAnime4kHint: 'Edge-aware sharpening inside the built-in player, applied live to online and torrent streams too.',
      setAnime4kOff: 'Off',
      setAnime4kFast: 'Fast',
      setAnime4kBalanced: 'Balanced',
      setAnime4kQuality: 'Quality',
      setResume: 'Remember position',
      setResumeHint: 'Hand the stream to the player at the second currently being watched.',
      externalPlayer: 'Open in player',
      openWithDefault: 'Open in default player',
      embedMpv: 'Embedded mpv',
      play: 'Play',
      pause: 'Pause',
      setTorrent: 'Torrent streaming',
      setTorrentHint: 'Default source, upload cap, and where pieces are cached.',
      setProvider: 'Default source',
      setProviderAuto: 'Automatic (AniBT then AnimeTosho)',
      setUploadLimit: 'Upload cap (KB/s)',
      setUploadLimitHint: '0 means unlimited.',
      setAutoClean: 'Clean up after (minutes)',
      setAutoCleanHint: '0 keeps the cache so a second play is instant.',
      setCacheDir: 'Cache folder',
      setCacheDirHint: 'Empty means the default location; a new folder applies after a plugin reload.',
      setQb: 'qBittorrent',
      setQbHint: 'Use the local qBittorrent Web API instead of the embedded engine.',
      setEngine: 'Engine',
      setEngineBuiltin: 'Embedded',
      setEngineQb: 'qBittorrent',
      setQbUrl: 'Web API URL',
      setQbUser: 'Username',
      setQbPass: 'Password',
      setQbPassHint: 'Empty keeps the stored password.',
      setDownloads: 'Downloads',
      setDownloadsHint: 'Both online streams and torrents are written here.',
      setDownloadDir: 'Download folder',
      setTitleLang: 'Title language',
      setTitleLangHint: 'Which spelling of an anime name the lists show. Falls back when a source does not carry it.',
      titleLangRomaji: 'Romaji',
      titleLangNative: 'Japanese',
      titleLangChinese: 'Chinese',
      titleLangEnglish: 'English',
      setUiLocale: 'Plugin language',
      setUiLocaleHint: '"Follow app" uses the DeepSeek Harness language setting; you can also give this plugin its own.',
      uiLocaleAuto: 'Follow app',
      uiLocaleZh: '简体中文',
      uiLocaleEn: 'English',
      setDownloadDirHint: 'Defaults to the system Downloads folder — or pick one.',
      setBrowse: 'Browse…',
      setUseDefault: 'Use default',
      setCopyTorrents: 'Copy finished torrents into the download folder',
      setKeepHistory: 'Keep download history',
      setOpenDir: 'Open download folder',
      setSources: 'Data sources',
      setSourcesHint: 'A disabled source is skipped by the page and by aggregated searches.',
      setSrcAnilist: 'AniList',
      setSrcBangumi: 'Bangumi',
      setSrcBilibili: 'Bilibili',
      setSrcAnibt: 'AniBT',
      setSrcAnimetosho: 'AnimeTosho',
      setUi: 'Interface',
      setVerboseRows: 'Detailed torrent rows',
      setVerboseRowsHint: 'Size, resolution, episode number and release group.',
      setData: 'Data',
      setDataHint: 'Settings and credentials stay on this machine under DSH_HOME.',
      setPaths: 'On disk',
      setFfmpeg: 'ffmpeg',
      setFfmpegYes: 'found',
      setFfmpegNo: 'not found, transcoding disabled',
      setFailed: 'Save failed',
      setLoading: 'Reading settings…',
      dlTitle: 'Downloads',
      dlEmpty: 'No downloads yet',
      dlHint: 'Downloads started from a stream or a torrent keep running while the page is closed.',
      dlCancel: 'Cancel',
      dlRemove: 'Remove',
      dlReveal: 'Show in folder',
      dlClear: 'Clear finished',
      dlSpeed: 'Speed',
      dlStatusRunning: 'Downloading',
      dlStatusQueued: 'Queued',
      dlStatusDone: 'Done',
      dlStatusError: 'Failed',
      dlStatusCancelled: 'Cancelled',
      dlStatusInterrupted: 'Interrupted',
      dlRunningCount: 'active',
      dlDoneCount: 'done',
      dlTotalSpeed: 'total speed',
      dlEta: 'left',
      dlReceived: 'received',
      dlCancelAll: 'Cancel all',
      dlOpenFile: 'Open file',
    }

    /** Immutable set for a dotted path, so one control cannot clobber a section. */
    function setPath(root, path, value) {
      const parts = path.split('.')
      const copy = { ...(root ?? {}) }
      let cursor = copy
      for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index]
        cursor[key] = { ...(cursor[key] ?? {}) }
        cursor = cursor[key]
      }
      cursor[parts[parts.length - 1]] = value
      return copy
    }

    function readPath(root, path) {
      return path.split('.').reduce((value, key) => (value === null || value === undefined ? undefined : value[key]), root)
    }

    const TITLE_LANGUAGE_OPTIONS = ['romaji', 'native', 'chinese', 'english']
    const UI_LOCALE_OPTIONS = ['auto', 'zh', 'en']
    const uiPrefs = { locale: 'auto', titleLanguage: 'romaji' }
    /** Mirror of settings.stream, so a view opened later starts from the saved defaults. */
    const streamPrefs = { quality: 80, provider: 'auto', transcode: 'auto', autoNext: true }
    const uiPrefListeners = new Set()

    function applyUiPrefs(next) {
      if (next === null || typeof next !== 'object') return
      uiPrefs.locale = UI_LOCALE_OPTIONS.includes(next.locale) ? next.locale : 'auto'
      uiPrefs.titleLanguage = TITLE_LANGUAGE_OPTIONS.includes(next.titleLanguage)
        ? next.titleLanguage
        : 'romaji'
      for (const listener of Array.from(uiPrefListeners)) {
        try {
          listener()
        } catch {
          // a listener that throws must not break the others
        }
      }
    }

    function subscribeUiPrefs(listener) {
      uiPrefListeners.add(listener)
      return () => {
        uiPrefListeners.delete(listener)
      }
    }

    const CJK_PATTERN = /[\u3400-\u9fff]/
    const SIMPLIFIED_MARKERS = /[这说时们国语爱战灭术电视动开关门长问见现发经历还过让从梦岛风龙剑骑军师侠义团众楼观欢乐别学觉边莲进击巨贵的么样]/

    /** Any title variant on a media item, in whatever shape the host sent it. */
    function titleText(value) {
      if (typeof value === 'string') return value.trim() === '' ? '' : value
      if (value === null || typeof value !== 'object') return ''
      return titleText(value.romaji) || titleText(value.native) || titleText(value.english)
    }

    /**
     * The name to show for a title: the chosen language when the source has it,
     * otherwise the closest thing it does have.
     */
    function displayTitle(item) {
      if (typeof item === 'string') return item
      if (item === null || typeof item !== 'object') return ''
      const synonyms = Array.isArray(item.synonyms) ? item.synonyms : []
      const chineseAlias =
        titleText(item.titleChinese) ||
        titleText(item.nameCn) ||
        titleText(synonyms.find((entry) => CJK_PATTERN.test(entry ?? '')))
      // A kanji-only Japanese name passes a bare CJK test, so "Chinese" needs a
      // character that only exists in simplified Chinese.
      const simplifiedMarkers = SIMPLIFIED_MARKERS
      const chineseName =
        chineseAlias ||
        (simplifiedMarkers.test(titleText(item.title)) ? titleText(item.title) : '') ||
        (simplifiedMarkers.test(titleText(item.titleNative)) ? titleText(item.titleNative) : '')
      const candidates = {
        romaji: [titleText(item.titleRomaji), titleText(item.titleEnglish), titleText(item.titleNative), titleText(item.title), chineseAlias],
        native: [titleText(item.titleNative), titleText(item.titleOriginal), titleText(item.title), titleText(item.titleRomaji), titleText(item.titleEnglish), chineseAlias],
        chinese: [chineseName, titleText(item.title), titleText(item.titleNative), titleText(item.titleRomaji), titleText(item.titleEnglish), titleText(item.titleOriginal)],
        english: [titleText(item.titleEnglish), titleText(item.titleRomaji), titleText(item.title), titleText(item.titleNative), chineseAlias],
      }[uiPrefs.titleLanguage]
      for (const value of candidates ?? []) {
        if (value !== '') return value
      }
      return titleText(item.title) || titleText(item.name) || ''
    }

    /** A second name for the same title, when it differs from the primary one. */
    function altTitle(item, primary) {
      if (item === null || typeof item !== 'object') return ''
      const rest = [titleText(item.titleOriginal), titleText(item.titleRomaji), titleText(item.titleNative), titleText(item.nameCn)]
      for (const value of rest) {
        if (value !== '' && value !== primary) return value
      }
      return ''
    }

    function SettingsSection({ title, hint, children, group }) {
      return h(
        'section',
        { className: 'dshan-set', 'data-group': group ?? 'other' },
        h('h3', { className: 'dshan-set-title' }, title),
        hint ? h('p', { className: 'dshan-set-hint' }, hint) : null,
        children,
      )
    }

    function SettingsRow({ label, hint, children }) {
      return h(
        'div',
        { className: 'dshan-set-row' },
        h(
          'div',
          { className: 'dshan-set-label' },
          h('span', null, label),
          hint ? h('span', { className: 'dshan-set-note' }, hint) : null,
        ),
        h('div', { className: 'dshan-set-control' }, children),
      )
    }

    function SettingsSwitch({ checked, onChange, label }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dshan-switch',
          'data-on': checked ? 'true' : 'false',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          onClick: () => onChange(!checked),
          title: label,
        },
        h('span', { className: 'dshan-switch-dot' }),
      )
    }

    function SettingsChoices({ value, options, onChange }) {
      return h(
        'div',
        { className: 'dshan-choices' },
        options.map((option) =>
          h(
            'button',
            {
              type: 'button',
              key: option.value,
              className: 'dshan-chip',
              'data-active': value === option.value ? 'true' : 'false',
              onClick: () => onChange(option.value),
            },
            option.label,
          ),
        ),
      )
    }

    function SettingsInput({ value, onChange, placeholder, type = 'text', width }) {
      return h('input', {
        className: 'dshan-input',
        type,
        value: value ?? '',
        placeholder: placeholder ?? '',
        style: width === undefined ? undefined : { width },
        onChange: (event) => onChange(event.target.value),
      })
    }

    /** The gear menu's subtitle colours; the host stores one of these hexes. */
    const SUBTITLE_COLORS = [
      { value: '#FFFFFF', label: '白' },
      { value: '#FFF4C2', label: '淡黄' },
      { value: '#A8F0FF', label: '青' },
      { value: '#C9FFD0', label: '浅绿' },
      { value: '#FFD1E1', label: '粉' },
      { value: '#F2F2F2', label: '灰白' },
    ]

    function SettingsTab({ T }) {
      const remote = useEndpoint(`${API}/settings`)
      const [draft, setDraft] = useState(null)
      const [note, setNote] = useState(null)
      const [busy, setBusy] = useState(false)
      const [group, setGroup] = useState('all')
      // The merged-DASH cache is a host-side folder, so it is read and cleared
      // through its own endpoint rather than through the settings document.
      const cacheRemote = useEndpoint(`${API}/stream/cache`)
      const [cacheBusy, setCacheBusy] = useState(false)

      const payload = remote.status === 'ready' ? remote.data : null
      const cacheView = cacheRemote.status === 'ready' ? cacheRemote.data : null
      useEffect(() => {
        if (payload?.settings !== undefined) setDraft(payload.settings)
      }, [remote.data])

      const set = (path, value) => setDraft((previous) => setPath(previous, path, value))

      const save = async () => {
        if (draft === null) return
        setBusy(true)
        setNote(null)
        try {
          const saved = await postJson(`${API}/settings/save`, draft)
          if (saved?.settings !== undefined) {
            setDraft(saved.settings)
            applyUiPrefs(saved.settings.ui)
          }
          setNote({ kind: 'ok', text: T('setSaved') })
          remote.reload()
        } catch (error) {
          setNote({ kind: 'error', text: `${T('setFailed')}: ${error?.message ?? error}` })
        } finally {
          setBusy(false)
        }
      }

      const reset = async () => {
        if (window.confirm(T('setResetAsk')) !== true) return
        setBusy(true)
        try {
          const next = await postJson(`${API}/settings/reset`, {})
          if (next?.settings !== undefined) {
            setDraft(next.settings)
            applyUiPrefs(next.settings.ui)
          }
          remote.reload()
        } catch (error) {
          setNote({ kind: 'error', text: `${T('setFailed')}: ${error?.message ?? error}` })
        } finally {
          setBusy(false)
        }
      }

      const openDownloadDir = async () => {
        try {
          await postJson(`${API}/downloads/reveal`, { path: payload?.paths?.downloadDir })
        } catch {
          /* nothing to show if the folder is not there yet */
        }
      }

      const fmtBytes = (bytes) => {
        const value = Number(bytes) || 0
        if (value < 1024) return `${value} B`
        const units = ['KB', 'MB', 'GB', 'TB']
        let size = value / 1024
        let index = 0
        while (size >= 1024 && index < units.length - 1) {
          size /= 1024
          index += 1
        }
        return `${size.toFixed(1)} ${units[index]}`
      }

      const clearMuxCache = async () => {
        if (window.confirm('清空在线流的合并缓存？正在播的那一集会重新合并一次。') !== true) return
        setCacheBusy(true)
        setNote(null)
        try {
          const result = await postJson(`${API}/stream/cache/clear`, {})
          cacheRemote.reload()
          const skipped = Number(result?.skipped) || 0
          setNote({
            kind: 'ok',
            text: `已清理 ${Number(result?.removed) || 0} 个文件 · ${fmtBytes(result?.bytes)}${skipped > 0 ? `，${skipped} 个正在使用已跳过` : ''}`,
          })
        } catch (error) {
          setNote({ kind: 'error', text: `清理失败：${error?.message ?? error}` })
        } finally {
          setCacheBusy(false)
        }
      }

      const players = Array.isArray(payload?.players) ? payload.players : []
      const playerOptions = [
        { value: 'mpv', label: 'mpv' },
        { value: 'vlc', label: 'VLC' },
        { value: 'potplayer', label: 'PotPlayer' },
        ...(players.some((entry) => entry.id === 'custom') ? [{ value: 'custom', label: T('setCommand') }] : []),
      ]

      const groupList = [
        ['all', T('setGroupAll')],
        ['playback', T('setGroupPlayback')],
        ['player', T('setGroupPlayer')],
        ['torrent', T('setGroupTorrent')],
        ['storage', T('setGroupStorage')],
        ['ui', T('setGroupUi')],
      ]

      if (draft === null) {
        // Signing in does not depend on the settings payload, so keep the
        // accounts reachable while the rest is still loading.
        return h(
          'div',
          { className: 'dshan-settings' },
          h('div', { className: 'dshan-loading' }, remote.status === 'error' ? remote.error : T('setLoading')),
        )
      }

      return h(
        'div',
        { className: 'dshan-settings' },
        h(
          'div',
          { className: 'dshan-settings-head' },
          h('h2', { className: 'dshan-settings-title' }, T('tabSettings')),
          h(
            'div',
            { className: 'dshan-settings-actions' },
            note === null ? null : h('span', { className: 'dshan-account-note', 'data-kind': note.kind }, note.text),
            h('button', { type: 'button', className: 'dshan-btn', disabled: busy, onClick: reset }, T('setReset')),
            h('button', { type: 'button', className: 'dshan-btn', 'data-primary': 'true', disabled: busy, onClick: save }, T('setSave')),
          ),
        ),

        h(
          'div',
          { className: 'dshan-nav', 'data-active-group': group },
          groupList.map(([id, label]) =>
            h(
              'button',
              {
                key: id,
                type: 'button',
                'data-active': group === id ? 'true' : 'false',
                onClick: () => setGroup(id),
              },
              label,
            ),
          ),
        ),

        h(SettingsSection, {
          group: 'playback',
          title: T('setVideo'),
          hint: T('setVideoHint'),
          children: [
            h(SettingsRow, {
              key: 'mode',
              label: T('setPlayerMode'),
              children: h(SettingsChoices, {
                value: draft.player.mode,
                options: [
                  { value: 'inline', label: T('setModeInline') },
                  { value: 'external', label: T('setModeExternal') },
                ],
                onChange: (value) => set('player.mode', value),
              }),
            }),
            h(SettingsRow, {
              key: 'engine',
              label: '播放引擎',
              hint: 'PrismFlow（自研：DASH 双轨 MSE + libass 字幕 + 锐化/超分）。mpv 只作为「外部播放器」存在，不再内嵌。',
              children: h('span', { className: 'dshan-set-value' }, 'PrismFlow'),
            }),
            h(SettingsRow, {
              key: 'skipOpEd',
              label: '跳过 OP / ED',
              hint: '章节标题含 OP/ED/片头/片尾 时自动跳过（seanime 的 Skip OP/ED）。仅对带章节的种子/本地文件有效。',
              children: h(SettingsSwitch, {
                checked: draft.player.skipOpEd !== false,
                onChange: (value) => set('player.skipOpEd', value),
              }),
            }),
            h(SettingsRow, {
              key: 'chapterMarkers',
              label: '显示章节标记',
              hint: '在进度条上画出容器里的章节分段（seanime 的 Show Chapter Markers）。',
              children: h(SettingsSwitch, {
                checked: draft.player.chapterMarkers !== false,
                onChange: (value) => set('player.chapterMarkers', value),
              }),
            }),
            h(SettingsRow, {
              key: 'highlightSkipped',
              label: '高亮被跳过的片段',
              hint: '被自动跳过的 OP/ED 段在进度条上用另一种颜色标出来（seanime 的 Highlight Skipped Chapters）。',
              children: h(SettingsSwitch, {
                checked: draft.player.highlightSkipped !== false,
                onChange: (value) => set('player.highlightSkipped', value),
              }),
            }),
            h(SettingsRow, {
              key: 'subtitleFont',
              label: '字幕字体',
              hint: '写进服务端生成 ASS 的 Style 行，由 libass 排版。',
              children: h('input', {
                className: 'dshan-input',
                value: draft.player.subtitle?.font ?? 'Microsoft YaHei',
                onChange: (event) => set('player.subtitle.font', event.target.value),
              }),
            }),
            h(SettingsRow, {
              key: 'subtitleSize',
              label: '字幕字号',
              hint: 'ASS 的 Fontsize（1080p 画布，64 约等于常规大小）。',
              children: h('input', {
                className: 'dshan-input',
                type: 'number',
                min: 12,
                max: 160,
                value: draft.player.subtitle?.size ?? 64,
                onChange: (event) => set('player.subtitle.size', Number(event.target.value) || 64),
              }),
            }),
            h(SettingsRow, {
              key: 'subtitleOutline',
              label: '字幕描边',
              hint: '关闭表示不描边；粗细 1–6。',
              children: h(SettingsSwitch, {
                checked: draft.player.subtitle?.outline !== false,
                onChange: (value) => set('player.subtitle.outline', value),
              }),
            }),
            h(SettingsRow, {
              key: 'subtitleOutlineSize',
              label: '描边粗细',
              hint: 'ASS 的 Outline；描边关掉时不生效。',
              children: h('input', {
                className: 'dshan-input',
                type: 'number',
                min: 1,
                max: 6,
                style: { width: '80px' },
                value: draft.player.subtitle?.outlineSize ?? 3,
                onChange: (event) => {
                  const size = Math.min(6, Math.max(1, Number(event.target.value) || 3))
                  set('player.subtitle.outlineSize', size)
                },
              }),
            }),
            h(SettingsRow, {
              key: 'subtitleColor',
              label: '字幕颜色',
              hint: 'ASS 的 PrimaryColour，写进 Style 行。',
              children: h(
                'div',
                { className: 'dshan-dirpick' },
                h('input', {
                  className: 'dshan-input',
                  type: 'color',
                  style: { width: '48px', padding: '2px' },
                  value: draft.player.subtitle?.color ?? '#FFFFFF',
                  onChange: (event) => set('player.subtitle.color', event.target.value.toUpperCase()),
                }),
                h('span', { className: 'dshan-pathtext' }, draft.player.subtitle?.color ?? '#FFFFFF'),
              ),
            }),
            h(SettingsRow, {
              key: 'subtitleShadow',
              label: '字幕阴影',
              hint: 'ASS 的 Shadow；开着会有一点投影。',
              children: h(SettingsSwitch, {
                checked: draft.player.subtitle?.shadow === true,
                onChange: (value) => set('player.subtitle.shadow', value),
              }),
            }),
            h(SettingsRow, {
              key: 'autonext',
              label: T('setAutoNext'),
              hint: T('setAutoNextHint'),
              children: h(SettingsSwitch, {
                checked: draft.stream.autoNext,
                onChange: (value) => set('stream.autoNext', value),
              }),
            }),
            h(SettingsRow, {
              key: 'transcode',
              label: T('setTranscode'),
              children: h(SettingsChoices, {
                value: draft.stream.transcode,
                options: [
                  { value: 'auto', label: T('setTranscodeAuto') },
                  { value: 'remux', label: T('setTranscodeRemux') },
                  { value: 'transcode', label: T('setTranscodeTranscode') },
                ],
                onChange: (value) => set('stream.transcode', value),
              }),
            }),
          ],
        }),

        h(SettingsSection, {
          group: 'player',
          title: T('setDesktop'),
          hint: T('setDesktopHint'),
          children: [
            h(SettingsRow, {
              key: 'anime4k',
              label: T('setAnime4k'),
              hint: T('setAnime4kHint'),
              children: h(SettingsChoices, {
                value: draft.player.anime4k,
                options: ANIME4K_OPTIONS.map((option) => ({
                  value: option.value,
                  label: `${option.label} · ${option.description}`,
                })),
                onChange: (value) => set('player.anime4k', value),
              }),
            }),
            h(SettingsRow, {
              key: 'resume',
              label: T('setResume'),
              hint: T('setResumeHint'),
              children: h(SettingsSwitch, {
                checked: draft.player.resume !== false,
                onChange: (value) => set('player.resume', value),
              }),
            }),
            h(SettingsRow, {
              key: 'detected',
              label: T('setDetected'),
              children:
                players.length === 0
                  ? h('span', { className: 'dshan-set-note' }, T('setNoneDetected'))
                  : h(
                      'div',
                      { className: 'dshan-choices' },
                      players.map((entry) =>
                        h('span', { key: entry.id, className: 'dshan-chip', 'data-active': 'false' }, `${entry.label} · ${entry.path}`),
                      ),
                    ),
            }),
            h(SettingsRow, {
              key: 'external',
              label: T('setExternal'),
              children: h(SettingsChoices, {
                value: draft.player.external,
                options: playerOptions,
                onChange: (value) => set('player.external', value),
              }),
            }),
            h(SettingsRow, {
              key: 'command',
              label: T('setCommand'),
              hint: T('setCommandHint'),
              children: h(SettingsInput, {
                value: draft.player.command,
                placeholder: 'C:\\path\\to\\mpv.exe --fs {url}',
                onChange: (value) => set('player.command', value),
              }),
            }),
          ],
        }),

        h(SettingsSection, {
          group: 'torrent',
          title: T('setTorrent'),
          hint: T('setTorrentHint'),
          children: [
            h(SettingsRow, {
              key: 'provider',
              label: T('setProvider'),
              children: h(SettingsChoices, {
                value: draft.stream.provider,
                options: [
                  { value: 'auto', label: T('setProviderAuto') },
                  { value: 'anibt', label: 'AniBT' },
                  { value: 'animetosho', label: 'AnimeTosho' },
                ],
                onChange: (value) => set('stream.provider', value),
              }),
            }),
            h(SettingsRow, {
              key: 'upload',
              label: T('setUploadLimit'),
              hint: T('setUploadLimitHint'),
              children: h(SettingsInput, {
                type: 'number',
                width: '110px',
                value: draft.torrent.uploadLimitKbps,
                onChange: (value) => set('torrent.uploadLimitKbps', Number(value) || 0),
              }),
            }),
            h(SettingsRow, {
              key: 'clean',
              label: T('setAutoClean'),
              hint: T('setAutoCleanHint'),
              children: h(SettingsInput, {
                type: 'number',
                width: '110px',
                value: draft.torrent.autoCleanMinutes,
                onChange: (value) => set('torrent.autoCleanMinutes', Number(value) || 0),
              }),
            }),
            h(SettingsRow, {
              key: 'cache',
              label: T('setCacheDir'),
              hint: T('setCacheDirHint'),
              children: h(SettingsInput, {
                value: draft.torrent.cacheDir,
                placeholder: payload?.paths?.cacheDir ?? '',
                onChange: (value) => set('torrent.cacheDir', value),
              }),
            }),
          ],
        }),

        h(SettingsSection, {
          group: 'torrent',
          title: T('setQb'),
          hint: T('setQbHint'),
          children: [
            h(SettingsRow, {
              key: 'engine',
              label: T('setEngine'),
              children: h(SettingsChoices, {
                value: draft.torrent.kind,
                options: [
                  { value: 'builtin', label: T('setEngineBuiltin') },
                  { value: 'qbittorrent', label: T('setEngineQb') },
                ],
                onChange: (value) => set('torrent.kind', value),
              }),
            }),
            h(SettingsRow, {
              key: 'qburl',
              label: T('setQbUrl'),
              children: h(SettingsInput, {
                value: draft.qbittorrent.url,
                placeholder: 'http://127.0.0.1:8080',
                onChange: (value) => set('qbittorrent.url', value),
              }),
            }),
            h(SettingsRow, {
              key: 'qbuser',
              label: T('setQbUser'),
              children: h(SettingsInput, {
                width: '200px',
                value: draft.qbittorrent.username,
                onChange: (value) => set('qbittorrent.username', value),
              }),
            }),
            h(SettingsRow, {
              key: 'qbpass',
              label: T('setQbPass'),
              hint: T('setQbPassHint'),
              children: h(SettingsInput, {
                type: 'password',
                width: '200px',
                value: draft.qbittorrent.password,
                onChange: (value) => set('qbittorrent.password', value),
              }),
            }),
          ],
        }),

        h(SettingsSection, {
          group: 'storage',
          title: '在线流合并缓存',
          hint: '网页播放器把哔哩哔哩的 DASH 视频轨和音频轨合并成的 mp4，每集 200–500 MB，放在系统临时目录里。清理只删文件，不动设置。',
          children: [
            h(SettingsRow, {
              key: 'muxUsage',
              label: '已占用',
              hint: cacheView?.dir ?? '',
              children: h(
                'span',
                { className: 'dshan-set-value' },
                cacheRemote.status === 'ready'
                  ? `${Number(cacheView?.files) || 0} 个文件 · ${fmtBytes(cacheView?.bytes)}`
                  : cacheRemote.status === 'error'
                    ? '读取失败'
                    : '读取中…',
              ),
            }),
            h(SettingsRow, {
              key: 'muxClear',
              label: '清空缓存',
              hint: '下次播放同一集会重新合并。',
              children: h(
                'button',
                {
                  type: 'button',
                  className: 'dshan-btn',
                  disabled: cacheBusy,
                  onClick: () => {
                    void clearMuxCache()
                  },
                },
                cacheBusy ? '清理中…' : '清空',
              ),
            }),
          ],
        }),

        h(SettingsSection, {
          group: 'storage',
          title: T('setDownloads'),
          hint: T('setDownloadsHint'),
          children: [
            h(SettingsRow, {
              key: 'dir',
              label: T('setDownloadDir'),
              hint: T('setDownloadDirHint'),
              children: h(
                'div',
                { className: 'dshan-dirpick' },
                h(SettingsInput, {
                  value: draft.downloads.dir,
                  placeholder: payload?.paths?.defaultDownloadDir ?? payload?.paths?.downloadDir ?? '',
                  onChange: (value) => set('downloads.dir', value),
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshan-mini',
                    onClick: () => {
                      void (async () => {
                        try {
                          const picked = await postJson(`${API}/settings/pick-dir`, {
                            start: draft.downloads.dir === '' ? payload?.paths?.defaultDownloadDir ?? '' : draft.downloads.dir,
                          })
                          if (typeof picked?.path === 'string' && picked.path !== '') set('downloads.dir', picked.path)
                        } catch (error) {
                          setNote({ kind: 'error', text: `${T('setFailed')}: ${error?.message ?? error}` })
                        }
                      })()
                    },
                  },
                  T('setBrowse'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshan-mini',
                    title: payload?.paths?.defaultDownloadDir ?? '',
                    onClick: () => set('downloads.dir', ''),
                  },
                  T('setUseDefault'),
                ),
                h('span', { className: 'dshan-pathtext' }, payload?.paths?.downloadDir ?? ''),
              ),
            }),
            h(SettingsRow, {
              key: 'copy',
              label: T('setCopyTorrents'),
              children: h(SettingsSwitch, {
                checked: draft.downloads.copyTorrents,
                onChange: (value) => set('downloads.copyTorrents', value),
              }),
            }),
            h(SettingsRow, {
              key: 'history',
              label: T('setKeepHistory'),
              children: h(SettingsSwitch, {
                checked: draft.downloads.keepHistory,
                onChange: (value) => set('downloads.keepHistory', value),
              }),
            }),
            h(SettingsRow, {
              key: 'open',
              label: T('setOpenDir'),
              children: h('button', { type: 'button', className: 'dshan-btn', onClick: openDownloadDir }, payload?.paths?.downloadDir ?? ''),
            }),
          ],
        }),

        h(SettingsSection, {
          group: 'ui',
          title: T('setUi'),
          children: [
            h(SettingsRow, {
              key: 'titleLanguage',
              label: T('setTitleLang'),
              hint: T('setTitleLangHint'),
              children: h(SettingsChoices, {
                value: draft.ui.titleLanguage,
                options: [
                  { value: 'romaji', label: T('titleLangRomaji') },
                  { value: 'native', label: T('titleLangNative') },
                  { value: 'chinese', label: T('titleLangChinese') },
                  { value: 'english', label: T('titleLangEnglish') },
                ],
                onChange: (value) => set('ui.titleLanguage', value),
              }),
            }),
            h(SettingsRow, {
              key: 'locale',
              label: T('setUiLocale'),
              hint: T('setUiLocaleHint'),
              children: h(SettingsChoices, {
                value: draft.ui.locale,
                options: [
                  { value: 'auto', label: T('uiLocaleAuto') },
                  { value: 'zh', label: T('uiLocaleZh') },
                  { value: 'en', label: T('uiLocaleEn') },
                ],
                onChange: (value) => set('ui.locale', value),
              }),
            }),
            h(SettingsRow, {
              key: 'verbose',
              label: T('setVerboseRows'),
              hint: T('setVerboseRowsHint'),
              children: h(SettingsSwitch, {
                checked: draft.ui.verboseTorrentRows,
                onChange: (value) => set('ui.verboseTorrentRows', value),
              }),
            }),
          ],
        }),

        h(SettingsSection, {
          group: 'storage',
          title: T('setData'),
          hint: T('setDataHint'),
          children: [
            h(SettingsRow, {
              key: 'paths',
              label: T('setPaths'),
              children: h(
                'code',
                { className: 'dshan-set-code' },
                payload?.paths?.settingsFile ?? '',
              ),
            }),
            h(SettingsRow, {
              key: 'ffmpeg',
              label: T('setFfmpeg'),
              children: h(
                'span',
                { className: 'dshan-set-note' },
                payload?.ffmpeg ? `${T('setFfmpegYes')} · ${payload.ffmpeg}` : T('setFfmpegNo'),
              ),
            }),
          ],
        }),

      )
    }

    const DL_STATUS_KEY = {
      running: 'dlStatusRunning',
      queued: 'dlStatusQueued',
      done: 'dlStatusDone',
      error: 'dlStatusError',
      cancelled: 'dlStatusCancelled',
      cancelling: 'dlStatusCancelled',
      interrupted: 'dlStatusInterrupted',
    }

    /** 1.4 MB — the download manager needs it at module scope (formatBytes lives deeper). */
    function dlBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let index = 0
      let size = value
      while (size >= 1024 && index < units.length - 1) {
        size /= 1024
        index += 1
      }
      return `${size >= 100 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`
    }

    function DownloadsTab({ T }) {
      const state = usePoll(`${API}/downloads`, 1500, true)
      const jobs = Array.isArray(state.data?.jobs) ? state.data.jobs : []

      const act = async (route, body) => {
        try {
          await postJson(`${API}/downloads/${route}`, body)
        } catch {
          /* the next poll shows the truth */
        }
      }

      const active = jobs.filter((job) => job.status === 'running' || job.status === 'queued' || job.status === 'cancelling')
      const done = jobs.filter((job) => job.status === 'done')
      const speed = active.reduce((sum, job) => sum + (Number(job.speed) || 0), 0)

      /** 3:20 — a remaining time needs a total to divide by, which a live remux lacks. */
      const etaText = (job) => {
        const total = Number(job.total) || 0
        const received = Number(job.received) || 0
        const rate = Number(job.speed) || 0
        if (total <= 0 || received <= 0 || rate <= 0) return ''
        const seconds = Math.round((total - received) / rate)
        if (!Number.isFinite(seconds) || seconds <= 0) return ''
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      }
      // A live remux has no content-length, so its percent would sit at 0 % for
      // the whole download: show the received size and an indeterminate bar.
      const progressOf = (job) => {
        const total = Number(job.total) || 0
        const received = Number(job.received) || 0
        if (job.status === 'done') return { pct: 100, text: '100%', unknown: false }
        if (total > 0 && received > 0) {
          const pct = Math.min(99, Math.round((received / total) * 100))
          return { pct, text: `${pct}%`, unknown: false }
        }
        const ratio = Number(job.progress) || 0
        if (ratio > 0) {
          const pct = Math.min(99, Math.round(ratio * 100))
          return { pct, text: `${pct}%`, unknown: false }
        }
        if (job.status === 'error' || job.status === 'interrupted') return { pct: 100, text: '—', unknown: false }
        return { pct: 0, text: job.formattedReceived ?? '', unknown: job.status === 'running' }
      }

      return h(
        'div',
        { className: 'dshan-settings' },
        h(
          'div',
          { className: 'dshan-settings-head' },
          h(
            'div',
            null,
            h('h2', { className: 'dshan-settings-title' }, T('dlTitle')),
            h(
              'p',
              { className: 'dshan-settings-lead' },
              `${T('dlHint')}${jobs.length === 0 ? '' : ` · ${active.length} ${T('dlRunningCount')} · ${done.length} ${T('dlDoneCount')}`}`,
            ),
          ),
          h(
            'div',
            { className: 'dshan-settings-actions' },
            active.length === 0
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshan-btn',
                    onClick: () => {
                      for (const job of active) void act('cancel', { id: job.id })
                    },
                  },
                  T('dlCancelAll'),
                ),
            h('button', { type: 'button', className: 'dshan-btn', onClick: () => act('clear', {}) }, T('dlClear')),
          ),
        ),
        // One line of totals, the way Motrix's stats bar reads: how many run and
        // how fast the whole queue is going.
        jobs.length === 0
          ? null
          : h(
              'div',
              { className: 'dshan-dl-stats' },
              [
                `${active.length} ${T('dlRunningCount')}`,
                `${done.length} ${T('dlDoneCount')}`,
                speed > 0 ? `${T('dlTotalSpeed')} ${dlBytes(speed)}/s` : null,
              ]
                .filter((part) => typeof part === 'string' && part !== '')
                .join('  ·  '),
            ),
        jobs.length === 0
          ? h('div', { className: 'dshan-empty' }, T('dlEmpty'))
          : h(
              'div',
              { className: 'dshan-dl-list' },
              jobs.map((job) => {
                const bar = progressOf(job)
                const eta = etaText(job)
                const finished = job.status === 'done' || job.status === 'error' || job.status === 'cancelled' || job.status === 'interrupted'
                return h(
                  'div',
                  { key: job.id, className: 'dshan-dl-row', 'data-status': job.status },
                  h(
                    'div',
                    { className: 'dshan-dl-main' },
                    h('span', { className: 'dshan-dl-title', title: job.title ?? job.filename ?? '' }, job.title ?? job.filename ?? job.id),
                    h(
                      'span',
                      { className: 'dshan-dl-meta' },
                      h('span', { className: 'dshan-dl-pill', 'data-status': job.status }, T(DL_STATUS_KEY[job.status] ?? 'dlStatusRunning')),
                      [
                        job.source ?? job.kind,
                        finished ? job.formattedTotal : null,
                      ]
                        .filter((part) => typeof part === 'string' && part !== '')
                        .map((part) => ` · ${part}`)
                        .join(''),
                    ),
                    // 失败原因以前只写在 JSON 里，界面只说「失败」，用户判断不了是线路死了还是没权限。
                    job.error ? h('span', { className: 'dshan-dl-error', title: job.error }, job.error) : null,
                  ),
                  h(
                    'div',
                    { className: 'dshan-dl-meter' },
                    h(
                      'div',
                      { className: 'dshan-dl-bar', 'data-unknown': bar.unknown ? 'true' : 'false' },
                      h('span', { style: bar.unknown ? undefined : { width: `${bar.pct}%` } }),
                    ),
                    h('span', { className: 'dshan-dl-pct' }, bar.text),
                  ),
                  h(
                    'div',
                    { className: 'dshan-dl-rate' },
                    [job.status === 'running' && job.formattedSpeed ? job.formattedSpeed : null, eta === '' ? null : `${T('dlEta')} ${eta}`]
                      .filter((part) => typeof part === 'string' && part !== '')
                      .join(' · '),
                  ),
                  h(
                    'div',
                    { className: 'dshan-dl-actions' },
                    job.status === 'done'
                      ? h('button', { type: 'button', className: 'dshan-btn', onClick: () => act('reveal', { path: job.path }) }, T('dlReveal'))
                      : null,
                    finished
                      ? h('button', { type: 'button', className: 'dshan-btn', onClick: () => act('remove', { id: job.id }) }, T('dlRemove'))
                      : h('button', { type: 'button', className: 'dshan-btn', onClick: () => act('cancel', { id: job.id }) }, T('dlCancel')),
                  ),
                )
              }),
            ),
      )
    }

    const SECTIONS_CSS = `
.dshan-settings-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.dshan-settings-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dshan-btn{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));background:var(--dsw-alias-bg-layer-1,#161a20);color:var(--dsw-alias-label-primary,#e8eaf0);border-radius:9px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit;}
.dshan-btn:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.24));}
.dshan-btn:disabled{opacity:.5;cursor:default;}
.dshan-btn[data-primary="true"]{background:var(--dsw-alias-brand-primary,#6c8cff);border-color:transparent;color:#fff;}
.dshan-set{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:12px;padding:14px 16px;margin-bottom:12px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));}
.dshan-set-title{margin:0 0 4px;font-size:13px;font-weight:600;}
.dshan-set-hint{margin:0 0 10px;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2);line-height:1.5;}
.dshan-set-row{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:7px 0;border-top:1px dashed var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-set-row:first-of-type{border-top:none;}
.dshan-set-label{display:flex;flex-direction:column;gap:2px;font-size:12px;flex:1 1 160px;min-width:0;}
.dshan-set-label>span:first-child{white-space:nowrap;text-overflow:ellipsis;overflow:hidden;}
.dshan-set-note{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);max-width:420px;line-height:1.45;}
.dshan-set-control{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 1 auto;justify-content:flex-end;}
.dshan-set-code{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);word-break:break-all;max-width:420px;}
.dshan-choices{display:flex;gap:6px;flex-wrap:wrap;}
.dshan-input{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));border-radius:8px;color:var(--dsw-alias-label-primary,#e8eaf0);font-size:12px;padding:6px 10px;font-family:inherit;min-width:220px;max-width:340px;}
.dshan-switch{width:38px;height:21px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08));position:relative;cursor:pointer;padding:0;}
.dshan-switch[data-on="true"]{background:var(--dsw-alias-brand-primary,#6c8cff);border-color:transparent;}
.dshan-switch-dot{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:transform .15s ease;}
.dshan-switch[data-on="true"] .dshan-switch-dot{transform:translateX(17px);}
.dshan-set-accounts{margin-top:18px;padding-top:15px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));}
.dshan-dl-list{display:flex;flex-direction:column;gap:8px;}
.dshan-dl-stats{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);margin:-6px 0 12px;font-variant-numeric:tabular-nums;}
.dshan-dl-row{display:grid;grid-template-columns:minmax(0,1fr) 220px 120px auto;gap:12px;align-items:center;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:10px;padding:9px 12px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));}
.dshan-dl-main{display:flex;flex-direction:column;gap:3px;min-width:0;}
.dshan-dl-title{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshan-dl-meta{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);}
.dshan-dl-error{font-size:11px;color:var(--dsw-alias-state-error-primary,#ff6b6b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshan-dl-meter{display:flex;align-items:center;gap:8px;min-width:0;}
.dshan-dl-bar{position:relative;height:5px;flex:1 1 auto;border-radius:3px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08));overflow:hidden;}
.dshan-dl-pct{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);min-width:44px;text-align:right;font-variant-numeric:tabular-nums;}
.dshan-dl-rate{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}
.dshan-dl-pill{display:inline-block;margin-right:6px;padding:0 6px;border-radius:6px;font-size:10px;line-height:16px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));color:var(--dsw-alias-label-secondary,#9aa3b2);}
.dshan-dl-pill[data-status="running"]{border-color:transparent;background:var(--dsw-alias-brand-primary,#6c8cff);color:#fff;}
.dshan-dl-pill[data-status="done"]{border-color:transparent;background:var(--dsw-alias-state-success-primary,#3ddc97);color:#08130d;}
.dshan-dl-pill[data-status="error"]{border-color:transparent;background:var(--dsw-alias-state-error-primary,#ff6b6b);color:#1a0808;}
@keyframes dshan-dl-slide{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}
.dshan-dl-bar[data-unknown="true"]>span{width:30%;animation:dshan-dl-slide 1.5s ease-in-out infinite;}
.dshan-dl-bar>span{display:block;height:100%;background:var(--dsw-alias-brand-primary,#6c8cff);transition:width .3s ease;}
.dshan-dl-row[data-status="done"] .dshan-dl-bar>span{background:var(--dsw-alias-state-success-primary,#3ddc97);}
.dshan-dl-row[data-status="error"] .dshan-dl-bar>span{background:var(--dsw-alias-state-error-primary,#ff6b6b);}
.dshan-dl-actions{display:flex;gap:6px;}
.dshan-dirpick{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;}
.dshan-character{cursor:pointer;}
.dshan-character:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#f0a13a);outline-offset:2px;}
.dshan-charcard-backdrop{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,.42);backdrop-filter:blur(2px);}
.dshan-charcard{position:relative;width:min(400px,calc(100vw - 48px));max-height:min(80vh,720px);overflow:auto;padding:20px 20px 16px;border-radius:16px;background:rgba(16,18,22,.96);color:#eef1f6;box-shadow:0 24px 60px rgba(0,0,0,.45);}
.dshan-charcard-close{position:absolute;top:10px;right:10px;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:#9aa4b2;font-size:16px;line-height:1;cursor:pointer;}
.dshan-charcard-close:hover{background:rgba(255,255,255,.08);color:#fff;}
.dshan-charcard-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.dshan-charcard-pic{width:44px;height:60px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.08);flex:0 0 auto;}
.dshan-charcard-name{font-size:17px;font-weight:650;letter-spacing:.2px;}
.dshan-charcard-native{margin-top:2px;font-size:12px;color:#9aa4b2;}
.dshan-charcard-eyebrow{font-size:10px;font-weight:700;letter-spacing:1.4px;color:#e8a33d;margin-bottom:8px;}
.dshan-charcard-desc{margin:0 0 12px;font-size:12.5px;line-height:1.62;color:#d7dce5;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;}
.dshan-charcard-desc[data-expanded="true"]{display:block;-webkit-line-clamp:unset;overflow:visible;}
.dshan-charcard-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
.dshan-charcard-tag{padding:3px 10px;border:1px solid rgba(255,255,255,.18);border-radius:999px;font-size:11px;color:#e7ebf2;}
.dshan-charcard-voice{font-size:11.5px;color:#9aa4b2;margin-bottom:12px;}
.dshan-charcard-more{align-self:flex-start;padding:7px 14px;border:0;border-radius:8px;background:#e8a33d;color:#1b1206;font-size:12px;font-weight:650;cursor:pointer;}
.dshan-charcard-more:hover{background:#f2b455;}
.dshan-dirpick .dshan-pathtext{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary,#94a0b3);}
.dshan-set .dshan-chip[data-active="false"]{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);}
.dshan-set .dshan-chip[data-active="false"]:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.28));color:var(--dsw-alias-label-primary,#e8eaf0);}
.dshan-set .dshan-chip{font-size:12px;padding:5px 10px;}
@media (max-width:760px){.dshan-dl-row{grid-template-columns:1fr;}}
`

    Object.assign(ZH, {
      download: '下载',
      downloadQueued: '已经加入下载列表，可以在「下载」里看进度。',
      downloadFailed: '加入下载列表失败',
    })
    Object.assign(EN, {
      download: 'Download',
      downloadQueued: 'Queued — check the Downloads tab for progress.',
      downloadFailed: 'Could not queue the download',
    })

    Object.assign(ZH, SECTIONS_KEYS_ZH)
    Object.assign(EN, SECTIONS_KEYS_EN)

    // ── 片源：扩展市场 ────────────────────────────────────────
    const EXT_KEYS_ZH = {
      extTitle: '片源',
      extLead: '数据源、种子流、在线流都装在这里；每个扩展有自己的偏好。',
      extInstalled: '已安装',
      extEnable: '启用',
      extDisable: '停用',
      extPrefs: '偏好',
      extWorking: '运行中',
      extDisabled: '已停用',
      extBuiltin: '内置',
      extNotIntegrated: '未集成',
      extOpenLink: '打开主页',
      extSave: '保存偏好',
      extSaved: '偏好已保存。',
      extTypeData: '数据源',
      extTypeTorrent: '种子流',
      extTypeOnline: '在线流',
      extSearchPlaceholder: '搜索扩展…',
      extNoMatch: '没有匹配的扩展。',
      extAccount: '账号',
      extAccountHint: '这个扩展自己管登录，凭据只存在本机。',
      extClose: '关闭',
      extDefault: '默认',
      extNumberHint: '范围 {{min}}–{{max}}',
      extAllOff: '这一类扩展都停用了。',
    }

    const EXT_KEYS_EN = {
      extTitle: 'Sources',
      extLead: 'Data sources, torrent streams and online streams live here — each with its own preferences.',
      extInstalled: 'Installed',
      extEnable: 'Enable',
      extDisable: 'Disable',
      extPrefs: 'Preferences',
      extWorking: 'Working',
      extDisabled: 'Disabled',
      extBuiltin: 'Built-in',
      extNotIntegrated: 'Not integrated',
      extOpenLink: 'Open page',
      extSave: 'Save preferences',
      extSaved: 'Preferences saved.',
      extTypeData: 'Data source',
      extTypeTorrent: 'Torrent stream',
      extTypeOnline: 'Online stream',
      extSearchPlaceholder: 'Search extensions…',
      extNoMatch: 'No extension matches.',
      extAccount: 'Account',
      extAccountHint: 'This extension owns its own login; credentials stay on this machine.',
      extClose: 'Close',
      extDefault: 'Default',
      extNumberHint: 'Range {{min}}–{{max}}',
      extAllOff: 'Every extension of this kind is disabled.',
    }

    const EXT_CSS = `
.dshan-ext-head{display:flex;align-items:flex-start;gap:10px;}
.dshan-ext-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;}
.dshan-ext{display:flex;flex-direction:column;gap:9px;padding:13px 14px;border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l1,#e6e6e6);}
.dshan-ext-logo{width:38px;height:38px;flex:0 0 38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(135deg,#6C8CFF,#8B5CF6);}
.dshan-ext-logo[data-type="torrent"]{background:linear-gradient(135deg,#12B886,#0CA678);}
.dshan-ext-logo[data-type="online"]{background:linear-gradient(135deg,#F76707,#E8590C);}
.dshan-ext-titles{flex:1;min-width:0;}
.dshan-ext-name{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#1f1f1f);}
.dshan-ext-desc{font-size:12px;line-height:1.45;margin-top:2px;color:var(--dsw-alias-label-secondary,#888);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.dshan-ext-tools{display:flex;align-items:center;gap:6px;}
@keyframes none{}
.dshan-src{
  position:relative;isolation:isolate;
  display:flex;flex-direction:column;
  width:min(960px,94vw);max-height:84vh;
  border-radius:18px;overflow:hidden;
  color:var(--dsw-alias-label-primary,#1f2430);
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));
  box-shadow:0 32px 80px rgba(10,16,30,.42),0 2px 8px rgba(10,16,30,.18);
  background:var(--dsw-alias-bg-overlay,#fbfcfe);
  backdrop-filter:blur(28px) saturate(150%);-webkit-backdrop-filter:blur(28px) saturate(150%);
}
.dshan-src::before{content:"";position:absolute;inset:0;z-index:-1;background:#fff;opacity:.86;}
.dshan-src-gutter{border-right:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07));}
.dshan-src-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));}
.dshan-src-headtext{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;}
.dshan-src-title{font-size:14px;font-weight:650;}
.dshan-src-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary,#7c8798);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dshan-src-meta{display:flex;align-items:center;gap:10px;padding:10px 18px 8px;flex-wrap:wrap;}
.dshan-src-file{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2430);}
.dshan-src-tabs{display:flex;gap:6px;}
.dshan-src-body{display:flex;flex:1;min-height:0;margin:0 18px 14px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#f6f7f9);}
.dshan-src-gutter{padding:12px 8px 12px 12px;overflow:hidden;text-align:right;font-family:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;font-size:11.5px;line-height:1.62;color:var(--dsw-alias-label-secondary,#a4abb8);white-space:pre;user-select:none;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));}
.dshan-src-input{flex:1;min-width:0;border:0;outline:none;resize:none;padding:12px 14px;background:transparent;color:var(--dsw-alias-label-primary,#1f2430);font-family:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;font-size:11.5px;line-height:1.62;white-space:pre;overflow:auto;tab-size:2;}
.dshan-src-input:disabled{opacity:.6;}
.dshan-src-tab{appearance:none;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:transparent;border-radius:8px;padding:4px 10px;font:inherit;font-size:11.5px;color:var(--dsw-alias-label-secondary,#7c8798);cursor:pointer;}
.dshan-src-tab[data-active="true"]{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2430);font-weight:600;}
.dshan-src-code{margin:12px 18px 16px;padding:14px 16px;flex:1;min-height:200px;overflow:auto;background:var(--dsw-alias-bg-layer-1,#f6f7f9);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07));border-radius:12px;font-family:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;font-size:11.5px;line-height:1.62;white-space:pre;tab-size:2;color:var(--dsw-alias-label-primary,#1f2430);}
.dshan-ext-code{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa4b2);opacity:.55;letter-spacing:1px;user-select:none;}
.dshan-icon{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#8b93a1);cursor:pointer;transition:background .15s ease,color .15s ease;}
.dshan-icon:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,rgba(120,130,150,.14));color:var(--dsw-alias-label-primary,#1f2430);}
.dshan-icon:disabled{opacity:.3;cursor:default;}
.dshan-icon svg{display:block;}
.dshan-eprefs-head .dshan-icon{width:30px;height:30px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:10px;font-size:13px;}
.dshan-ext-chips{display:flex;flex-wrap:wrap;gap:5px;}
.dshan-ext-pill{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:6px;font-size:11px;line-height:19px;background:var(--dsw-alias-bg-layer-2,#f1f3f5);color:var(--dsw-alias-label-secondary,#8b95a1);}
.dshan-ext-pill[data-tone="ok"]{background:rgba(18,184,134,.16);color:#0b8a63;}
.dshan-ext-pill[data-tone="muted"]{background:rgba(134,142,150,.18);color:#6b7280;}
.dshan-ext-pill[data-tone="data"]{background:rgba(108,140,255,.16);color:#4c66d8;}
.dshan-ext-pill[data-tone="torrent"]{background:rgba(18,184,134,.16);color:#0b8a63;}
.dshan-ext-pill[data-tone="online"]{background:rgba(247,103,7,.16);color:#c2570a;}
.dshan-ext-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary,#8b95a1);border-top:1px dashed var(--dsw-alias-border-l1,#ececec);padding-top:8px;margin-top:auto;}
.dshan-ext-author{font-weight:600;color:var(--dsw-alias-label-primary,#4b5563);}
.dshan-ext-actions{margin-left:auto;display:flex;gap:6px;}
.dshan-seg{display:inline-flex;padding:2px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f1f3f5);gap:2px;}
.dshan-seg button{appearance:none;border:0;background:transparent;padding:5px 13px;border-radius:999px;font-size:12px;color:var(--dsw-alias-label-secondary,#8b95a1);cursor:pointer;}
.dshan-seg button[data-active="true"]{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.dshan-prefs{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(16,18,24,.42);backdrop-filter:blur(2px);}
.dshan-prefs-card{width:min(560px,92vw);max-height:min(86vh,760px);overflow:auto;border-radius:16px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e6e6e6);box-shadow:0 24px 60px rgba(0,0,0,.28);}
.dshan-prefs-head{display:flex;align-items:center;gap:10px;padding:14px 16px;position:sticky;top:0;background:var(--dsw-alias-bg-overlay,#fff);border-bottom:1px solid var(--dsw-alias-border-l1,#eee);z-index:1;}
.dshan-prefs-body{padding:6px 16px 4px;}
.dshan-prefs-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1,#eee);}
.dshan-ext-field{padding:9px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#f1f1f1);}
.dshan-ext-field:last-child{border-bottom:0;}
.dshan-crash{margin:18px;padding:16px 18px;border-radius:12px;border:1px solid var(--dsw-alias-state-error-primary,#dc2626);display:flex;flex-direction:column;gap:10px;}
.dshan-crash-title{font-size:13px;font-weight:650;color:var(--dsw-alias-state-error-primary,#dc2626);}
.dshan-crash-body{margin:0;white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.5;max-height:360px;overflow:auto;color:var(--dsw-alias-label-secondary,#7c8798);}
.dshan-ext-actions{gap:10px;margin-left:auto;}
/* A source's own site, straight from the card: one click to the place the
   titles actually come from. */
.dshan-ext-site{display:inline-flex;align-items:center;gap:4px;margin-left:auto;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,#e3e6eb);color:var(--dsw-alias-label-secondary,#7c8798);font-size:11px;text-decoration:none;transition:color .15s,border-color .15s;}
.dshan-ext-site:hover{color:var(--dsw-alias-label-primary,#1f2430);border-color:currentColor;}
.dshan-ext-site svg{width:12px;height:12px;}
.dshan-ext-site + .dshan-ext-actions{margin-left:8px;}
.dshan-ext-actions .dshan-switch{transform:scale(.92);transform-origin:right center;}
.dshan-eprefs{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(12,16,26,.5);backdrop-filter:blur(3px);}
.dshan-eprefs-card{
  position:relative;isolation:isolate;
  width:min(680px,100%);max-height:min(84vh,780px);
  display:flex;flex-direction:column;border-radius:18px;overflow:hidden;
  color:var(--dsw-alias-label-primary,#1f2430);
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));
  box-shadow:0 32px 80px rgba(10,16,30,.42),0 2px 8px rgba(10,16,30,.18);
  background:var(--dsw-alias-bg-overlay,#fbfcfe);
  backdrop-filter:blur(28px) saturate(150%);-webkit-backdrop-filter:blur(28px) saturate(150%);
}
.dshan-eprefs-card::before{content:'';position:absolute;inset:0;z-index:-1;background:#fff;opacity:.86;pointer-events:none;}
.dshan-eprefs-head{display:flex;align-items:center;gap:12px;padding:18px 20px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));}
.dshan-eprefs-head .dshan-ext-titles{flex:1;min-width:0;}
.dshan-eprefs-head .dshan-ext-name{font-size:15px;font-weight:650;}
.dshan-eprefs-head .dshan-ext-desc{font-size:11.5px;color:var(--dsw-alias-label-secondary,#7c8798);}
.dshan-eprefs-body{flex:1;min-height:0;overflow:auto;padding:2px 20px 10px;display:flex;flex-direction:column;}
.dshan-eprefs-body .dshan-set{background:transparent;border:0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07));border-radius:0;box-shadow:none;padding:16px 0;}
.dshan-eprefs-body .dshan-set:last-child{border-bottom:0;}
.dshan-eprefs-section{display:flex;flex-direction:column;gap:4px;padding:18px 0 8px;}
.dshan-eprefs-section-title{font-size:13px;font-weight:650;letter-spacing:.2px;}
.dshan-eprefs-section-hint{font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary,#7c8798);}
.dshan-pluginerror{display:flex;align-items:flex-start;gap:8px;margin:0 0 12px;padding:9px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--dsw-alias-label-error,#e5484d) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-label-error,#e5484d) 10%,transparent);color:var(--dsw-alias-label-error,#e5484d);font-size:12px;line-height:1.55;word-break:break-word;}
.dshan-eprefs .dshan-account{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.6));padding:12px 14px;box-shadow:none;gap:10px;}
.dshan-eprefs .dshan-account-head{align-items:flex-start;}
.dshan-eprefs .dshan-account-title{font-size:13px;font-weight:600;}
.dshan-eprefs .dshan-account-row{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;margin-top:2px;}
.dshan-eprefs .dshan-account-row .dshan-input{flex:1;min-width:0;height:30px;}
.dshan-eprefs .dshan-account-link{margin-top:2px;}
.dshan-eprefs .dshan-qr{align-items:center;width:100%;padding-top:6px;}
.dshan-eprefs .dshan-qr-img{width:176px;height:176px;box-shadow:0 6px 18px rgba(16,24,40,.18);}
.dshan-eprefs .dshan-btn{white-space:nowrap;height:30px;padding:0 14px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;}
.dshan-eprefs .dshan-btn[data-primary="true"],.dshan-eprefs .dshan-btn-primary{background:var(--dsw-alias-brand-primary,#4f6bff);border-color:transparent;color:#fff;font-weight:600;}
.dshan-eprefs .dshan-btn[data-primary="true"]:hover{filter:brightness(1.06);}
.dshan-eprefs-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.5));}
.dshan-eprefs-foot .dshan-account-note{margin-right:auto;}
.dshan-settings{display:grid;grid-template-columns:176px minmax(0,1fr);column-gap:22px;align-content:start;}
.dshan-settings>.dshan-settings-head{grid-column:1/-1;}
.dshan-settings>.dshan-nav{grid-column:1;grid-row:2;position:sticky;top:4px;align-self:start;}
.dshan-settings>.dshan-set,.dshan-settings>.dshan-set-accounts{grid-column:2;}
.dshan-nav{display:flex;flex-direction:column;align-items:stretch;gap:2px;padding:0;}
.dshan-nav button{width:100%;text-align:left;}
@media (max-width:820px){.dshan-settings{grid-template-columns:minmax(0,1fr);}.dshan-settings>.dshan-nav{grid-column:1;grid-row:auto;flex-direction:row;flex-wrap:wrap;position:static;margin-bottom:6px;}.dshan-settings>.dshan-set{grid-column:1;}}
.dshan-nav button{appearance:none;border:1px solid transparent;background:transparent;border-radius:9px;padding:7px 11px;font-size:12.5px;line-height:1.2;color:var(--dsw-alias-label-secondary,#7c8798);cursor:pointer;transition:background .15s ease,color .15s ease;}
.dshan-nav button:hover{border-color:var(--dsw-alias-brand-primary,#6C8CFF);color:var(--dsw-alias-label-primary,#1f2430);}
.dshan-nav button[data-active="true"]{background:var(--dsw-alias-brand-primary,#6C8CFF);border-color:transparent;color:#fff;font-weight:600;}
.dshan-nav[data-active-group="playback"]~.dshan-set:not([data-group="playback"]),
.dshan-nav[data-active-group="player"]~.dshan-set:not([data-group="player"]),
.dshan-nav[data-active-group="torrent"]~.dshan-set:not([data-group="torrent"]),
.dshan-nav[data-active-group="storage"]~.dshan-set:not([data-group="storage"]),
.dshan-nav[data-active-group="sources"]~.dshan-set:not([data-group="sources"]),
.dshan-nav[data-active-group="ui"]~.dshan-set:not([data-group="ui"]){display:none;}
.dshan-nav:not([data-active-group="account"])~.dshan-set-accounts{display:none;}
`

    const SOURCE_KEYS_ZH = {
      extSource: '查看源码',
      srcLoading: '正在读取源码…',
      srcTitle: '代码',
      srcHint: '你可以在这里编辑这个扩展的代码。',
      srcSave: '保存',
      srcSaving: '保存中…',
      srcSaved: '已保存',
      srcSavedRestart: '已保存；宿主文件要关→开插件才生效',
      srcDirty: '有未保存的修改',
      srcRestore: '还原上一版',
      srcRestored: '已还原到 {{at}} 的备份',
      srcNoBackup: '还没有备份，保存一次之后就能还原',
      srcRestartHint: '关→开插件才生效',
      srcLines: '行',
      srcCopy: '复制全部',
      srcCopied: '已复制',
      srcTruncated: '源码过长，只显示前 400 KB',
    }

    const SOURCE_KEYS_EN = {
      extSource: 'View source',
      srcLoading: 'Reading source…',
      srcTitle: 'Code',
      srcHint: 'You can edit the code of the extension here.',
      srcSave: 'Save',
      srcSaving: 'Saving…',
      srcSaved: 'Saved',
      srcSavedRestart: 'Saved; restart the plugin for host files to take effect',
      srcDirty: 'Unsaved changes',
      srcRestore: 'Restore previous',
      srcRestored: 'Restored the backup from {{at}}',
      srcNoBackup: 'No backup yet — save once first',
      srcRestartHint: 'restart the plugin to apply',
      srcLines: 'lines',
      srcCopy: 'Copy all',
      srcCopied: 'Copied',
      srcTruncated: 'Source is long; showing the first 400 KB',
    }

    const EXT_TYPE_KEYS = { data: 'extTypeData', torrent: 'extTypeTorrent', online: 'extTypeOnline' }

    const extGear = () =>
      h(
        'svg',
        { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 },
        h('path', { d: 'M4 7h9M19 7h1M4 17h3M13 17h7' }),
        h('circle', { cx: 16, cy: 7, r: 2.1 }),
        h('circle', { cx: 9, cy: 17, r: 2.1 }),
      )

    function extInitials(name) {
      const trimmed = String(name ?? '').trim()
      if (trimmed === '') return '?'
      const ascii = trimmed.match(/[A-Za-z0-9]/g)
      if (ascii !== null && ascii.length > 0) return ascii.slice(0, 2).join('').toUpperCase()
      return trimmed.slice(0, 1)
    }

    const codeGlyph = () =>
      h(
        'svg',
        { viewBox: '0 0 24 24', width: 13, height: 13, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        h('path', { d: 'm9 6-5 6 5 6' }),
        h('path', { d: 'm15 6 5 6-5 6' }),
      )

    function SourceViewer({ entry, T, onClose }) {
      const remote = useEndpoint(`${API}/extensions/source?id=${encodeURIComponent(entry.id)}`)
      const files = Array.isArray(remote.data?.files) ? remote.data.files : []
      const [index, setIndex] = useState(0)
      const active = files[index] ?? files[0] ?? null
      const [draft, setDraft] = useState('')
      const [note, setNote] = useState(null)
      const [busy, setBusy] = useState(false)
      const [copied, setCopied] = useState(false)
      const gutterRef = useRef(null)

      const activeKey = active === null ? '' : `${active.path}:${active.bytes}`
      useEffect(() => {
        setDraft(active === null ? '' : active.content)
        setNote(null)
      }, [activeKey])

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      const lineCount = Math.max(1, draft.split('\n').length)
      const dirty = active !== null && draft !== active.content

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(draft)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        } catch (error) {
          setCopied(false)
        }
      }

      const backups = Array.isArray(active?.backups) ? active.backups : []

      const restore = async () => {
        if (active === null || backups.length === 0) return
        setBusy(true)
        setNote(null)
        try {
          const result = await postJson(`${API}/extensions/source-restore`, { id: entry.id, path: active.path })
          if (result !== null && result !== undefined && result.ok === false) {
            setNote({ kind: 'error', text: result?.error?.message ?? 'restore failed' })
          } else {
            const stamp = String(result?.restoredAt ?? '').replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
            const text = T('srcRestored').replace('{{at}}', stamp)
            setNote({ kind: 'ok', text: result?.needsRestart === true ? `${text} · ${T('srcRestartHint')}` : text })
            remote.reload()
          }
        } catch (error) {
          setNote({ kind: 'error', text: `${T('setFailed')}: ${error?.message ?? error}` })
        } finally {
          setBusy(false)
        }
      }

      const save = async () => {
        if (active === null) return
        setBusy(true)
        setNote(null)
        try {
          const result = await postJson(`${API}/extensions/source-save`, { id: entry.id, path: active.path, content: draft })
          if (result !== null && result !== undefined && result.ok === false) {
            setNote({ kind: 'error', text: result?.error?.message ?? 'save failed' })
          } else {
            const needsRestart = result?.needsRestart === true
            setNote({ kind: 'ok', text: needsRestart ? T('srcSavedRestart') : T('srcSaved') })
            remote.reload()
          }
        } catch (error) {
          setNote({ kind: 'error', text: `${T('setFailed')}: ${error?.message ?? error}` })
        } finally {
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'dshan-eprefs', role: 'dialog', 'aria-modal': 'true', onClick: (event) => { if (event.target === event.currentTarget) onClose() } },
        h(
          'div',
          { className: 'dshan-src' },
          h(
            'div',
            { className: 'dshan-src-head' },
            h(
              'div',
              { className: 'dshan-src-headtext' },
              h('div', { className: 'dshan-src-title' }, T('srcTitle')),
              h('div', { className: 'dshan-src-sub' }, T('srcHint')),
            ),
            h('button', { type: 'button', className: 'dshan-icon', title: T('extClose'), onClick: onClose }, '✕'),
          ),
          h(
            'div',
            { className: 'dshan-src-meta' },
            h('span', { className: 'dshan-src-file' }, active === null ? T('srcLoading') : `${entry.name} · ${active.path}`),
            h('span', { className: 'dshan-src-sub' }, active === null ? '' : `${active.lines} ${T('srcLines')} · ${formatBytes(active.bytes)}`),
            files.length > 1
              ? h(
                  'div',
                  { className: 'dshan-src-tabs' },
                  files.map((item, at) =>
                    h('button', { key: item.path, type: 'button', className: 'dshan-src-tab', 'data-active': at === index ? 'true' : 'false', onClick: () => setIndex(at) }, item.name),
                  ),
                )
              : null,
          ),
          h(
            'div',
            { className: 'dshan-src-body' },
            h('div', { className: 'dshan-src-gutter', ref: gutterRef }, Array.from({ length: lineCount }, (_, at) => at + 1).join('\n')),
            h('textarea', {
              className: 'dshan-src-input',
              value: draft,
              spellCheck: false,
              wrap: 'off',
              disabled: active === null,
              onChange: (event) => setDraft(event.currentTarget.value),
              onScroll: (event) => {
                if (gutterRef.current !== null) gutterRef.current.scrollTop = event.currentTarget.scrollTop
              },
            }),
          ),
          h(
            'div',
            { className: 'dshan-eprefs-foot' },
            note === null
              ? h('span', { className: 'dshan-account-note' }, dirty ? T('srcDirty') : '')
              : h('span', { className: 'dshan-account-note', 'data-kind': note.kind }, note.text),
            h('button', { type: 'button', className: 'dshan-btn', disabled: busy || active === null || backups.length === 0, title: backups.length === 0 ? T('srcNoBackup') : backups[0].name, onClick: restore }, T('srcRestore')),
            h('button', { type: 'button', className: 'dshan-btn', disabled: active === null, onClick: copy }, copied ? T('srcCopied') : T('srcCopy')),
            h('button', { type: 'button', className: 'dshan-btn', 'data-primary': 'true', disabled: busy || active === null || !dirty, onClick: save }, busy ? T('srcSaving') : T('srcSave')),
            h('button', { type: 'button', className: 'dshan-btn', onClick: onClose }, T('extClose')),
          ),
        ),
      )
    }

    function ExtensionCard({ entry, T, onToggle, onPrefs, onSource }) {
      const hasPrefs = entry.settings.length > 0 || entry.account !== ''
      return h(
        'article',
        { className: 'dshan-ext', 'data-type': entry.type },
        h(
          'div',
          { className: 'dshan-ext-head' },
          h(
            'div',
            { className: 'dshan-ext-logo', 'data-type': entry.type },
            entry.icon === '' ? extInitials(entry.name) : h('img', { src: entry.icon, alt: '', style: { width: '100%', height: '100%', borderRadius: '11px', objectFit: 'cover' } }),
          ),
          h(
            'div',
            { className: 'dshan-ext-titles' },
            h('div', { className: 'dshan-ext-name' }, entry.name),
            h('div', { className: 'dshan-ext-desc' }, entry.description),
          ),
          h(
            'div',
            { className: 'dshan-ext-tools' },
            hasPrefs
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshan-icon',
                    title: T('extPrefs'),
                    onClick: onPrefs,
                  },
                  extGear(),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dshan-icon dshan-ext-source',
                title: T('extSource'),
                onClick: onSource,
              },
              codeGlyph(),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dshan-ext-chips' },
          h('span', { className: 'dshan-ext-pill' }, `v${entry.version === '' ? '1.0.0' : entry.version}`),
          h(
            'span',
            { className: 'dshan-ext-pill', 'data-tone': entry.enabled ? 'ok' : 'muted' },
            entry.enabled ? T('extWorking') : T('extDisabled'),
          ),
          h('span', { className: 'dshan-ext-pill' }, entry.lang === 'zh' ? '中文' : entry.lang === 'en' ? 'EN' : 'MULTI'),
          h('span', { className: 'dshan-ext-pill', 'data-tone': entry.type }, T(EXT_TYPE_KEYS[entry.type] ?? 'extTypeData')),
        ),
        h(
          'div',
          { className: 'dshan-ext-meta' },
          h('span', { className: 'dshan-ext-author' }, entry.author === '' ? '—' : entry.author),
          h('span', null, 'JavaScript'),
          entry.builtin ? h('span', { className: 'dshan-ext-pill' }, T('extBuiltin')) : null,
          entry.website === undefined || entry.website === ''
            ? null
            : h(
                'a',
                {
                  className: 'dshan-ext-site',
                  href: entry.website,
                  target: '_blank',
                  rel: 'noreferrer',
                  title: entry.website,
                },
                h(PlayerIcon, { name: 'external' }),
                // The button shows the site itself: "打开主页" said nothing about
                // where it goes, and the row is already about that one plugin.
                String(entry.website).replace(/^https?:\/\//, '').replace(/\/$/, ''),
              ),
          h(
            'div',
            { className: 'dshan-ext-actions' },
            h(SettingsSwitch, {
              label: entry.enabled ? T('extDisable') : T('extEnable'),
              checked: entry.enabled,
              onChange: () => onToggle(),
            }),
          ),
        ),
      )
    }

    function ExtensionPrefs({ entry, T, onClose, onSaved }) {
      const fields = Array.isArray(entry.settings) ? entry.settings : []
      const accountId = typeof entry.account === 'string' ? entry.account : ''
      const [values, setValues] = useState(() => ({ ...(entry.values ?? {}) }))
      const [busy, setBusy] = useState(false)
      const [note, setNote] = useState(null)
      const accounts = useEndpoint(`${API}/accounts`)
      // The provider list comes from the extensions, so an extension that
      // declares its own account is usable here without a page change; the
      // built-in copy is only a fallback for the three we ship.
      const hostProvider =
        accounts.status === 'ready' && accountId !== ''
          ? (accounts.data?.providers ?? []).find((item) => item?.id === accountId) ?? null
          : null
      const known = accountId === '' ? null : PROVIDER_INFO.find((info) => info.id === accountId) ?? null
      const accountInfo =
        accountId === ''
          ? null
          : hostProvider === null
            ? known
            : {
                id: hostProvider.id,
                title: hostProvider.label || known?.title || hostProvider.id,
                hint: hostProvider.hint || known?.hint || '',
                // 这里过去把 password / oauth 都折成 'token'，于是扩展面板里的
                // 账号只剩「粘贴 token」一种形态：AniCh 的邮箱登录和注册永远
                // 不出现。原样透传，让 AccountCard 自己按 kind 分支。
                kind: hostProvider.kind === 'password' || hostProvider.kind === 'oauth' || hostProvider.kind === 'qr'
                  ? hostProvider.kind
                  : 'token',
                link: hostProvider.link || known?.link,
                placeholder: hostProvider.placeholder || known?.placeholder,
              }
      const accountStatus = accounts.status === 'ready' && accountId !== ''
        ? accounts.data?.accounts?.[accountId] ?? null
        : null

      const save = async () => {
        setBusy(true)
        setNote(null)
        try {
          await postJson(`${API}/extensions/save`, { id: entry.id, values })
          setNote({ kind: 'ok', text: T('extSaved') })
          if (typeof onSaved === 'function') onSaved()
        } catch (error) {
          setNote({ kind: 'error', text: `${T('setFailed')}: ${error?.message ?? error}` })
        } finally {
          setBusy(false)
        }
      }

      const field = (item) => {
        if (item.kind === 'switch') {
          return h(
            'div',
            { className: 'dshan-ext-field', key: item.key },
            h(SettingsRow, {
              label: uiPrefs.locale === 'en' ? item.labelEn : item.label,
              hint: item.hint,
              children: h(SettingsSwitch, {
                label: uiPrefs.locale === 'en' ? item.labelEn : item.label,
                checked: values[item.key] !== false,
                onChange: (next) => setValues((previous) => ({ ...previous, [item.key]: next })),
              }),
            }),
          )
        }
        if (item.kind === 'choice') {
          const options = Array.isArray(item.options) ? item.options : []
          return h(
            'div',
            { className: 'dshan-ext-field', key: item.key },
            h(SettingsRow, {
              label: uiPrefs.locale === 'en' ? item.labelEn : item.label,
              hint: item.hint,
              children: h(SettingsChoices, {
                value: values[item.key] ?? item.default,
                options: options.map((option) => [
                  option.value,
                  uiPrefs.locale === 'en' ? option.labelEn : option.label,
                ]),
                onChange: (next) => setValues((previous) => ({ ...previous, [item.key]: next })),
              }),
            }),
          )
        }
        if (item.kind === 'text') {
          const english = uiPrefs.locale === 'en'
          return h(
            'div',
            { className: 'dshan-ext-field', key: item.key },
            h(SettingsRow, {
              label: english ? item.labelEn : item.label,
              hint: english ? item.hintEn || item.hint : item.hint,
              children: h(SettingsInput, {
                value: values[item.key] ?? item.default ?? '',
                placeholder: item.placeholder ?? '',
                onChange: (next) => setValues((previous) => ({ ...previous, [item.key]: next })),
              }),
            }),
          )
        }
        const hint =
          item.min === undefined || item.max === undefined
            ? item.hint
            : `${T('extNumberHint').replace('{{min}}', String(item.min)).replace('{{max}}', String(item.max))}${item.hint === '' ? '' : ` · ${item.hint}`}`
        return h(
          'div',
          { className: 'dshan-ext-field', key: item.key },
          h(SettingsRow, {
            label: uiPrefs.locale === 'en' ? item.labelEn : item.label,
            hint,
            children: h(SettingsInput, {
              type: 'number',
              value: values[item.key] ?? item.default,
              width: '96px',
              onChange: (next) => {
                const number = Number(next)
                setValues((previous) => ({ ...previous, [item.key]: Number.isFinite(number) ? number : previous[item.key] }))
              },
            }),
          }),
        )
      }

      return h(
        'div',
        { className: 'dshan-eprefs', role: 'dialog', 'aria-modal': 'true', onClick: (event) => { if (event.target === event.currentTarget) onClose() } },
        h(
          'div',
          { className: 'dshan-eprefs-card' },
          h(
            'div',
            { className: 'dshan-eprefs-head' },
            h('div', { className: 'dshan-ext-logo', 'data-type': entry.type }, extInitials(entry.name)),
            h(
              'div',
              { className: 'dshan-ext-titles' },
              h('div', { className: 'dshan-ext-name' }, entry.name),
              h(
                'div',
                { className: 'dshan-ext-desc' },
                `v${entry.version === '' ? '1.0.0' : entry.version} · ${entry.enabled ? T('extWorking') : T('extDisabled')} · ${T(EXT_TYPE_KEYS[entry.type] ?? 'extTypeData')}`,
              ),
            ),
            h('button', { type: 'button', className: 'dshan-icon', title: T('extClose'), onClick: onClose }, '✕'),
          ),
          h(
            'div',
            { className: 'dshan-eprefs-body' },
            accountInfo === null
              ? null
              : h(
                  'div',
                  { className: 'dshan-ext-field' },
                  h(
                    'div',
                    { className: 'dshan-eprefs-section' },
                    h('span', { className: 'dshan-eprefs-section-title' }, `${T('extAccount')} · ${accountInfo.title}`),
                    h('span', { className: 'dshan-eprefs-section-hint' }, T('extAccountHint')),
                  ),
                  h(AccountCard, {
                    info: accountInfo,
                    status: accountStatus,
                    T,
                    onSaved: accounts.reload,
                    onCleared: accounts.reload,
                  }),
                ),
            fields.map(field),
          ),
          h(
            'div',
            { className: 'dshan-eprefs-foot' },
            note === null ? null : h('span', { className: 'dshan-account-note', 'data-kind': note.kind }, note.text),
            h('button', { type: 'button', className: 'dshan-btn', onClick: onClose }, T('extClose')),
            h('button', { type: 'button', className: 'dshan-btn', 'data-primary': 'true', disabled: busy, onClick: save }, T('extSave')),
          ),
        ),
      )
    }

    Object.assign(ZH, EXT_KEYS_ZH)
    Object.assign(EN, EXT_KEYS_EN)
    Object.assign(ZH, SOURCE_KEYS_ZH)
    Object.assign(EN, SOURCE_KEYS_EN)

const STYLE_ID = 'dsh-anime-style'
    const CSS = `
.dshan-root{--dshan-radius:14px;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#0f1115);color:var(--dsw-alias-label-primary,#e8eaf0);font-family:var(--dsw-font-family,system-ui,-apple-system,"Segoe UI",sans-serif);font-size:13px;line-height:1.5;}
.dshan-head{display:flex;align-items:center;gap:12px;padding:14px 18px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));flex-wrap:wrap;}
.dshan-brand{display:flex;align-items:center;gap:10px;min-width:0;}
.dshan-brand h1{margin:0;font-size:16px;font-weight:650;letter-spacing:.2px;}
.dshan-brand p{margin:0;font-size:11.5px;color:var(--dsw-alias-label-secondary,#98a1b3);}
.dshan-badges{display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap;}
.dshan-badge{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;font-size:11px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#98a1b3);background:var(--dsw-alias-bg-layer-1,#161922);}
.dshan-badge[data-warn="true"]{border-color:rgba(255,120,120,.5);color:#ff9d9d;background:rgba(255,120,120,.12);}
.dshan-sources{display:inline-flex;align-items:center;gap:4px;padding:3px;border-radius:999px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));}
.dshan-source{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 10px;border-radius:999px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#98a1b3);font:inherit;font-size:11.5px;cursor:pointer;transition:.16s;white-space:nowrap;}
.dshan-source:hover{color:var(--dsw-alias-label-primary,#e8eaf0);}
.dshan-source[data-active="true"]{color:#fff;background:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-source[data-active="true"] .dshan-dot{background:rgba(255,255,255,.85);}
.dshan-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary,#6b7280);}
.dshan-dot.on{background:var(--dsw-alias-state-success-primary,#22c55e);}
.dshan-dot.off{background:var(--dsw-alias-state-warn-primary,#f59e0b);}
.dshan-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));background:var(--dsw-alias-bg-layer-1,#161922);color:var(--dsw-alias-label-secondary,#98a1b3);cursor:pointer;transition:.16s;}
.dshan-iconbtn:hover{color:var(--dsw-alias-label-primary,#e8eaf0);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.2));}
.dshan-iconbtn.spinning svg{animation:dshan-spin 1s linear infinite;}
@keyframes dshan-spin{to{transform:rotate(360deg)}}
.dshan-tabs{display:flex;gap:4px;padding:8px 18px;overflow-x:auto;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));}
.dshan-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#98a1b3);font:inherit;font-size:12.5px;padding:6px 12px;border-radius:9px;cursor:pointer;white-space:nowrap;transition:.16s;}
.dshan-tab:hover{color:var(--dsw-alias-label-primary,#e8eaf0);background:var(--dsw-alias-bg-layer-1,#161922);}
.dshan-tab[data-active="true"]{color:#fff;background:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-body{flex:1;min-height:0;overflow:auto;padding:14px 18px 26px;}
.dshan-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
.dshan-select,.dshan-input{appearance:none;height:30px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));background:var(--dsw-alias-bg-layer-1,#161922);color:var(--dsw-alias-label-primary,#e8eaf0);font:inherit;font-size:12.5px;padding:0 10px;outline:none;}
.dshan-select{padding-right:26px;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 14px) 13px,calc(100% - 9px) 13px;background-size:5px 5px;background-repeat:no-repeat;}
.dshan-input{flex:1;min-width:180px;}
.dshan-input:focus,.dshan-select:focus{border-color:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-chip{appearance:none;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));background:transparent;color:var(--dsw-alias-label-secondary,#98a1b3);font:inherit;font-size:12px;padding:5px 11px;border-radius:999px;cursor:pointer;}
.dshan-chip[data-active="true"]{color:#fff;background:var(--dsw-alias-brand-primary,#4f6bff);border-color:transparent;}
.dshan-chip[data-off="true"]{opacity:.55;cursor:not-allowed;}
.dshan-chip[data-off="true"][data-active="true"]{background:transparent;color:var(--dsw-alias-label-secondary,#98a1b3);
  border-color:var(--dsw-alias-border-l1,rgba(255,255,255,.12));}
.dshan-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:14px;}

/* —— 浏览页：左侧筛选栏 + 右侧密集海报网格 —— */
.dshan-browse{display:flex;gap:18px;align-items:flex-start;}
.dshan-rail{flex:0 0 208px;display:flex;flex-direction:column;gap:8px;position:sticky;top:0;}
.dshan-railrow{position:relative;display:flex;align-items:center;gap:9px;height:38px;padding:0 12px;border-radius:9px;
  background:var(--dsw-alias-bg-layer-1,#1b1d21);border:1px solid transparent;color:var(--dsw-alias-label-secondary,#98a1b3);
  font-size:13px;cursor:pointer;transition:border-color .14s ease,color .14s ease,background .14s ease;}
.dshan-railrow:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.16));color:#fff;}
.dshan-railrow[data-active="true"]{color:#fff;}
.dshan-railrow .dshan-railicon{flex:0 0 16px;display:inline-flex;align-items:center;justify-content:center;opacity:.85;}
.dshan-railrow .dshan-raillabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshan-railrow .dshan-railchev{flex:0 0 auto;opacity:.6;font-size:10px;}
.dshan-railrow select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font:inherit;}
.dshan-railrow.dshan-railinput{padding:0 10px;}
.dshan-railrow.dshan-railinput input{flex:1 1 auto;min-width:0;background:transparent;border:0;outline:0;color:inherit;font:inherit;}
.dshan-railrow.dshan-railinput input::placeholder{color:inherit;opacity:.75;}
.dshan-railrow.dshan-railtoggle{padding-left:12px;}
.dshan-switch{position:relative;width:30px;height:17px;border-radius:999px;background:rgba(255,255,255,.16);transition:background .16s ease;flex:0 0 auto;}
.dshan-switch::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:transform .16s ease;}
.dshan-switch[data-on="true"]{background:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-switch[data-on="true"]::after{transform:translateX(13px);}
.dshan-railfoot{margin-top:6px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));display:flex;flex-direction:column;gap:8px;}
.dshan-bmain{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:14px;}
.dshan-bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(114px,1fr));gap:16px 14px;}
.dshan-bcard{display:flex;flex-direction:column;gap:7px;min-width:0;cursor:pointer;border:0;background:transparent;padding:0;text-align:left;font:inherit;color:inherit;}
.dshan-bcover{position:relative;aspect-ratio:2/3;border-radius:5px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#1d2130);}
.dshan-bcover img{width:100%;height:100%;object-fit:cover;display:block;transition:filter .16s ease,transform .16s ease;}
.dshan-bcard:hover .dshan-bcover img{filter:brightness(1.08);transform:scale(1.02);}
.dshan-bcard:hover .dshan-btitle{color:var(--dsw-alias-brand-primary,#6b83ff);}
.dshan-bcover .dshan-ph{display:flex;align-items:center;justify-content:center;height:100%;color:var(--dsw-alias-label-secondary,#98a1b3);font-size:11px;}
.dshan-bflag{position:absolute;left:6px;bottom:6px;height:18px;padding:0 6px;display:inline-flex;align-items:center;border-radius:4px;
  font-size:10px;font-weight:600;color:#fff;background:rgba(0,0,0,.66);backdrop-filter:blur(4px);}
.dshan-bscore{position:absolute;right:6px;bottom:6px;height:18px;padding:0 6px;display:inline-flex;align-items:center;gap:3px;border-radius:4px;
  font-size:10px;font-weight:600;color:#fff;background:rgba(0,0,0,.66);backdrop-filter:blur(4px);}
.dshan-btitle{font-size:12.5px;line-height:1.34;color:var(--dsw-alias-label-primary,#e8ecf4);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color .14s ease;}
.dshan-bmeta{font-size:11px;color:var(--dsw-alias-label-secondary,#8d95a6);display:flex;gap:6px;align-items:center;}
.dshan-bempty{display:flex;align-items:center;justify-content:center;min-height:220px;color:var(--dsw-alias-label-secondary,#8d95a6);font-size:13px;}
@media (max-width:720px){.dshan-browse{flex-direction:column;}.dshan-rail{position:static;flex:1 1 auto;width:100%;}}
.dshan-card{position:relative;display:flex;flex-direction:column;min-width:0;border-radius:var(--dshan-radius);background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));overflow:hidden;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;}
.dshan-card:hover{transform:translateY(-2px);border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.18));box-shadow:0 10px 26px rgba(0,0,0,.28);}
.dshan-cover{position:relative;aspect-ratio:2/3;background:var(--dsw-alias-bg-layer-2,#1d2130);overflow:hidden;}
.dshan-cover img{width:100%;height:100%;object-fit:cover;display:block;}
.dshan-cover .dshan-ph{display:flex;align-items:center;justify-content:center;height:100%;color:var(--dsw-alias-label-secondary,#98a1b3);font-size:11px;}
.dshan-score{position:absolute;top:7px;right:7px;height:20px;padding:0 7px;display:inline-flex;align-items:center;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:rgba(0,0,0,.62);backdrop-filter:blur(6px);}
.dshan-score.high{background:rgba(34,197,94,.9);}
.dshan-score.mid{background:rgba(245,158,11,.92);}
.dshan-epflag{position:absolute;left:7px;bottom:7px;height:20px;padding:0 7px;display:inline-flex;align-items:center;border-radius:999px;font-size:10.5px;color:#fff;background:rgba(79,107,255,.92);}
.dshan-cardbody{padding:8px 9px 10px;display:flex;flex-direction:column;gap:4px;min-width:0;}
.dshan-cardtitle{font-size:12.5px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.dshan-cardmeta{font-size:11px;color:var(--dsw-alias-label-secondary,#98a1b3);display:flex;gap:6px;flex-wrap:wrap;}
.dshan-follow{margin-top:2px;appearance:none;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));background:transparent;color:var(--dsw-alias-label-secondary,#98a1b3);font:inherit;font-size:11.5px;height:26px;border-radius:8px;cursor:pointer;transition:.16s;}
.dshan-follow:hover{color:var(--dsw-alias-label-primary,#e8eaf0);border-color:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-follow[data-on="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f6bff) 18%,transparent);border-color:transparent;color:var(--dsw-alias-brand-primary,#6d84ff);}
.dshan-rows{display:flex;flex-direction:column;gap:8px;}
.dshan-row{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));cursor:pointer;transition:.16s;}
.dshan-row:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.18));}
.dshan-rowcover{width:40px;height:56px;border-radius:7px;overflow:hidden;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2,#1d2130);}
.dshan-rowcover img{width:100%;height:100%;object-fit:cover;display:block;}
.dshan-rowtime{font-variant-numeric:tabular-nums;font-size:12px;font-weight:600;color:var(--dsw-alias-brand-primary,#7d92ff);flex:0 0 46px;}
.dshan-rowmain{flex:1;min-width:0;}
.dshan-rowtitle{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshan-rowsub{font-size:11px;color:var(--dsw-alias-label-secondary,#98a1b3);}
.dshan-eptag{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#1d2130);color:var(--dsw-alias-label-secondary,#98a1b3);flex:0 0 auto;}
.dshan-section{margin:18px 0 8px;font-size:12px;font-weight:650;color:var(--dsw-alias-label-secondary,#98a1b3);letter-spacing:.3px;text-transform:none;}
.dshan-state{padding:26px 8px;text-align:center;color:var(--dsw-alias-label-secondary,#98a1b3);font-size:12.5px;}
.dshan-state.error{color:var(--dsw-alias-state-error-primary,#ef4444);}
.dshan-state button{margin-top:10px;}
.dshan-empty{padding:26px 8px;text-align:center;color:var(--dsw-alias-label-secondary,#98a1b3);font-size:12.5px;}
.dshan-generic{display:block;}
.dshan-skeleton{height:220px;border-radius:var(--dshan-radius);background:linear-gradient(100deg,var(--dsw-alias-bg-layer-1,#161922) 30%,var(--dsw-alias-bg-layer-2,#1d2130) 50%,var(--dsw-alias-bg-layer-1,#161922) 70%);background-size:300% 100%;animation:dshan-shimmer 1.4s ease-in-out infinite;}
@keyframes dshan-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}
.dshan-mine{display:flex;flex-direction:column;gap:10px;}
.dshan-mineitem{display:flex;gap:12px;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-minecover{width:52px;height:74px;border-radius:8px;overflow:hidden;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2,#1d2130);cursor:pointer;}
.dshan-minecover img{width:100%;height:100%;object-fit:cover;display:block;}
.dshan-minemain{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}
.dshan-minetop{display:flex;gap:8px;align-items:flex-start;}
.dshan-minetitle{font-size:13px;font-weight:650;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;}
.dshan-bar{height:5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#1d2130);overflow:hidden;}
.dshan-bar span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--dsw-alias-brand-primary,#4f6bff),#8b5cf6);transition:width .25s;}
.dshan-mineline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary,#98a1b3);}
.dshan-mini{appearance:none;display:inline-flex;align-items:center;height:26px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#8b93a1);font:inherit;font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease;}
.dshan-mini:hover{background:var(--dsw-alias-bg-layer-2,rgba(120,130,150,.14));color:var(--dsw-alias-label-primary,#1f2430);}
.dshan-mini:hover{color:var(--dsw-alias-label-primary,#e8eaf0);border-color:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-mini.danger:hover{color:var(--dsw-alias-state-error-primary,#ef4444);border-color:var(--dsw-alias-state-error-primary,#ef4444);}
.dshan-srcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;}
.dshan-src{display:flex;gap:11px;padding:11px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-srcicon{width:34px;height:34px;border-radius:9px;overflow:hidden;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2,#1d2130);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--dsw-alias-label-secondary,#98a1b3);}
.dshan-srcicon img{width:100%;height:100%;object-fit:cover;}
.dshan-srcmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
.dshan-srcname{font-size:12.5px;font-weight:650;display:flex;align-items:center;gap:6px;min-width:0;}
.dshan-srcname b{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshan-tag{font-size:10px;padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f6bff) 20%,transparent);color:var(--dsw-alias-brand-primary,#8ea0ff);flex:0 0 auto;}
.dshan-tag.torrent{background:rgba(245,158,11,.18);color:#f0b64b;}
.dshan-srcdesc{font-size:11px;color:var(--dsw-alias-label-secondary,#98a1b3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.dshan-srclink{font-size:11px;color:var(--dsw-alias-brand-primary,#8ea0ff);text-decoration:none;width:fit-content;}
.dshan-srclink:hover{text-decoration:underline;}
.dshan-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);}
.dshan-sheet{width:min(880px,100%);max-height:min(720px,88vh);overflow:auto;border-radius:18px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));box-shadow:0 28px 70px rgba(0,0,0,.5);}
.dshan-banner{position:relative;height:150px;background:var(--dsw-alias-bg-layer-2,#1d2130);overflow:hidden;}
.dshan-banner img{width:100%;height:100%;object-fit:cover;opacity:.55;}
.dshan-bannergrad{position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,color-mix(in srgb,var(--dsw-alias-bg-layer-1,#161922) 92%,transparent));}
.dshan-sheetclose{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.4);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.dshan-sheetbody{display:flex;gap:18px;padding:0 20px 20px;margin-top:-58px;position:relative;}
.dshan-sheetcover{width:132px;flex:0 0 auto;aspect-ratio:2/3;border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#1d2130);box-shadow:0 14px 32px rgba(0,0,0,.45);}
.dshan-sheetcover img{width:100%;height:100%;object-fit:cover;display:block;}
.dshan-sheetinfo{flex:1;min-width:0;padding-top:64px;display:flex;flex-direction:column;gap:9px;}
.dshan-sheettitle{font-size:19px;font-weight:700;line-height:1.3;}
.dshan-sheetalt{font-size:11.5px;color:var(--dsw-alias-label-secondary,#98a1b3);}
.dshan-chips{display:flex;gap:6px;flex-wrap:wrap;}
.dshan-chipbox{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#1d2130);color:var(--dsw-alias-label-secondary,#98a1b3);}
.dshan-synopsis{font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-secondary,#98a1b3);white-space:pre-wrap;max-height:170px;overflow:auto;}
.dshan-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;}
.dshan-btn{appearance:none;height:30px;padding:0 13px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));background:transparent;color:var(--dsw-alias-label-primary,#e8eaf0);font:inherit;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;}
.dshan-btn:hover{border-color:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-btn.primary{background:var(--dsw-alias-brand-primary,#4f6bff);border-color:transparent;color:#fff;}
.dshan-btn.primary[data-on="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f6bff) 22%,transparent);color:var(--dsw-alias-brand-primary,#8ea0ff);}
.dshan-next{font-size:12px;color:var(--dsw-alias-state-success-primary,#22c55e);}
@media (max-width:720px){.dshan-sheetbody{flex-direction:column}.dshan-sheetcover{width:104px}.dshan-sheetinfo{padding-top:8px}}
.dshan-detail{display:flex;flex-direction:column;min-height:0;flex:1;overflow-y:auto;overflow-x:hidden;border-radius:var(--dshan-radius);background:var(--dsw-alias-bg-base,#0f1115);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));}
.dshan-hero{position:relative;flex:0 0 auto;min-height:188px;overflow:hidden;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));background:var(--dsw-alias-bg-layer-1,#161922);}
.dshan-heroimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.42;}
.dshan-herograd{position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-base,#0f1115) 15%,transparent) 0%,color-mix(in srgb,var(--dsw-alias-bg-base,#0f1115) 92%,transparent) 78%,var(--dsw-alias-bg-base,#0f1115) 100%);}
.dshan-heroinner{position:relative;display:flex;gap:16px;padding:16px 18px 14px;align-items:flex-end;}
.dshan-herocover{width:112px;flex:0 0 auto;aspect-ratio:2/3;border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#1d2130);box-shadow:0 14px 30px rgba(0,0,0,.45);}
.dshan-herocover img{width:100%;height:100%;object-fit:cover;display:block;}
.dshan-heroinfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;}
.dshan-herotop{display:flex;align-items:center;gap:10px;}
.dshan-herotitle{margin:0;font-size:20px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.dshan-viewswitcher{display:flex;gap:4px;padding:8px 18px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));}
.dshan-view{display:flex;flex-direction:column;gap:10px;align-items:stretch;}
.dshan-synopsis.full{max-height:none;}
.dshan-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;}
.dshan-fact{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));font-size:12px;}
.dshan-fact b{font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshan-us{display:grid;grid-template-columns:repeat(auto-fill,minmax(172px,1fr));gap:10px;}
.dshan-playerbox{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:14px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-video{width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;display:block;}
.dshan-playerbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;}
.dshan-eppanel{display:flex;flex-direction:column;gap:8px;}
.dshan-epgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px;}
.dshan-epbtn{appearance:none;height:34px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;
  padding:0 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-radius:9px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));background:var(--dsw-alias-bg-layer-1,#161922);color:var(--dsw-alias-label-secondary,#98a1b3);font:inherit;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer;transition:.14s;}
.dshan-epbtn:hover{color:var(--dsw-alias-label-primary,#e8eaf0);border-color:var(--dsw-alias-brand-primary,#4f6bff);}
.dshan-epbtn[data-active="true"]{background:var(--dsw-alias-brand-primary,#4f6bff);border-color:transparent;color:#fff;}
/* Watch screen: player left, episodes in a fixed rail on the right. */
.dshan-watchbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.dshan-watchbar-grow{flex:1 1 auto;min-width:8px;}
.dshan-pill{appearance:none;display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));background:var(--dsw-alias-bg-layer-1,#161922);
  color:var(--dsw-alias-label-primary,#e8eaf0);font:inherit;font-size:12.5px;cursor:pointer;transition:.14s;}
.dshan-pill:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.22));}
.dshan-pill-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary,#4f6bff);flex:0 0 auto;}
.dshan-pill-caret{font-size:11px;opacity:.6;}
.dshan-select-compact{height:30px;border-radius:999px;}
.dshan-watch{display:grid;grid-template-columns:minmax(0,1fr) 268px;gap:12px;align-items:start;}
.dshan-watch-main{min-width:0;}
.dshan-modal-mask{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  background:rgba(6,8,13,.62);backdrop-filter:blur(3px);padding:20px;}
.dshan-omodal{width:min(720px,94vw);display:flex;flex-direction:column;gap:12px;padding:16px 18px;border-radius:14px;
  background:var(--dsw-alias-bg-layer-1,#14161d);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));
  box-shadow:0 18px 48px rgba(0,0,0,.45);}
.dshan-omodal-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#f2f4f8);}
.dshan-omodal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:2px;}
.dshan-omodal-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
.dshan-omodal-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary,#98a1b3);margin-right:2px;}
.dshan-omodal-row{display:flex;align-items:center;gap:8px;}
.dshan-omodal-row .dshan-input{flex:1 1 auto;min-width:0;}
.dshan-omodal-results{max-height:min(44vh,380px);overflow:auto;margin-top:2px;padding-right:2px;}
.dshan-omodal-results .dshan-grid{grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;}
.dshan-omodal-results .dshan-cardtitle{font-size:12.5px;font-weight:500;line-height:1.45;
  color:var(--dsw-alias-label-primary,#f2f4f8);white-space:normal;overflow:hidden;display:-webkit-box;
  -webkit-line-clamp:2;-webkit-box-orient:vertical;}
.dshan-omodal-results .dshan-cardmeta{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary,#98a1b3);}
.dshan-side-empty{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#98a1b3);}
.dshan-watch-idle{display:flex;align-items:center;justify-content:center;min-height:320px;border-radius:12px;
  border:1px dashed var(--dsw-alias-border-l1,rgba(255,255,255,.12));color:var(--dsw-alias-label-secondary,#98a1b3);font-size:12.5px;}
.dshan-watch-side{display:flex;flex-direction:column;gap:8px;padding:11px;border-radius:12px;
  background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-side-head{display:flex;align-items:baseline;gap:8px;justify-content:space-between;}
.dshan-side-title{font-size:12.5px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;}
.dshan-side-count{flex:0 0 auto;font-size:11.5px;color:var(--dsw-alias-label-secondary,#98a1b3);font-variant-numeric:tabular-nums;}
.dshan-epgrid.compact{grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;}
.dshan-epgrid.compact .dshan-epbtn{height:30px;padding:0;font-size:11.5px;border-radius:7px;}
@media (max-width: 860px){.dshan-watch{grid-template-columns:minmax(0,1fr);}}
.dshan-seasonhead{display:flex;gap:11px;align-items:center;padding:10px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-seasoncover{width:40px;height:56px;border-radius:7px;object-fit:cover;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2,#1d2130);}
.dshan-enginebar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:7px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px dashed var(--dsw-alias-border-l1,rgba(255,255,255,.1));}
.dshan-job{display:flex;flex-direction:column;gap:7px;padding:10px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-torrents{display:flex;flex-direction:column;gap:7px;}
.dshan-torrent{display:flex;gap:12px;align-items:center;padding:9px 11px;border-radius:11px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-torrent:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.18));}
.dshan-torrentactions{display:flex;gap:6px;flex-wrap:wrap;flex:0 0 auto;}
.dshan-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#98a1b3);cursor:pointer;}
.dshan-input.small{flex:0 0 92px;min-width:0;}
.dshan-characters{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;}
.dshan-character{display:flex;gap:10px;padding:9px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-charcover{width:56px;height:78px;border-radius:8px;overflow:hidden;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2,#1d2130);}
.dshan-charcover img{width:100%;height:100%;object-fit:cover;display:block;}
.dshan-charmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
.dshan-chardesc{font-size:11px;color:var(--dsw-alias-label-secondary,#98a1b3);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.dshan-relations{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:9px;}
.dshan-watchorder{display:flex;flex-direction:column;gap:6px;}
.dshan-worow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;text-align:left;
  background:var(--dsw-alias-bg-layer-2,#14171c);border:1px solid var(--dsw-alias-border-l1,#232a33);color:inherit;
  font:inherit;width:100%;}
.dshan-worow[data-current="true"]{border-color:var(--dsw-alias-brand-primary,#5b6ef5);}
.dshan-worow[data-link="true"]{cursor:pointer;}
.dshan-worow[data-link="true"]:hover{background:var(--dsw-alias-bg-layer-3,#191d24);}
.dshan-wonum{width:22px;height:22px;flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:600;background:rgba(255,255,255,.07);color:var(--dsw-alias-label-secondary,#9aa4b2);}
.dshan-worow[data-current="true"] .dshan-wonum{background:var(--dsw-alias-brand-primary,#5b6ef5);color:#fff;}
.dshan-womain{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap;}
.dshan-wocover{width:26px;height:36px;flex:none;border-radius:5px;object-fit:cover;background:#1b1f26;}
.dshan-worel{font-size:11px;padding:1px 6px;border-radius:6px;background:rgba(255,255,255,.07);
  color:var(--dsw-alias-label-secondary,#9aa4b2);flex:none;}
.dshan-worel[data-current="true"]{background:rgba(91,110,245,.18);color:#aab4ff;}
.dshan-wotitle{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#e8ecf4);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;max-width:min(46vw,420px);}
.dshan-themecover{width:64px;height:36px;flex:none;border-radius:5px;object-fit:cover;background:#1b1f26;}
.dshan-themesrc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;}
.dshan-themes{display:flex;flex-direction:column;gap:6px;}
.dshan-theme{border-radius:10px;background:var(--dsw-alias-bg-layer-2,#14171c);
  border:1px solid var(--dsw-alias-border-l1,#232a33);overflow:hidden;}
.dshan-theme[data-open="true"]{border-color:var(--dsw-alias-brand-primary,#5b6ef5);}
.dshan-themerow{display:flex;align-items:center;gap:10px;padding:8px 10px;}
.dshan-themetag{flex:none;font-size:11px;font-weight:600;padding:2px 7px;border-radius:6px;
  background:rgba(91,110,245,.18);color:#aab4ff;letter-spacing:.3px;}
.dshan-thememain{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;}
.dshan-themetitle{font-size:13px;color:var(--dsw-alias-label-primary,#e8ecf4);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.dshan-theme[data-open="true"] .dshan-pl{max-height:min(52vh,420px);border-radius:8px;}
.dshan-audio{display:block;width:100%;padding:8px 10px 10px;box-sizing:border-box;}
.dshan-relation{display:flex;gap:10px;padding:9px;border-radius:11px;background:var(--dsw-alias-bg-layer-1,#161922);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));}
.dshan-relation[data-link="true"]{cursor:pointer;text-align:left;font:inherit;color:inherit;width:100%;transition:border-color .16s,background .16s,transform .16s;}
.dshan-relation[data-link="true"]:hover{border-color:var(--dsw-alias-brand-primary,#4f6bff);background:var(--dsw-alias-bg-layer-2,#1d2130);transform:translateY(-1px);}
.dshan-relation[data-link="true"]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6bff);outline-offset:2px;}
.dshan-relcover{width:42px;height:58px;border-radius:7px;overflow:hidden;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2,#1d2130);}
.dshan-relcover img{width:100%;height:100%;object-fit:cover;display:block;}
@media (max-width:720px){.dshan-heroinner{flex-direction:column;align-items:flex-start}.dshan-herocover{width:84px}}

${PLAYER_CSS}
${SETTINGS_CSS}${SECTIONS_CSS}${EXT_CSS}
`

    function ensureStyles() {
      if (typeof document === 'undefined') return
      // Deliberately not idempotent: a hot-reloaded client keeps the DOM of the
      // previous mount, so returning early would leave the old sheet in place and
      // every rule added in the new version would silently never apply.
      const existing = document.getElementById(STYLE_ID)
      if (existing !== null && existing.textContent === CSS) return
      const element = existing ?? document.createElement('style')
      element.id = STYLE_ID
      element.textContent = CSS
      if (existing === null) document.head.appendChild(element)
    }

    /* ------------------------------------------------------------------ *
     * Small helpers
     * ------------------------------------------------------------------ */

    const stripHtml = (value) =>
      typeof value === 'string' ? value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : ''

    const pad = (value) => String(value).padStart(2, '0')

    function clockOf(seconds) {
      const date = new Date(seconds * 1000)
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function dayKey(seconds) {
      const date = new Date(seconds * 1000)
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function dayLabelOf(seconds, T) {
      const target = new Date(seconds * 1000)
      target.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
      if (diffDays === 0) return T('today')
      if (diffDays === 1) return T('tomorrow')
      const names = T('weekday')
      const name = Array.isArray(names) ? names[target.getDay()] : ''
      return `${name} ${target.getMonth() + 1}/${target.getDate()}`
    }

    function shortDate(seconds) {
      const date = new Date(seconds * 1000)
      return `${date.getMonth() + 1}/${date.getDate()}`
    }

    const HAN = /[\u3400-\u9fff]/

    // bilibili only indexes localised titles, so Han names are tried before the
    // romanised ones; anything without Han characters is very unlikely to match.
    function bilibiliTitles(media, titles) {
      const list = []
      const push = (value) => {
        const text = String(value ?? '').trim()
        if (text !== '' && !list.includes(text)) list.push(text)
      }
      push(media?.nameCn)
      push(media?.nativeTitle)
      for (const synonym of Array.isArray(media?.synonyms) ? media.synonyms : []) {
        if (HAN.test(synonym)) push(synonym)
      }
      for (const title of titles) if (HAN.test(title)) push(title)
      for (const title of titles) push(title)
      return list
    }

    function relativeFuture(epochSeconds, T) {
      const delta = epochSeconds * 1000 - Date.now()
      if (delta <= 0) return T('alreadyAired')
      const minutes = Math.floor(delta / 60000)
      if (minutes < 60) return `${minutes}${T('minuteShort')}`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours}${T('hourShort')}`
      const days = Math.floor(hours / 24)
      return `${days}${T('dayShort')}${hours % 24 > 0 ? `${hours % 24}${T('hourShort')}` : ''}`
    }

    function statusLabel(status, T) {
      if (status === 'RELEASING') return T('airingNow')
      if (status === 'FINISHED') return T('finished')
      if (status === 'NOT_YET_RELEASED') return T('notYetAired')
      if (status === 'CANCELLED') return T('cancelled')
      return ''
    }

    function seasonLabel(season, T) {
      const map = { WINTER: 'winter', SPRING: 'spring', SUMMER: 'summer', FALL: 'fall' }
      return season && map[season] ? T(map[season]) : ''
    }

    /**
     * A 404 from one of our own routes never means "the anime is missing": the
     * Host answers 200 {ok:false} for upstream trouble and reserves 404 for
     * routes it does not know. So a 404 here means the running Host is still
     * an older build without the route — worth saying out loud instead of
     * printing "HTTP 404".
     */
    const STALE_ROUTE = '__dsh_anime_stale_route__'
    let translate = (key) => key

    function describeError(message) {
      if (message === STALE_ROUTE) return translate('hostStale')
      return message
    }

    async function fetchJson(path) {
      const response = await fetch(path, { cache: 'no-store', headers: { accept: 'application/json' } })
      if (response.status === 404) throw new Error(STALE_ROUTE)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      if (payload !== null && typeof payload === 'object' && payload.ok === false) {
        throw new Error(payload?.error?.message ?? 'request failed')
      }
      return payload?.data ?? payload
    }

    /** A GET that re-runs on demand, with the errors the page needs to render. */
    function useEndpoint(path) {
      const [state, setState] = useState({ status: path === null ? 'idle' : 'loading', data: null, error: '' })
      const [nonce, setNonce] = useState(0)
      const alive = useRef(true)

      useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
        }
      }, [])

      useEffect(() => {
        if (path === null) {
          setState({ status: 'idle', data: null, error: '' })
          return undefined
        }
        let cancelled = false
        setState((previous) => ({ status: 'loading', data: previous.data, error: '' }))
        fetchJson(path)
          .then((data) => {
            if (!cancelled) setState({ status: 'ready', data, error: '' })
          })
          .catch((error) => {
            if (!cancelled) setState({ status: 'error', data: null, error: describeError(error?.message ?? String(error)) })
          })
        return () => {
          cancelled = true
        }
      }, [path, nonce])

      const reload = useCallback(() => setNonce((value) => value + 1), [])
      return { ...state, reload }
    }

    /* ------------------------------------------------------------------ *
     * Watchlist — the one thing this page owns. Kept in localStorage so it
     * survives reloads without a Host storage API.
     * ------------------------------------------------------------------ */

    function readWatchlist() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.id === 'string') : []
      } catch {
        return []
      }
    }

    function writeWatchlist(entries) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
      } catch {
        /* a full or blocked localStorage must not break the page */
      }
    }

    function readSource() {
      try {
        const raw = window.localStorage.getItem(SOURCE_KEY)
        return SOURCE_OPTIONS.some(([key]) => key === raw) ? raw : 'anilist'
      } catch {
        return 'anilist'
      }
    }

    function writeSource(value) {
      try {
        window.localStorage.setItem(SOURCE_KEY, value)
      } catch {
        /* the choice simply is not remembered */
      }
    }

    function itemFromMedia(media) {
      return {
        id: media.id,
        anilistId: media.anilistId ?? null,
        title: media.title ?? '',
        cover: media.cover ?? null,
        total: typeof media.episodes === 'number' ? media.episodes : null,
        watched: 0,
        score: media.score ?? null,
        status: media.status ?? null,
        siteUrl: media.siteUrl ?? media.url ?? null,
        anichId: media.anichId ?? null,
        source: media.source ?? 'anilist',
        addedAt: Date.now(),
      }
    }

    /**
     * Fold a detail response over the list row it came from, without letting an
     * empty field win. The detail endpoint answers with the fields it happens to
     * know: a show with no score yet, no synopsis, no episode count would
     * otherwise wipe the very values the row already carried.
     */
    function mergeDetail(base, extra) {
      if (extra === null || extra === undefined) return base
      const out = { ...base }
      for (const [key, value] of Object.entries(extra)) {
        if (value === undefined || value === null) continue
        if (typeof value === 'string' && value.trim() === '') continue
        if (Array.isArray(value) && value.length === 0) continue
        out[key] = value
      }
      return out
    }

    /**
     * Which site the "去源头看" button leads to. It used to say AniList no
     * matter which database the row came from.
     */
    function siteName(media) {
      if (media?.source === 'bangumi') return 'Bangumi'
      if (media?.source === 'anich') return 'AniCh'
      if (media?.source === 'animeko') return 'Animeko'
      return 'AniList'
    }

    /* ------------------------------------------------------------------ *
     * Icons
     * ------------------------------------------------------------------ */

    const svg = (children, size, viewBox = '0 0 24 24') =>
      h(
        'svg',
        {
          width: size,
          height: size,
          viewBox,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        children,
      )

    function Mark({ size = 18 }) {
      // 黑色、不带底板：图标只画字形（书架 + 播放三角），不再自带渐变方块。
      // 颜色走 label-primary，浅色主题下就是近黑的 #1f2430，深色主题自动反过来，
      // 用写死的 #000 在深色主题里会直接看不见。
      const ink = 'var(--dsw-alias-label-primary,#111)'
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 64 64',
          fill: ink,
          'aria-hidden': 'true',
          className: 'dshan-mark',
          style: { color: ink },
        },
        h('path', { d: 'M13 16.6h38a2.2 2.2 0 0 1 0 4.4H13a2.2 2.2 0 0 1 0-4.4Z' }),
        h('path', { d: 'M17.4 23.6h3.6v24h-3.6zM43 23.6h3.6v24H43z' }),
        h('path', { d: 'M23.4 25.4h17.2v3.4H23.4z', opacity: 0.72 }),
        h('path', {
          d: 'M28.6 41.6c0-.9.5-1.7 1.3-2.1l8.4-4.6a2.3 2.3 0 0 1 3.4 2v9.2a2.3 2.3 0 0 1-3.4 2l-8.4-4.6c-.8-.4-1.3-1.2-1.3-2.1Z',
        }),
      )
    }

    const IconRefresh = ({ size = 14 }) =>
      svg(
        [
          h('path', { key: 'a', d: 'M20 11a8 8 0 1 0-2.3 5.7' }),
          h('path', { key: 'b', d: 'M20 4v7h-7' }),
        ],
        size,
      )

    const IconClose = ({ size = 14 }) =>
      svg([h('path', { key: 'a', d: 'M6 6l12 12M18 6L6 18' })], size)

    const IconExternal = ({ size = 12 }) =>
      svg(
        [
          h('path', { key: 'a', d: 'M14 4h6v6' }),
          h('path', { key: 'b', d: 'M20 4l-9 9' }),
          h('path', { key: 'c', d: 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5' }),
        ],
        size,
      )

    /* ------------------------------------------------------------------ *
     * Presentational pieces
     * ------------------------------------------------------------------ */

    function Cover({ src, alt, fallback, ratio }) {
      const [broken, setBroken] = useState(false)
      if (typeof src !== 'string' || src === '' || broken) {
        return h('div', { className: 'dshan-ph' }, fallback ?? '')
      }
      return h('img', {
        src,
        alt: alt ?? '',
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        onError: () => setBroken(true),
        style: ratio ? { aspectRatio: ratio } : undefined,
      })
    }

    function ScoreBadge({ score }) {
      if (typeof score !== 'number' || score <= 0) return null
      // AniList scores 0–100, Bangumi and Animeko score 0–10; only the colour
      // is normalised, the number stays the one the source printed.
      const scaled = score <= 10.5 ? score * 10 : score
      const tone = scaled >= 78 ? 'high' : scaled >= 62 ? 'mid' : ''
      return h('span', { className: `dshan-score ${tone}`.trim() }, score)
    }

    function Card({ media, followed, onToggle, onOpen, T }) {
      const meta = []
      if (media.season && media.seasonYear) meta.push(`${media.seasonYear} ${seasonLabel(media.season, T)}`)
      else if (media.seasonYear) meta.push(String(media.seasonYear))
      if (typeof media.episodes === 'number') meta.push(`${media.episodes}${T('episodes')}`)
      if (media.format) meta.push(media.format)
      return h(
        'div',
        {
          className: 'dshan-card',
          onClick: () => onOpen(media),
          role: 'button',
          tabIndex: 0,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') onOpen(media)
          },
        },
        h(
          'div',
          { className: 'dshan-cover' },
          h(Cover, { src: media.cover, alt: media.title, fallback: T('noCover') }),
          h(ScoreBadge, { score: media.score }),
          media.status === 'RELEASING' ? h('span', { className: 'dshan-epflag' }, T('airingNow')) : null,
        ),
        h(
          'div',
          { className: 'dshan-cardbody' },
          h('div', { className: 'dshan-cardtitle', title: displayTitle(media) }, displayTitle(media)),
          h('div', { className: 'dshan-cardmeta' }, meta.filter(Boolean).join(' · ')),
          h(
            'button',
            {
              className: 'dshan-follow',
              'data-on': followed ? 'true' : 'false',
              onClick: (event) => {
                event.stopPropagation()
                onToggle(media)
              },
            },
            followed ? T('following') : T('follow'),
          ),
        ),
      )
    }

    function State({ tone, children, action, actionLabel }) {
      return h(
        'div',
        { className: `dshan-state${tone === 'error' ? ' error' : ''}` },
        h('div', null, children),
        action
          ? h('button', { className: 'dshan-btn', onClick: action }, actionLabel ?? '')
          : null,
      )
    }

    function Skeletons({ count = 10 }) {
      return h(
        'div',
        { className: 'dshan-grid' },
        Array.from({ length: count }, (_value, index) => h('div', { className: 'dshan-skeleton', key: index })),
      )
    }

    /* ------------------------------------------------------------------ *
     * Tabs
     * ------------------------------------------------------------------ */

    /** The error line for a failed source: name the one that actually failed. */
    function sourceDownLabel(source, T) {
      if (source === 'animeko') return T('animekoDown')
      if (source === 'bangumi') return T('bangumiDown')
      return T('anilistDown')
    }

    function SeasonTab({ T, followedIds, onToggle, onOpen, source }) {
      const initial = useMemo(() => {
        const now = new Date()
        const month = now.getMonth() + 1
        const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL'
        return { season, year: now.getFullYear() }
      }, [])
      const [season, setSeason] = useState(initial.season)
      const [year, setYear] = useState(initial.year)
      const [sort, setSort] = useState('popular')
      const [pages, setPages] = useState(1)
      const [extra, setExtra] = useState([])
      const [more, setMore] = useState({ status: 'idle', error: '' })

      // Each database gets its own seasonal endpoint: AniList paginates by
      // page, Bangumi answers a v0 search over an air_date range, Animeko
      // exposes its quarterly schedule.
      const path =
        source === 'animeko'
          ? `${API}/animeko/season?season=${season}&year=${year}&sort=${sort}`
          : source === 'anich'
            ? `${API}/anich/season?season=${season}&year=${year}`
            : source === 'bangumi'
              ? `${API}/bangumi/season?season=${season}&year=${year}`
              : `${API}/anilist/season?season=${season}&year=${year}&sort=${sort}&perPage=30&page=1`
      const first = useEndpoint(path)

      useEffect(() => {
        setPages(1)
        setExtra([])
        setMore({ status: 'idle', error: '' })
      }, [season, year, sort])

      const items = useMemo(() => {
        const base = Array.isArray(first.data?.items) ? first.data.items : []
        return base.concat(extra)
      }, [first.data, extra])

      const loadMore = () => {
        if (source !== 'anilist') return
        const next = pages + 1
        setMore({ status: 'loading', error: '' })
        fetchJson(`${API}/anilist/season?season=${season}&year=${year}&sort=${sort}&perPage=30&page=${next}`)
          .then((data) => {
            setExtra((current) => current.concat(Array.isArray(data?.items) ? data.items : []))
            setPages(next)
            setMore({ status: 'idle', error: '' })
          })
          .catch((error) => setMore({ status: 'error', error: error?.message ?? 'failed' }))
      }

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dshan-toolbar' },
          h(
            'select',
            { className: 'dshan-select', value: season, onChange: (event) => setSeason(event.target.value) },
            h('option', { value: 'WINTER' }, T('winter')),
            h('option', { value: 'SPRING' }, T('spring')),
            h('option', { value: 'SUMMER' }, T('summer')),
            h('option', { value: 'FALL' }, T('fall')),
          ),
          h('input', {
            className: 'dshan-select',
            style: { width: '86px', textAlign: 'center' },
            type: 'number',
            value: year,
            min: 1940,
            max: 2100,
            onChange: (event) => {
              const next = Number.parseInt(event.target.value, 10)
              if (Number.isFinite(next)) setYear(next)
            },
          }),
          h(
            'select',
            { className: 'dshan-select', value: sort, onChange: (event) => setSort(event.target.value) },
            h('option', { value: 'popular' }, T('sortPopular')),
            h('option', { value: 'score' }, T('sortScore')),
            h('option', { value: 'newest' }, T('sortNewest')),
            h('option', { value: 'title' }, T('sortTitle')),
          ),
        ),
        first.status === 'loading' && items.length === 0
          ? h(Skeletons, { count: 12 })
          : first.status === 'error'
            ? h(State, { tone: 'error', action: first.reload, actionLabel: T('retry') }, first.error || sourceDownLabel(source, T))
            : items.length === 0
              ? h(State, null, T('emptySeason'))
              : h(
                  'div',
                  null,
                  h(
                    'div',
                    { className: 'dshan-grid' },
                    items.map((media) =>
                      h(Card, {
                        key: media.id,
                        media,
                        T,
                        followed: followedIds.has(media.id),
                        onToggle,
                        onOpen,
                      }),
                    ),
                  ),
                  source === 'anilist' && (first.data?.hasNextPage || more.status !== 'idle')
                    ? h(
                        'div',
                        { style: { display: 'flex', justifyContent: 'center', marginTop: '16px' } },
                        h(
                          'button',
                          { className: 'dshan-btn', onClick: loadMore, disabled: more.status === 'loading' },
                          more.status === 'loading' ? T('loading') : T('loadMore'),
                        ),
                      )
                    : null,
                ),
      )
    }

    function AiringTab({ T, followedIds, onToggle, onOpen, source }) {
      // AniList answers a rolling 7-day window from "now", Animeko answers the
      // same window but wants the day and the zone spelled out.
      const today = useMemo(() => {
        const now = new Date()
        const pad = (value) => String(value).padStart(2, '0')
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      }, [])
      const timeZone = useMemo(() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
        } catch {
          return 'Asia/Shanghai'
        }
      }, [])
      const week = useEndpoint(
        source === 'animeko'
          ? `${API}/animeko/airing?today=${today}&tz=${encodeURIComponent(timeZone)}`
          : source === 'bangumi'
            ? null
            : `${API}/anilist/airing`,
      )
      // Bangumi has no "airing soon" feed; its weekly calendar is the closest
      // thing, and it is worth showing next to AniList's window.
      const calendar = useEndpoint(source === 'animeko' ? null : `${API}/bangumi/calendar`)
      const [selected, setSelected] = useState(() => dayKey(Math.floor(Date.now() / 1000)))
      const rowPrefix = source === 'animeko' ? 'animeko' : 'anilist'

      const days = useMemo(() => {
        const base = new Date()
        base.setHours(0, 0, 0, 0)
        return Array.from({ length: 7 }, (_value, index) => {
          const date = new Date(base.getTime() + index * 86400000)
          const seconds = Math.floor(date.getTime() / 1000)
          return { key: dayKey(seconds), label: dayLabelOf(seconds, T), date: shortDate(seconds) }
        })
      }, [T])

      const byDay = useMemo(() => {
        const map = new Map()
        const items = Array.isArray(week.data?.items) ? week.data.items : []
        for (const item of items) {
          const key = dayKey(item.airingAt)
          if (!map.has(key)) map.set(key, [])
          map.get(key).push(item)
        }
        return map
      }, [week.data])

      const rows = byDay.get(selected) ?? []

      // Bangumi's calendar is indexed by weekday 1..7 (Mon..Sun).
      const bangumiDay = useMemo(() => {
        const list = Array.isArray(calendar.data?.days) ? calendar.data.days : []
        if (list.length === 0) return null
        const target = new Date(`${selected}T12:00:00`)
        const weekday = target.getDay() === 0 ? 7 : target.getDay()
        return list.find((day) => day?.weekday?.id === weekday) ?? null
      }, [calendar.data, selected])

      const dayLabel = days.find((day) => day.key === selected)?.label ?? ''

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dshan-toolbar' },
          days.map((day) =>
            h(
              'button',
              {
                key: day.key,
                className: 'dshan-chip',
                'data-active': day.key === selected ? 'true' : 'false',
                onClick: () => setSelected(day.key),
              },
              `${day.label} ${day.date}`,
            ),
          ),
        ),
        source === 'bangumi'
          ? null
          : week.status === 'loading' && rows.length === 0
            ? h(Skeletons, { count: 6 })
            : week.status === 'error'
              ? h(State, { tone: 'error', action: week.reload, actionLabel: T('retry') }, week.error || sourceDownLabel(source, T))
              : rows.length === 0
                ? h(State, null, T('emptyAiring'))
                : h(
                  'div',
                  { className: 'dshan-rows' },
                  rows.map((row) =>
                    h(
                      'div',
                      {
                        className: 'dshan-row',
                        key: row.id,
                        onClick: () =>
                          onOpen({
                            id: `${rowPrefix}-${row.mediaId}`,
                            ...(rowPrefix === 'animeko'
                              ? { animekoId: row.mediaId, bgmId: row.mediaId }
                              : { anilistId: row.mediaId }),
                            title: row.title,
                            cover: row.cover,
                            episodes: row.episodes,
                            score: row.score,
                            siteUrl: row.siteUrl,
                            source: rowPrefix,
                          }),
                      },
                      h('div', { className: 'dshan-rowtime' }, clockOf(row.airingAt)),
                      h('div', { className: 'dshan-rowcover' }, h(Cover, { src: row.cover, alt: row.title, fallback: '' })),
                      h(
                        'div',
                        { className: 'dshan-rowmain' },
                        h('div', { className: 'dshan-rowtitle' }, row.title),
                        h(
                          'div',
                          { className: 'dshan-rowsub' },
                          `${relativeFuture(row.airingAt, T)}${row.score ? ` · ${T('score')} ${row.score}` : ''}`,
                        ),
                      ),
                      h('span', { className: 'dshan-eptag' }, `EP ${row.episode ?? '?'}`),
                      h(
                        'button',
                        {
                          className: 'dshan-follow',
                          style: { width: '62px', marginTop: 0 },
                          'data-on': followedIds.has(`${rowPrefix}-${row.mediaId}`) ? 'true' : 'false',
                          onClick: (event) => {
                            event.stopPropagation()
                            onToggle({
                              id: `${rowPrefix}-${row.mediaId}`,
                              ...(rowPrefix === 'animeko'
                                ? { animekoId: row.mediaId, bgmId: row.mediaId }
                                : { anilistId: row.mediaId }),
                              title: row.title,
                              cover: row.cover,
                              episodes: row.episodes,
                              score: row.score,
                              siteUrl: row.siteUrl,
                              source: rowPrefix,
                            })
                          },
                        },
                        followedIds.has(`${rowPrefix}-${row.mediaId}`) ? T('following') : T('follow'),
                      ),
                    ),
                  ),
                ),
        calendar.status === 'error'
          ? h('div', { className: 'dshan-state' }, T('bangumiDown'))
          : bangumiDay !== null && Array.isArray(bangumiDay.items) && bangumiDay.items.length > 0
            ? h(
                'div',
                null,
                h('div', { className: 'dshan-section' }, `${T('weeklyFrom')} · ${dayLabel}`),
                h(
                  'div',
                  { className: 'dshan-rows' },
                  bangumiDay.items.map((item) =>
                    h(
                      'div',
                      {
                        className: 'dshan-row',
                        key: item.id,
                        onClick: () =>
                          onOpen({
                            id: item.id,
                            title: item.title,
                            cover: item.cover,
                            episodes: item.episodes,
                            score: item.score,
                            siteUrl: item.url,
                            season: null,
                            seasonYear: item.date ? Number(String(item.date).slice(0, 4)) : null,
                            source: 'bangumi',
                          }),
                      },
                      h('div', { className: 'dshan-rowtime' }, '—'),
                      h('div', { className: 'dshan-rowcover' }, h(Cover, { src: item.cover, alt: item.title, fallback: '' })),
                      h(
                        'div',
                        { className: 'dshan-rowmain' },
                        h('div', { className: 'dshan-rowtitle' }, displayTitle(item)),
                        h('div', { className: 'dshan-rowsub' }, item.titleOriginal || altTitle(item, displayTitle(item))),
                      ),
                      h('span', { className: 'dshan-eptag' }, 'Bangumi'),
                    ),
                  ),
                ),
              )
            : null,
      )
    }

    /* --- 浏览页用的小图标：16×16 描边，跟侧栏文字同色 --- */
    function Ico({ d, fill }) {
      return h(
        'svg',
        {
          width: 15,
          height: 15,
          viewBox: '0 0 24 24',
          fill: fill ? 'currentColor' : 'none',
          stroke: fill ? 'none' : 'currentColor',
          strokeWidth: 1.9,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d }),
      )
    }

    const ICO = {
      search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16.2 16.2 21 21',
      film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4',
      sort: 'M3 6h11M3 12h7M3 18h4M17 6v12M14 15l3 3 3-3',
      genre: 'M12 3l2.6 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.3 9.4l6.1-.8z',
      tag: 'M20.6 13.4 13 21 3 11V3h8l9.6 9.6a1.4 1.4 0 0 1 0 .8ZM7.5 7.5h.01',
      grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
      calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
      clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
      score: 'M12 3l2.6 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.3 9.4l6.1-.8z',
      trash: 'M3 6h18M8 6V3.8h8V6M5.5 6l1 14h11l1-14',
      adult: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8v8M8 12h8',
    }

    /** One sidebar row whose value comes from a <select> laid under it. */
    function RailSelect({ icon, label, value, options, onChange }) {
      const current = options.find((option) => option.value === (value ?? '')) ?? null
      const text = current?.label ?? label
      return h(
        'div',
        { className: 'dshan-railrow', 'data-active': text === label ? 'false' : 'true', title: label },
        h('span', { className: 'dshan-railicon' }, h(Ico, { d: icon })),
        h('span', { className: 'dshan-raillabel' }, text),
        h('span', { className: 'dshan-railchev' }, '\u25be'),
        h(
          'select',
          {
            value: value ?? '',
            'aria-label': label,
            onChange: (event) => onChange(event.target.value),
          },
          options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
        ),
      )
    }

    /** A poster card shaped like the reference: cover, corner action, clamp title. */
    function BrowseCard({ media, onOpen, T }) {
      const title = displayTitle(media)
      const when =
        media.season && media.seasonYear
          ? `${seasonLabel(media.season, T)} ${media.seasonYear}`
          : media.seasonYear
            ? String(media.seasonYear)
            : ''
      return h(
        'button',
        {
          className: 'dshan-bcard',
          type: 'button',
          onClick: () => onOpen(media),
          title,
        },
        h(
          'div',
          { className: 'dshan-bcover' },
          h(Cover, { src: media.cover, alt: title, fallback: T('noCover') }),
          media.status === 'RELEASING' ? h('span', { className: 'dshan-bflag' }, T('airingNow')) : null,
          media.score ? h('span', { className: 'dshan-bscore' }, `\u2605 ${media.score}`) : null,
        ),
        h('div', { className: 'dshan-btitle' }, title),
        h(
          'div',
          { className: 'dshan-bmeta' },
          when,
          typeof media.episodes === 'number' ? h('span', null, `\u00b7 ${media.episodes}${T('episodes')}`) : null,
        ),
      )
    }

    /**
     * Browse: a filter rail on the left, a dense poster grid on the right.
     *
     * Every control maps to a real AniList facet through `/anilist/browse`, so
     * what the rail says is what the query asks — no decorative dropdowns.
     * The cross-database buttons search Bangumi / Animeko with the same words
     * and land their own grids underneath.
     */
    function SearchTab({ T, followedIds, onToggle, onOpen, source }) {
      const [term, setTerm] = useState('')
      const [debounced, setDebounced] = useState('')
      const [genre, setGenre] = useState('')
      const [tag, setTag] = useState('')
      const [format, setFormat] = useState('')
      const [season, setSeason] = useState('')
      const [year, setYear] = useState('')
      const [status, setStatus] = useState('')
      const [score, setScore] = useState('')
      const [adult, setAdult] = useState(false)
      const [sort, setSort] = useState('')
      const [page, setPage] = useState(1)
      const [items, setItems] = useState([])
      const [total, setTotal] = useState(0)
      const [hasNext, setHasNext] = useState(false)
      const [load, setLoad] = useState({ status: 'idle', error: '' })
      const [bangumi, setBangumi] = useState(null)
      const [animeko, setAnimeko] = useState(null)

      useEffect(() => {
        const timer = setTimeout(() => setDebounced(term.trim()), 350)
        return () => clearTimeout(timer)
      }, [term])

      // Any filter change starts a new result set; `page` only grows through
      // "load more", so the two are separate dependencies.
      useEffect(() => {
        setPage(1)
      }, [debounced, genre, tag, format, season, year, status, score, adult, sort])

      const query = useMemo(() => {
        const parts = []
        if (debounced !== '') parts.push(`q=${encodeURIComponent(debounced)}`)
        if (genre !== '') parts.push(`genre=${encodeURIComponent(genre)}`)
        if (tag !== '') parts.push(`tag=${encodeURIComponent(tag)}`)
        if (format !== '') parts.push(`format=${format}`)
        if (season !== '') parts.push(`season=${season}`)
        if (year !== '') parts.push(`year=${year}`)
        if (status !== '') parts.push(`status=${status}`)
        if (score !== '') parts.push(`score=${score}`)
        if (adult) parts.push('adult=1')
        if (sort !== '') parts.push(`sort=${sort}`)
        parts.push(`page=${page}`)
        parts.push('perPage=42')
        return parts.join('&')
      }, [debounced, genre, tag, format, season, year, status, score, adult, sort, page])

      useEffect(() => {
        let dropped = false
        setLoad((current) => ({ status: page === 1 ? 'loading' : 'more', error: current.error }))
        fetchJson(`${API}/anilist/browse?${query}`)
          .then((data) => {
            if (dropped) return
            const next = Array.isArray(data?.items) ? data.items : []
            setItems((current) => (page === 1 ? next : [...current, ...next]))
            setTotal(Number(data?.total) || 0)
            setHasNext(data?.hasNextPage === true)
            setLoad({ status: 'ready', error: '' })
          })
          .catch((error) => {
            if (dropped) return
            setLoad({ status: 'error', error: error?.message ?? 'failed' })
          })
        return () => {
          dropped = true
        }
      }, [query, page])

      // A new word or a source switch makes the extra results stale.
      useEffect(() => {
        setBangumi(null)
        setAnimeko(null)
      }, [debounced, source])

      const runBangumi = () => {
        if (debounced === '') return
        setBangumi({ status: 'loading', items: [], error: '' })
        fetchJson(`${API}/bangumi/search?q=${encodeURIComponent(debounced)}`)
          .then((data) => setBangumi({ status: 'ready', items: Array.isArray(data?.items) ? data.items : [], error: '' }))
          .catch((error) => setBangumi({ status: 'error', items: [], error: error?.message ?? 'failed' }))
      }

      const runAnimeko = () => {
        if (debounced === '') return
        setAnimeko({ status: 'loading', items: [], error: '' })
        fetchJson(`${API}/animeko/search?q=${encodeURIComponent(debounced)}&limit=24`)
          .then((data) => setAnimeko({ status: 'ready', items: Array.isArray(data?.items) ? data.items : [], error: '' }))
          .catch((error) => setAnimeko({ status: 'error', items: [], error: error?.message ?? 'failed' }))
      }

      const clearAll = () => {
        setTerm('')
        setDebounced('')
        setGenre('')
        setTag('')
        setFormat('')
        setSeason('')
        setYear('')
        setStatus('')
        setScore('')
        setAdult(false)
        setSort('')
      }

      const any = T('any')
      const years = useMemo(() => {
        const current = new Date().getFullYear() + 1
        const list = [{ value: '', label: T('anyYears') }]
        for (let value = current; value >= 1970; value -= 1) list.push({ value: String(value), label: String(value) })
        return list
      }, [T])

      const extra = [
        source === 'bangumi' ? null : ['bangumi', bangumi, runBangumi, T('searchBangumi'), T('bangumiResults'), T('bangumiDown')],
        source === 'animeko' ? null : ['animeko', animeko, runAnimeko, T('searchAnimeko'), T('animekoResults'), T('animekoDown')],
      ].filter(Boolean)

      return h(
        'div',
        { className: 'dshan-browse' },
        h(
          'div',
          { className: 'dshan-rail' },
          h(
            'div',
            { className: 'dshan-railrow dshan-railinput', 'data-active': term === '' ? 'false' : 'true' },
            h('span', { className: 'dshan-railicon' }, h(Ico, { d: ICO.search })),
            h('input', {
              placeholder: T('browseTitlePh'),
              value: term,
              'aria-label': T('browseTitle'),
              onChange: (event) => setTerm(event.target.value),
              autoFocus: true,
            }),
          ),
          h(RailSelect, {
            icon: ICO.sort,
            label: T('browseSort'),
            value: sort,
            onChange: setSort,
            options: [
              { value: '', label: debounced !== '' ? T('sortRelevance') : T('sortPopular') },
              { value: 'POPULARITY_DESC', label: T('sortPopular') },
              { value: 'SCORE_DESC', label: T('sortScore') },
              { value: 'TRENDING_DESC', label: T('sortTrending') },
              { value: 'START_DATE_DESC', label: T('sortNewest') },
              { value: 'TITLE_ROMAJI', label: T('sortName') },
            ],
            T,
          }),
          h(RailSelect, {
            icon: ICO.genre,
            label: T('anyGenres'),
            value: genre,
            onChange: setGenre,
            options: [
              { value: '', label: T('anyGenres') },
              ...['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'].map((name) => ({ value: name, label: name })),
            ],
            T,
          }),
          h(
            'div',
            { className: 'dshan-railrow dshan-railinput', 'data-active': tag === '' ? 'false' : 'true' },
            h('span', { className: 'dshan-railicon' }, h(Ico, { d: ICO.tag })),
            h('input', {
              placeholder: T('anyTags'),
              value: tag,
              'aria-label': T('browseTag'),
              onChange: (event) => setTag(event.target.value),
            }),
          ),
          h(RailSelect, {
            icon: ICO.grid,
            label: T('anyFormats'),
            value: format,
            onChange: setFormat,
            options: [
              { value: '', label: T('anyFormats') },
              { value: 'TV', label: T('fmtTv') },
              { value: 'MOVIE', label: T('fmtMovie') },
              { value: 'OVA', label: T('fmtOva') },
              { value: 'ONA', label: T('fmtOna') },
              { value: 'SPECIAL', label: T('fmtSpecial') },
            ],
            T,
          }),
          h(RailSelect, {
            icon: ICO.calendar,
            label: T('anySeasons'),
            value: season,
            onChange: setSeason,
            options: [
              { value: '', label: T('anySeasons') },
              { value: 'WINTER', label: seasonLabel('WINTER', T) },
              { value: 'SPRING', label: seasonLabel('SPRING', T) },
              { value: 'SUMMER', label: seasonLabel('SUMMER', T) },
              { value: 'FALL', label: seasonLabel('FALL', T) },
            ],
            T,
          }),
          h(RailSelect, {
            icon: ICO.calendar,
            label: T('anyYears'),
            value: year,
            onChange: setYear,
            options: years,
            T,
          }),
          h(RailSelect, {
            icon: ICO.clock,
            label: T('anyStatuses'),
            value: status,
            onChange: setStatus,
            options: [
              { value: '', label: T('anyStatuses') },
              { value: 'RELEASING', label: T('stAiring') },
              { value: 'FINISHED', label: T('stFinished') },
              { value: 'NOT_YET_RELEASED', label: T('stNotYet') },
              { value: 'HIATUS', label: T('stHiatus') },
              { value: 'CANCELLED', label: T('stCancelled') },
            ],
            T,
          }),
          h(RailSelect, {
            icon: ICO.score,
            label: T('anyScores'),
            value: score,
            onChange: setScore,
            options: [
              { value: '', label: T('anyScores') },
              { value: '90', label: '90+' },
              { value: '80', label: '80+' },
              { value: '70', label: '70+' },
              { value: '60', label: '60+' },
            ],
            T,
          }),
          h(
            'div',
            {
              className: 'dshan-railrow dshan-railtoggle',
              'data-active': adult ? 'true' : 'false',
              onClick: () => setAdult((current) => !current),
              role: 'switch',
              'aria-checked': adult ? 'true' : 'false',
              tabIndex: 0,
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') setAdult((current) => !current)
              },
            },
            h('span', { className: 'dshan-switch', 'data-on': adult ? 'true' : 'false' }),
            h('span', { className: 'dshan-raillabel' }, T('browseAdult')),
          ),
          h(
            'div',
            {
              className: 'dshan-railrow',
              onClick: clearAll,
              role: 'button',
              tabIndex: 0,
              title: T('browseClear'),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') clearAll()
              },
            },
            h('span', { className: 'dshan-railicon' }, h(Ico, { d: ICO.trash })),
            h('span', { className: 'dshan-raillabel' }, T('browseClear')),
          ),
          extra.length === 0
            ? null
            : h(
                'div',
                { className: 'dshan-railfoot' },
                h('div', { className: 'dshan-bmeta' }, T('browseOther')),
                ...extra.map(([key, , run, label]) =>
                  h(
                    'div',
                    {
                      key,
                      className: 'dshan-railrow dshan-railtoggle',
                      onClick: run,
                      role: 'button',
                      tabIndex: 0,
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') run()
                      },
                    },
                    h('span', { className: 'dshan-railicon' }, h(Ico, { d: ICO.search })),
                    h('span', { className: 'dshan-raillabel' }, label),
                  ),
                ),
              ),
        ),
        h(
          'div',
          { className: 'dshan-bmain' },
          load.status === 'error'
            ? h(State, { tone: 'error', action: () => setPage(1), actionLabel: T('retry') }, load.error || sourceDownLabel('anilist', T))
            : null,
          load.status === 'loading' && items.length === 0 ? h(Skeletons, { count: 12 }) : null,
          items.length === 0 && load.status !== 'loading' && load.status !== 'error'
            ? h('div', { className: 'dshan-bempty' }, T('browseEmpty'))
            : null,
          items.length === 0
            ? null
            : h(
                'div',
                { className: 'dshan-bgrid' },
                items.map((media) => h(BrowseCard, { key: media.id, media, onOpen, T })),
              ),
          items.length === 0
            ? null
            : h(
                'div',
                { className: 'dshan-bmeta', style: { justifyContent: 'space-between' } },
                h('span', null, `${T('browseCount')} ${total}`),
                hasNext
                  ? h(
                      'button',
                      {
                        className: 'dshan-btn',
                        onClick: () => setPage((current) => current + 1),
                        disabled: load.status === 'more',
                      },
                      load.status === 'more' ? T('loading') : T('browseMore'),
                    )
                  : null,
              ),
          ...extra.map(([key, state, , , heading, down]) =>
            state === null
              ? null
              : h(
                  'div',
                  { key: `extra-${key}` },
                  h('div', { className: 'dshan-section' }, heading),
                  state.status === 'loading'
                    ? h(State, null, T('loading'))
                    : state.status === 'error'
                      ? h(State, { tone: 'error' }, state.error || down)
                      : h(
                          'div',
                          { className: 'dshan-grid' },
                          state.items.map((item) =>
                            h(Card, {
                              key: item.id,
                              media: item,
                              T,
                              followed: followedIds.has(item.id),
                              onToggle,
                              onOpen,
                            }),
                          ),
                        ),
                ),
          ),
        ),
      )
    }

    function MineTab({ T, entries, onToggle, onOpen, onProgress }) {
      // AniCh list rows are allowed to arrive without a total ("1 集" for a film
      // is a real answer, `null` is not), so the card asks the detail endpoint
      // once per entry that is missing one and remembers the answer.
      const [totals, setTotals] = useState({})
      const missingKey = entries
        .filter((entry) => entry.source === 'anich' && (typeof entry.total !== 'number' || entry.total <= 0))
        .map((entry) => entry.id)
        .filter((id) => totals[id] === undefined)
        .join(',')
      useEffect(() => {
        if (missingKey === '') return undefined
        let dropped = false
        for (const id of missingKey.split(',')) {
          const numeric = String(id).replace(/^anich-/, '')
          if (!/^\d+$/.test(numeric)) continue
          fetchJson(`${API}/anich/detail?id=${numeric}`)
            .then((data) => {
              if (dropped) return
              const count = typeof data?.episodes === 'number' && data.episodes > 0 ? data.episodes : null
              setTotals((current) => (current[id] === count ? current : { ...current, [id]: count }))
            })
            .catch(() => {
              // A failed lookup leaves the card exactly as it was: "已看 3 集"
              // without a denominator beats a card that disappears.
              if (!dropped) setTotals((current) => (current[id] === null ? current : { ...current, [id]: null }))
            })
        }
        return () => {
          dropped = true
        }
      }, [missingKey])
      if (entries.length === 0) {
        return h(State, null, T('emptyMine'))
      }
      const sorted = entries.slice().sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      return h(
        'div',
        { className: 'dshan-mine' },
        sorted.map((entry) => {
          const fromDetail = typeof totals[entry.id] === 'number' ? totals[entry.id] : 0
          const rawTotal =
            typeof entry.total === 'number' && entry.total > 0 ? entry.total : fromDetail > 0 ? fromDetail : null
          const total = rawTotal
          const ratio = total === null ? 0 : Math.min(100, Math.round(((entry.watched ?? 0) / total) * 100))
          return h(
            'div',
            { className: 'dshan-mineitem', key: entry.id },
            h(
              'div',
              { className: 'dshan-minecover', onClick: () => onOpen(entry) },
              h(Cover, { src: entry.cover, alt: entry.title, fallback: '' }),
            ),
            h(
              'div',
              { className: 'dshan-minemain' },
              h(
                'div',
                { className: 'dshan-minetop' },
                h('div', { className: 'dshan-minetitle', onClick: () => onOpen(entry), title: displayTitle(entry) }, displayTitle(entry)),
                h(
                  'button',
                  { className: 'dshan-mini danger', onClick: () => onToggle(entry) },
                  T('remove'),
                ),
              ),
              h(
                'div',
                { className: 'dshan-mineline' },
                total === null
                  ? `${T('watchedEps')} ${entry.watched ?? 0}`
                  : `${T('watchedEps')} ${entry.watched ?? 0} / ${T('ofEps')} ${total}${T('episodes')}`,
                entry.score ? `· ${T('score')} ${entry.score}` : '',
                entry.status ? `· ${statusLabel(entry.status, T)}` : '',
              ),
              h('div', { className: 'dshan-bar' }, h('span', { style: { width: `${ratio}%` } })),
              h(
                'div',
                { className: 'dshan-mineline' },
                h('button', { className: 'dshan-mini', onClick: () => onProgress(entry, 1), title: T('plusOne') }, '+1'),
                h('button', { className: 'dshan-mini', onClick: () => onProgress(entry, -1), title: T('minusOne') }, '−1'),
                entry.siteUrl
                  ? h(
                      'a',
                      {
                        className: 'dshan-mini',
                        href: entry.siteUrl,
                        target: '_blank',
                        rel: 'noreferrer',
                        style: { textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
                      },
                      entry.source === 'bangumi'
                        ? T('bangumiPage')
                        : entry.source === 'anich'
                          ? T('anichPage')
                          : T('anilistPage'),
                    )
                  : null,
              ),
            ),
          )
        }),
      )
    }

        function SourcesTab({ T, onChanged }) {
      const [kind, setKind] = useState('all')
      const [term, setTerm] = useState('')
      const [editing, setEditing] = useState(null)
      const [viewing, setViewing] = useState(null)
      const [pendingId, setPendingId] = useState('')
      const [toggleError, setToggleError] = useState('')
      const extensions = useEndpoint(`${API}/extensions`)

      const installed = Array.isArray(extensions.data?.items) ? extensions.data.items : []
      const needle = term.trim().toLowerCase()

      // The Seanime catalogue that used to fill a second tab listed 99 providers
      // none of which this plugin can run, so every card only ever said
      // "not integrated": the list was pure noise and is gone.
      const shown = useMemo(() => {
        const pool = installed
        return pool.filter((entry) => {
          if (kind !== 'all' && entry.type !== undefined && entry.type !== kind) return false
          if (kind !== 'all' && entry.type === undefined && entry.kind !== kind) return false
          if (needle === '') return true
          return `${entry.name} ${entry.author ?? ''} ${entry.description ?? ''}`.toLowerCase().includes(needle)
        })
      }, [kind, needle, installed])

      // A swallowed failure looks exactly like "the switch does nothing", which
      // is what the开关 complained about, so the reason is shown next to the grid.
      const toggle = async (entry) => {
        if (pendingId !== '') return
        setPendingId(entry.id)
        setToggleError('')
        try {
          await postJson(`${API}/extensions/toggle`, { id: entry.id, enabled: !entry.enabled })
          extensions.reload()
          // The header's source switcher mirrors these switches, so it is told
          // immediately instead of waiting for its next poll.
          if (typeof onChanged === 'function') onChanged()
        } catch (error) {
          setToggleError(`${entry.name}：${error?.message ?? String(error)}`)
        } finally {
          setPendingId('')
        }
      }

      const kinds = [
        ['all', T('all')],
        ['data', T('extTypeData')],
        ['torrent', T('extTypeTorrent')],
        ['online', T('extTypeOnline')],
      ]

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dshan-toolbar', style: { alignItems: 'flex-start', gap: '10px' } },
          h(
            'div',
            { style: { flex: '1', minWidth: '180px' } },
            h('div', { className: 'dshan-settings-title', style: { fontSize: '17px' } }, T('extTitle')),
            h(
              'div',
              { className: 'dshan-settings-sub' },
              T('extLead'),
            ),
          ),
          h(
            'button',
            { type: 'button', className: 'dshan-btn', disabled: true },
            `${T('extInstalled')} ${installed.length}`,
          ),
        ),
        h(
          'div',
          { className: 'dshan-toolbar' },
          kinds.map(([value, label]) =>
            h(
              'button',
              {
                key: value,
                type: 'button',
                className: 'dshan-chip',
                'data-active': kind === value ? 'true' : 'false',
                onClick: () => setKind(value),
              },
              label,
            ),
          ),
          h('input', {
            className: 'dshan-input',
            style: { marginLeft: 'auto', width: '220px' },
            value: term,
            placeholder: T('extSearchPlaceholder'),
            onChange: (event) => setTerm(event.currentTarget.value),
          }),
        ),
        toggleError === ''
          ? null
          : h(
              'div',
              { className: 'dshan-pluginerror', role: 'alert' },
              h('span', null, toggleError),
            ),
        shown.length === 0
          ? h('div', { className: 'dshan-empty' }, kind !== 'all' ? T('extAllOff') : T('extNoMatch'))
          : h(
              'div',
              { className: 'dshan-ext-grid' },
              shown.map((entry) =>
                h(ExtensionCard, {
                  key: entry.id,
                  entry,
                  T,
                  onToggle: () => toggle(entry),
                  onPrefs: () => setEditing(entry),
                  onSource: () => setViewing(entry),
                }),
              ),
            ),
        editing === null
          ? null
          : (() => {
              const current =
                typeof editing === 'string' ? installed.find((item) => item.id === editing) ?? null : editing
              if (current === null) return null
              return h(ExtensionPrefs, {
                entry: current,
                T,
                onClose: () => setEditing(null),
                onSaved: extensions.reload,
              })
            })(),
        viewing === null ? null : h(SourceViewer, { entry: viewing, T, onClose: () => setViewing(null) }),
      )
    }

    function usePoll(path, intervalMs, enabled) {
      const [state, setState] = useState({ data: null, error: '' })
      useEffect(() => {
        if (!enabled || path === null) return undefined
        let cancelled = false
        const tick = () => {
          fetchJson(path)
            .then((data) => {
              if (!cancelled) setState({ data, error: '' })
            })
            .catch((error) => {
              if (!cancelled) setState((previous) => ({ ...previous, error: error?.message ?? String(error) }))
            })
        }
        tick()
        const handle = window.setInterval(tick, intervalMs)
        return () => {
          cancelled = true
          window.clearInterval(handle)
        }
      }, [path, intervalMs, enabled])
      return state
    }

    const formatCount = (value) => {
      const number = Number(value)
      if (!Number.isFinite(number) || number <= 0) return '0'
      if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`
      if (number >= 10000) return `${(number / 10000).toFixed(1)}万`
      return String(Math.round(number))
    }

    const formatBytes = (bytes) => {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return ''
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let index = 0
      let size = value
      while (size >= 1024 && index < units.length - 1) {
        size /= 1024
        index += 1
      }
      return `${size.toFixed(size >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
    }

    const isVideoName = (name) => /\.(mkv|mp4|m4v|avi|webm|mov|ts)$/i.test(String(name ?? ''))

    /**
     * Which file to play.
     *
     * A season pack holds every episode, so picking files[0] would always play
     * episode 1. When the release carries an episode number this matches it in
     * the file names (`E02`, ` - 02`, `第02话`) and only then falls back to the
     * first video file.
     */
    function chooseFile(files, pick) {
      const videos = (files ?? []).filter((file) => isVideoName(file.name))
      if (videos.length === 0) return (files ?? [])[0]
      const episode = pick?.episode ?? 0
      if (episode > 0 && pick?.batch === true && videos.length > 1) {
        const patterns = [
          new RegExp(`[Ee][Pp]?0*${episode}(?!\\d)`),
          new RegExp(`(?:^|[^\\d])0*${episode}(?:[^\\d]|$)`),
          new RegExp(`第\\s*0*${episode}\\s*[话話集]`),
        ]
        for (const pattern of patterns) {
          const hit = videos.find((file) => pattern.test(file.name) && !/sp|ncop|menu|preview|trailer/i.test(file.name))
          if (hit !== undefined) return hit
        }
      }
      return videos.find((file) => !/sp|ncop|menu|preview|trailer/i.test(file.name)) ?? videos[0]
    }


    const QN_CHOICES = [
      [80, '1080P'],
      [64, '720P'],
      [32, '480P'],
      [16, '360P'],
    ]

    /**
     * Mutations go out as POST; the dsh-app: scheme hands those to the host as
     * GET, so a failed POST is retried through /action?name=&payload=.
     */
    function readResult(response, text) {
      let payload = null
      try {
        payload = text === '' ? null : JSON.parse(text)
      } catch {
        payload = null
      }
      if (!response.ok || payload === null) return null
      if (typeof payload === 'object' && payload.ok === false) {
        throw new Error(payload?.error?.message ?? 'request failed')
      }
      return payload?.data ?? payload
    }

    async function postJson(path, body) {
      const json = JSON.stringify(body ?? {})
      const name = (path.startsWith(API) ? path.slice(API.length) : path).replace(/^\//, '')
      // The desktop shell delivers a mutation to the host as a GET without the
      // body, so the payload travels in the query string; the `/action` twin is
      // the second attempt for hosts that route mutations that way only.
      const query = `payload=${encodeURIComponent(json)}`
      // A hung attempt would look like a dead switch, so each one is bounded.
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(8000)
        : undefined
      const attempts = [
        { url: `${API}/${name}?${query}`, init: { method: 'POST', headers: { accept: 'application/json' }, signal } },
        { url: `${API}/action?name=${encodeURIComponent(name)}&${query}`, init: { headers: { accept: 'application/json' }, signal } },
        { url: `${API}/${name}?${query}`, init: { headers: { accept: 'application/json' }, signal } },
      ]
      let failure = ''
      for (const target of attempts) {
        try {
          console.info('[dsh-anime] mutation attempt', target.init.method ?? 'GET', target.url)
          const response = await fetch(target.url, target.init)
          const text = await response.text().catch(() => '')
          console.info('[dsh-anime] mutation reply', response.status, String(text).slice(0, 200))
          const result = readResult(response, text)
          if (result !== null) return result
          failure = `HTTP ${response.status} ${text.slice(0, 120)}`
          // 404 here is not "no such thing": the route is registered by the
          // host at startup, so a 404 means this host predates the route.
          if (response.status === 404) failure = STALE_ROUTE
        } catch (error) {
          console.info('[dsh-anime] mutation threw', String(error?.message ?? error))
          failure = String(error?.message ?? error)
        }
      }
      console.error('[dsh-anime] mutation failed', path, failure)
      throw new Error(`${name} 失败：${failure}`)
    }

    /* ---- online: bilibili ------------------------------------------- */

    /**
     * The buttons an extension contributed in `manifest.actions`.
     *
     * A source is a data provider: the player, the grid and the navigation stay
     * with the page, and this is the only surface a source owns. `open` sends the
     * user to the site itself (their own search page usually beats ours for
     * brand-new titles), `call` runs a handler the extension registered.
     */
    function ExtensionActions({ id, T }) {
      const info = useEndpoint(`${API}/extensions`)
      const entry = Array.isArray(info.data?.items)
        ? info.data.items.find((item) => item.id === id) ?? null
        : null
      const actions = Array.isArray(entry?.actions) ? entry.actions : []
      if (actions.length === 0) return null
      const english = T('search') === 'Search'
      const press = (action) => {
        if (action.kind === 'open') {
          window.open(action.url, '_blank', 'noreferrer')
          return
        }
        void postJson(`${API}/extensions/action`, { id, action: action.id }).catch(() => undefined)
      }
      return h(
        React.Fragment,
        null,
        actions.map((action) =>
          h(
            'button',
            {
              key: action.id,
              type: 'button',
              className: 'dshan-btn',
              title: action.hint === '' ? action.url : action.hint,
              onClick: () => press(action),
            },
            english && action.labelEn !== '' ? action.labelEn : action.label,
          ),
        ),
      )
    }

    /**
     * Any online source that answers the generic contract: browse covers, look
     * one up by name, pick an episode, switch the line, play. Nothing in here
     * knows the site's name — that is what makes adding a source a manifest
     * change instead of a page change.
     */
    // "Manual search" opens this dialog instead of keeping a search box on the
    // page: browsing the latest release stays the default, searching is a step
    // you take on purpose (same idea as the reference player).
    /**
     * One search dialog for every online source.
     *
     * The title is often written differently per language, so the dialog offers
     * the names the catalog already knows (native / romaji / english) as chips:
     * tap one and it searches immediately. Results are drawn as a poster wall in
     * the dialog itself and picking one opens it in the page behind.
     */
    function OnlineSearchDialog({ title, placeholder, initial, candidates, source, onPick, onCancel, T }) {
      const [value, setValue] = React.useState(initial ?? '')
      const [term, setTerm] = React.useState('')
      const inputRef = React.useRef(null)
      React.useEffect(() => {
        if (inputRef.current !== null) inputRef.current.focus()
      }, [])
      const results = useEndpoint(term === '' ? null : `${API}/online/search?source=${source}&q=${encodeURIComponent(term)}`)
      const items = Array.isArray(results.data?.items) ? results.data.items : []
      const run = (text) => {
        const next = String(text ?? '').trim()
        setValue(next)
        setTerm(next)
      }
      const chips = (Array.isArray(candidates) ? candidates : []).filter((entry) => String(entry ?? '').trim() !== '')
      return h(
        'div',
        { className: 'dshan-modal-mask', onClick: onCancel },
        h(
          'form',
          {
            className: 'dshan-omodal',
            onClick: (event) => event.stopPropagation(),
            onSubmit: (event) => {
              event.preventDefault()
              run(value)
            },
          },
          h('div', { className: 'dshan-omodal-title' }, title),
          chips.length === 0
            ? null
            : h(
                'div',
                { className: 'dshan-omodal-chips' },
                h('span', { className: 'dshan-omodal-hint' }, T('onlineCandidates')),
                chips.map((name) =>
                  h(
                    'button',
                    {
                      key: name,
                      type: 'button',
                      className: 'dshan-chip',
                      'data-active': String(term === name),
                      onClick: () => run(name),
                    },
                    name,
                  ),
                ),
              ),
          h(
            'div',
            { className: 'dshan-omodal-row' },
            h('input', {
              ref: inputRef,
              className: 'dshan-input',
              value: value,
              placeholder: placeholder,
              onChange: (event) => setValue(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Escape') onCancel()
              },
            }),
            h('button', { className: 'dshan-btn primary', type: 'submit' }, T('search')),
          ),
          term === ''
            ? null
            : h(
                'div',
                { className: 'dshan-omodal-results' },
                results.status === 'error'
                  ? h('div', { className: 'dshan-state error' }, results.error?.message ?? T('loadFailed'))
                  : h(
                      'div',
                      { className: 'dshan-grid' },
                      items.map((item) =>
                        h(
                          'button',
                          {
                            key: item.id,
                            type: 'button',
                            className: 'dshan-card',
                            title: item.title,
                            onClick: () => onPick(item),
                          },
                          h(
                            'div',
                            { className: 'dshan-cover' },
                            String(item.cover ?? '') === ''
                              ? h('div', { className: 'dshan-ph' }, T('noCover'))
                              : h('img', {
                                  src: String(item.cover),
                                  alt: '',
                                  loading: 'lazy',
                                  referrerPolicy: 'no-referrer',
                                  onError: (event) => {
                                    const img = event.currentTarget
                                    if (img.dataset.fallback === '1') return
                                    img.dataset.fallback = '1'
                                    img.src = `${API}/online/cover?source=${source}&url=${encodeURIComponent(String(item.cover))}`
                                  },
                                }),
                          ),
                          h(
                            'div',
                            { className: 'dshan-cardbody' },
                            h('div', { className: 'dshan-cardtitle' }, item.title),
                            h(
                              'div',
                              { className: 'dshan-cardmeta' },
                              [item.note, item.year, item.kind, item.area]
                                .filter((value) => value !== undefined && value !== '')
                                .join(' · '),
                            ),
                          ),
                        ),
                      ),
                    ),
                items.length === 0 && results.status === 'ready'
                  ? h('div', { className: 'dshan-empty' }, T('noResults'))
                  : null,
              ),
          h(
            'div',
            { className: 'dshan-omodal-foot' },
            h('button', { className: 'dshan-btn', type: 'button', onClick: onCancel }, T('cancel')),
          ),
        ),
      )
    }

    /**
     * The page every online source shares.
     *
     * Search-first by request: there is no catalog wall, the page opens on the
     * player and the episode rail, and everything else is one dialog away.
     */
    function GenericOnlineView({ source, sourceName, candidates, T }) {
      const [picked, setPicked] = useState(null)
      const [server, setServer] = useState('')
      const [playing, setPlaying] = useState(null)
      const [error, setError] = useState('')
      const [searchOpen, setSearchOpen] = useState(false)
      // Which episode the line list is being shown for. The list is per episode
      // (AniCh answers a different set for every one), so the range query has to
      // carry it once an episode has been played — otherwise the names on screen
      // describe episode 1 while the player is on episode 9.
      const [episodeNo, setEpisodeNo] = useState(0)
      // Tapping a poster is the confirmation: the first episode starts as soon as
      // the line list has loaded, without another click.
      const autoPlay = React.useRef(false)

      // The line list belongs to the anime that is open, not to the site: two
      // shows on the same site are carried by different lines (and a line's sid
      // is per-anime too), so both endpoints carry the picked id.
      const servers = useEndpoint(
        `${API}/online/servers?source=${source}${picked === null ? '' : `&id=${encodeURIComponent(picked.id)}`}${episodeNo > 0 ? `&episode=${episodeNo}` : ''}`,
      )
      const episodes = useEndpoint(
        picked === null
          ? null
          : `${API}/online/episodes?source=${source}&id=${encodeURIComponent(picked.id)}&server=${encodeURIComponent(server)}`,
      )

      const serverList = Array.isArray(servers.data?.items) ? servers.data.items : []
      const serverNames = serverList.map((item) => (typeof item === 'string' ? item : String(item?.name ?? '')))
      const lastTimeRef = React.useRef(0)
      // 站点给的 caption 就是画质（`全集(全高清-1080P) · 1080P`）。一集里往往有十来条
      // 线路其实是同一档的几个镜像，所以在“清晰度”里按画质去重：点哪一档就落到那一档的
      // 第一条线，它死了宿主会自己顺着候选表继续换（换线那套已经在 online/stream 里）。
      //
      // 没有 caption 的站点（FQDM 这类 MacCMS，线路就叫「新浪资源2」「番茄2线」）不能
      // 退成「线路 3」——那正好把用户唯一能对上号的信息扔掉，而线路名是站点给的、可读的
      // 真名，直接用它。
      const lineQuality = (item, index) => {
        const caption = typeof item === 'string' ? '' : String(item?.caption ?? '')
        const match = /(\d{3,4})\s*[Pp]/.exec(caption)
        if (match !== null) return `${match[1]}P`
        const tail = String(caption.split('·').pop() ?? '').trim()
        if (tail !== '') return tail.length > 12 ? `${tail.slice(0, 12)}…` : tail
        const named = typeof item === 'string' ? item : String(item?.name ?? '')
        if (named !== '') return named
        return `${T('onlineServer')} ${index + 1}`
      }
      const qualityChoices = (() => {
        const seen = new Map()
        serverList.forEach((item, index) => {
          const label = lineQuality(item, index)
          const entry = seen.get(label)
          if (entry === undefined) seen.set(label, { label, index, count: 1 })
          else entry.count += 1
        })
        return [...seen.values()]
      })()
      const qualityAt = serverNames.indexOf(server)
      const currentQuality = qualityAt < 0 ? (qualityChoices[0]?.label ?? '') : lineQuality(serverList[qualityAt], qualityAt)
      const pickQuality = (label) => {
        const choice = qualityChoices.find((entry) => entry.label === label)
        if (choice === undefined) return
        const item = serverList[choice.index]
        const name = typeof item === 'string' ? item : String(item?.name ?? '')
        if (name === '' || name === server) return
        // 一律带上当前位置：宿主那边 `start > 0` 就会走 ffmpeg 的 `-ss`（m3u8 和
        // 普通文件都能跳），不再按“这条线看起来能不能跳”去猜——猜错的结果就是进度条
        // 说 12:30 而画面从片头开始。窄带线路会因此多缓冲几秒，但位置是真的。
        const before = playing === null ? null : episodeList[playing.at] ?? null
        setServer(name)
        if (before === null) {
          setPlaying(null)
          return
        }
        play(before, playing.at, { server: name, start: Math.max(0, Math.floor(lastTimeRef.current)) })
        lastTimeRef.current = 0
      }
      useEffect(() => {
        if (serverNames.length === 0) return
        if (server === '' || serverNames.includes(server) === false) setServer(serverNames[0])
      }, [serverNames.join('|')])

      useEffect(() => {
        setPicked(null)
        setServer('')
        setPlaying(null)
        setError('')
      }, [source])

      useEffect(() => {
        // A freshly opened anime starts on its own first line, and its line list
        // is asked for without an episode (the host then answers for episode 1).
        setServer('')
        setEpisodeNo(0)
      }, [picked === null ? '' : picked.id])

      const episodeList = Array.isArray(episodes.data?.items) ? episodes.data.items : []
      const play = (episode, at, options) => {
        setError('')
        setEpisodeNo(Number(episode.number) > 0 ? Number(episode.number) : at + 1)
        // 换清晰度＝换一条线路重开同一个流。线路明写的是 m3u8 时宿主能把 `start`
        // 变成 ffmpeg 的输入跳转，续看；直通文件只能从头给字节，那就老实从 0 开始。
        const line = String(options?.server ?? server)
        const start = Math.max(0, Math.floor(Number(options?.start ?? 0) || 0))
        const query = `source=${source}&episode=${encodeURIComponent(episode.id)}&server=${encodeURIComponent(line)}`
        setPlaying({
          label: `${T('episode')} ${episode.number ?? at + 1}`,
          src: `${API}/online/stream?${query}`,
          at,
          start,
          duration: 0,
        })
        // A live transcode carries no length, so ask the host for the real one
        // (summed from the playlist) and let the timeline show it.
        void fetchJson(`${API}/online/duration?${query}`)
          .then((payload) => {
            const seconds = Number(payload?.seconds)
            if (!Number.isFinite(seconds) || seconds <= 0) return
            setPlaying((current) =>
              current === null || current.src !== `${API}/online/stream?${query}`
                ? current
                : { ...current, duration: Math.round(seconds) },
            )
          })
          .catch(() => undefined)
      }
      const nextUp = playing === null ? null : episodeList[playing.at + 1] ?? null

      useEffect(() => {
        if (autoPlay.current === false) return
        if (episodes.status === 'error') {
          autoPlay.current = false
          return
        }
        if (episodes.status !== 'ready' || episodeList.length === 0) return
        autoPlay.current = false
        play(episodeList[0], 0)
      }, [episodes.status, episodeList.length, picked === null ? '' : picked.id, server])
      const clearAll = () => {
        setPicked(null)
        setPlaying(null)
        setError('')
      }
      const serverSelect =
        serverNames.length === 0
          ? null
          : h(
              'select',
              {
                className: 'dshan-select dshan-select-compact',
                value: server,
                title: T('onlineServer'),
                onChange: (event) => {
                  // Switching the line drops the player: the episode ids of the
                  // other line are different, so the old src would 404.
                  setServer(event.target.value)
                  setPlaying(null)
                },
              },
              serverList.map((item) => {
                const name = typeof item === 'string' ? item : String(item?.name ?? '')
                const count = typeof item === 'string' ? 0 : Number(item?.count ?? 0)
                return h('option', { key: name, value: name }, count > 0 ? `${name} · ${count}` : name)
              }),
            )

      return h(
        'div',
        { className: 'dshan-generic' },
        h(
          'div',
          { className: 'dshan-watchbar' },
          // The source name and its website links live on 设置 → 片源 (that is
          // where a source is turned on or off), so this bar only carries what
          // belongs to playback: the line, and the search.
          serverSelect,
          h(
            'button',
            { className: 'dshan-btn', type: 'button', onClick: () => setSearchOpen(true) },
            T('manualSearch'),
          ),
          h('span', { className: 'dshan-watchbar-grow' }),
        ),
        searchOpen
          ? h(OnlineSearchDialog, {
              title: T('manualSearch'),
              placeholder: T('onlineSearchPlaceholder'),
              initial: '',
              candidates,
              source,
              T,
              onCancel: () => setSearchOpen(false),
              onPick: (item) => {
                setSearchOpen(false)
                autoPlay.current = true
                setPicked(item)
                setPlaying(null)
                setError('')
              },
            })
          : null,
        error === '' ? null : h('div', { className: 'dshan-state error' }, error),
        h(
          'div',
          { className: 'dshan-watch' },
          h(
            'div',
            { className: 'dshan-watch-main' },
            playing === null
              ? h(
                  'div',
                  { className: 'dshan-watch-idle' },
                  picked === null ? T('onlinePickAnime') : T('onlinePickEpisode'),
                )
              : h(Player, {
                  T,
                  key: playing.src,
                  src: playing.src,
                  title: picked?.title ?? sourceName,
                  subtitle: playing.label,
                  hasNext: nextUp !== null,
                  onNext: nextUp === null ? null : () => play(nextUp, playing.at + 1),
                  onClose: () => setPlaying(null),
                  errorHint: T('onlinePlaybackFailed'),
                  durationHint: playing?.duration ?? 0,
                  startAt: playing?.start ?? 0,
                  onTime: (seconds) => {
                    lastTimeRef.current = Number.isFinite(seconds) ? seconds : 0
                  },
                  quality: currentQuality,
                  onQuality: pickQuality,
                  qualityOptions: qualityChoices.map((choice) => ({
                    value: choice.label,
                    label: choice.label,
                    note: choice.count > 1 ? `${choice.count} ${T('qualityMirrors')}` : undefined,
                  })),
                  // 在线源多半只给 m3u8，浏览器存下来不是一个能播的文件，所以下载走
                  // 宿主端的 ffmpeg 转封装；线路就是当前在播的那条。
                  onDownload: () =>
                    queueDownload('/downloads/stream', {
                      source,
                      episode: episodeList[playing.at]?.id ?? '',
                      server: serverNames[qualityAt] ?? server,
                      title: `${picked?.title ?? sourceName} - ${playing.label}`,
                    }),
                }),
          ),
          h(
            'aside',
            { className: 'dshan-watch-side' },
            h(
              'div',
              { className: 'dshan-side-head' },
              h('span', { className: 'dshan-side-title', title: picked?.title ?? '' }, picked?.title ?? T('episodes')),
              h(
                'span',
                { className: 'dshan-side-count' },
                picked === null ? '' : episodes.status === 'ready' ? `${episodeList.length} ${T('episode')}` : '…',
              ),
            ),
            picked === null
              ? h('div', { className: 'dshan-side-empty' }, T('onlinePickAnime'))
              : episodes.status === 'error'
                ? h('div', { className: 'dshan-state error' }, episodes.error?.message ?? T('loadFailed'))
                : h(
                    'div',
                    { className: 'dshan-epgrid compact' },
                    episodeList.map((episode, at) =>
                      h(
                        'button',
                        {
                          key: episode.id,
                          type: 'button',
                          className: 'dshan-epbtn',
                          'data-active': String(playing?.at === at),
                          title: episode.title ?? '',
                          onClick: () => play(episode, at),
                        },
                        String(episode.number ?? at + 1),
                      ),
                    ),
                  ),
          ),
        ),
      )
    }

    function OnlineView({ media, titles, T }) {
      const [mode, setMode] = useState('bangumi')
      // The page belongs to the `online` contract, not to bilibili: the chip row
      // below is built from whatever online extensions are installed.
      const [source, setSource] = useState('bilibili')
      const onlineList = useEndpoint(`${API}/online/sources`)
      // Toggling an extension in 片源 happens in another tab of this page, so
      // the chip row has to re-read the list instead of trusting the first load.
      const reloadSources = onlineList.reload
      React.useEffect(() => {
        const timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') reloadSources()
        }, 4000)
        return () => window.clearInterval(timer)
      }, [reloadSources])
      const onlineSources = Array.isArray(onlineList.data?.items) ? onlineList.data.items : []
      // `source` is what the user picked; this is what we may actually show. A
      // switched-off source falls through to the first one that is on, so
      // turning 哔哩哔哩 off in 片源 lands on another source instead of a dead end.
      const chosenSource = onlineSources.find((entry) => entry.id === source) ?? null
      const fallbackSource = onlineSources.find((entry) => entry.enabled === true) ?? null
      const effectiveSource =
        chosenSource !== null && chosenSource.enabled === true
          ? chosenSource.id
          : fallbackSource?.id ?? source
      const shownSource = onlineSources.find((entry) => entry.id === effectiveSource) ?? null
      const [query, setQuery] = useState(titles[0] ?? '')
      const [submitted, setSubmitted] = useState(null)
      const [seasonId, setSeasonId] = useState(null)
      // The online source owns its own ladder now, so the starting quality comes
      // from the extension's own preferences (设置 → 片源 → 哔哩哔哩) instead of a
      // global setting the page used to duplicate.
      const [quality, setQuality] = useState(80)
      // 手动匹配 bumps this, and the effect below puts the caret in the search
      // box — the reference line for "the auto match picked the wrong season".
      const [searchFocus, setSearchFocus] = useState(0)
      useEffect(() => {
        if (searchFocus === 0) return undefined
        const input = document.querySelector('.dshan-toolbar .dshan-input')
        if (input !== null && typeof input.focus === 'function') input.focus()
        return undefined
      }, [searchFocus])
      const extInfo = useEndpoint(`${API}/extensions`)
      const biliExt = Array.isArray(extInfo.data?.items)
        ? extInfo.data.items.find((entry) => entry.id === 'bilibili') ?? null
        : null
      const biliQuality = Number(biliExt?.values?.quality)
      // Everything below asks the host for bilibili data, so with the extension
      // switched off nothing is requested at all — the panel explains instead.
      const biliOff = biliExt !== null && biliExt.enabled !== true
      useEffect(() => {
        if (Number.isFinite(biliQuality) && biliQuality > 0) setQuality(biliQuality)
      }, [biliQuality])
      const [playing, setPlaying] = useState(null)
      const [error, setError] = useState('')

      // Upload state runs beside the bangumi state so switching back keeps both.
      const [videoQuery, setVideoQuery] = useState('')
      const [videoSubmitted, setVideoSubmitted] = useState(null)
      const [pickedBvid, setPickedBvid] = useState(null)
      const [pickedPart, setPickedPart] = useState(null)

      const search = useEndpoint(
        biliOff || mode !== 'bangumi' || submitted === null
          ? null
          : `${API}/bili/search?q=${encodeURIComponent(submitted)}`,
      )
      const season = useEndpoint(biliOff || seasonId === null ? null : `${API}/bili/season?season_id=${seasonId}`)
      const videoList = useEndpoint(
        biliOff || videoSubmitted === null ? null : `${API}/bili/videos?keyword=${encodeURIComponent(videoSubmitted)}&page=1`,
      )
      const videoDetail = useEndpoint(
        biliOff || pickedBvid === null ? null : `${API}/bili/video?bvid=${encodeURIComponent(pickedBvid)}`,
      )

      const submit = (event) => {
        event?.preventDefault()
        const text = query.trim()
        if (text === '') return
        setSeasonId(null)
        setPlaying(null)
        setSubmitted(text)
      }

      const submitVideo = (event) => {
        event?.preventDefault()
        const text = videoQuery.trim()
        if (text === '') return
        setPickedBvid(null)
        setPickedPart(null)
        setPlaying(null)
        setError('')
        setVideoSubmitted(text)
      }

      const results = Array.isArray(search.data?.items) ? search.data.items : []
      const episodes = Array.isArray(season.data?.episodes) ? season.data.episodes : []
      const videos = Array.isArray(videoList.data?.items) ? videoList.data.items : []
      const parts = Array.isArray(videoDetail.data?.pages) ? videoDetail.data.pages : []

      const [attempt, setAttempt] = useState(0)

      useEffect(() => {
        if (submitted === null && titles.length > 0) setSubmitted(titles[0])
      }, [])

      useEffect(() => {
        if (submitted === null || search.status !== 'ready' || results.length > 0) return
        if (attempt >= 3 || attempt >= titles.length - 1) return
        const nextTitle = titles[attempt + 1]
        if (nextTitle === undefined || nextTitle === submitted) return
        setAttempt(attempt + 1)
        setQuery(nextTitle)
        setSeasonId(null)
        setSubmitted(nextTitle)
      }, [search.status, results.length, attempt, submitted, titles])

      // An upload with a single part starts playing as soon as it is picked.
      useEffect(() => {
        if (pickedBvid === null || videoDetail.status !== 'ready') return
        if (parts.length !== 1) return
        if (playing !== null && playing.bvid === pickedBvid) return
        playPart(parts[0])
      }, [videoDetail.status, pickedBvid, parts.length])

      function playPart(part) {
        setError('')
        setPickedPart(part.cid)
        setPlaying({
          bvid: pickedBvid,
          cid: part.cid,
          label: parts.length > 1 ? `P${part.page} · ${part.part}` : videoDetail.data?.title ?? '',
          src: `${API}/bili/stream?bvid=${encodeURIComponent(pickedBvid)}&cid=${part.cid}&qn=${quality}`,
          subtitleQuery: `bvid=${encodeURIComponent(pickedBvid)}&cid=${part.cid}`,
        })
      }

      const sourceSwitch =
        onlineSources.length > 0
          ? h(
              'div',
              { className: 'dshan-chips', style: { marginBottom: '10px' } },
              onlineSources.map((entry) =>
                h(
                  'button',
                  {
                    key: entry.id,
                    type: 'button',
                    className: 'dshan-chip',
                    'data-active': String(entry.id === effectiveSource),
                    'data-off': String(entry.enabled !== true),
                    disabled: entry.enabled !== true,
                    title: entry.enabled === true ? entry.name : `${entry.name} · ${T('onlineOff')}`,
                    onClick: () => {
                      setSource(entry.id)
                      setPlaying(null)
                      setError('')
                    },
                  },
                  // The row doubles as the state of every source, so a switched
                  // off extension says so instead of silently looking the same.
                  entry.enabled === true ? entry.name : `${entry.name} · ${T('onlineOff')}`,
                ),
              ),
            )
          : null

      // Titles differ per language and the catalog holds several of them, so the
      // search dialog offers the known names instead of making you guess how a
      // source spells the show.
      const searchCandidates = (() => {
        const pool = [
          ...(Array.isArray(titles) ? titles : []),
          titleText(media?.titleNative),
          titleText(media?.title),
          titleText(media?.titleRomaji),
          titleText(media?.titleEnglish),
          titleText(media?.titleChinese),
          titleText(media?.nameCn),
          titleText(media?.titleOriginal),
        ]
        const seen = new Set()
        const list = []
        for (const raw of pool) {
          const value = String(raw ?? '').trim()
          if (value === '' || seen.has(value)) continue
          seen.add(value)
          list.push(value)
          if (list.length >= 6) break
        }
        return list
      })()

      // Everything from here down is bilibili's own rich view (seasons, parts,
      // DASH). Other sources share one generic view built on the contract.
      if (effectiveSource !== 'bilibili') {
        return h(
          'div',
          { className: 'dshan-view' },
          sourceSwitch,
          h(GenericOnlineView, {
            source: effectiveSource,
            sourceName: shownSource?.name ?? effectiveSource,
            // Titles differ per language and the catalog knows all of them, so
            // the search dialog can offer them instead of guessing.
            candidates: searchCandidates,
            T,
          }),
        )
      }

      const modeSwitch = h(
        'div',
        { className: 'dshan-chips', style: { marginBottom: '12px' } },
        h(
          'button',
          {
            key: 'bangumi',
            type: 'button',
            className: 'dshan-chip',
            'data-active': String(mode === 'bangumi'),
            onClick: () => {
              setMode('bangumi')
              setPlaying(null)
              setError('')
            },
          },
          T('modeBangumi'),
        ),
        h(
          'button',
          {
            key: 'video',
            type: 'button',
            className: 'dshan-chip',
            'data-active': String(mode === 'video'),
            onClick: () => {
              setMode('video')
              setPlaying(null)
              setError('')
              if (videoQuery === '' && titles.length > 0) setVideoQuery(titles[0])
            },
          },
          T('modeVideo'),
        ),
      )

      // Reaching this point with bilibili off means no online source is on at
      // all (an enabled one would have been picked above). Say that instead of
      // leaving an empty page that reads like a broken search.
      if (biliExt !== null && biliExt.enabled !== true) {
        return h(
          'div',
          { className: 'dshan-view' },
          sourceSwitch,
          modeSwitch,
          h(
            'div',
            { className: 'dshan-empty' },
            onlineSources.length > 0
              ? T('onlineNoneOn')
              : '在线流由「哔哩哔哩」扩展提供，现在它是关闭的。到「设置 → 片源 → 哔哩哔哩」打开即可。',
          ),
        )
      }

      if (mode === 'video') return h('div', { className: 'dshan-view' }, sourceSwitch, modeSwitch, uploadView())

      function playEpisode(episode) {
        setError('')
        setPlaying({
          epId: episode.epId,
          cid: episode.cid,
          label: `${T('episode')} ${episode.index}${episode.longTitle ? ` · ${episode.longTitle}` : ''}`,
          src: `${API}/bili/stream?ep_id=${episode.epId}&cid=${episode.cid}&qn=${quality}`,
          subtitleQuery: `ep_id=${episode.epId}&cid=${episode.cid}`,
        })
      }

      const episodeList = Array.isArray(episodes) ? episodes : []
      const currentEpisodeAt = playing === null ? -1 : episodeList.findIndex((item) => item.epId === playing.epId)
      const nextUp = currentEpisodeAt >= 0 ? (episodeList[currentEpisodeAt + 1] ?? null) : null

      return h(
        'div',
        { className: 'dshan-view' },
        sourceSwitch,
        modeSwitch,
        h(
          'form',
          { className: 'dshan-toolbar', onSubmit: submit },
          h('input', {
            className: 'dshan-input',
            value: query,
            placeholder: T('biliSearchPlaceholder'),
            onChange: (event) => setQuery(event.target.value),
          }),
          h('button', { className: 'dshan-btn primary', type: 'submit' }, T('search')),
          h(
            'select',
            { className: 'dshan-select', value: String(quality), onChange: (event) => setQuality(Number(event.target.value)) },
            QN_CHOICES.map(([value, label]) => h('option', { key: value, value: String(value) }, label)),
          ),
        ),
        titles.length > 1
          ? h(
              'div',
              { className: 'dshan-chips', style: { marginBottom: '10px' } },
              titles.slice(0, 4).map((title) =>
                h(
                  'button',
                  {
                    key: title,
                    className: 'dshan-chip',
                    type: 'button',
                    onClick: () => {
                      setQuery(title)
                      setSeasonId(null)
                      setPlaying(null)
                      setSubmitted(title)
                    },
                  },
                  title,
                ),
              ),
            )
          : null,
        error === '' ? null : h('div', { className: 'dshan-state error' }, error),

        playing === null
          ? null
          : h(
              'div',
              { className: 'dshan-watchbar' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshan-pill',
                  title: T('onlineSource'),
                  onClick: () => {
                    setPlaying(null)
                    setError('')
                  },
                },
                h('span', { className: 'dshan-pill-dot' }),
                '哔哩哔哩',
                h('span', { className: 'dshan-pill-caret' }, '⌄'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshan-btn',
                  onClick: () => {
                    setPlaying(null)
                    setSearchFocus((value) => value + 1)
                  },
                },
                T('manualMatch'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshan-btn',
                  disabled: true,
                  title: T('noDubTrack'),
                },
                T('switchDub'),
              ),
              h('span', { className: 'dshan-watchbar-grow' }),
              h('button', { className: 'dshan-btn', type: 'button', onClick: () => setPlaying(null) }, T('backToList')),
              h(ExtensionActions, { id: 'bilibili', T }),
            ),

        playing === null
          ? displayedSeason(season)
          : h(
              'div',
              { className: 'dshan-watch' },
              h(
                'div',
                { className: 'dshan-watch-main' },
                h(Player, {
                  T,
                  key: playing.bvid === undefined ? playing.src : `${playing.bvid}:${playing.cid}`,
                  src: playing.src,
                  subtitleQuery: playing.subtitleQuery ?? null,
                  quality,
                  onQuality: (value) => {
                    setQuality(value)
                    setPlaying((previous) =>
                      previous === null
                        ? previous
                        : { ...previous, src: String(previous.src).replace(/qn=\d+/, `qn=${value}`) },
                    )
                  },
                  parts: parts.length > 1 && playing.bvid !== undefined ? parts : null,
                  pickedCid: playing.cid,
                  playing: { epId: playing.epId, cid: playing.cid, bvid: playing.bvid, index: playing.index },
                  durationHint: Number(parts.find((item) => item.cid === playing.cid)?.duration) || 0,
                  onPickPart: (part) => playPart(part),
                  title: season.data?.title ?? query ?? '',
                  subtitle: playing.label,
                  hasNext: nextUp !== null,
                  onNext: nextUp === null ? null : () => playEpisode(nextUp),
                  onClose: () => setPlaying(null),
                  errorHint: T('biliPlaybackFailed'),
                  onDownload: () =>
                    queueDownload('/downloads/bili', {
                      ep_id: playing.epId,
                      cid: playing.cid,
                      qn: quality,
                      title: episodeDownloadTitle(season.data?.title ?? query, playing.label),
                    }),
                }),
              ),
              h(
                'aside',
                { className: 'dshan-watch-side' },
                h(
                  'div',
                  { className: 'dshan-side-head' },
                  h(
                    'span',
                    { className: 'dshan-side-title', title: season.data?.title ?? query ?? '' },
                    season.data?.title ?? query ?? '',
                  ),
                  h(
                    'span',
                    { className: 'dshan-side-count' },
                    episodes.length > 0 ? `${episodes.length} ${T('episode')}` : `${parts.length} P`,
                  ),
                ),
                episodes.length === 0
                  ? h(
                      'div',
                      { className: 'dshan-epgrid compact' },
                      parts.map((part) =>
                        h(
                          'button',
                          {
                            key: part.cid,
                            type: 'button',
                            className: 'dshan-epbtn',
                            'data-active': String(part.cid === playing.cid),
                            title: part.part ?? '',
                            onClick: () => playPart(part),
                          },
                          String(part.page ?? ''),
                        ),
                      ),
                    )
                  : h(
                      'div',
                      { className: 'dshan-epgrid compact' },
                      episodes.map((episode) =>
                        h(
                          'button',
                          {
                            key: episode.epId ?? episode.index,
                            type: 'button',
                            className: 'dshan-epbtn',
                            'data-active': String(playing.epId === episode.epId),
                            title: episode.longTitle ?? '',
                            onClick: () => {
                              setError('')
                              setPlaying({
                                epId: episode.epId,
                                cid: episode.cid,
                                label: `${T('episode')} ${episode.index}${episode.longTitle ? ` · ${episode.longTitle}` : ''}`,
                                src: `${API}/bili/stream?ep_id=${episode.epId}&cid=${episode.cid}&qn=${quality}`,
                              })
                            },
                          },
                          String(episode.index ?? ''),
                        ),
                      ),
                    ),
              ),
            ),

        playing !== null || episodes.length === 0
          ? null
          : h(
              'div',
              { className: 'dshan-eppanel' },
              h('div', { className: 'dshan-section' }, T('episodes') + ` · ${episodes.length}`),
              h(
                'div',
                { className: 'dshan-epgrid' },
                episodes.map((episode) =>
                  h(
                    'button',
                    {
                      key: episode.epId ?? episode.index,
                      type: 'button',
                      className: 'dshan-epbtn',
                      'data-active': String(playing !== null && playing.epId === episode.epId),
                      title: episode.longTitle ?? '',
                      onClick: () => {
                        setError('')
                        setPlaying({
                          epId: episode.epId,
                          cid: episode.cid,
                          label: `${T('episode')} ${episode.index}${episode.longTitle ? ` · ${episode.longTitle}` : ''}`,
                          src: `${API}/bili/stream?ep_id=${episode.epId}&cid=${episode.cid}&qn=${quality}`,
                        })
                      },
                    },
                    String(episode.index ?? ''),
                  ),
                ),
              ),
            ),

        results.length === 0
          ? null
          : h(
              'div',
              null,
              h('div', { className: 'dshan-section' }, T('biliResults')),
              h(
                'div',
                { className: 'dshan-rows' },
                results.map((item) =>
                  h(
                    'div',
                    {
                      key: item.seasonId,
                      className: 'dshan-row',
                      onClick: () => {
                        setSeasonId(item.seasonId)
                        setPlaying(null)
                        setError('')
                      },
                    },
                    h('div', { className: 'dshan-rowcover' }, item.cover ? h('img', { src: item.cover, alt: '' }) : null),
                    h(
                      'div',
                      { className: 'dshan-rowmain' },
                      h('div', { className: 'dshan-rowtitle' }, displayTitle(item)),
                      h(
                        'div',
                        { className: 'dshan-rowsub' },
                        [item.episodes === null ? null : `${item.episodes} 话`, item.score === null ? null : `★ ${item.score}`, item.year]
                          .filter(Boolean)
                          .join(' · '),
                      ),
                    ),
                    h('span', { className: 'dshan-eptag' }, item.seasonId === seasonId ? T('selected') : T('open')),
                  ),
                ),
              ),
            ),
        search.status === 'loading' ? h('div', { className: 'dshan-state' }, T('loading')) : null,
        search.status === 'error' ? h('div', { className: 'dshan-state error' }, search.error) : null,
        submitted !== null && search.status === 'ready' && results.length === 0 && seasonId === null
          ? h('div', { className: 'dshan-state' }, T('biliNoResult'))
          : null,
      )

      /** Search bilibili uploads, then play a part of the one you pick. */
      function uploadView() {
        const picked = videoDetail.data
        const partList = Array.isArray(parts) ? parts : []
        const currentPartAt = playing === null ? -1 : partList.findIndex((item) => item.cid === playing.cid)
        const nextPart = currentPartAt >= 0 ? (partList[currentPartAt + 1] ?? null) : null
        return h(
          'div',
          null,
          h(
            'form',
            { className: 'dshan-toolbar', onSubmit: submitVideo },
            h('input', {
              className: 'dshan-input',
              value: videoQuery,
              placeholder: T('videoSearchPlaceholder'),
              onChange: (event) => setVideoQuery(event.target.value),
            }),
            h('button', { className: 'dshan-btn primary', type: 'submit' }, T('search')),
            h(
              'select',
              { className: 'dshan-select', value: String(quality), onChange: (event) => setQuality(Number(event.target.value)) },
              QN_CHOICES.map(([value, label]) => h('option', { key: value, value: String(value) }, label)),
            ),
          ),
          titles.length > 1
            ? h(
                'div',
                { className: 'dshan-chips', style: { marginBottom: '10px' } },
                titles.slice(0, 4).map((title) =>
                  h(
                    'button',
                    { key: title, className: 'dshan-chip', type: 'button', onClick: () => setVideoQuery(title) },
                    title,
                  ),
                ),
              )
            : null,
          error === '' ? null : h('div', { className: 'dshan-state error' }, error),

          playing === null
            ? null
            : h(Player, {
                T,
                key: playing.bvid === undefined ? playing.src : `${playing.bvid}:${playing.cid}`,
                src: playing.src,
              subtitleQuery: playing.subtitleQuery ?? null,
              quality,
              onQuality: (value) => {
                setQuality(value)
                setPlaying((previous) =>
                  previous === null
                    ? previous
                    : { ...previous, src: String(previous.src).replace(/qn=\d+/, `qn=${value}`) },
                )
              },
                title: videoDetail.data?.title ?? videoQuery,
                subtitle: playing.label,
                playing: { cid: playing.cid, bvid: playing.bvid, index: playing.index },
                hasNext: nextPart !== null,
                onNext: nextPart === null ? null : () => playPart(nextPart),
                onClose: () => setPlaying(null),
                errorHint: T('biliPlaybackFailed'),
                onDownload: () =>
                  queueDownload('/downloads/bili', {
                    bvid: pickedBvid,
                    cid: playing.cid,
                    qn: quality,
                    title: episodeDownloadTitle(videoDetail.data?.title ?? videoQuery, playing.label),
                  }),
              }),

          pickedBvid === null
            ? null
            : videoDetail.status === 'error'
              ? h('div', { className: 'dshan-state error' }, videoDetail.error)
              : videoDetail.status !== 'ready' || picked === null
                ? h('div', { className: 'dshan-state' }, T('loading'))
                : h(
                    'div',
                    { className: 'dshan-seasonhead' },
                    picked.cover ? h('img', { className: 'dshan-seasoncover', src: picked.cover, alt: '' }) : null,
                    h(
                      'div',
                      { className: 'dshan-rowmain' },
                      h('div', { className: 'dshan-rowtitle' }, picked.title),
                      h(
                        'div',
                        { className: 'dshan-rowsub' },
                        [
                          `${T('uploader')} ${picked.owner}`,
                          `${formatCount(picked.stat?.view)} ${T('videoViews')}`,
                          parts.length > 1 ? `${T('parts')} ${parts.length}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · '),
                      ),
                      h(
                        'div',
                        { className: 'dshan-chips', style: { marginTop: '8px' } },
                        h(
                          'a',
                          {
                            className: 'dshan-chip',
                            href: `https://www.bilibili.com/video/${picked.bvid}`,
                            target: '_blank',
                            rel: 'noreferrer',
                          },
                          T('watchOnBili'),
                        ),
                      ),
                    ),
                  ),

          parts.length === 0
            ? null
            : h(
                'div',
                { className: 'dshan-eppanel' },
                h(
                  'div',
                  { className: 'dshan-section' },
                  parts.length > 1 ? `${T('parts')} · ${parts.length}` : T('videoPicked'),
                ),
                h(
                  'div',
                  {
                    className: 'dshan-epgrid',
                    // One picked upload is a title, not a page number: give it the
                    // whole row so it cannot be squeezed into a 52px cell.
                    style: parts.length === 1 ? { gridTemplateColumns: '1fr' } : undefined,
                  },
                  parts.map((part) =>
                    h(
                      'button',
                      {
                        key: part.cid,
                        type: 'button',
                        className: 'dshan-epbtn',
                        'data-active': String(pickedPart === part.cid),
                        title: part.part,
                        onClick: () => playPart(part),
                      },
                      parts.length > 1 ? String(part.page) : part.part,
                    ),
                  ),
                ),
              ),

          videos.length === 0
            ? null
            : h(
                'div',
                null,
                h('div', { className: 'dshan-section' }, `${T('videoResults')} · ${videoList.data?.total ?? videos.length}`),
                h(
                  'div',
                  { className: 'dshan-rows' },
                  videos.map((item) =>
                    h(
                      'div',
                      {
                        key: item.bvid,
                        className: 'dshan-row',
                        onClick: () => {
                          setPickedBvid(item.bvid)
                          setPickedPart(null)
                          setPlaying(null)
                          setError('')
                        },
                      },
                      h('div', { className: 'dshan-rowcover' }, item.cover ? h('img', { src: item.cover, alt: '' }) : null),
                      h(
                        'div',
                        { className: 'dshan-rowmain' },
                        h('div', { className: 'dshan-rowtitle' }, item.title),
                        h(
                          'div',
                          { className: 'dshan-rowsub' },
                          [item.author, item.duration, `${formatCount(item.play)} ${T('videoViews')}`].filter(Boolean).join(' · '),
                        ),
                      ),
                      h('span', { className: 'dshan-eptag' }, item.bvid === pickedBvid ? T('selected') : T('open')),
                    ),
                  ),
                ),
              ),

          videoList.status === 'loading' ? h('div', { className: 'dshan-state' }, T('loading')) : null,
          videoList.status === 'error' ? h('div', { className: 'dshan-state error' }, videoList.error) : null,
          videoSubmitted !== null && videoList.status === 'ready' && videos.length === 0
            ? h('div', { className: 'dshan-state' }, T('videoNoResult'))
            : null,
          videoSubmitted === null ? h('div', { className: 'dshan-state' }, T('videoSearchPlaceholder')) : null,
        )
      }

      function chosenPartLabel() {
        const part = parts.find((item) => item.cid === pickedPart)
        return part === undefined ? `${T('parts')} ${parts.length}` : part.part
      }

      function displayedSeason(state) {
        if (seasonId === null) return null
        if (state.status === 'error') return h('div', { className: 'dshan-state error' }, state.error)
        if (state.status !== 'ready' || state.data === null) return h('div', { className: 'dshan-state' }, T('loading'))
        const data = state.data
        return h(
          'div',
          { className: 'dshan-seasonhead' },
          data.cover ? h('img', { className: 'dshan-seasoncover', src: data.cover, alt: '' }) : null,
          h(
            'div',
            { className: 'dshan-rowmain' },
            h('div', { className: 'dshan-rowtitle' }, data.title),
            h(
              'div',
              { className: 'dshan-rowsub' },
              [
                data.rating?.score === undefined ? null : `★ ${data.rating.score}`,
                data.evaluate === '' ? null : data.evaluate,
                `${episodes.length} 话`,
                data.rights?.areaLimit === true ? T('areaLimited') : null,
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          ),
        )
      }
    }

    function TorrentView({ media, titles, T }) {
      const [provider, setProvider] = useState('all')
      const [query, setQuery] = useState(titles[0] ?? '')
      const [episode, setEpisode] = useState('')
      const [resolution, setResolution] = useState('1080p')
      const [batch, setBatch] = useState(false)
      const [request, setRequest] = useState(null)
      const [message, setMessage] = useState('')
      const [job, setJob] = useState(null)
      const [player, setPlayer] = useState(null)
      const [busyHash, setBusyHash] = useState('')

      const results = useEndpoint(request)
      const status = useEndpoint(`${API}/torrent/status`)
      const watched = usePoll(`${API}/torrent/list`, 2000, job !== null && job.ready !== true)

      const items = Array.isArray(results.data?.items) ? results.data.items : []
      const backend = status.data?.backend
      const current = job === null ? null : (watched.data?.items ?? []).find((entry) => entry.hash === job.hash) ?? job

      useEffect(() => {
        if (current === null || current.ready !== true) return
        if (job !== null && job.ready === true) return
        const target = chooseFile(current.files ?? [], job?.pick ?? null)
        if (target === undefined) return
        setJob({ ...current, ready: true })
        setPlayer({
          hash: current.hash,
          index: target.index,
          name: target.name,
          src: `${API}/torrent/stream?hash=${current.hash}&index=${target.index}`,
        })
      }, [current, job])

      const stop = async () => {
        if (current === null) return
        try {
          await postJson(`${API}/torrent/remove`, { hash: current.hash })
        } catch (error) {
          setMessage(error?.message ?? String(error))
        }
        setPlayer(null)
        setJob(null)
      }

      const search = (event) => {
        event?.preventDefault()
        const text = query.trim()
        if (text === '') return
        setMessage('')
        const params = new URLSearchParams({ q: text, provider, resolution })
        if (episode.trim() !== '') params.set('episode', episode.trim())
        if (batch) params.set('batch', '1')
        if (titles.length > 1) params.set('titles', titles.slice(1, 4).join(','))
        setRequest(`${API}/torrent/search?${params.toString()}`)
      }

      const play = async (item) => {
        setMessage('')
        setBusyHash(item.infoHash)
        setPlayer(null)
        try {
          const added = await postJson(`${API}/torrent/add`, { magnet: item.magnet })
          setJob({
            hash: added.hash,
            name: item.title,
            ready: false,
            progress: 0,
            peers: 0,
            files: [],
            pick: { episode: item.episodeNumber ?? 0, batch: item.isBatch === true },
          })
        } catch (error) {
          setMessage(error?.message ?? String(error))
        } finally {
          setBusyHash('')
        }
      }

      const openExternal = async (item) => {
        setMessage('')
        try {
          const added = await postJson(`${API}/torrent/add`, { magnet: item.magnet })
          const opened = await postJson(`${API}/torrent/open-player`, { hash: added.hash, index: 0 })
          setMessage(opened?.spawned === false ? T('playerFailed') : `${T('playerOpened')}: ${opened?.player ?? ''}`)
        } catch (error) {
          setMessage(error?.message ?? String(error))
        }
      }

      return h(
        'div',
        { className: 'dshan-view' },
        h(
          'form',
          { className: 'dshan-toolbar', onSubmit: search },
          h(
            'select',
            { className: 'dshan-select', value: provider, onChange: (event) => setProvider(event.target.value) },
            h('option', { value: 'all' }, T('providerAuto')),
            h('option', { value: 'anibt' }, 'AniBT'),
            h('option', { value: 'animetosho' }, 'AnimeTosho'),
          ),
          h('input', {
            className: 'dshan-input',
            value: query,
            placeholder: T('refineTitle'),
            onChange: (event) => setQuery(event.target.value),
          }),
          h('input', {
            className: 'dshan-input small',
            value: episode,
            placeholder: T('episodeNumber'),
            inputMode: 'numeric',
            onChange: (event) => setEpisode(event.target.value.replace(/[^\d]/g, '')),
          }),
          h(
            'select',
            { className: 'dshan-select', value: resolution, onChange: (event) => setResolution(event.target.value) },
            ['2160p', '1080p', '720p', '480p', ''].map((value) =>
              h('option', { key: value || 'any', value }, value === '' ? T('anyResolution') : value),
            ),
          ),
          h(
            'label',
            { className: 'dshan-toggle' },
            h('input', { type: 'checkbox', checked: batch, onChange: (event) => setBatch(event.target.checked) }),
            h('span', null, T('batchOnly')),
          ),
          h('button', { className: 'dshan-btn primary', type: 'submit' }, T('search')),
        ),

        h(
          'div',
          { className: 'dshan-enginebar' },
          h('span', { className: 'dshan-rowsub' }, `${T('engine')}: ${backend?.label ?? '—'}`),
          backend?.kind === 'qbittorrent' ? null : h('span', { className: 'dshan-rowsub' }, T('engineHint')),
          h('span', { className: 'dshan-rowsub', style: { marginLeft: 'auto' } }, status.data?.ffmpeg === true ? 'ffmpeg ✓' : 'ffmpeg ✗'),
          (status.data?.players ?? []).length === 0
            ? null
            : h('span', { className: 'dshan-rowsub' }, `${T('externalPlayers')}: ${status.data.players.map((entry) => entry.label).join(' / ')}`),
        ),

        message === '' ? null : h('div', { className: 'dshan-state' }, message),

        current !== null
          ? h(
              'div',
              { className: 'dshan-job' },
              h(
                'div',
                { className: 'dshan-rowmain' },
                h('div', { className: 'dshan-rowtitle' }, current.name ?? ''),
                h(
                  'div',
                  { className: 'dshan-rowsub' },
                  [
                    current.ready === true ? T('ready') : T('fetchingMetadata'),
                    `${Math.round((current.progress ?? 0) * 100)}%`,
                    `${formatBytes(current.size)}`,
                    `${current.peers ?? 0} peers`,
                    current.formattedSpeed ? `${current.formattedSpeed}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                ),
              ),
              h(
                'div',
                { className: 'dshan-bar' },
                h('span', { style: { width: `${Math.max(2, Math.round((current.progress ?? 0) * 100))}%` } }),
              ),
              h(
                'div',
                { className: 'dshan-playerbar' },
                h(
                  'span',
                  { className: 'dshan-rowsub' },
                  typeof current.status === 'string' ? current.status : '',
                ),
                h(
                  'button',
                  { className: 'dshan-mini danger', type: 'button', onClick: stop, style: { marginLeft: 'auto' } },
                  T('stopStream'),
                ),
              ),
            )
          : null,

        player === null
          ? null
          : h(Player, {
              T,
              key: player.src,
              src: player.src,
              title: player.name ?? '',
              subtitle: `${player.hash.slice(0, 12)}…`,
              playing: { hash: player.hash, index: player.index },
              onClose: () => setPlayer(null),
              errorHint: T('codecHint'),
              onDownload: () =>
                queueDownload('/downloads/torrent', {
                  hash: player.hash,
                  index: player.index,
                  title: player.name ?? '',
                }),
              onFallback: () => {
                if (String(player.src).includes('/transcode')) return
                setPlayer({ ...player, src: `${API}/torrent/transcode?hash=${player.hash}&index=${player.index}` })
              },
            }),

        results.status === 'loading' ? h('div', { className: 'dshan-state' }, T('loading')) : null,
        results.status === 'error' ? h('div', { className: 'dshan-state error' }, results.error) : null,
        results.status === 'ready' && items.length === 0
          ? h('div', { className: 'dshan-state' }, request === null ? T('torrentIdle') : T('torrentEmpty'))
          : null,
        items.length === 0
          ? null
          : h(
              'div',
              null,
              h(
                'div',
                { className: 'dshan-section' },
                `${T('torrentResults')} · ${items.length}` +
                  (typeof results.data?.scanned === 'number' ? ` / ${T('scanned')} ${results.data.scanned}` : ''),
              ),
              h(
                'div',
                { className: 'dshan-torrents' },
                items.map((item) =>
                  h(
                    'div',
                    { key: item.infoHash || item.magnet.slice(-32), className: 'dshan-torrent' },
                    h(
                      'div',
                      { className: 'dshan-rowmain' },
                      h('div', { className: 'dshan-rowtitle' }, item.title),
                      h(
                        'div',
                        { className: 'dshan-rowsub' },
                        [
                          item.providerLabel ?? item.provider,
                          item.formattedSize || formatBytes(item.size),
                          item.resolution || null,
                          item.isBatch ? T('batch') : item.episodeNumber > 0 ? `${T('episode')} ${item.episodeNumber}` : null,
                          item.releaseGroup || null,
                          item.seeders >= 0 ? `${item.seeders} seeds` : null,
                        ]
                          .filter(Boolean)
                          .join(' · '),
                      ),
                    ),
                    h(
                      'div',
                      { className: 'dshan-torrentactions' },
                      h(
                        'button',
                        {
                          className: 'dshan-mini',
                          type: 'button',
                          disabled: busyHash === item.infoHash,
                          onClick: () => play(item),
                        },
                        T('streamHere'),
                      ),
                      h('button', { className: 'dshan-mini', type: 'button', onClick: () => openExternal(item) }, T('openInPlayer')),
                      h(
                        'button',
                        {
                          className: 'dshan-mini',
                          type: 'button',
                          onClick: () => {
                            navigator.clipboard?.writeText(item.magnet).then(
                              () => setMessage(T('magnetCopied')),
                              () => setMessage(item.magnet),
                            )
                          },
                        },
                        T('copyMagnet'),
                      ),
                    ),
                  ),
                ),
              ),
            ),
      )
    }

    /* ---- cast & relations ------------------------------------------- */

    function plainText(value) {
      return String(value ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function CastView({ merged, T }) {
      const characters = Array.isArray(merged.characters) ? merged.characters : []
      const [picked, setPicked] = React.useState(null)
      const [expanded, setExpanded] = React.useState(false)
      const relations = Array.isArray(merged.relations) ? merged.relations : []
      if (characters.length === 0 && relations.length === 0) {
        return h('div', { className: 'dshan-state' }, T('noCast'))
      }
      return h(
        'div',
        { className: 'dshan-view' },
        characters.length === 0
          ? null
          : h(
              'div',
              null,
              h('div', { className: 'dshan-section' }, `${T('characters')} · ${characters.length}`),
              h(
                'div',
                { className: 'dshan-characters' },
                characters.map((character) =>
                  h(
                    'div',
                    {
                      key: character.id,
                      className: 'dshan-character',
                      role: 'button',
                      tabIndex: 0,
                      title: character.name ?? '',
                      onClick: () => {
                        setPicked(character)
                        setExpanded(false)
                      },
                      onKeyDown: (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        setPicked(character)
                        setExpanded(false)
                      },
                    },
                    h(
                      'div',
                      { className: 'dshan-charcover' },
                      character.image ? h('img', { src: character.image, alt: '', loading: 'lazy' }) : null,
                    ),
                    h(
                      'div',
                      { className: 'dshan-charmain' },
                      h('div', { className: 'dshan-rowtitle' }, character.name ?? ''),
                      character.native ? h('div', { className: 'dshan-rowsub' }, character.native) : null,
                      h(
                        'div',
                        { className: 'dshan-rowsub' },
                        [character.role === 'MAIN' ? T('mainRole') : T('supportRole'), character.age, character.gender]
                          .filter(Boolean)
                          .join(' · '),
                      ),
                      character.description
                        ? h('div', { className: 'dshan-chardesc' }, character.description)
                        : null,
                    ),
                  ),
                ),
              ),
            ),
        picked === null
          ? null
          : h(
              'div',
              {
                className: 'dshan-charcard-backdrop',
                onClick: () => setPicked(null),
                role: 'presentation',
              },
              h(
                'div',
                {
                  className: 'dshan-charcard',
                  role: 'dialog',
                  onClick: (event) => event.stopPropagation(),
                },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshan-charcard-close',
                    'aria-label': T('close'),
                    onClick: () => setPicked(null),
                  },
                  '×',
                ),
                h(
                  'div',
                  { className: 'dshan-charcard-head' },
                  picked.image
                    ? h('img', { className: 'dshan-charcard-pic', src: picked.image, alt: '' })
                    : h('div', { className: 'dshan-charcard-pic' }),
                  h(
                    'div',
                    null,
                    h('div', { className: 'dshan-charcard-name' }, picked.name ?? ''),
                    picked.native ? h('div', { className: 'dshan-charcard-native' }, picked.native) : null,
                  ),
                ),
                h('div', { className: 'dshan-charcard-eyebrow' }, T('charInfo')),
                h(
                  'p',
                  {
                    className: 'dshan-charcard-desc',
                    'data-expanded': expanded ? 'true' : 'false',
                    style: expanded
                      ? { display: 'block', WebkitLineClamp: 'unset', overflow: 'visible', maxHeight: 'none' }
                      : undefined,
                  },
                  plainText(picked.description) === '' ? T('charNoDesc') : plainText(picked.description),
                ),
                h(
                  'div',
                  { className: 'dshan-charcard-tags' },
                  [
                    picked.gender,
                    picked.age,
                    picked.bloodType ? `${picked.bloodType}` : '',
                    picked.role === 'MAIN' ? T('mainRole') : picked.role ? T('supportRole') : '',
                  ]
                    .filter((entry) => entry !== '' && entry !== null && entry !== undefined)
                    .map((entry, index) =>
                      h('span', { key: `tag-${index}`, className: 'dshan-charcard-tag' }, entry),
                    ),
                ),
                picked.voice?.name
                  ? h(
                      'div',
                      { className: 'dshan-charcard-voice' },
                      `${T('voiceActor')} · ${picked.voice.name}`,
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshan-charcard-more',
                    onClick: () => setExpanded((value) => !value),
                  },
                  expanded ? T('showLess') : T('showMoreInfo'),
                ),
              ),
            ),
        relations.length === 0
          ? null
          : h(
              'div',
              null,
              h('div', { className: 'dshan-section' }, `${T('relations')} · ${relations.length}`),
              h(
                'div',
                { className: 'dshan-relations' },
                relations.map((relation) =>
                  h(
                    'div',
                    { key: relation.id, className: 'dshan-relation' },
                    h('div', { className: 'dshan-relcover' }, relation.cover ? h('img', { src: relation.cover, alt: '', loading: 'lazy' }) : null),
                    h(
                      'div',
                      { className: 'dshan-rowmain' },
                      h('div', { className: 'dshan-rowsub' }, relation.relation ?? ''),
                      h('div', { className: 'dshan-rowtitle' }, relation.title ?? ''),
                      h('div', { className: 'dshan-rowsub' }, [relation.format, relation.year, relation.status].filter(Boolean).join(' · ')),
                    ),
                  ),
                ),
              ),
            ),
      )
    }

    /* ---- the page itself -------------------------------------------- */

    function Detail({ media, T, followed, onToggle, onClose, onOpenRelated, nested }) {
      const isAniList = typeof media?.anilistId === 'number'
      const isAnimeko = media?.source === 'animeko' || typeof media?.animekoId === 'number'
      // AniCh's list rows only carry a title, a cover and a one-line note; the
      // synopsis, the genres and the episode count live behind /anich/detail.
      // Follow cards saved before `anichId` existed still have `anich-<id>` as
      // their key, so the id is dug out of whichever one is present.
      const anichNumeric = (() => {
        const direct = String(media?.anichId ?? '').replace(/[^0-9]/g, '')
        if (direct !== '') return direct
        const match = /^anich-(\d+)$/.exec(String(media?.id ?? ''))
        return match === null ? '' : match[1]
      })()
      const isAnich = media?.source === 'anich' || anichNumeric !== ''
      // AniList needs a second request for banner/episodes, Animeko for the
      // full infobox, AniCh for the synopsis; Bangumi's payload already is the
      // whole record.
      const detail = useEndpoint(
        isAniList
          ? `${API}/anilist/media?id=${media.anilistId}`
          : isAnimeko && Number.isFinite(media?.animekoId)
            ? `${API}/animeko/subject?id=${media.animekoId}`
            : isAnich && anichNumeric !== ''
              ? `${API}/anich/detail?id=${anichNumeric}`
              : null,
      )
      const merged = useMemo(() => mergeDetail(media, detail.data), [media, detail.data])
      const [view, setView] = useState('info')

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      // Every title the media is known by: AniBT indexes Japanese and Chinese
      // names, AnimeTosho mostly romanised ones, and bilibili Chinese ones.
      const titles = useMemo(() => {
        const list = []
        const push = (value) => {
          const text = String(value ?? '').trim()
          if (text !== '' && !list.includes(text)) list.push(text)
        }
        const title = merged.title ?? {}
        if (typeof title === 'string') push(title)
        push(title.romaji)
        push(title.native)
        push(title.english)
        push(merged.nativeTitle)
        push(merged.romajiTitle)
        push(merged.nameCn)
        // Animeko ships every other title as one flat alias list.
        for (const alias of Array.isArray(merged.aliases) ? merged.aliases.slice(0, 6) : []) push(alias)
        return list
      }, [merged])

      const summary = stripHtml(merged.summary ?? merged.description ?? '')
      const next = merged.nextEpisode
      const genres = Array.isArray(merged.genres) ? merged.genres : []
      const studios = Array.isArray(merged.studios) ? merged.studios : []
      const followItem = {
        id: merged.id,
        anilistId: merged.anilistId ?? null,
        title: merged.title,
        cover: merged.cover,
        episodes: merged.episodes ?? null,
        score: merged.score ?? null,
        status: merged.status ?? null,
        siteUrl: merged.siteUrl ?? null,
        source: merged.source ?? 'anilist',
      }

      // Watch order and themes are features in their own right, standing beside
      // the stream views rather than buried under the info tab; they only exist
      // for AniList entries because that is where the relation graph and the
      // animethemes id live.
      const VIEWS = [
        ['info', 'viewInfo'],
        ['online', 'viewOnline'],
        ['torrent', 'viewTorrent'],
        ['cast', 'viewCast'],
        ...(isAniList ? [['order', 'viewOrder'], ['themes', 'viewThemes']] : []),
      ]

      return h(
        'div',
        { className: 'dshan-detail' },
        h(
          'div',
          { className: 'dshan-hero' },
          merged.banner ? h('img', { className: 'dshan-heroimg', src: merged.banner, alt: '' }) : null,
          h('div', { className: 'dshan-herograd' }),
          h(
            'div',
            { className: 'dshan-heroinner' },
            h('div', { className: 'dshan-herocover' }, merged.cover ? h('img', { src: merged.cover, alt: '' }) : null),
            h(
              'div',
              { className: 'dshan-heroinfo' },
              h('div', { className: 'dshan-herotop' },
                h(
                  'button',
                  { className: 'dshan-iconbtn', type: 'button', onClick: onClose, title: nested === true ? T('back') : T('close') },
                  h(IconClose, { size: 14 }),
                ),
                h('h2', { className: 'dshan-herotitle' }, displayTitle(merged) || titles[0] || ''),
              ),
              titles.length > 1
                ? h('div', { className: 'dshan-sheetalt' }, titles.slice(1, 4).join(' / '))
                : null,
              h(
                'div',
                { className: 'dshan-chips' },
                [
                  merged.score === null || merged.score === undefined ? null : `★ ${merged.score}`,
                  merged.format,
                  merged.statusLabel ?? statusLabel(merged.status, T),
                  merged.seasonYear ? `${merged.seasonYear} ${seasonLabel(merged.season, T)}` : null,
                  merged.episodes === null || merged.episodes === undefined ? null : `${merged.episodes} 话`,
                  merged.sourceLabel,
                ]
                  .filter(Boolean)
                  .map((label, index) => h('span', { key: `${label}-${index}`, className: 'dshan-chipbox' }, label)),
              ),
              genres.length === 0
                ? null
                : h(
                    'div',
                    { className: 'dshan-chips' },
                    studios.map((studio) => h('span', { key: studio, className: 'dshan-chipbox' }, studio)),
                    genres.slice(0, 8).map((genre) => h('span', { key: genre, className: 'dshan-chipbox' }, genre)),
                  ),
              h(
                'div',
                { className: 'dshan-actions' },
                h(
                  'button',
                  {
                    className: 'dshan-btn primary',
                    type: 'button',
                    'data-on': String(followed),
                    onClick: () => onToggle(followItem),
                  },
                  followed ? T('followed') : T('follow'),
                ),
                merged.siteUrl
                  ? h('a', { className: 'dshan-btn', href: merged.siteUrl, target: '_blank', rel: 'noreferrer' }, siteName(merged), h(IconExternal, { size: 12 }))
                  : null,
                merged.trailer?.id
                  ? h(
                      'a',
                      {
                        className: 'dshan-btn',
                        href: `https://www.youtube.com/watch?v=${merged.trailer.id}`,
                        target: '_blank',
                        rel: 'noreferrer',
                      },
                      T('trailer'),
                      h(IconExternal, { size: 12 }),
                    )
                  : null,
                next !== null && next !== undefined
                  ? h('span', { className: 'dshan-next' }, `${T('nextEpisode')} ${relativeFuture(next.airingAt, T)}`)
                  : null,
              ),
            ),
          ),
        ),

        h(
          'div',
          { className: 'dshan-viewswitcher' },
          VIEWS.map(([id, key]) =>
            h(
              'button',
              { key: id, type: 'button', className: 'dshan-tab', 'data-active': String(view === id), onClick: () => setView(id) },
              T(key),
            ),
          ),
          detail.status === 'loading' ? h('span', { className: 'dshan-rowsub' }, T('loadingDetail')) : null,
        ),

        h(
          'div',
          { className: 'dshan-body' },
          view === 'info'
            ? h(
                'div',
                { className: 'dshan-view' },
                summary === '' ? null : h('div', { className: 'dshan-synopsis full' }, summary),
                h(
                  'div',
                  { className: 'dshan-facts' },
                  [
                    [T('studio'), studios.join(' / ')],
                    [T('source'), merged.sourceLabel],
                    [T('rank'), merged.rank === null || merged.rank === undefined ? '' : `#${merged.rank}`],
                    [T('episodeLength'), merged.duration === null || merged.duration === undefined ? '' : `${merged.duration} 分钟`],
                  ]
                    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
                    .map(([label, value]) =>
                      h(
                        'div',
                        { key: label, className: 'dshan-fact' },
                        h('span', { className: 'dshan-rowsub' }, label),
                        h('b', null, value),
                      ),
                    ),
                ),
                h(RelationsList, { relations: merged.relations ?? [], T, current: merged, onOpen: onOpenRelated }),
              )
            : null,
          view === 'online' ? h(OnlineView, { media: merged, titles: bilibiliTitles(merged, titles), T }) : null,
          view === 'torrent' ? h(TorrentView, { media: merged, titles, T }) : null,
          view === 'cast' ? h(CastView, { merged, T }) : null,
          view === 'order' ? h(WatchOrderList, { id: media.anilistId, T, current: merged, onOpen: onOpenRelated }) : null,
          view === 'themes' ? h(ThemesList, { id: media.anilistId, T, query: titles[0] ?? merged.title ?? '' }) : null,
        ),
      )
    }

    // A relation row carries a bare AniList id (numeric) or an `animeko-<id>`
    // key, so it has to be turned back into a media record before it can be
    // opened: without the id field Detail would not know what to fetch.
    function relationTarget(relation, current) {
      const raw = String(relation?.id ?? '')
      if (raw === '') return null
      const prefixed = /^anilist-(\d+)$/.exec(raw) ?? /^animeko-(\d+)$/.exec(raw)
      if (prefixed !== null) {
        const numeric = Number(prefixed[1])
        if (!Number.isFinite(numeric)) return null
        const source = raw.startsWith('animeko-') ? 'animeko' : 'anilist'
        const media = { ...relation, id: raw, source, title: relation.title ?? '', cover: relation.cover ?? null }
        if (source === 'animeko') {
          media.animekoId = numeric
          media.bgmId = numeric
        } else {
          media.anilistId = numeric
        }
        return media
      }
      const numeric = Number(raw)
      if (!Number.isFinite(numeric)) return null
      const source = current?.source === 'animeko' ? 'animeko' : 'anilist'
      const media = { ...relation, id: `${source}-${numeric}`, source, title: relation.title ?? '', cover: relation.cover ?? null }
      if (source === 'animeko') {
        media.animekoId = numeric
        media.bgmId = numeric
      } else {
        media.anilistId = numeric
      }
      return media
    }

    // AniList carries PREQUEL/SEQUEL edges on every media, so the franchise
    // order is a chain walk rather than a lookup: the host does the walking and
    // returns the whole run, and this only prints it. A single entry means the
    // show stands alone, which is worth no section at all.
    function WatchOrderList({ id, T, current, onOpen }) {
      const result = useEndpoint(typeof id === 'number' ? `${API}/anilist/watchorder?id=${id}` : null)
      const items = Array.isArray(result.data?.items) ? result.data.items : []
      if (items.length <= 1) return null
      return h(
        'div',
        null,
        h('div', { className: 'dshan-section' }, `${T('watchOrder')} · ${items.length}`),
        h(
          'div',
          { className: 'dshan-watchorder' },
          items.map((item, index) => {
            const isCurrent = item.relation === 'CURRENT'
            const label = isCurrent ? T('watchCurrent') : item.relation === 'PREQUEL' ? '前作' : '续作'
            const meta = [item.format, item.episodes === null ? null : `${item.episodes} 话`, item.year].filter(Boolean).join(' · ')
            const target = onOpen === undefined || isCurrent
              ? null
              : {
                  id: `anilist-${item.id}`,
                  source: 'anilist',
                  anilistId: item.id,
                  title: item.title,
                  cover: item.cover,
                }
            const body = [
              h('span', { className: 'dshan-wonum' }, String(index + 1)),
              item.cover
                ? h('img', { className: 'dshan-wocover', src: item.cover, alt: '', loading: 'lazy' })
                : null,
              h(
                'span',
                { className: 'dshan-womain' },
                h('span', { className: 'dshan-worel', 'data-current': String(isCurrent) }, label),
                h('span', { className: 'dshan-wotitle' }, item.title),
                meta === '' ? null : h('span', { className: 'dshan-rowsub' }, meta),
              ),
            ]
            if (target === null) {
              return h('div', { key: `${item.id}-${index}`, className: 'dshan-worow', 'data-current': String(isCurrent) }, body)
            }
            return h(
              'button',
              {
                key: `${item.id}-${index}`,
                type: 'button',
                className: 'dshan-worow',
                'data-current': String(isCurrent),
                'data-link': 'true',
                title: item.title,
                onClick: () => onOpen(target),
              },
              body,
            )
          }),
        ),
      )
    }

    // animethemes.moe indexes by AniList id and hands back official OP/ED clips.
    // Two sources, switched rather than mixed: animethemes has the official
    // clips but sits behind Cloudflare here, while bilibili answers and — unlike
    // a bare bilibili page — the host relays its bytes with the Referer and
    // cookie they require. Only the chosen source is queried, so the broken one
    // costs nothing until it is picked; when it *is* picked and fails, we print
    // why and point at the one that works.
    function ThemesList({ id, T, query }) {
      const [source, setSource] = useState('themes')
      const [fellBack, setFellBack] = useState(false)
      // The theme video plays in the same Player as the episodes: its control
      // bar, its preload segment, its speed menu. qn is the only thing this
      // pane owns, because bilibili's ladder is per-request.
      const [qn, setQn] = useState(80)
      // Where the theme video was when the quality changed: the Player remounts
      // on a new qn (different src), so it needs the position handed back, the
      // same way the episode player does.
      const [qat, setQat] = useState(0)
      const [open, setOpen] = useState(null)
      const [busy, setBusy] = useState('')
      const [term, setTerm] = useState(query ?? '')
      const [submitted, setSubmitted] = useState(query ?? '')
      const themes = useEndpoint(
        source === 'themes' && typeof id === 'number' ? `${API}/animethemes/themes?id=${id}` : null,
      )
      const search = useEndpoint(
        source === 'bilibili' && submitted.trim() !== ''
          ? `${API}/bili/videos?keyword=${encodeURIComponent(submitted)}&page=1`
          : null,
      )

      useEffect(() => {
        if (source !== 'themes' || fellBack) return
        if (themes.status !== 'error') return
        setFellBack(true)
        setSource('bilibili')
      }, [source, fellBack, themes.status])

      const list = Array.isArray(themes.data?.themes) ? themes.data.themes : []
      const found = Array.isArray(search.data?.items) ? search.data.items : []

      const pick = (next) => {
        setOpen(null)
        setSource(next)
      }

      // A bilibili upload is only playable once its cid is known, and the cid
      // arrives with the video's part list — one request per press, not per row,
      // so a result list costs nothing until something is played.
      const openVideo = async (bvid) => {
        const key = `bili-${bvid}`
        if (open !== null && open.startsWith(key)) {
          setOpen(null)
          return
        }
        setBusy(bvid)
        try {
          const response = await fetch(`${API}/bili/video?bvid=${bvid}`)
          const payload = await response.json()
          const cid = payload?.data?.pages?.[0]?.cid ?? null
          if (cid !== null) setOpen(`${key}:${cid}`)
        } catch {
          /* the row keeps its play label; nothing is left half-open */
        } finally {
          setBusy('')
        }
      }

      const themeList =
        themes.status === 'error'
          ? h(
              'div',
              null,
              h('div', { className: 'dshan-rowsub' }, `${T('themesFailed')}：${themes.error?.message ?? ''}`),
              h(
                'button',
                { type: 'button', className: 'dshan-btn', style: { marginTop: '10px' }, onClick: () => pick('bilibili') },
                `${T('biliSource')} →`,
              ),
            )
          : themes.status === 'ready' && list.length === 0
            ? h('div', { className: 'dshan-rowsub' }, T('themesEmpty'))
            : h(
                'div',
                { className: 'dshan-themes' },
                list.map((theme, index) => {
                  const key = `${theme.slug || theme.type}-${index}`
                  const isOpen = open === key
                  return h(
                    'div',
                    { key, className: 'dshan-theme', 'data-open': String(isOpen) },
                    h(
                      'div',
                      { className: 'dshan-themerow' },
                      h('span', { className: 'dshan-themetag' }, theme.sequence === null ? theme.type : `${theme.type}${theme.sequence}`),
                      h(
                        'span',
                        { className: 'dshan-thememain' },
                        h('span', { className: 'dshan-themetitle' }, theme.title || theme.slug || theme.type),
                        theme.artists === '' ? null : h('span', { className: 'dshan-rowsub' }, theme.artists),
                      ),
                      h(
                        'button',
                        { type: 'button', className: 'dshan-btn', onClick: () => setOpen(isOpen ? null : key) },
                        isOpen ? T('stopTheme') : T('playTheme'),
                      ),
                    ),
                    isOpen
                      ? h(Player, {
                          T,
                          key: `${key}:video`,
                          src: theme.video,
                          title: theme.title || theme.slug || theme.type,
                          subtitle: theme.artists,
                          onClose: () => setOpen(null),
                          errorHint: T('onlinePlaybackFailed'),
                        })
                      : null,
                  )
                }),
              )

      const songList =
        found.length === 0
          ? search.status === 'ready'
            ? h('div', { className: 'dshan-rowsub' }, T('themesEmpty'))
            : null
          : h(
              'div',
              { className: 'dshan-themes' },
              found.map((video) => {
                const key = `bili-${video.bvid}`
                const isOpen = open !== null && open.startsWith(`${key}:`)
                const cid = isOpen ? open.slice(key.length + 1) : null
                return h(
                  'div',
                  { key, className: 'dshan-theme', 'data-open': String(isOpen) },
                  h(
                    'div',
                    { className: 'dshan-themerow' },
                    video.cover === '' || video.cover === undefined
                      ? null
                      : h('img', {
                          className: 'dshan-themecover',
                          src: video.cover,
                          alt: '',
                          loading: 'lazy',
                          referrerPolicy: 'no-referrer',
                        }),
                    h(
                      'span',
                      { className: 'dshan-thememain' },
                      h('span', { className: 'dshan-themetitle' }, video.title),
                      h(
                        'span',
                        { className: 'dshan-rowsub' },
                        [video.author, video.duration, video.play > 0 ? `▶ ${video.play}` : null].filter(Boolean).join(' · '),
                      ),
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'dshan-btn', onClick: () => openVideo(video.bvid) },
                      busy === video.bvid ? '…' : isOpen ? T('stopTheme') : T('playTheme'),
                    ),
                  ),
                  isOpen && cid !== null
                    ? h(Player, {
                        T,
                        key: `${video.bvid}:${cid}:${qn}`,
                        src: `${API}/bili/stream?bvid=${video.bvid}&cid=${cid}&qn=${qn}`,
                        title: video.title,
                        subtitle: [video.author, video.duration].filter(Boolean).join(' · '),
                        onClose: () => setOpen(null),
                        errorHint: T('onlinePlaybackFailed'),
                        startAt: qat,
                        onTime: (seconds) => setQat(Number.isFinite(seconds) ? seconds : 0),
                        quality: qn,
                        onQuality: (next) => setQn(Number(next) || 80),
                        qualityOptions: BILI_THEME_QUALITIES,
                      })
                    : null,
                )
              }),
            )

      return h(
        'div',
        { className: 'dshan-view' },
        h(
          'div',
          { className: 'dshan-themesrc' },
          h(
            'div',
            { className: 'dshan-seg' },
            h('button', { type: 'button', 'data-active': String(source === 'themes'), onClick: () => pick('themes') }, 'animethemes'),
            h('button', { type: 'button', 'data-active': String(source === 'bilibili'), onClick: () => pick('bilibili') }, T('biliSource')),
          ),
          fellBack ? h('span', { className: 'dshan-rowsub' }, T('themesFellBack')) : null,
        ),
        source === 'themes'
          ? themeList
          : h(
              'div',
              null,
              h(
                'div',
                { className: 'dshan-toolbar' },
                h('input', {
                  className: 'dshan-input',
                  value: term,
                  placeholder: T('themesSearchPlaceholder'),
                  onChange: (event) => setTerm(event.currentTarget.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') setSubmitted(term)
                  },
                }),
                h('button', { className: 'dshan-btn', type: 'button', onClick: () => setSubmitted(term) }, T('searchButton')),
              ),
              search.status === 'error'
                ? h('div', { className: 'dshan-rowsub' }, `${T('themesFailed')}：${search.error?.message ?? ''}`)
                : null,
              songList,
            ),
      )
    }

    function RelationsList({ relations, T, current, onOpen }) {
      if (!Array.isArray(relations) || relations.length === 0) return null
      return h(
        'div',
        null,
        h('div', { className: 'dshan-section' }, `${T('relations')} · ${relations.length}`),
        h(
          'div',
          { className: 'dshan-relations' },
          relations.map((relation) => {
            const target = onOpen ? relationTarget(relation, current) : null
            const body = [
              h('div', { className: 'dshan-relcover' }, relation.cover ? h('img', { src: relation.cover, alt: '', loading: 'lazy' }) : null),
              h(
                'div',
                { className: 'dshan-rowmain' },
                h('div', { className: 'dshan-rowsub' }, relation.relation ?? ''),
                h('div', { className: 'dshan-rowtitle' }, relation.title ?? ''),
                h('div', { className: 'dshan-rowsub' }, [relation.format, relation.year, relation.statusLabel ?? relation.status].filter(Boolean).join(' · ')),
                target !== null ? h('div', { className: 'dshan-rowsub' }, `↵ ${T('openInDetail')}`) : null,
              ),
            ]
            if (target === null) {
              return h('div', { key: relation.id, className: 'dshan-relation' }, body)
            }
            return h(
              'button',
              {
                key: relation.id,
                type: 'button',
                className: 'dshan-relation',
                'data-link': 'true',
                title: relation.title ?? '',
                onClick: () => onOpen(target),
              },
              body,
            )
          }),
        ),
      )
    }

    /* ------------------------------------------------------------------ *
     * The page
     * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Settings — accounts
 *
 * Three logins, three different realities: bilibili hands back its own
 * cookies (scan the QR), AniList and Bangumi hand back a personal token.
 * Nothing here ever sees a password, and the page only ever receives a
 * masked status, never the secret.
 * ------------------------------------------------------------------ */

const PROVIDER_INFO = [
  {
    id: 'bilibili',
    title: '哔哩哔哩',
    hint: '扫码登录后，在线流会带上你的账号：1080P / 大会员片源都能播。',
    kind: 'qr',
  },
  {
    id: 'anilist',
    title: 'AniList',
    hint: '在 AniList → Settings → Developer → Create New Client 拿到 Personal Access Token。',
    kind: 'token',
    link: 'https://anilist.co/settings/developer',
    placeholder: '粘贴 Personal Access Token',
  },
  {
    id: 'bangumi',
    title: 'Bangumi',
    hint: '在 bgm.tv/dev/app 建一个应用，把 App ID / App Secret 填到「Bangumi 偏好」里，然后点「授权」；也可以直接粘贴 Access Token。',
    kind: 'oauth',
    link: 'https://bgm.tv/dev/app',
    placeholder: '粘贴 Access Token',
  },
]

function AccountCard({ info, status, T, onSaved, onCleared }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [qr, setQr] = useState(null)
  const [polling, setPolling] = useState(false)
  // AniCh 的头像是站点图片代理地址，偶尔会挂；挂了就退回首字母。
  const [avatarBroken, setAvatarBroken] = useState(false)

  const say = (kind, text) => setNote({ kind, text })

  const save = async () => {
    if (token.trim() === '') {
      say('error', T('accountNeedToken'))
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const data = await postJson(`${API}/accounts/save`, { provider: info.id, value: token.trim() })
      setToken('')
      say('ok', T('accountSaved'))
      onSaved(data?.accounts?.[info.id] ?? null)
    } catch (error) {
      say('error', error?.message ?? String(error))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    setNote(null)
    try {
      await postJson(`${API}/accounts/logout`, { provider: info.id })
      say('ok', T('accountCleared'))
      onCleared()
    } catch (error) {
      say('error', error?.message ?? String(error))
    } finally {
      setBusy(false)
    }
  }

  const startQr = async () => {
    setBusy(true)
    setNote(null)
    try {
      const data = await postJson(`${API}/accounts/qr`, { provider: info.id })
      if (data === null || typeof data !== 'object' || typeof data.key !== 'string') {
        throw new Error(T('accountHostStale'))
      }
      setQr({ key: data.key, image: data.image, url: data.url, state: 'waiting' })
      setPolling(true)
    } catch (error) {
      say('error', error?.message ?? String(error))
    } finally {
      setBusy(false)
    }
  }

  /**
   * OAuth: the Host builds the authorize URL (it holds the app secret) and the
   * callback comes back to this same origin. We just open the tab and poll the
   * `state` like a QR key.
   */
  const startOauth = async () => {
    setBusy(true)
    setNote(null)
    try {
      const redirectUri = `${window.location.origin}${API}/bangumi/oauth/callback`
      const data = await postJson(`${API}/accounts/qr`, { provider: info.id, redirectUri })
      if (data === null || typeof data !== 'object' || typeof data.url !== 'string') {
        throw new Error(T('accountHostStale'))
      }
      window.open(data.url, '_blank', 'noopener,noreferrer')
      setQr({ kind: 'oauth', key: String(data.state ?? ''), url: data.url, state: 'waiting' })
      setPolling(true)
    } catch (error) {
      say('error', error?.message ?? String(error))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Password providers (AniCh) sign in with email + password, and can register a
   * new account from here: the Host asks the site for a mail code first.
   */
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [regOpen, setRegOpen] = useState(false)
  const [regEmail, setRegEmail] = useState('')
  const [regCode, setRegCode] = useState('')
  const [regName, setRegName] = useState('')
  const [regPassword, setRegPassword] = useState('')

  const loginPassword = async () => {
    if (user.trim() === '' || password === '') {
      say('error', T('accountNeedUserPass'))
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const data = await postJson(`${API}/accounts/password`, {
        provider: info.id,
        user: user.trim(),
        password,
      })
      setPassword('')
      say('ok', T('accountLoggedIn'))
      onSaved(data?.accounts?.[info.id] ?? null)
    } catch (error) {
      say('error', error?.message ?? String(error))
    } finally {
      setBusy(false)
    }
  }

  const sendCode = async () => {
    setBusy(true)
    setNote(null)
    try {
      const data = await postJson(`${API}/accounts/code`, { provider: info.id, email: regEmail.trim() })
      say('ok', String(data?.message ?? T('accountCodeSent')))
    } catch (error) {
      say('error', error?.message ?? String(error))
    } finally {
      setBusy(false)
    }
  }

  const registerAccount = async () => {
    setBusy(true)
    setNote(null)
    try {
      const data = await postJson(`${API}/accounts/register`, {
        provider: info.id,
        email: regEmail.trim(),
        code: regCode.trim(),
        name: regName.trim(),
        password: regPassword,
      })
      setRegPassword('')
      setRegCode('')
      setRegOpen(false)
      say('ok', T('accountRegistered'))
      onSaved(data?.accounts?.[info.id] ?? null)
    } catch (error) {
      say('error', error?.message ?? String(error))
    } finally {
      setBusy(false)
    }
  }

  // Poll the key while the QR is on screen; the Host saves the cookie for us.
  useEffect(() => {
    if (!polling || qr === null) return undefined
    let alive = true
    const tick = async () => {
      try {
        const data = await fetchJson(
          `${API}/accounts/qr/status?key=${encodeURIComponent(qr.key)}&provider=${encodeURIComponent(info.id)}`,
        )
        if (!alive) return
        const state = data?.state ?? 'waiting'
        if (state === 'ok') {
          setQr(null)
          setPolling(false)
          say('ok', T('accountLoggedIn'))
          onSaved(data?.accounts?.[info.id] ?? null)
          return
        }
        if (state === 'expired') {
          setQr(null)
          setPolling(false)
          say('error', T('qrExpired'))
          return
        }
        setQr((current) => (current === null ? current : { ...current, state }))
      } catch (error) {
        if (alive) {
          setPolling(false)
          say('error', error?.message ?? String(error))
        }
      }
    }
    const timer = window.setInterval(tick, 2200)
    tick()
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [polling, qr?.key])

  const loggedIn = status?.loggedIn === true

  return h(
    'section',
    { className: 'dshan-account' },
    h(
      'div',
      { className: 'dshan-account-head' },
      h(
        'div',
        { className: 'dshan-account-id' },
        h('div', { className: 'dshan-account-title' }, info.title),
        h('div', { className: 'dshan-account-hint' }, info.hint),
      ),
      loggedIn
        ? h(
            'span',
            { className: 'dshan-account-badge', 'data-on': 'true' },
            `${T('accountLoggedInAs')} ${status?.name === '' ? `#${status?.uid ?? ''}` : status?.name}`,
          )
        : h('span', { className: 'dshan-account-badge' }, T('accountNotLoggedIn')),
    ),

    loggedIn
      ? h(
          'div',
          { className: 'dshan-account-row' },
          status?.avatar && !avatarBroken
            ? h('img', {
                className: 'dshan-account-face',
                src: status.avatar,
                alt: '',
                referrerPolicy: 'no-referrer',
                onError: () => setAvatarBroken(true),
              })
            : h('span', { className: 'dshan-account-initial' }, (status?.name === '' ? '' : String(status?.name ?? '').trim().slice(0, 1)).toUpperCase() || '·'),
          h(
            'div',
            { className: 'dshan-account-meta' },
            h(
              'div',
              { className: 'dshan-account-name' },
              status?.name !== '' && status?.name
                ? status.name
                : `${T('accountLoggedInAs')} #${status?.uid ?? ''}`,
            ),
          ),
          h(
            'button',
            { className: 'dshan-btn', type: 'button', disabled: busy, onClick: logout },
            T('accountLogout'),
          ),
        )
      : null,

    !loggedIn && info.kind === 'password'
      ? h(
          'div',
          { className: 'dshan-account-col' },
          h(
            'div',
            { className: 'dshan-account-row' },
            h('input', {
              className: 'dshan-input',
              type: 'text',
              value: user,
              placeholder: T('accountEmail'),
              onChange: (event) => setUser(event.target.value),
            }),
            h('input', {
              className: 'dshan-input',
              type: 'password',
              value: password,
              placeholder: T('accountPassword'),
              onChange: (event) => setPassword(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') void loginPassword()
              },
            }),
            h(
              'button',
              { className: 'dshan-btn dshan-btn-primary', type: 'button', disabled: busy, onClick: loginPassword },
              busy ? T('accountWorking') : T('accountLogin'),
            ),
          ),
          h(
            'button',
            {
              className: 'dshan-account-toggle',
              type: 'button',
              onClick: () => setRegOpen((value) => !value),
            },
            regOpen ? T('accountRegisterClose') : T('accountRegisterOpen'),
          ),
          regOpen
            ? h(
                'div',
                { className: 'dshan-account-col' },
                h(
                  'div',
                  { className: 'dshan-account-row' },
                  h('input', {
                    className: 'dshan-input',
                    type: 'email',
                    value: regEmail,
                    placeholder: T('accountEmail'),
                    onChange: (event) => setRegEmail(event.target.value),
                  }),
                  h('input', {
                    className: 'dshan-input',
                    type: 'text',
                    value: regCode,
                    placeholder: T('accountCode'),
                    onChange: (event) => setRegCode(event.target.value),
                  }),
                  h(
                    'button',
                    { className: 'dshan-btn', type: 'button', disabled: busy, onClick: sendCode },
                    T('accountSendCode'),
                  ),
                ),
                h(
                  'div',
                  { className: 'dshan-account-row' },
                  h('input', {
                    className: 'dshan-input',
                    type: 'text',
                    value: regName,
                    placeholder: T('accountUser'),
                    onChange: (event) => setRegName(event.target.value),
                  }),
                  h('input', {
                    className: 'dshan-input',
                    type: 'password',
                    value: regPassword,
                    placeholder: T('accountPassword'),
                    onChange: (event) => setRegPassword(event.target.value),
                  }),
                  h(
                    'button',
                    { className: 'dshan-btn dshan-btn-primary', type: 'button', disabled: busy, onClick: registerAccount },
                    T('accountRegister'),
                  ),
                ),
              )
            : null,
        )
      : null,

    !loggedIn && (info.kind === 'qr' || info.kind === 'oauth')
      ? h(
          'div',
          { className: 'dshan-account-row' },
          h(
            'button',
            {
              className: 'dshan-btn dshan-btn-primary',
              type: 'button',
              disabled: busy,
              onClick: info.kind === 'oauth' ? startOauth : startQr,
            },
            busy ? T('accountWorking') : info.kind === 'oauth' ? T('accountOauthOpen') : T('biliScanLogin'),
          ),
          h('span', { className: 'dshan-account-or' }, T('accountOrCookie')),
        )
      : null,

    !loggedIn
      ? h(
          'div',
          { className: 'dshan-account-row' },
          h('input', {
            className: 'dshan-input',
            type: 'password',
            value: token,
            placeholder: info.kind === 'qr' ? T('biliCookiePlaceholder') : info.placeholder,
            onChange: (event) => setToken(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') void save()
            },
          }),
          h(
            'button',
            { className: 'dshan-btn', type: 'button', disabled: busy, onClick: save },
            busy ? T('accountWorking') : T('accountSave'),
          ),
        )
      : null,

    info.link
      ? h(
          'a',
          { className: 'dshan-account-link', href: info.link, target: '_blank', rel: 'noreferrer' },
          T('accountGetToken'),
        )
      : null,

    note === null
      ? null
      : h('div', { className: 'dshan-account-note', 'data-kind': note.kind }, note.text),

    qr === null
      ? null
      : h(
          'div',
          { className: qr.kind === 'oauth' ? 'dshan-oauth' : 'dshan-qr' },
          qr.kind === 'oauth'
            ? h(
                'div',
                { className: 'dshan-oauth-body' },
                h('div', { className: 'dshan-oauth-state' }, T('accountOauthWaiting')),
                h(
                  'a',
                  { className: 'dshan-account-link', href: qr.url, target: '_blank', rel: 'noreferrer' },
                  T('accountOauthReopen'),
                ),
              )
            : h('img', { className: 'dshan-qr-img', src: qr.image, alt: T('biliScanLogin') }),
          qr.kind === 'oauth'
            ? null
            : h(
                'div',
                { className: 'dshan-qr-state' },
                qr.state === 'scanned' ? T('qrScanned') : T('qrWaiting'),
              ),
          h(
            'button',
            {
              className: 'dshan-btn',
              type: 'button',
              onClick: () => {
                setQr(null)
                setPolling(false)
              },
            },
            T('qrCancel'),
          ),
        ),
  )
}

function AccountsSection({ T }) {
  const accounts = useEndpoint(`${API}/accounts`)
  const data = accounts.status === 'ready' ? accounts.data : null
  // A mutation answers with the account it just saved: show that at once,
  // instead of waiting for the reload (which may read another host instance).
  const [fresh, setFresh] = useState({})
  const hostProviders = Array.isArray(data?.providers) ? data.providers : []
  // The extensions own their accounts, so the Host's list is the truth: a
  // provider that is not registered cannot show a card, and a new extension
  // that declares one shows up without a page change. PROVIDER_INFO stays as
  // the copy for the three built-ins (links, placeholders) and as the fallback
  // while the first fetch is still in flight.
  const list =
    hostProviders.length === 0
      ? PROVIDER_INFO
      : hostProviders
          // `scoped` providers belong to one extension and are edited in that
          // extension's own panel (AniCh: login + registration next to the data
          // source). Listing them here too is how you end up with two cards that
          // disagree about which one you are supposed to use.
          .filter((host) => host?.scoped !== true)
          .map((host) => {
            const base = PROVIDER_INFO.find((entry) => entry.id === host.id) ?? {}
            return {
              id: host.id,
              title: host.label || base.title || host.id,
              hint: host.hint || base.hint || '',
              kind:
                host.kind === 'qr' || host.kind === 'oauth' || host.kind === 'password' ? host.kind : 'token',
              link: host.link || base.link,
              placeholder: host.placeholder || base.placeholder,
            }
          })
  const status = data?.accounts ?? null

  return h(
    'div',
    { className: 'dshan-settings' },
    h('h2', { className: 'dshan-settings-title' }, T('settingsAccounts')),
    h('p', { className: 'dshan-settings-lead' }, T('settingsAccountsLead')),
    accounts.status === 'error'
      ? h('div', { className: 'dshan-account-note', 'data-kind': 'error' }, accounts.error)
      : null,
    accounts.status === 'loading' && data === null
      ? h('div', { className: 'dshan-loading' }, T('loading'))
      : null,
    list.map((info) =>
      h(AccountCard, {
        key: info.id,
        info,
        status: fresh[info.id] ?? (status === null ? null : status[info.id] ?? null),
        T,
        onSaved: (account) => {
          if (account !== null && typeof account === 'object') {
            setFresh((current) => ({ ...current, [info.id]: account }))
          }
          accounts.reload()
        },
        onCleared: () => {
          setFresh((current) => {
            const next = { ...current }
            delete next[info.id]
            return next
          })
          accounts.reload()
        },
      }),
    ),
  )
}

    
    const SETTINGS_KEYS_ZH = {
  tabSettings: '设置',
  settingsAccounts: '账号',
  settingsAccountsLead: '登录后，在线流会用你的账号取片，追番列表也能同步到对应的站点。凭据只保存在本机。',
  accountNotLoggedIn: '未登录',
  accountLoggedInAs: '已登录',
  accountLogout: '退出登录',
  accountSave: '保存',
  accountWorking: '处理中…',
  accountSaved: '已保存并验证通过',
  accountCleared: '已退出登录',
  accountLoggedIn: '登录成功',
  accountNeedToken: '请先粘贴凭据',
  accountOrCookie: '或粘贴 Cookie',
  accountOauthOpen: '打开授权页面',
  accountOauthWaiting: '授权页面已在浏览器里打开，授权完成后这里会自动更新。',
  accountOauthReopen: '重新打开授权页面',
  accountEmail: '邮箱',
  accountPassword: '密码',
  accountUser: '用户名',
  accountCode: '邮箱验证码',
  accountLogin: '登录',
  accountRegister: '注册',
  accountRegisterOpen: '没有账号？点这里注册',
  accountRegisterClose: '收起注册',
  accountSendCode: '获取验证码',
  accountCodeSent: '验证码已发送',
  accountRegistered: '注册成功，已登录',
  accountNeedUserPass: '请先填邮箱和密码',
  accountGetToken: '在哪里拿 Token ↗',
  biliScanLogin: '扫码登录',
  biliCookiePlaceholder: '或粘贴 SESSDATA=... 的 Cookie',
  qrWaiting: '用哔哩哔哩 App 扫码',
  qrScanned: '已扫码，请在手机上确认',
  qrExpired: '二维码已过期，请重新获取',
  qrCancel: '取消',
  accountHostStale: '宿主路由还没就绪：到插件市场把「追番」关一次再打开，然后重试。',
}

    const SETTINGS_KEYS_EN = {
  tabSettings: 'Settings',
  settingsAccounts: 'Accounts',
  settingsAccountsLead: 'Sign in so streaming uses your account and your list can sync. Credentials stay on this machine.',
  accountNotLoggedIn: 'Not signed in',
  accountLoggedInAs: 'Signed in as',
  accountLogout: 'Sign out',
  accountSave: 'Save',
  accountWorking: 'Working…',
  accountSaved: 'Saved and verified',
  accountCleared: 'Signed out',
  accountLoggedIn: 'Signed in',
  accountNeedToken: 'Paste a credential first',
  accountOrCookie: 'or paste a cookie',
  accountOauthOpen: 'Open the authorize page',
  accountOauthWaiting: 'The authorize page is open in your browser; this updates once you finish.',
  accountOauthReopen: 'Reopen the authorize page',
  accountGetToken: 'Where to get a token ↗',
  biliScanLogin: 'Scan to sign in',
  biliCookiePlaceholder: 'or paste SESSDATA=... cookie',
  qrWaiting: 'Scan with the Bilibili app',
  qrScanned: 'Scanned — confirm on your phone',
  qrExpired: 'QR expired, request a new one',
  qrCancel: 'Cancel',
  accountHostStale: 'Host routes are not live yet — toggle the anime plugin off and on, then retry.',
  accountEmail: 'Email',
  accountPassword: 'Password',
  accountUser: 'Username',
  accountCode: 'Email code',
  accountLogin: 'Sign in',
  accountRegister: 'Register',
  accountRegisterOpen: 'No account? Register here',
  accountRegisterClose: 'Hide registration',
  accountSendCode: 'Send code',
  accountCodeSent: 'Code sent',
  accountRegistered: 'Registered and signed in',
  accountNeedUserPass: 'Fill in the email and password first',
}

    Object.assign(ZH, {
      charInfo: '角色信息',
      charNoDesc: '这个角色还没有简介。',
      showMoreInfo: '显示更多',
      showLess: '收起',
      voiceActor: '声优',
      close: '关闭',
    })
    Object.assign(EN, {
      charInfo: 'CHARACTER INFORMATION',
      charNoDesc: 'No description for this character yet.',
      showMoreInfo: 'Show more info',
      showLess: 'Show less',
      voiceActor: 'Voice',
      close: 'Close',
    })
    Object.assign(ZH, SETTINGS_KEYS_ZH)
    Object.assign(EN, SETTINGS_KEYS_EN)

    const TABS = [
      ['season', 'tabSeason'],
      ['airing', 'tabAiring'],
      ['search', 'tabSearch'],
      ['mine', 'tabMine'],
      ['sources', 'tabSources'],
      ['downloads', 'tabDownloads'],
      ['settings', 'tabSettings'],
    ]

    function Panel({ T }) {
      const [, setPrefEpoch] = useState(0)
      useEffect(() => subscribeUiPrefs(() => setPrefEpoch((value) => value + 1)), [])
      const prefsRemote = useEndpoint(`${API}/settings`)
      useEffect(() => {
        if (prefsRemote.data?.settings?.ui !== undefined) applyUiPrefs(prefsRemote.data.settings.ui)
        if (prefsRemote.data?.settings?.stream !== undefined) {
          Object.assign(streamPrefs, prefsRemote.data.settings.stream)
        }
      }, [prefsRemote.data])
      const [tab, setTab] = useState('season')
      const [source, setSource] = useState(() => readSource())
      const [watchlist, setWatchlist] = useState(() => readWatchlist())
      // Relations open the next title on top instead of replacing the one you
      // came from, so closing walks back through the franchise you explored.
      const [trail, setTrail] = useState([])
      const detail = trail.length === 0 ? null : trail[trail.length - 1]
      const openDetail = useCallback((media) => {
        if (media === null || media === undefined) return
        setTrail((current) => [...current, media])
      }, [])
      const closeDetail = useCallback(() => {
        setTrail((current) => current.slice(0, -1))
      }, [])
      const health = useEndpoint(`${API}/health`)

      // Remember the real server origin the host reports, so hand-offs to mpv
      // get an http url even though this page lives on dsh-app://.
      React.useEffect(() => {
        const origin = health?.data?.origin
        if (typeof origin === 'string' && /^https?:\/\//.test(origin)) HOST_ORIGIN = origin
      }, [health?.data?.origin])
      const extensions = useEndpoint(`${API}/extensions`)
      const [refreshKey, setRefreshKey] = useState(0)
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        writeWatchlist(watchlist)
      }, [watchlist])

      useEffect(() => {
        writeSource(source)
      }, [source])

      const followedIds = useMemo(() => new Set(watchlist.map((entry) => entry.id)), [watchlist])

      const toggle = useCallback((media) => {
        setWatchlist((current) => {
          const exists = current.some((entry) => entry.id === media.id)
          if (exists) return current.filter((entry) => entry.id !== media.id)
          return current.concat([{ ...itemFromMedia(media), id: media.id }])
        })
      }, [])

      const progress = useCallback((entry, delta) => {
        setWatchlist((current) =>
          current.map((item) => {
            if (item.id !== entry.id) return item
            const total = typeof item.total === 'number' && item.total > 0 ? item.total : null
            let watched = (item.watched ?? 0) + delta
            if (watched < 0) watched = 0
            if (total !== null && watched > total) watched = total
            return { ...item, watched }
          }),
        )
      }, [])

      const refresh = () => {
        setBusy(true)
        health.reload()
        extensions.reload()
        setRefreshKey((value) => value + 1)
        setTimeout(() => setBusy(false), 600)
      }

      const sources = health.data?.sources
      // true / false / null (not probed yet — the dot stays grey rather than
      // claiming a source is down before it was ever asked).
      const hostBuild = health.data?.build
      const hostStale = typeof hostBuild === 'string' && hostBuild !== EXPECTED_BUILD
      const hostDown = health.status === 'error'

      // One line per page load, reported to the host so its log records which
      // build the page itself is running — the only way to tell a cached page
      // from a fixed one.
      useEffect(() => {
        console.info(
          `[dsh-anime] page build ${EXPECTED_BUILD} · host ${health.status === 'idle' ? 'asking' : hostBuild ?? health.status}`,
        )
        fetchJson(`${API}/client/heartbeat?build=${encodeURIComponent(EXPECTED_BUILD)}`).catch(() => {})
      }, [])

      // The header mirrors the 片源 switches, so it keeps asking: a switch
      // flipped there (or in another window) shows up without a manual refresh.
      useEffect(() => {
        const handle = window.setInterval(() => extensions.reload(), 5000)
        return () => window.clearInterval(handle)
      }, [extensions.reload])

      // Which of the three data sources are switched on in 片源: the top
      // switcher offers exactly those. Until the list arrives nothing is
      // hidden, and when every source is off all three stay, so the page is
      // never left with nothing to read from.
      const enabledSources = useMemo(() => {
        const items = Array.isArray(extensions.data?.items) ? extensions.data.items : []
        if (items.length === 0) return null
        const on = new Set(items.filter((entry) => entry.enabled === true).map((entry) => entry.id))
        const shown = SOURCE_OPTIONS.filter(([key]) => on.has(key))
        return shown.length === 0 ? null : shown
      }, [extensions.data])
      const visibleSources = enabledSources ?? SOURCE_OPTIONS
      useEffect(() => {
        if (enabledSources === null) return
        if (!enabledSources.some(([key]) => key === source)) setSource(enabledSources[0][0])
      }, [enabledSources, source])

      const sourceOk = (key) => {
        if (key === 'anilist') return health.status === 'error' ? false : true
        const probe = sources?.[key]?.lastProbe
        if (health.status === 'error') return false
        if (probe === undefined || probe === null || probe.at === 0) return null
        return probe.ok === true
      }

      // A detail page takes the whole panel: stacking it under the grid left the
      // cards visible through the sheet and made the page unscrollable.
      if (detail !== null) {
        return h(
          'div',
          { className: 'dshan-root' },
          h(Detail, {
            key: detail.id ?? `detail-${trail.length}`,
            media: detail,
            T,
            followed: followedIds.has(detail.id),
            onToggle: toggle,
            onClose: closeDetail,
            onOpenRelated: openDetail,
            nested: trail.length > 1,
          }),
        )
      }

      return h(
        'div',
        { className: 'dshan-root' },
        h(
          'div',
          { className: 'dshan-head' },
          h(
            'div',
            { className: 'dshan-brand' },
            h(Mark, { size: 30 }),
            h('div', null, h('h1', null, T('title')), h('p', null, T('subtitle'))),
          ),
          h(
            'div',
            { className: 'dshan-badges' },
            // The one page-wide switch: it decides where 本季新番 / 放送表 /
            // 搜索 read from, so the same show never appears twice. Which
            // sources appear here follows the 片源 switches: a source that is
            // off there is not offered here.
            h(
              'div',
              { className: 'dshan-sources', role: 'group', 'aria-label': T('dataSource'), title: T('switchSource') },
              visibleSources.map(([key, label]) =>
                h(
                  'button',
                  {
                    key,
                    type: 'button',
                    className: 'dshan-source',
                    'data-active': source === key ? 'true' : 'false',
                    title: sources?.[key]?.lastProbe?.message ?? sources?.[key]?.endpoint ?? '',
                    onClick: () => setSource(key),
                  },
                  h('span', { className: `dshan-dot${sourceOk(key) === true ? ' on' : sourceOk(key) === false ? ' off' : ''}` }),
                  label,
                ),
              ),
            ),
            hostStale || hostDown
              ? h(
                  'span',
                  {
                    className: 'dshan-badge',
                    'data-warn': 'true',
                    title: `${T('hostStaleShort')}: ${hostBuild ?? health.error ?? ''}`,
                  },
                  T('hostStaleShort'),
                )
              : null,
            h(
              'button',
              { className: `dshan-iconbtn${busy ? ' spinning' : ''}`, onClick: refresh, title: T('refresh'), 'aria-label': T('refresh') },
              h(IconRefresh, { size: 14 }),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dshan-tabs', role: 'tablist' },
          TABS.map(([key, labelKey]) =>
            h(
              'button',
              {
                key,
                className: 'dshan-tab',
                role: 'tab',
                'data-active': tab === key ? 'true' : 'false',
                onClick: () => setTab(key),
              },
              T(labelKey),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dshan-body' },
          tab === 'season'
            ? safeTab(SeasonTab, { key: `season-${source}-${refreshKey}`, T, followedIds, onToggle: toggle, onOpen: openDetail, source })
            : tab === 'airing'
              ? safeTab(AiringTab, { key: `airing-${source}-${refreshKey}`, T, followedIds, onToggle: toggle, onOpen: openDetail, source })
              : tab === 'search'
                ? safeTab(SearchTab, { key: `search-${source}`, T, followedIds, onToggle: toggle, onOpen: openDetail, source })
                : tab === 'mine'
                  ? safeTab(MineTab, {
                      T,
                      entries: watchlist,
                      onToggle: toggle,
                      onOpen: openDetail,
                      onProgress: progress,
                    })
                  : tab === 'sources'
                    ? safeTab(SourcesTab, { key: `sources-${refreshKey}`, T, onChanged: extensions.reload })
                    : tab === 'downloads'
                      ? safeTab(DownloadsTab, { T })
                      : safeTab(SettingsTab, { T }),
        ),
              )
    }

    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        console.error('dsh-anime tab crashed', error)
      }

      render() {
        const error = this.state.error
        if (error === null) return this.props.children
        return h(
          'div',
          { className: 'dshan-crash' },
          h('div', { className: 'dshan-crash-title' }, uiPrefs.locale === 'en' ? 'This tab crashed' : '这个标签页崩了'),
          h('pre', { className: 'dshan-crash-body' }, String((error && (error.stack || error.message)) || error)),
          h(
            'button',
            { type: 'button', className: 'dshan-btn', onClick: () => this.setState({ error: null }) },
            uiPrefs.locale === 'en' ? 'Retry' : '重试',
          ),
        )
      }
    }

    /** Render one tab inside the boundary so a crash stays local. */
    function safeTab(Component, props) {
      return h(PanelBoundary, null, h(Component, props))
    }

    /* ------------------------------------------------------------------ *
     * Registration
     * ------------------------------------------------------------------ */

    return {
      name: 'dsh-anime',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ensureStyles()

        try {
          ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-anime: dictionaries')
        } catch (error) {
          console.warn('[dsh-anime] locale registration failed; falling back to built-in strings', error)
        }

        let bound
        try {
          bound = ctx.locale.bind(NS)
        } catch {
          bound = undefined
        }
        const T = (key) => {
          if (uiPrefs.locale === 'zh') {
            const fixedZh = ZH[key]
            return fixedZh === undefined ? key : fixedZh
          }
          if (uiPrefs.locale === 'en') {
            const fixedEn = EN[key]
            if (fixedEn !== undefined) return fixedEn
            const fallbackZh = ZH[key]
            return fallbackZh === undefined ? key : fallbackZh
          }
          let value
          if (typeof bound === 'function') {
            try {
              value = bound(key)
            } catch {
              value = undefined
            }
          }
          if (typeof value === 'string' && value !== '' && value !== key) return value
          const fallback = ZH[key]
          return fallback === undefined ? key : fallback
        }
        translate = T

        const disposers = []
        try {
          disposers.push(
            ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, () => h(Panel, { T })),
          )
        } catch (error) {
          console.error('[dsh-anime] could not register the main panel', error)
        }
        try {
          disposers.push(
            ctx.slots.register(
              { name: 'sidebar.panellist', id: PANEL_ID, order: PANEL_ORDER, label: () => T('nav'), locale: NS },
              (owner) => h(Mark, { size: owner?.size ?? 18 }),
            ),
          )
        } catch (error) {
          console.error('[dsh-anime] could not register the sidebar icon', error)
        }

        return () => {
          for (const dispose of disposers) {
            try {
              if (typeof dispose === 'function') dispose()
            } catch {
              /* already gone */
            }
          }
        }
      },
    }
  },
})
