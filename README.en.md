# 追番 · dsh-anime

<p align="center">
  <img src="icon.svg" width="72" height="72" alt="dsh-anime">
</p>

[中文](README.md) · **English**

A whole-page anime tracker plugin for [DeepSeek Harness](https://github.com/deepseek-ai): seasonal charts, airing schedule, search, watchlist progress,
anime details, online playback, torrent playback, downloads, theme songs. It registers as a "sidebar icon + main panel"
(`sidebar.panellist` id `dsh-anime` ⇄ `main` key `dsh-anime`) — not an overlay, and not a widget.

> An anime tracker as a DeepSeek Harness plugin: seasonal charts, airing schedule, search, watchlist, detail pages,
> streaming (bilibili / FQDM / AniCh), torrents, a download manager and OP/ED themes — with its own player
> (**PrismFlow**: MSE + libass + Anime4K) instead of a bare `<video>` tag.

- Version: `1.0.13` (page build `2026-10-25.99`)
- Runtime: DeepSeek Harness desktop edition (provides the plugin host and the Web front end)
- Optional external dependencies: `ffmpeg` (transcoding / download muxing), `mpv` (embedded or external playback), `qBittorrent` (external download client)

### Note  
    This plugin currently has quite a few incomplete features and bugs; they will be solved and optimised one by one in the future.

## Table of contents

- [Features](#features)
- [Installation](#installation)
- [First launch: only one source is on](#first-launch-only-one-source-is-on)
- [Data sources](#data-sources)
- [Playback](#playback)
- [Watchlist and details](#watchlist-and-details)
- [Theme songs (OP / ED)](#theme-songs-op--ed)
- [Downloads](#downloads)
- [Accounts and privacy](#accounts-and-privacy)
- [Settings](#settings)
- [HTTP API](#http-api)
- [Architecture](#architecture)
- [Development](#development)
- [Known limitations](#known-limitations)
- [License and third-party](#license-and-third-party)

---

## Features

| Page | What it does |
| --- | --- |
| Seasonal / Search | AniList-style left filter rail + poster grid: season, year, sort (popularity / score / start date), genre, tags, airing status, format, score range, whether to include adult content; the Search page uses the same grid |
| Airing | The next 7 days of broadcasts, grouped by weekday, with today highlighted; the data follows the anime database selected in the page header |
| Watchlist | A local watchlist: episode +1 / −1, progress bar, continue watching; watchlist cards show the next episode and the number of episodes already watched |
| Details | Banner / cover / score / genres / studios / external links / trailer / countdown to the next episode; tabs: Info, Online stream, Torrent stream, Watch order, Themes, Characters & relations |
| Online stream | bilibili, FQDM, AniCh, plus AnimeFlow declarative sources (`src-*`): search → season match → episode grid → play; **real route names**, automatic dead-route switching |
| Torrent stream | AniBT / AnimeTosho: episode + resolution + batch-only + exact title filter, with size / episode number / fansub group; built-in BT engine or hand over to qBittorrent |
| Sources | Installed extensions + the Seanime Marketplace catalogue; toggles, preferences, and the `<>` source view / edit in the top-right corner of each card |
| Downloads | Online stream and Torrent stream share one task table (Motrix style): progress, speed, pause, cancel, open folder |
| Settings | Sections for playback, desktop players, torrent stream, downloads & data, interface language and so on |

The page header also has a **three-way anime database** switch (AniList / Bangumi / Animeko) that decides where Seasonal, Airing and Search read from.
The three are never mixed on one screen — the same show would then appear twice with two different sets of ids. Online stream and Torrent stream are unrelated to that switch.

## Installation

The plugin is just an ordinary DSH plugin package (`dsh.bundle.patch` + `dsh.client.platform = web`); there are two ways to install it.

### Option 1: install from GitHub (recommended)

```bash
# Install the package into the profile (equivalent to running pnpm add inside the profile directory)
dsh --profile desktop plugin add "git+https://github.com/Elisoar111/dsh-anime.git"

# On macOS / Linux use your own profile name (web / tui / …)
dsh --profile web plugin add "git+https://github.com/Elisoar111/dsh-anime.git"
```

Then make sure `dsh.profile.bundles` in the profile's `package.json` contains this entry — without it the plugin is not loaded:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@local/dsh-anime", "…other plugins"]
    }
  }
}
```

Restart DSH (or switch the plugin off → on once in the plugin panel) and 「追番 (Anime)」 appears in the sidebar.

### Option 2: local development install

```bash
git clone https://github.com/Elisoar111/dsh-anime.git
cd dsh-anime
npm install          # the only runtime dependency is webtorrent
```

Add one dependency and one bundle to the profile's `package.json`, with the path pointing at your clone:

```json
{
  "dependencies": {
    "@local/dsh-anime": "link:D:/path/to/dsh-anime"
  },
  "dsh": {
    "profile": {
      "bundles": ["@local/dsh-anime"]
    }
  }
}
```

```bash
dsh --profile desktop plugin install     # let pnpm create the link
```

Profile file location: `$DSH_HOME/profiles/<profile>/package.json`,
on Windows by default `%USERPROFILE%\.dsh\profiles\desktop\package.json`.

During development, after changing `index.js` / `lib/*.js`: restart the plugin once (off → on) and that is enough; changing `client.js` additionally needs a page refresh.

### Optional external dependencies

| Tool | Used for | What happens without it |
| --- | --- | --- |
| `ffmpeg` | Online-stream transcoding (HLS → fMP4), torrent download muxing | Online streams cannot play; torrent stream is limited to "Open with player" |
| `mpv` | External playback via "Open with player" | One entry point less; the built-in player is unaffected |
| `qBittorrent` | Handing torrent tasks to an external client | Only the built-in BT engine is available |

> After installation **only AniList is switched on**; the other sources have to be enabled by yourself under Sources — see the next section.

## First launch: only one source is on

Of the nine built-in sources, every one except AniList has `defaultEnabled: false`, and AnimeFlow's declarative sources (`src-*`) are off by default as well.
That way a new user can get the page running first and open sources as needed, instead of a screen of a dozen cards all saying "not configured / unreachable".

How to enable them: Sources → find the card → toggle at the bottom right. The toggle state is written into
`extensions.<id>.enabled` in `$DSH_HOME/state/dsh-anime/settings.json`, and after that even editing that source's own preferences will not quietly reset it
(`dev/check-default-sources.mjs` guards exactly this).

## Data sources

| Source | What it provides | Network status (measured) |
| --- | --- | --- |
| **AniList** `graphql.anilist.co` | Seasonal charts, popularity, airing timeline, search, details (characters / relations / studios / trailer), watch order | Works, 1–8 seconds |
| **Bangumi** `api.bgm.tv` / mirror `bgmapi.anibt.net` | Weekly airing schedule, Chinese search, search shows by season, details / episodes / collection | The official address times out; the data endpoints go through the anibt mirror by default (works). **OAuth login still points at `bgm.tv`**, and the mirror does not proxy that endpoint, so collection sync needs your own proxy |
| **Animeko** `api.animeko.org` | Season schedule, airing schedule, search, entry details; covers from `static.myani.org` | Works, anonymous without a token, 1–2 seconds; entry ids share the same id space as Bangumi |
| **bilibili** `api.bilibili.com` | Online stream (bangumi + user uploads), second Themes source | Works; without a cookie you get a 412 risk-control block, so the host fetches `buvid3/buvid4` first and then requests |
| **FQDM** | Online stream (MacCMS template site) | Works; the route table is `{name, sid, count}`, and the CDN of some routes is dead (see "automatic dead-route switching") |
| **AniCh** `ani.emmmm.eu.org` | Online stream (site parsing) + index (season / search / details / episodes) | Works; among the 15 parsed routes some are promo clips on a Xiaohongshu CDN and must be filtered out by domain |
| **AniBT** `anibt.net` | First choice for torrent stream, Chinese fansub groups | Works, 1–4 seconds |
| **AnimeTosho** `animetosho.org` | Torrent-stream fallback (HTML parsing) | Works, but many trackers are dead |
| **AnimeFlow declarative sources** `assets/sources/animeflow` | `src-girigiri` / `src-gpjda` / `src-mxdm` and others, rule-driven online sources | Depends on the site |
| **Seanime Marketplace** (jsDelivr mirror) | The Sources page lists the online-stream / torrent-stream providers of the upstream ecosystem (71 + 28 measured this time; it follows the upstream list) | GitHub raw is unreachable, so jsDelivr is used |

Every upstream is **proxied and cached by the host** (short-term 60 seconds / mid-term 10 minutes / Sources catalogue 6 hours): a browser hitting them directly runs into CORS and
Referer hotlink protection, while the host side has neither limitation and does not expose the upstream URL to the page either.

### How the Chinese titles are filled in

AniList only has romanised / Japanese / English titles, so the poster wall is naturally English when it is selected. The host does one layer of **Chinese title mapping**:
if the entry's own `title.native` is Chinese (has Han characters, no kana) it is used directly; otherwise the host goes to Animeko's schedule for the same season
(`/v1/schedule/season/{id}` and `/v1/schedule/airing`) and builds a `name + aliases` index for **exact** matching.
A title is only renamed on an exact hit — an earlier attempt at "take the first Animeko search result" mapped「薬屋のひとりごと」onto
「BanG Dream! 第三季」, which is worse than keeping the English title, so it was dropped. The index is cached for 6 hours; titles that still miss keep their original name.

For 100% Chinese, switch to the **Animeko** data source (it ships its own `nameCn`).

## Playback

### PrismFlow (default engine)

An in-house player component: bilibili's DASH video track / audio track are muxed by the page itself via MSE, subtitles go through libass (real ASS rendering —
font / size / colour / outline / shadow are all changed in Settings and emitted as host-generated `[V4+ Styles]`), and the picture can optionally get Anime4K sharpening / upscaling.
It depends on no external process and does not occupy its own window.

- Settings → Playback → "Playback engine": `PrismFlow` (default) or `Embedded mpv` (native rendering, Anime4K goes through mpv's `--glsl-shaders-append`).
- The same control bar is used elsewhere as well: the anime, torrent-stream and theme-song (OP/ED) players are all built on it, so the preload segment, the quality menu,
  the keyboard shortcuts and picture-in-picture behave identically everywhere.

### Online stream

1. Search: `/bili/search`, `/online/search` (FQDM / AniCh / `src-*` go through one shared abstraction).
2. Episodes: `/bili/season`, `/online/episodes`.
3. Resolve: done internally by `/online/resolve`; the host pulls the stream with a `Referer` and **passes Range through** (206).
4. Playback: `<video>`/MSE reads `/online/stream`, or the transcoding path `/torrent/transcode`.

**Automatic dead-route switching**: `streamCandidates()` first asks the extension for candidates. On MacCMS sites such as FQDM the `sid` is per show, so switching a route must
**rewrite the episode id** rather than just swap the name (`alternates()` in `lib/fqdm.js`); for AniCh the candidates are quality tiers.
Candidates are ordered "the one the user clicked → the rest → lines remembered as playable", at most 6 are tried, and the ones that played are remembered in `goodLine`.
(Playable lines are often at positions 5–11 of the list, so when only three are tried all three are frequently dead.)

**Ad-route filtering**: a few `全集(全高清-1080P)` entries in AniCh's `/vod/{id}/{ep}` actually point at promo clips on a Xiaohongshu CDN; the host drops them by domain so that ffmpeg does not
report `not in allowed_segment_extensions` or play a stretch of advert.

**Quality**: bilibili uses the qn ladder (4K / 1080P+ / 720P / 480P / 360P), and switching tier carries the current second back through `startAt`
instead of returning to the opening; for sources without captions (FQDM / AniCh) the tier names are the real route names the site provides, instead of an invented "Route 3".

### Torrent stream

- The **built-in engine** (`webtorrent`) is the default; when adding a magnet you **must not pass `announce: []`**, because that overwrites the trackers that come with the magnet,
  and DHT is unreliable on this network, so the metadata would never arrive. Metadata usually takes 4–20 seconds.
- `/torrent/stream?hash=&index=`: reads the file from the swarm and supports Range (206); while the metadata is not ready it immediately returns
  **409 `metadata-pending`**, so the request does not hang.
- Encodings that cannot be played (HEVC / 10bit / AV1) go through `/torrent/transcode`, where ffmpeg remuxes or transcodes before pushing the stream to the player.
- You can also switch to **qBittorrent** (`/api/v2`, `auth/login` to obtain the SID, automatic re-login and replay on 403).
- "Open with player" hands the stream URL to the local mpv / VLC / PotPlayer (auto-detected), together with the current second and the title.

### Progress bar, seeking and fMP4

The fMP4 segments of an online stream carry no container duration, so such a stream shows a total length of `--:--` and its progress bar cannot be dragged — that is a limitation of the stream itself,
not a bug in the player. For the paths where a duration is available (transcoding, torrent stream, bilibili DASH's `duration`) the plugin shows the real length;
bilibili's segmented DASH has no index table, so dragging = **switching to a stream that starts at the target second** (`/bili/stream?…&start=<seconds>`,
where the host starts the mux with ffmpeg `-ss`), the page records "how many seconds were skipped" in `offset`, and the progress bar shows `offset + seconds inside the stream`.

Dragging uses a separate scrub state, and the real position is only restored when you let go, so `timeupdate` cannot snatch it back; `±85s`, `←/→`, `A/D`
and the progress bar all share the same seek path. ffmpeg transcoded streams do not support Range, and on that path the progress bar is disabled.

### External players and picture enhancement

The gear in the player panel lists the mpv / VLC / PotPlayer detected on this machine; one click hands the stream over to it, together with the current second
(mpv `--start=`, VLC `--start-time=`, PotPlayer `/seek=`) and the current episode title.

- **Anime4K**: `off / Fast / Balanced / High quality`; the shaders ship with the plugin in `assets/anime4k/` (49 `.glsl` files) and are handed to mpv one by one
  via `--glsl-shaders-append=`; the presets use only `Restore_CNN_*` + `Upscale_CNN_x2_*` + `Clamp_Highlights`, because
  GAN / UL / VL cannot keep up with real-time 1080p decoding. VLC and PotPlayer have no equivalent mechanism.
- **Custom command**: fill in a template in Settings and it takes over player selection; the placeholders are `{url}` `{start}` `{title}` `{shaders}`.
- **Embedded mpv**: `mpv --wid=<window handle> --geometry=<panel rect>` draws directly into the panel area, and `--input-ipc-server` then wires
  play / pause / ±30s / speed / volume / position back to the panel (`lib/mpv.js`). When the window handle cannot be obtained it degrades to a separate window.

## Watchlist and details

- The **watchlist** lives in the browser's `localStorage` (`dsh-anime:watchlist:v1`); it needs no network and takes no host state.
- The **Details** header: banner, cover, title, aliases, score / genres / airing status / season / episode count / studios / source, the watchlist button,
  the AniList external link, the trailer, and the countdown to the next episode.
- **Watch order** (`anilist/watchorder`): a topological sort over AniList's `relations` produces a "prequel → this → sequel" chain,
  with the current show highlighted and each row carrying cover, format, episode count and year; clicking any row jumps to that work's details, and you can go back level by level.
- **Characters and relations**: character cards (voice actor, gender, age, birthday, blood type, description) + related works.

## Theme songs (OP / ED)

The Themes tab on the Details page is a **source switch** (only the selected source is queried), with animethemes as the default:

| Source | Notes |
| --- | --- |
| animethemes.moe | Fetches the official OP/ED clips by AniList id (`/animethemes/themes`). Note that an **array form such as** `filter[has][]=resources` **is mandatory**; a scalar is rejected with `The filter.resource must be an array` |
| bilibili | Reuses `bili/videos` for search + `bili/video` to get the cid + `bili/stream` to fetch the bytes, searching "show name OP" against video titles |

On this machine `api.animethemes.moe` is often challenged by Cloudflare (403 / 422 / 500); the page shows the real failure reason verbatim,
and offers a one-click switch to bilibili. Both sources use the same `Player` (not a native browser `<video>`);
the bilibili one carries the qn ladder, and changing quality does not lose the position.

## Downloads

Both sources share one task table, files land in the system "Downloads" folder by default, and the history is written to `downloads.json`:

- **Online stream**: the download icon at the bottom right of the player → `/downloads/stream`; the host fetches the stream with its own `Referer`/Cookie,
  writes `name.mp4.part` first and then renames it. **The output is handed to ffmpeg by extension** (when writing `.part` it cannot recognise the container and reports
  `Unable to find a suitable output format`), so it really is writing `.part` plus an explicit `-f mp4`.
- **Torrent stream**: `/downloads/torrent`; the host polls the engine's progress and copies the finished file into the download folder.
- Both have progress, speed, cancel (cancel deletes the `.part`), and open containing folder; the interface follows Motrix's task rows / progress bars / status badges.
- The download folder can be set in three ways: type a path, "Browse…" (the host prefers Electron's `dialog.showOpenDialog` and falls back to
  PowerShell + WinForms), or "Use default". It can also be overridden with the `DSH_ANIME_DOWNLOAD_DIR` environment variable.

## Accounts and privacy

| Site | Sign-in method | Nickname / avatar taken from |
| --- | --- | --- |
| bilibili | QR code (or paste a `SESSDATA=...` cookie) | `uname` / `face` from `/x/web-interface/nav` |
| AniList | Personal Access Token | `Viewer { name avatar { medium } }` |
| Bangumi | Access Token | `username` / `avatar.large` from `/v0/me` |
| AniCh | Email + password (the account card is embedded in the preferences of the **AniCh index** data source, not on the global accounts page) | The nickname and avatar are taken after `/ajax_login` on the site |

Credentials are written only to the local `$DSH_HOME/state/dsh-anime/accounts.json`, and **what the page receives is always masked**
(`loggedIn / name / face / masked`); secrets are never sent back to the renderer. `accounts.json` is validated by mtime before it is read, so
two host instances running at the same time never read each other's stale cache. The repository contains no account or token of any kind.

## Settings

Grouped navigation on the left, content cards on the right; after a change, click "Save settings" to write it back to `$DSH_HOME/state/dsh-anime/settings.json`;
"Restore defaults" resets immediately and rebuilds the BT engine.

| Section | Contents |
| --- | --- |
| Interface | Which language show titles use (romaji / original Japanese / Chinese / English), plugin interface language (follow the app / Simplified Chinese / English) |
| Video playback | Embedded or external player, default quality, auto-play next, how non-MP4 sources are handled (automatic / remux only / transcode when needed) |
| Desktop players | The detected mpv / VLC / PotPlayer, plus one custom command template |
| Torrent stream | Default source (auto → AniBT → AnimeTosho), upload limit, cache folder, minutes after which a finished item is cleaned up |
| qBittorrent | Address / username / password (leave empty to keep the old password) |
| Downloads | Download folder, keep the `.torrent` after completion, keep history |

**Title language** (`ui.titleLanguage`) takes the first non-empty of four candidate groups, and the Chinese mode requires "contains a Simplified-Chinese marker" —
a Japanese title written purely in Han characters (such as `呪術廻戦 死滅回游 前編`) is not mistaken for Chinese and falls through to the next candidate.

**Interface language** (`ui.locale`): the strings are two dictionaries, `ZH` / `EN`, inside `client.js`, handed to the host via
`ctx.locale.register(NS, { zh, en })`; with `auto` it follows the app. `dev/audit-tkeys.mjs` checks that every key used by
`T('key')` exists on both sides.

## HTTP API

Everything is mounted under `/dsh-anime/api/`. Upstream failures uniformly return `200 {ok:false, error:{message}}` (media streams use 409),
and 404 is reserved for unknown routes. Write operations accept both `POST <route>` and `GET <route>?payload=<json>`
(the DSH desktop shell delivers a page's POST to the host as a GET without a body).

| Group | Routes |
| --- | --- |
| Metadata | `health`、`anilist/season|trending|airing|search|media|browse|watchorder`、`animeko/season|airing|search|subject`、`bangumi/calendar|search|season|subject|episodes|collection(s)|mark`、`anich/season|search|detail|episodes` |
| Online stream | `online/sources|browse|search|episodes|servers|resolve|stream|duration`、`bili/search|season|episode|stream|videos|video|chapters` |
| Torrent stream | `torrent/search|add|remove|files|stream|transcode|status|list|config|open-player` |
| Downloads | `downloads`、`downloads/bili|torrent|stream|cancel|remove|clear|reveal` |
| Accounts | `accounts`、`accounts/save|logout|qr|qr/status|code|password|register` |
| Extensions | `extensions`、`extensions/save|toggle|action|source|source-save|source-restore` |
| Sources / Themes | `sources`、`sources/manifest`、`animethemes/themes` |
| Settings / Player | `settings`、`settings/save|reset|pick-dir`、`player/open|shaders|shaders/open`、`player/embed*` |
| Other | `stream/cache|stream/cache/clear`、`client/heartbeat` |

## Architecture

```
package.json          dsh.bundle.patch + dsh.client (platform: web)
cordis.patch.yml      insert: id dsh-anime → name '@local/dsh-anime'
index.js              Host half: data sources, proxy and cache, extension registry, BT engine, download queue, player bridge
client.js             Client half: sidebar icon + main panel (React, single file with its own styles and i18n)
lib/anilist.js        AniList GraphQL (season / search / details / watch order)
lib/bangumi.js        Bangumi v0 + mirror fallback
lib/anich.js          AniCh parsing + index (login / register / send code / route filtering)
lib/fqdm.js           FQDM (MacCMS) routes, route switching and covers
lib/bilibili.js       bilibili (search / season / DASH / subtitles / segmented seek)
lib/wbi.js            bilibili WBI signing
lib/chapters.js       Chapters / highlights (pgc timeline)
lib/anibt.js          AniBT source (episode-number and batch detection)
lib/animetosho.js     AnimeTosho HTML parsing fallback
lib/websource.js      AnimeFlow declarative sources (JSON / HTML rules → extensions)
lib/html.js           HTML parsing (shared by the declarative sources)
lib/xpath.js          Minimal XPath implementation (declarative-source selectors)
lib/extensions.js     Extension registry: manifest, schema validation, enabled state, invocation and timeouts
lib/torrent-engine.js Built-in webtorrent engine + qBittorrent client + ffmpeg transcoding + opening an external player
lib/render-stream.js  MSE manifest generation (DASH segments / duration / init segment)
lib/mpv.js            Embedded mpv (wid + JSON IPC)
lib/downloads.js      Download queue (shared by online stream / torrent stream)
lib/accounts.js       Account storage (masked output, mtime validation)
lib/settings.js       Settings read/write and field validation
locale/{zh,en}.json   Name and description shown in the plugin marketplace
assets/anime4k/       Anime4K shaders; assets/vendor/ bundles libass, jassub, anime4k-webgpu
dev/                  Development-time scripts (checks, probes, previews), see dev/README.md
docs/status.md        Development log: what each round changed, what proved it, what is still missing
```

**The route table is process-level**: the host does not allow the same exact route to be registered twice, yet the plugin is `apply()`ed repeatedly (reload, panel switch,
second instance). So each path is registered only once per process, and what gets registered is a forwarder — on every request it takes "the handler published by the most recent apply"
from the process-level table (`globalThis[Symbol.for('dsh-anime.routes')]`).
Every apply leaves one line in the log, `routes published: N handlers … build <number>`,
and a "Host restart required"（宿主需重启）tag in the page header means the Host's and the Client's `EXPECTED_BUILD` do not match.

**An extension is a plugin**: the three kinds of extension — data source, torrent stream, online stream — go through the same registry, and the page only has to read the manifest to draw the cards,
the toggles and the preferences dialog; routes belonging to a switched-off extension simply answer "disabled". AnimeFlow's declarative sources are registered as extensions as well (`src-*`).

## Development

```bash
# Structural check (no DSH needed): can client.js be loaded, how many slots does apply() register
node dev/load-client.mjs

# Static audit of string keys, CSS hooks, routes and lib dependencies
node dev/audit-tkeys.mjs && node dev/audit-routes.mjs && node dev/audit-libs.mjs

# Walk the whole component tree with a fake React, checking that a given page renders without throwing and that no bare React elements leak
node dev/render-check.mjs anilist 16498

# Regression guards for the default sources / the theme-song player
node dev/check-default-sources.mjs && node dev/check-theme-player.mjs
```

Tests that need a **running host** (by default `DSH_ANIME_API=http://127.0.0.1:<port>/dsh-anime/api`, where the port is the DSH Web port):

```bash
node dev/test-host.mjs            # end-to-end smoke over every Host route (real node:http + fake ctx)
node dev/test-stream.mjs          # bilibili: search → season → playback URL → Range stream
node dev/test-torrent-routes.mjs  # torrent: search → add → metadata → Range stream (real magnet, tens of seconds)
node dev/probe-anich.mjs          # AniCh: search → episodes → routes → resolve → first byte
node dev/test-reload.mjs          # apply → dispose → apply; after a reload no duplicate routes, and the new code answers
```

**How to make code changes take effect**: for `client.js`, press `Ctrl+R` in the DSH window to reload; `index.js` / `lib/*.js` are the host half,
so you must switch「追番 (Anime)」off and on once in the plugin marketplace (or restart DSH) — editing the files alone does not hot-reload.

A categorised list of the further development tools is in [dev/README.md](dev/README.md); historical decisions and round-by-round evidence are in [docs/status.md](docs/status.md).

## Known limitations

- **Bangumi OAuth**: the data endpoints can go through the mirror, but the login endpoint `bgm.tv/oauth/access_token` is not proxied by the mirror,
  so you need your own proxy or a self-hosted reverse proxy.
- **animethemes.moe**: often blocked by Cloudflare on this machine, so Themes ends up on bilibili by default.
- **Online-stream fMP4 has no container duration**: total length `--:--` and the progress bar cannot be dragged; paths that do have a `duration` behave normally.
- **Torrent tracker quality**: many public trackers are dead, and AnimeTosho results often contain entries with 0 seeders.
- **AniCh registration** needs an email verification code; the plugin only provides the entry point and never sends it on your behalf.

## License and third-party

This project is released under the **MIT** licence (see [LICENSE](LICENSE)).

`assets/vendor/` holds third-party build artefacts, each of which keeps its original licence:
[libass-wasm](https://github.com/PrismarineJS/libass-wasm), [jassub](https://github.com/ThaUnknown/jassub),
[anime4k-webgpu](https://github.com/Anime4KWebBoost/anime4k-webgpu), [Anime4K](https://github.com/bloc97/Anime4K);
`assets/anime4k/*.glsl` comes from Anime4K (MIT). The BT engine is [WebTorrent](https://github.com/webtorrent/webtorrent) (MIT).

Data comes from public APIs such as [AniList](https://anilist.co), [Bangumi](https://bgm.tv), [Animeko](https://animeko.org),
[bilibili](https://www.bilibili.com); the plugin only aggregates and plays on the client side and hosts no content.

The interface and interactions take inspiration from [Seanime](https://github.com/5rahim/seanime) (extensions / Sources catalogue / player interactions) and
[Motrix](https://github.com/agalwood/Motrix) (download list).
