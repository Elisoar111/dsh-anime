# 剩余项与完成情况

build `2026-10-25.99`。每项分「改了什么 / 拿什么证明 / 还差什么」，验证一律标清楚是**自检**（脚本、真接口）还是**待窗口实测**。

## 一览

| # | 项 | 状态 | 谁验过 |
|---|---|---|---|
| 1 | 拖进度条不跳转 | 已改，等实测 | 待你在窗口点 |
| 4 | 长播中断（30s/几分钟停） | 根因已定位并修，等长播实测 | 待你放完整一集 |
| 5 | 合流文件占磁盘 | 已修（含一个真 bug）+ 清空按钮 | 自检通过 |
| 6 | 在线流章节画不出来 | 路由重写，数据实测通过 | 真接口实测 + 待看 UI |
| 7 | 字幕样式 UI | 已被「整体移除字幕」取代 | — |
| 8 | 手动指定其它 cid 的字幕 | 同上，字幕面板现在只说明没有字幕 | 自检通过 |
| 9 | 内嵌 mpv 死代码 | 宿主路由已删，客户端加守卫 | 路由表实测 |
| 10 | 设置页「播放引擎」只读 | 按设计保留 | — |
| — | 优化 PrismFlow（m00173） | 喂流/seek/看门狗重做 | 自检 + 待长播 |
| — | bilibili 插件化（m00173） | 设置 + 数据 + 常量都进扩展；扩展系统加了 `choice`/`text` | 自检通过 |
| — | 账号系统搬进扩展（m01865） | 三个 provider 各自持有登录；宿主只存凭据、只路由 | 自检 21 项 + 真接口 |
| — | FQDM 在线插件 + 通用在线页面（m02213 / m02508） | 新增 `fqdm` 扩展；页面按 `online` 契约渲染，不再写死 bilibili | 真接口 + 渲染台 |
| — | Anime4K 真实现（m04359 / m04949） | WebGPU 走 anime4k-webgpu；没有 WebGPU 时走 monyone/Anime4K.js 的 WebGL 实现（本地 2×）；两个 UMD 包都已 vendor 并修好路由 | 真接口 + 待窗口实测 |
| — | 声明式动漫源插件（m05815 / m05963） | AnimeFlow 源规则（api 1 XPath / api 2 JSON）驱动 3 个 `online` 扩展；不可用的源已删除；弹幕与评论不做 | 真接口：3/3 可播 |
| — | AniCh 在线源播不出来（.85） | 根因是 resolve 回的线路 URL 是广告、或地址没有扩展名却被当 mp4 直通；现在按首字节判断 + 广告线路在源头过滤 | 真接口：200 `video/mp4`、30.7 MB/5s、`accept-ranges: bytes`、`Range` → 206 |
| — | AniCh 线路表是假的（.85） | `servers` 原来写死「线路1…线路8」；现在按集解析真实线路并带 caption，且按 (番剧,集) 缓存 3 分钟 | 真接口：11 条真实线路，`线路N · <caption>` |
| — | 在线 fMP4 总长 `--:--` / 拖不动（.85） | `online/duration` 修好（首字节判 m3u8/mp4，mp4 走 ffprobe 读 moov）+ 播放器虚拟时间轴重开流 | 真接口：5600 s；拖拽逻辑待窗口点 |
| — | 进度条没有预加载线条（.86） | 滑块轨道改成三段：蓝＝已播、白＝已预加载（`video.buffered`）、灰＝未下 | 自检（语法 + 搭载）；待窗口看 |
| — | Bangumi 的 `apiBase` 只对一半请求生效（.87） | 日历/搜索/季度原来写死 `BANGUMI_ENDPOINT`，镜像设置只改了 lib 那一半 | 本地桩：搜索/季度/详情/日历全部 200 |
| — | 搜索与季度的评分恒为空（.87） | v0 把分数放在 `rating.score`，代码只读 `subject.score` | 本地桩：`score=7.9`（修前 `null`） |
| — | 注册失败只说「HTTP 200」（.87） | `/register` 失败回 JSON，代码却按 protobuf 解 | 真接口：现显示站点原文「验证码不正确」 |
| — | 详情页 / 追番卡片没接 `anich/detail`（.86） | 详情页对 AniCh 条目补发 detail 取简介/类型/年份/别名/集数；追番卡片对缺集数的 AniCh 条目补问一次 | 真接口：`episodes 1`、`seasonYear 2026`、`genres 4`、`aliases 2` |
| — | Bangumi「只能等代理」（.87 → .89） | 找到并接上可用镜像 `https://bgmapi.anibt.net`：留空即镜像、填官方才是官方；`calendar` 超时 15 s → 45 s（镜像冷启动实测 19–27 s） | 真接口：`/bangumi/calendar` → `200 {"ok":true,…"星期一"…}`，冷启 27.6 s |
| — | Bangumi 登录（OAuth）仍不可用（.88） | 授权/换 token 仍写死在 `bgm.tv`；镜像的 `/oauth/access_token` 实测连接失败 | 已知边界，等代理或镜像补端点 |
| — | AniCh 登录/注册没放进数据源（.90） | 账号卡片从在线源搬到「AniCh 索引」数据源：`anich-data` 声明 `account`，`scoped: true` 让它不再重复出现在设置 → 账号；顺带修好扩展面板把 `password`/`oauth` 折成 `token`（注册表单因此从不出现）的旧问题 | 自检 13/13：宿主 `/accounts` 报 `kind=password scoped=true extension=anich-data`，登录态保留 |
| — | FQDM 切到番茄2线是黑屏（.91） | 那条线路的 CDN `v6.ppqrrs.com` 已解析不出来；而换线逻辑只对 AniCh 生效（候选表只认带 `type` 的条目）。新增可选 handler `alternates()` 让源自己报「还能在哪条线播 + 那条线的集数 id」，FQDM 按 `anime\|sid\|nid` 重写 id | 真接口：同一集同一线路改前 `{ok:false}` 357 字节，改后 `200 video/mp4`，`curl` 拉完 53 794 008 字节、首字节 `ftypiso5` |
| — | 下载界面一直是坏的（.88） | 真因在 ffmpeg：产物先写 `<名字>.mp4.part`，`.part` 不是它认识的扩展名，**每次**流下载都在「Unable to find a suitable output format」上秒退；现在显式给 `-f mp4/matroska/flv/mpegts`，界面改成 Motrix 那种下载管理器 | 自检：`dev/probe-download-stream.mjs` ALL PASS（8.0 MB、497 KB/s）；渲染台 `downloads` 分支通过 |
| — | 换清晰度会“跳回片头”（.92） | `start > 0` 时还走字节直通，`passthroughOnline()` 没法跳；现在 `start > 0` 一律转码走 `-ss`，客户端也不再按 `type==='m3u8'` 猜，一律带当前位置。顺带修掉无 caption 的源把线路名退成「线路 3」 | 真接口：mp4 线路 `start=2600`（全片 2611 s）9.47 s 自收尾、599 304 字节；`start=0` 30 s 吐 7 603 588 字节仍未结束 |
| — | 通用下载器不只有哔哩哔哩（.88） | `/downloads/stream` 接 `source+episode+server`，自己 resolve 真地址；候选表＝点的那条→后面最多六条 | 真接口：AniCh 11 条线路里挑出一条下到 8 MB |
| — | 死线路让下载卡在 0 B（.88） | 三道闸：`sniffMedia` 先要字节（HLS 连首片一起要）、ffprobe 认视频流、起任务后 `waitForFirstBytes` 25 s 内不见字节就取消换下一条；ffmpeg 加 `-rw_timeout 20s` 与 45 s 无进展看门狗 | 自检：TLS 死线路 8 s 内报错换线，不再挂死 |
| — | 搜索页不像 AniList（.93） | 浏览页照 AniList 的筛选栏重做：左栏 208px（标题、排序、类型、标签、格式、季度、状态、评分、成人、清空）+ 右侧 2:3 海报密网格；筛选条件直接翻成 AniList 的 `genre/sort/season/format/status/adult/tag` 参数，改一项重发一次 | 真接口：`dev/probe-anilist-browse.mjs` 4 组查询全部命中（Action 出鬼灭/咒术，`genre=Action&sort=POPULARITY_DESC` 排序正确）；视觉由 `dev/preview-browse.mjs` 用真 CSS + 真接口生成后截图核对 |
| — | 番剧页没有观看顺序（.94） | 新路由 `anilist/watchorder`：从当前条目沿 `PREQUEL` 往回走到最早一部，再沿 `SEQUEL` 往后走，最多 8+12 步，返回整条链（含中文名）；客户端把它做成与「在线流/种子/角色」平级的独立标签页 | 真接口：`id=16498` 返回 9 部（前作 OVA `No Regrets` → 第四季最终章），`position` 指向当前作 |
| — | 番剧页没有 OP/ED（.94 → .98） | 独立标签页，里面是**来源切换**（animethemes / 哔哩哔哩 segmented，选中哪个才查哪个）：① `animethemes/themes` 按 AniList id 取官方 OP/ED 片段（`filter[has][]=resources` 这类数组写法是必须的，标量会被判 `The filter.resource must be an array`）；② 哔哩哔哩走现成的 `bili/videos` 搜索 + `bili/video` 取 cid + `bili/stream` 代取字节（宿主代取字节、补 Referer/cookie，页面用自研 Player 播），封面加 `referrerPolicy=no-referrer` 才不会被图床当成盗链 | ① 本机仍不通：`api.animethemes.moe` 回 403 挑战页 / 422 / 500，页面把真实原因原文显示，并提供一键跳到哔哩哔哩。② 真接口：`/bili/videos?keyword=進撃の巨人 OP` 返回 20 条真结果（EVK塔克 114 万播放），`/bili/video?bvid=BV1nZ421z7t1` → cid 1425611404，`/bili/stream?bvid=…&cid=…&qn=80` → `200 video/mp4` **43 944 542 字节**，首 8 字节 `ftypiso5` ；③ 播放器不再用浏览器原生 `<video controls>`，改成本项目的 `Player`（同一条控制栏、同一个浮层、预加载段、清晰度按 bilibili 的 qn 阶梯 1080P/720P/480P/360P、换档时 `startAt` 回到原位）；animethemes 那一侧同样走 `Player`。按钮文案 `试听` → `播放` |
| — | `/health` 报的 version 一直是 1.0.0（.98） | `index.js` 里写死 `version: '1.0.0'`，连着十一个版本都没跟上 package.json。已改成启动时读 `package.json`（`readPackageVersion()`） | 真实版本：重载后 `/health` → `build 2026-10-25.99 / version 1.0.12` |
| — | 新用户装完不知道哪些源能用（.99） | 9 个扩展里只有 AniList 默认打开，其余 8 个（Bangumi / Animeko / AniBT / AnimeTosho / 哔哩哔哩 / FQDM / AniCh / AniCh 索引）带 `defaultEnabled: false`；跟着顺手堵了一个漏：`saveSettings` 以前不写 `enabled` 字段，一条默认关闭的源只要用户填个设置就被 `enabledOf` 判成开着，现在保存时按 manifest 的默认值落定 | `dev/check-default-sources.mjs` 6 项 PASS：空设置下只有 anilist 开、其余 8 个关；给默认关闭的源改设置仍关；用户显式打开后改设置不被关回去；anilist 改设置仍开。已有用户不受影响（已存 `enabled` 的照旧） ；④ 顺手挖出一个真 bug：`createExtensionRegistry` 的 `getSettings` 用的是 `settingsState ?? DEFAULT_SETTINGS`，插件刚重载、还没人读过设置时 `settingsState` 是 null，于是所有源按默认值渲染——以前默认全开看不出来，现在会显示全部关闭、用户的开关白存。改成 `settingsSync()`（惰性读盘 + 缓存） | 重载后实测 `/extensions`：9 个内置源全按已存开关显示 ON，三个 `src-*` 声明式源按新默认显示 off |
| — | 哔哩哔哩直链一直播不出来（.97） | `lib/bilibili.js` 的 `dashStream` 调用了 `findFfmpeg`，但这个模块从来没有 import 它，每次合并 DASH 都抛 `findFfmpeg is not defined`，响应头先发出去、正文 0 字节就结束 | 已修：从 `./torrent-engine.js` 导入 `findFfmpeg`。这类问题页面自己发现不了——播放器走的是 MSE manifest（不需要合并），只有 `<video>` 直链才会踩到。验证：修前 0 字节、修后 43 944 542 字节 |
| — | 插件市场满屏「未集成」（.94） | Seanime 目录里 99 个源本插件一个也跑不了，那个标签页只会印「未集成」；整页删除，只留已安装列表 | 自检：`node --check` + 渲染台通过；面板不再请求 `/sources` |

## 通用下载器与下载界面（.89）

**为什么重做**：用户点了「下载」从来没有一次成功过。表面上像界面问题，实际是宿主侧的 ffmpeg 参数写错：

```
Unable to find a suitable output format for 'C:\Users\...\probe-anich-39482-ep1.mp4.part'
```

产物必须先进 `.part` 再改名，但 ffmpeg 靠扩展名猜封装容器，`.part` 它不认识，于是**每一个**流下载都在初始化 muxer 时就退出了。现在按目标扩展名显式给 `-f`：mp4/m4v→`mp4`、mkv→`matroska`、flv→`flv`、ts→`mpegts`、mov→`mov`。

**线路这一侧**：AniCh 的线路「排行榜」每次都变，能播的常在列表第 5～11 位，所以下载不能只信用户点的那条。

| 闸 | 位置 | 它挡住什么 |
|---|---|---|
| `sniffMedia` | `index.js` | 播放列表能取到、分片主机已经没了的线路：HLS 会连**第一个分片**一起要字节，12 s 拿不到就换线 |
| `probeStream` | 原有 | ffprobe 认不出视频流（纯音频、404 页当 m3u8） |
| `waitForFirstBytes` | `index.js` | ffprobe 过了、真正 remux 时被 TLS 重置的线路：25 s 内没字节就取消任务并换下一条 |

**任务这一侧**（`lib/downloads.js`）：`-rw_timeout 20s` 管连接期，45 s 无进展看门狗管「连上了不再吐数据」；看门狗杀掉的 job 会写明「线路 45 秒没有数据」，而不是只留一句 `ffmpeg 退出码 1`。

**界面**（参考 Motrix）：统计条（进行中/已完成/总速度）、状态 pill（蓝=下载中、绿=完成、红=失败）、进度与「已收」二选一（在线流没有 content-length，百分比会永远停在 0，所以未知总量时用流动条纹表示）、速度与剩余时间、打开目录/取消/删除，以及「全部取消」与「清除已完成的」。

**还差什么**：暂停/继续没做——ffmpeg 单次转封装不可暂停（要停就是断流重来），qBittorrent 那边的任务可以做，等有需求再加。

## 声明式动漫源：一个规则引擎，十个 online 扩展（m05815）

**为什么这么做**：AnimeFlow 的「源」不是代码，是 JSON 规则（`openAnimeFlow/animeFlow-assets`）。照抄它的做法，加一个源就是丢一个 JSON 进去，不用改宿主。

**落地**

- `dsh-anime/lib/xpath.js`：零依赖 XPath 子集（`//tag`、`/tag`、`//*`、`[n]` 按同名兄弟、`[@a='v']`、`[@a]`、终结 `/text()`）。`[n]` 严格按 XPath 语义「同父下的第 n 个同名兄弟」，`[@class='a b c']` 按 **token 包含**匹配（主题多一个 class 就不至于整条规则失效）。
  - 宽松版 `selectXPathLoose`：先按规则原样，再去掉所有 `[n]`，最后退化成终点 `//tag[@class=…]`，第一个有结果的变体生效——规则是按旧版页面写的，加个横幅也不会立刻归零。
- `dsh-anime/lib/websource.js`：把规则变成扩展。
  - api 1：`searchUrl/searchList/searchName/searchLink` → 详情页 `lineNames/lineList/episode` → 播放页取 `player_aaaa` 的 `url`，否则退 `m3u8/mp4` 正则。
  - api 2：`searchApiConfig`（query 模板 + `$.info.rows[*]`）与 `chapterApiConfig`（`$$$`/`#`/`$` 分隔符拆分线路与集数）。
  - 已知不可用（今日实测）的源用 `manifest.defaultEnabled: false` 默认关闭，`enabledOf` 现在会尊重这个字段（用户手动打开后以设置为准）。
- `dsh-anime/index.js`：`apply` 里 `registerWebSources({ registry, dir: assets/sources/animeflow })`，每个源一个 `type:'online'` 扩展（`search/episodes/servers/resolve`），沿用既有 `online/*` 路由与通用在线页，`/online/stream` 自动对 m3u8 加 `aac_adtstoasc`。
- `dsh-anime/assets/sources/animeflow/*.json`：10 条规则已 vendor（`dev/vendor-animeflow-plugins.mjs` 走 `api.github.com/contents` + base64，raw.githubusercontent 被墙）。

**实测（`node dev/test-websource.mjs`，关键词「柯南」）**

| 源 | 结果 |
|---|---|
| girigiri愛動漫（api 2） | 搜索 4 · 集数 1 · **m3u8 可播** |
| 萌道动漫 | 搜索 36 · 集数 1277 · **m3u8 可播** |
| MX动漫 | 搜索 12 · 线路 3 · 集数 3833 · **m3u8 可播** |

**不可用的源已删除**（m05963）：`7sefun`（播放页回 `J`-转义串）、`didahd`（播放页回十六进制私有编码）、`dmbus`（播放页 JS 渲染）、`mgnacg` / `mutefun`（反爬）、`age` / `yishijie`（站点不可达）——规则 JSON 与 `index.json` 里的条目一起删掉，`assets/sources/animeflow/` 现在只有 `girigiri.json`、`gpjda.json`、`mxdm.json`。`lib/websource.js` 里的 `KNOWN_BROKEN` / `defaultEnabled` 随之移除（已经没有默认关闭的源）。

宿主侧验证（build `2026-10-24.79`）：`/online/sources` → 5 个在线源（bilibili、fqdm + 3 个 `src-*`，全部启用）；`/online/search?source=src-girigiri` → 4 条，`/online/episodes` → 1 集，`/online/stream?source=src-girigiri&episode=0|27053|0&server=chs` → `200 video/mp4 chunked`。

**还差什么**

- 想加回被删的源，需要按各自站点补规则：反爬要过验证码、JS 渲染的播放页要跑脚本、私有编码的播放地址要逐站逆向。
- 启停状态仍存在 `settings.extensions.src-*`，可在「设置 → 片源」里逐个开关。

## Anime4K：两条路 + 两个真 bug（m04359 / m04949）

**能跑的两条路**

- WebGPU：`assets/vendor/anime4k-webgpu/lib/index.js`（UMD，全局 `window['anime4k-webgpu']`），`render()` 内部自管帧循环，取消靠销毁 device。
- WebGL（无 WebGPU 时）：`assets/vendor/anime4k.js/anime4k.js`（monyone/Anime4K.js，Anime4K 4.0.1 GLSL 的 WebGL 移植，MIT，全局 `window.Anime4KJS`），`new VideoUpscaler(ANIME4KJS_SIMPLE_*_2X)` + `attachVideo(video, canvas)` + `start()`；需要 `OES_texture_float` / `OES_texture_float_linear` / `EXT_color_buffer_half_float`。
- 重拉方式：`node dev/vendor-anime4k-webgl.mjs`（写 `anime4k.js` 与 LICENSE，打印 sha256）。

**修掉的 bug**

1. `vendor` 前缀路由一直 404（`register()` 包装器把 `kind` 强行写成 `exact`），所以两个 Anime4K 包从来没被加载过——开关打开后代码静默落到 CAS。现在包装器支持 `kind: 'prefix'`，关键文件另按 exact 逐个注册（`serveVendorFile`），实测 `200 text/javascript` + `access-control-allow-origin: *`，9,398,501 / 3,480,650 字节。
2. `<video>` 盖住两个增强画布（没有 z-index）、锐化在硬边上被 clamp 成恒等、canvas 尺寸只在挂载时取一次：都已改（`z-index: 2`、允许 ±28% 过冲、按舞台框 × DPR 设尺寸）。


## bilibili 全部搬进插件（m01519 / m01560）

用户要求「bilibili 相关的设置和内容全部转移到插件中」，搬不动的就改扩展系统本身。

**扩展系统（`lib/extensions.js`）现在支持什么**

- 新增 `kind: 'choice'`（带 `options: [{value,label,labelEn}]`）与 `kind: 'text'`；`switch`/`number` 不变。
- `list()` 把 `options`、`unit` 一起发给页面，`ExtensionPrefs` 用 `SettingsChoices` 渲染下拉，`text` 用 `SettingsInput`。
- 统一的 `coerceField(field, stored)`：`choice` 只接受 manifest 声明过的值（越界回落默认），`switch` 非布尔回落默认，`number` clamp，`text` 非空字符串。`valuesOf`/`saveSettings` 都走它，所以 `settings.json` 里的脏值到不了上游。
- 新增 `registry.values(id)`：按 id 取当前值（不看 enabled）。

**搬进 `哔哩哔哩` manifest 的东西**

- `quality`（choice：4K / 1080P+ / 720P / 480P / 360P，默认 80）——原来是全局 `settings.stream.quality`，已从 `lib/settings.js` 的默认值与 coerce 里删掉，设置页那一行「清晰度」也删了。
- `preferUploads`（switch）保留。
- `handlers`：`search / videos / video / season / chapters / resolvePlay`。宿主的 `bili/*` 读路由、`resolvePlay`/`resolveVideoPlay`、`downloads/bili` 现在全部经 `registry.call('bilibili', …)`——停用扩展时一条都调不到，返回的是「哔哩哔哩 已在「片源」里停用，先打开再用」。
- `BILIBILI_API / BILIBILI_REFERER / BILIBILI_UA` 从 `index.js` 移到 `lib/bilibili.js` 并导出（宿主原来那份 UA 是 Chrome/131、模块里是 124，现在只有一份 124）。
- 清晰度默认值只有一个来源：`biliQuality()` = `registry.values('bilibili').quality`，`bili/episode`、`bili/qualities`、`bili/stream`、`downloads/bili` 四处都用它。

**关闭插件时的页面行为（用户报的那条）**

- `OnlineView` 先看 `/extensions` 里 `bilibili.enabled`：关着就只渲染一段说明——「在线流由「哔哩哔哩」扩展提供，现在它是关闭的。到「设置 → 片源 → 哔哩哔哩」打开即可。」，并且 `bili/search|season|videos|video` 四个 `useEndpoint` 全部传 `null`，不会再去打宿主。
- 原来关掉插件时这里是一片空白（像搜索坏了），现在是一句能照着做的提示。

**证据**

- `node dev/test-extension-schema.mjs`：默认值 / 脏值回落 / 保存 / `list()` 的 options / 停用时 `call` 抛「已停用」/ 重新启用后值还在——7 项全过。
- `node dev/probe-routes.mjs`：`build 2026-10-24.50`，65 条路由；`/bili/search` 在当前设置（哔哩哔哩处于停用）下返回停用错误，说明闸门生效。
- `node dev/load-client.mjs`、`node dev/render-check.mjs animeko season`、五个文件 `node --check` 全绿。

**还差什么**：无（账号见下一节，已一并搬走）。


## 账号系统搬进扩展（m01865）

用户要求「账号系统一起塞进扩展，包括 anilist、bangumi 和 bilibili」。原来三个登录都硬编码在宿主 `lib/accounts.js` 里（`verifyAccount` 一个 `if` 分发三个 provider、`providerLabels()` 一张固定表、`accounts.json` 三个固定槽位）。

**现在谁拥有账号**

- `bilibili` → `lib/bilibili.js` 末尾的 `bilibiliAccount`（`start` 生成二维码 / `poll` 轮询 / `verify` 打 `nav`），passport 域名、Web UA、`Set-Cookie` 解析都在这里。
- `anilist` → 新文件 `lib/anilist.js` 的 `anilistAccount`（GraphQL `Viewer` 校验 token）。
- `bangumi` → 新文件 `lib/bangumi.js` 的 `bangumiAccount`（`/v0/me`；连不上 bgm.tv 时给出可读的错误）。

**扩展系统加了什么**

- `register({ manifest, handlers, account })` 多一个 `account`：`{ start?, poll?, verify }`。
- manifest 的 `account` 支持对象形式 `{ provider, label, hint, kind: 'qr'|'token', link, placeholder }`；旧的字符串写法仍兼容。manifest 没写的展示字段（label/hint/link/placeholder）由 provider 模块补齐。
- 新增 `registry.accountProviders()`（给设置页列卡片，二维码 provider 排最前）与 `registry.account(id)`（返回 `{ …展示, start, poll, verify }`）。两者都不看 enabled —— 登录发生在启用之前。

**宿主只剩存储与路由**

- `lib/accounts.js` 不再认识任何 provider：只剩 `createAccountStore`（`get/set/clear/load/save`）、`publicAccounts` 脱敏视图、`httpJson`、`renderQr`。
- `accounts.json` 升级到 version 2：`{ version: 2, providers: { [id]: { secret, fields, savedAt } } }`。读到旧的 v1 形状（`cookie`/`token`/`mid`/`uname`/`face`/`userId`…）会在内存里迁移，下次保存写成 v2。
- `ACCOUNT` 从「三个字段的普通对象 + 每次保存手动刷新」改成读 store 的 Proxy，所以保存即生效，不再有「登录成功但显示未登录」的空窗。
- 路由：`accounts`（providers + 脱敏账号）、`accounts/qr`、`accounts/qr/status`、`accounts/save`、`accounts/logout` 全部经 `registry.account(…)`；`accounts/qr` 与 `accounts/qr/status` 接受 `provider` 参数（缺省取第一个 qr provider）。
- 客户端 `AccountsSection` 的卡片列表由 `/accounts` 的 `providers` 决定（不再固定三张），`PROVIDER_INFO` 降级为内置三个的文案兜底；扫码请求带上 `provider`。

**证据**

- `node dev/test-account-store.mjs`：21 项全过——两个 store 实例互相可见、脱敏不含 secret、v1 文件迁移（cookie→secret、mid→fields.uid、空槽位丢弃）、落盘为 v2、registry 的 `accountProviders/account` 与「未知的账号来源」、空 token 报错。
- `node dev/test-accounts.mjs`（真接口、真账户）：`/accounts` 返回 `bilibili`（Elisoar / uid 1663081572）与 `anilist`（Elisoar / uid 7471757）两条已登录记录——这两条是从旧 v1 文件迁移出来的；`/accounts/qr` 拿到二维码与 key，poll 返回 `waiting 未扫码`；坏 token 分别报 `AniList: Invalid token`、`bilibili: 账号未登录`、`连不上 Bangumi（fetch failed）…`；未知 provider 报 `未知的账号来源: netflix`。
- `node dev/probe-routes.mjs`：`/accounts` 的 `providers[0]` 是 `bilibili`（`kind: qr`，带 hint）。

**环境说明**：`dev/test-accounts.mjs` 里的 `accounts/logout` 在沙箱内会以 `EPERM … accounts.json.tmp` 失败——测试进程被限制在工作区内写文件，不是代码问题（`torrent/config` 早先也是同一原因）。


## FQDM 在线插件 + 通用在线页面（m02213 / m02508）

**插件**：`lib/fqdm.js` 实现 Seanime `onlinestream-provider` 的契约，`index.js` 把它注册成 `type:'online'` 的扩展（`id: fqdm`，settings 有 `server`(choice) 与 `preferChinese`(switch)，handlers 有 `search/browse/episodes/servers/resolve`，`timeoutMs: 30000`）。

- 数据来源（在站点上实测出来的）：搜索 `index.php/ajax/suggest?mid=1&wd=…`（`pic` 就是封面绝对地址）、**番剧目录** `index.php/ajax/data?mid=1&limit=&page=`（每页最多 10 条，靠 `page` 翻页）、详情页 play 链接按 `sid` 分组、播放页 `player_aaaa` JSON 里 `url` 是 m3u8。
- 线路：`新浪资源2 / 番茄2线 / 番茄1线 / 速播资源1 / 无尽②`；m3u8 必须带 `Referer: https://www.fqdm.cc/`，所以 `lib/torrent-engine.js` 的 `probeStream`/`createTranscodeStream` 都接受 `options.headers`（`-headers` 插在 `-i` 前）。

**通用路由**（宿主不再为某个站点单独写页面）：`online/sources`、`online/browse`、`online/search`、`online/episodes`、`online/servers`、`online/stream`、`online/cover`。它们都经 `registry.call(source, …)` 进扩展，`online/stream` 对 mp4 + `start=0` 直接原始字节直通，m3u8 交给 ffmpeg 转 fMP4（带 Referer），并按 `source:episode:server` 缓存 10 分钟解析结果。`online/cover` 只代理 http(s)、拒私网/本机、校验 `content-type: image/*`。

**页面**：`client.js` 新增 `GenericOnlineView`（搜索框 + 线路下拉 + 封面网格 + 集数网格 + 播放器 + 翻页），`OnlineView` 顶部多了片源要换的 chips——扩展多于一个时才出现，点非 bilibili 就整页切到通用视图；bilibili 仍走自己的季/集/清晰度/章节那一套。插件卡片上也多了一个「打开主页」按钮（`manifest.website`，扩展系统 `list()` 已输出该字段）。

**证据**

- `node dev/test-fqdm.mjs`（真接口）：`servers` 5 条；`search 咒术回战 -> 9`；`episodes id=12177 sid=3 -> 12`；`resolve -> m3u8`；`online/stream` 只报「没有找到 ffmpeg」（沙箱里没有 ffmpeg，见环境限制）。
- `node dev/probe-routes.mjs`：`online/sources` 列出 `bilibili`+`fqdm`，`online/browse?source=fqdm&page=1` 返回 10 条带封面，`online/servers` 返回 5 条线路。
- 渲染台 `dev/online-harness.html`（从 `client.js` 抽出整段页面 CSS + 手写网格）：封面卡 2:3、集数按钮、翻页、选中态都按设计出图。

**还差什么**：真实播放没验过（沙箱没有 ffmpeg，`online/stream` 只能报错）；FQDM 的封面 CDN 直连可用，但个别 CDN 可能需要 `/online/cover` 兜底。

### 死线路不再黑屏：`alternates`（.91）

用户切到 **番茄2线** 只看到一块黑画面。查到底是一条死线路，不是播放器的毛病：

```
转码没有出画面：[tcp @ …] Failed to resolve hostname v6.ppqrrs.com: Temporary failure in name resolution
Error opening input file https://v6.ppqrrs.com/wjv6/202309/09/RRf1W9W8Km1/video/index.m3u8
```

`v6.ppqrrs.com` 在本机连 DNS 都解析不出来（`dns.lookup` → `EAI_AGAIN`，`curl` 返回 000），站点那边还挂着这条 CDN。同一个番剧的另外四条线路（新浪资源2 / 番茄1线 / 速播资源1 / 无尽③）都正常。

**根因是换线逻辑只对 AniCh 生效**。`online/stream` 本来就有「一条线路死了试下一条」，但候选表只认 `servers` 返回里带 `type` 字段的条目（那是 AniCh 的画质档位形状），FQDM 的线路是 `{ name, sid, count }`，于是永远只试用户点的那一条。

**改法**：给 online 扩展加一个可选 handler `alternates(episodeId, server)`，由源自己回答「这一集还能在哪些线路上播、各自的集数 id 是什么」。换线路时 id 必须跟着换——MacCMS 的集数 id 是 `anime|sid|nid`，**sid 是每个番剧一份**，不是全局常量：

```js
// lib/fqdm.js
const entries = list
  .filter((line) => line.name !== current && line.sid !== '' && line.count > 0)
  .map((line) => ({ server: line.name, episodeId: `${animeId}|${line.sid}|${nid}` }))
```

`index.js` 的 `streamCandidates()` 按优先级分三路：① 有 `alternates` 就用它（id 一起换）；② 否则走老路（`servers` 条目带 `type`，id 不变、只换名）；③ 都没有就只试点的那条。候选统一成 `{ server, episode }`，上限仍是六条，`goodLine` 记住上次真正播通的那条。

**证据**（同一集、同一个用户点击的线路）：

```
# 改前
node dev/probe-fqdm-line.mjs 295 番茄2线
  4. /online/stream  HTTP 200 type=application/json len=357   ← 黑屏
     {"ok":false,"error":{"message":"转码没有出画面：…v6.ppqrrs.com…"}}

# 改后
node dev/probe-fqdm-line.mjs 295 番茄2线
  4. /online/stream  HTTP 200 type=video/mp4 first=1247B after 6.7s
     head: 0000001c6674797069736f35…  ("…ftypiso5")
```

同一条请求 `curl` 全量拉：`HTTP/1.1 200 OK`、`content-type: video/mp4`、**53 794 008 字节**落盘、首 12 字节 `ftypiso5`。

**还差什么**：AniCh 那半边的换线路这次没能重跑（站点又一次 30 s 超时，`online/search` 同一个词两次一成一败），所以只做了代码层回归——`alternates` 不存在时 `registry.call` 抛错被吞掉，接着走原来的名字轮转，行为与改前一致；等站点稳定时再跑一次 `dev/test-anich.mjs`。


### 抓页面不再用正则：`lib/html.js`（jsoup 形状）

用户点名 jsoup（Java）作为解析工具。这套插件是 Node，且本机 npm 全挂（`registry.npmjs.org` / `npmmirror` / 腾讯镜像都是 `SSL connection could not be established`），装不了 cheerio/jsdom，所以按 jsoup 的 API 写了一个零依赖的小解析器：

- `parseHtml(html)` 返回根元素；`select(sel)` / `selectOne(sel)` 支持 `tag`、`.class`、`#id`、`tag.class`、`[attr]`、`[attr=*^$~|=]`、后代链（`.card .title`）、逗号并列（`.a, .b`）、`*`。
- `attr(name)` / `hasAttr` / `text()`（丢标签、解实体、压空白）/ `html()`（按树重新序列化）/ `childrenElements()` / `descendants()`。
- 容错：`<li>a<li>b` 按 HTML 的隐含结束处理成兄弟节点，游离结束标签忽略，未闭合元素由祖先收尾，`<script>/<style>/<textarea>/<title>` 按原始文本处理，注释与 doctype 丢弃。
- 故意不做：兄弟选择器（`+`/`~`）、伪类、命名空间。

FQDM 的两处正则换成了查询：搜索页用 `.module-card-item` 卡片取 `.module-card-item-title` 里的标题（**海报锚点的文字是「第24集」这种更新标注，不能当标题**），详情页用 `a[href*="/play/id/"]` 分组 `sid`。

**证据**：`node dev/test-html.mjs` 32 项全过（结构/容错/属性选择器/实体/`text()`/`html()`，外加两段真站点检查：搜索页 27 个详情锚点每条都能取出 id+标题，详情页 55 个播放链接）。`node dev/test-fqdm.mjs` 里新增 `search-html` 一行，直接调 HTML 兜底路径：9 条、标题正确、都带封面（JSON 接口正常时这条路径平时不会走到）。


## 1 · 拖进度条不跳转

- **改动**：`client.js` 的 `seekTo` 分三支——普通文件直接写 `currentTime`；MSE 已缓冲区间内本地写；其余拆 `MediaSource`（`URL.revokeObjectURL` + `removeAttribute('src')` + `load()`）并用 `?start=<秒>&_e=<n>` 重建。`offset` + `seekEpoch` 保证同一秒重复拖也会重建，`totalDuration` 改用 manifest 给的全片时长（原先 offset 叠加会重复计）。
- **证据**：`bili/stream?format=manifest&start=600` 返回 `start=600` 且 `video` 里带 `start=600`；宿主 `/bili/dash...&start=` 走 `createTranscodeStream`（`-ss` 在 `-i` 前 = 输入快速定位）。
- **没验到**：这台机器的沙箱里 ffmpeg 起不来（退出码 `0xC0000142`，DLL 初始化失败），所以「松手到出画」的延迟**测不出来**。
- **怎么验**：拖一下松手，日志应刷 `[dsh-anime] manifest start=<秒> ep=… cid=… qn=… dur=…`，紧接着 `[dsh-anime] dash stream method=GET start=…`。

## 4 · 长播中断

- **根因**（不是上游、不是表示）：原 `attachDashMse` 把整集当**一条 HTTP 响应**按 1× 速率消费，读到 `done` 就 `endOfStream()` —— 响应提前结束被当成「播完」，停喂后靠 45 秒缓冲垫撑到 30 秒/几分钟处停。看门狗和 `mseActive` 都挂在 `.then()`（要等整条流喂完才 resolve），所以全程没有兜底；`push()` 的非配额错误静默 return、`waitFor` 无超时，死锁也没日志。定量排除：dur=1665s + 208.9MB ≈ 1.0 Mbit/s，45s≈5.6MB 远小于配额。
- **改动**：窗口化 `Range: bytes=<offset>-<offset+4MB-1>` 连续拉流；`rangeAhead` 只算播放头所在区间，≥30 秒才等；失败重试同 offset 最多 10 次；`waitFor` 加 5 秒超时；`endOfStream()` 只在一路真正播到结尾时调用；函数立即 `return { objectUrl }`，看门狗从第 0 秒生效；停顿先「原地 `?start=` 重建」，40 秒内第二次停顿才退整片（`muxedMode`）。
- **还差**：放完整一集确认没有「卡一下后继续」。

## 5 · 合流文件占磁盘

- **真 bug**：`muxCacheStats`/`clearMuxCache` 原本在 `createBilibili()` 闭包里，路由在工厂外 → `stream/cache` 一直抛 `muxCacheStats is not defined`，设置页那行永远「读取失败」。两个函数已随 bilibili 客户端移出，路由改成 `bili.*`。
- **改动**：设置页「存储」新增「在线流合并缓存」：`N 个文件 · X MB` + 目录 + 「清空」按钮；`clearMuxCache` 跳过 `.part` 和正在长写的文件，返回 `{ removed, bytes, skipped }`，提示「已清理 N 个文件 · X，N 个正在使用已跳过」。
- **证据**：`stream/cache` → `{ok:true,dir,files,bytes,running}`；`stream/cache/clear` → `{ok:true,removed:0,bytes:0,skipped:0}`。

## 6 · 在线流章节

- **旧的为什么永远空**：路由读 `x/web-interface/view` 的 `view_points`，而那个接口**没有这个字段**。
- **改动**：`lib/bilibili.js` 的 `chapters()`：
  - 投稿 → `x/player/v2?bvid=&cid=`（缺 cid 时先 `view` 取 `pages[0].cid`），读 `view_points[].{from,to,content}`，单位秒；
  - PGC → `pgc/view/web/season?ep_id=`（或 `season_id`），读 `episodes[].skip.{op,ed}`，转成「片头/片尾」两段 `skip:true`，判据 `end > start`（电影的 `op.start=0` 是常态，不能当「没有」）。
- **证据**（真接口）：`ep=459343 → 249-370 / 1316-1396`；`ep=806233 → 0-89 / 1470-1559`；`BV1xrnz6gEVD → 5 条`。
- **数据边界**：热门投稿里只有约 2/150 有章节，没数据的条就是素条；PGC 112/145 季至少一集有 op/ed。

## 7 / 8 · 字幕：按你的决定整体移除

- **删掉的东西**：`client.js` 里 bilibili 字幕的整条链路——`subTracks`/`manualCid`/`manualBusy`/`manualNote`/`activeTrack`/`tracks` 六个 state、`bili/subtitles` 的 fetch effect、`loadManualSubtitles()`、libass（SubtitlesOctopus）挂载 effect 与 `loadLibass()`/`LIBASS_BASE`、`<track>` 元素、`textTracks` 模式切换、字幕面板里的「哔哩哔哩字幕 · N」列表与「其它 cid」输入框。
- **宿主**：`bili/subtitles` 与 `bili/subtitle.vtt` 两条路由删除，`lib/bilibili.js` 的 `subtitles()` 与返回对象里的成员一并删除，`import { subtitleToAss }` 从 `index.js` 摘掉（`lib/render-stream.js` 自己还在用，磁力字幕烧制不受影响）。
- **结果**：点 CC 只剩一句「这个片源没有字幕轨」。设置里的 `player.subtitle.*`（字体/字号/描边/阴影/颜色）保留——它们仍然决定磁力片源字幕烧进画面的样式。
- **证据**：`node --check` 三个文件通过；`dev/load-client.mjs` 挂载正常；`dev/render-check.mjs animeko season` 3 项 PASS；`dev/audit-routes.mjs` 里已无 `subtitle`，路由数 67 → 63（含之前删的 5 条 embed 中的余数）。

## 9 · 内嵌 mpv

- 宿主删掉 `player/embed`、`player/embed/status|control|repin|close`；`player/open`、`player/shaders`、`player/shaders/open` 保留（着色器目录仍用 `lib/mpv.js` 的 `shaderCatalogue()`）。
- 客户端 `startEmbedded` 加了守卫：直接提示「内嵌播放器已移除，需要外放时用「用播放器打开」」，避免走到已删路由变成 404。函数体作为记录留着（`player.engine` 恒为 `builtin`，够不到）。

## 10 · 播放引擎只读

按「只保留自研播放器」的决定，`engine` 在 `coerceSettings` 里固定 `'builtin'`，设置页只展示 `PrismFlow`。不改。

## m00173 · bilibili 插件化

- `createBilibili()` 整块（约 997 行）移到 [lib/bilibili.js](../lib/bilibili.js)，依赖经 `deps` 注入（`routePrefix`、`accountCookie`、`combineCookie`、`mixinKey`、`signQuery`、`resolvePath`、`createTranscodeStream`），模块自己 import node 内置（`spawn`/`fs`/`crypto`/`os`）。`chapters()` 也搬进去了。
- `SOURCE_FILES.bilibili` 改为 `['lib/bilibili.js']`，插件源编辑器改的是实现文件。
- 仍在 index.js 的只剩路由接线（`bili/*` 薄壳 + `longCache`）和扩展清单注册，符合「路由归宿主、实现在源文件」的既有形态。

## UI 修正（这一轮）

### 第四轮：通用在线源界面（浏览页 + 观看页）

- **片源由扩展决定**：`online/sources` 列出所有 `type: 'online'` 扩展（哔哩哔哩、FQDM…），页面顶部是片源 chip 行；关掉哔哩哔哩会**自动落到下一个开着的片源**（`effectiveSource`：选中的那个没开就用第一个开着的），不再出现「只有一句提示」的死胡同；全部关掉时才显示 `onlineNoneOn` 文案。
- **浏览页**（选片源后）：搜索框 + 清除 + 线路下拉 → 封面网格（2:3，标题 + 类型·年份·地区·评分，封面直连站点 CDN，失败才走 `online/cover` 代理一次）→ 翻页。
- **观看页**（点开某部之后，照参考图）：顶栏 `片源 pill ⌄` + `线路` 下拉 + 右侧「返回列表」；下面 `grid-template-columns: minmax(0,1fr) 268px` —— 左边播放器（16:9），右边固定侧栏（标题 + 「N 集」+ 6 列集数按钮，当前集高亮）；窄屏（<860px）自动堆叠。
- **没选集时的空态**：`onlinePickEpisode`（「从右边选一集开始播放」），不再是空白播放器。
- **证据**：`dev/mk-online-preview.mjs` / `dev/mk-online-watch-preview.mjs` 用真 CSS + 线上接口（`online/browse`、`online/episodes`、`online/servers`）生成两个预览页，浏览器截图 `C:\Users\44516\Downloads\online-preview2.png`（浏览页）与 `online-watch.png`（观看页）。
- **build**：`2026-10-24.55`。

### 第五轮：哔哩哔哩观看页对齐参考布局 + 插件只做数据源

- **哔哩哔哩观看页照参考图改造**（用户：「对 bilibili 的界面已经比较满意，在此基础上添加图片上的一些元素」）：`playing !== null` 时先出一条 `.dshan-watchbar`（`哔哩哔哩 ⌄` 胶囊 + 「手动匹配」+ 「切换配音」（哔哩哔哩只有一条音轨，置灰带 `noDubTrack` 提示）+ 右侧「返回列表」+ 该扩展自带的按钮），下面是 `.dshan-watch` 两栏：左边原来的 `Player`（清晰度、分 P、下载、下一集全保留），右边 `.dshan-watch-side`（标题 + 「N 集」/「N P」+ 6 列集数或分 P 按钮）。没在播时仍是原来的列表 + 集数面板，一处没删。
- **顺手修掉一个真 bug（章节从来没加载过）**：`Player` 的章节 effect 读的是 `playing?.hash / bvid / epId / cid / index`，而 `playing` 在 `Player` 内是**本地布尔 state**（「是否在播」），所以条件恒为「没有元数据」，直接 `setChapterMarks([])` 返回。现在 `Player` 多收一个 `playing` 元数据 prop（签名里改名 `playingMeta`），effect 与依赖数组都改用它，四处调用点（哔哩哔哩番剧/投稿、磁力）各自把真实元数据传进去。
- **插件只做数据源，按钮由 manifest 声明**（用户：「插件主要做的是数据源，可以添加一些按钮等，主要的播放器等东西还是来调用插件的数据」）：
  - `lib/extensions.js`：新增 `actionsOf(manifest)`（把 `manifest.actions` 归一成 `{ id, kind, url, handler, icon, label, labelEn, hint }`，`kind` 缺省按有无 `url`/`handler` 推断，二者都缺的声明直接丢弃）、`list()` 每项输出 `actions`、新增 `runAction(id, actionId, args)`（`open` 返回 `{ kind:'open', url }`，`call` 跑 handler 返回 `{ kind:'call', value }`，未知按钮抛「<name> 没有这个按钮: <id>」）。
  - `index.js`：新增路由 `extensions/action`（POST `{ id, action, args }` → `registry.runAction`，失败返回 `{ ok:false, error:{ message } }`）；哔哩哔哩 manifest 声明「打开哔哩哔哩」「观看历史」，FQDM 声明「打开 FQDM」「最新更新」。
  - `client.js`：新增 `ExtensionActions({ id, T })`，按 `manifest.actions` 渲染按钮（`open` 走 `window.open(..., '_blank', 'noreferrer')`，`call` 走 `postJson('extensions/action')`），挂在通用观看页与哔哩哔哩观看页的 `watchbar` 右侧。播放器、网格、导航全部留在页面，扩展只贡献标签和行为。
  - **单元证据**：`node -e` 直接跑注册表 —— `list().actions` 只留合法两条（缺 url/handler 的 `bad` 被丢弃）、`runAction('demo','site') → {kind:'open',url}`、`runAction('demo','ping') → {kind:'call',value:'pong'}`、未知按钮抛「Demo 没有这个按钮: nope」。
- **build**：`2026-10-24.56`（73 条路由）。

### 第三轮：偏好设置重做 + 字幕设置收进一层

- **根因（面板半透明/挤在中间/卡片压叠）**：`client.js` 里有**两套同名 `.dshan-prefs*` CSS**——播放器弹窗那套在 `PLAYER_CSS` 里，页面级另有一套（`position:fixed;inset:0` 的遮罩 + `width:min(560px,92vw)` 的卡片）。页面级那套后加载，把播放器弹窗当成自己的遮罩/卡片重新排了版。现在播放器弹窗的类名统一改成 `.dshan-plprefs*`，两套互不干扰。
- **视觉**：`<b>偏好设置</b>` + 关闭按钮；`940px` 卡片 `#12141c`；`mask` 用 `rgba(6,8,13,.58)` + `blur(3px)`；分节小标题（数值 / 键位）；每项是「label 左、控件右」的一行（`minmax(280px,1fr)` 自动列）；键位是 76×30 键帽（等宽字体、点一下按新键、`caret-color:transparent` 去掉光标/选中高亮）；数字是 86×30 右对齐输入；底部左边「恢复默认」、右边「取消 / 保存」，保存是金褐色强调按钮。
- **去重（用户：「偏好中有的设置一样了，去除」）**：偏好设置弹窗里只留**键位表**。原来的「字幕与音频」（音量增益 / 字幕延迟）和「通用」（自动播放 / 自动连播）跟齿轮抽屉里的行完全重复，已整体删掉，连带 tab 条也去掉（只剩一个 tab 时没有意义）；`stepRow`/`switchRow` 两个只被它们用到的辅助函数一并删除。
- **字幕设置收进一层**：齿轮抽屉里原来的 4 条（字幕字号/描边/阴影/颜色）合并成一条「字幕样式」，值显示当前摘要（例如 `64 · 描边3 · 白`），点进去是二级面板（`panel === 'substyle'`）再分别选；面板头新增返回按钮 `.dshan-pl-panelback`，`parts` / `shaders` 子面板也有同一个返回键（顺带修了这两个面板标题显示成「音轨」的问题）。
- **证据**：`dev/mk-prefs-harness.mjs` 从 `PLAYER_CSS` 抽真 CSS 渲染 `dev/prefs-harness.html`，浏览器截图（`C:\Users\44516\Downloads\prefs-v7.png`）确认：单张不透明卡片、三列行式布局、键帽/数字可见、底部按钮正确。
- **build**：`2026-10-24.49`（`index.js` 的 `PLUGIN_BUILD` 与 `client.js` 的 `EXPECTED_BUILD` 同步）。

### 前两轮

- **齿轮图标**：`ICON_PATHS.settings` 原来画的是「圆 + 八道射线」，跟亮度键一样，已换成 feather 的齿轮（外圈 + 中心圆），tooltip 改成「更多设置」。
- **点画面收抽屉**：`video` 的 `onClick` 先判 `panel !== null` → `setPanel(null)` 并直接 return，不再顺带切播放/暂停。
- **数值绑定**：`seekFine/seekCoarse/speedStep` 实际存在 `prefs.keys` 里（键位处理读 `keys.seekFine`），原来输入框读写 `draft[field]` → 永远空、改了也没人用；现在读写 `draft.keys[field]`。
- **「已选视频」按钮折行**：`.dshan-epbtn` 加 `box-sizing/flex/nowrap/ellipsis`，单分 P 时 grid 变一列，标题不再 `slice(0,18)`。
- **移除「用默认播放器播放」**：播放器设置里那一行删掉（外放走下面按播放器列出的条目）。
- **设置行加图标**：`SettingRow` 支持 `icon`，速度/音量/自动播放/自动连播/跳过 OP-ED/字幕样式/外观/画质增强/偏好设置/外放 每行左边一个 16px 图标（新增 `speed/autoplay/autonext/skip/outline/shadow/palette/screen/sparkles/sliders/external` 路径）。
- **顺手修的 CSS 语法错**：`.dshan-qmenu-row[data-disabled="true"]{…;}"` 末尾多了一个 `"`（会让该条声明之后的解析变脏）。

## 清晰度进播放器 / 换线路保位置（.86 → .92）

**用户原话**：「清晰度放在播放器里面」。所以它不是播放器下面另起一条 chip 栏，而是控制栏里的一个按钮 + 浮层（`.dshan-qmenu`，`client.js:2997` 起）。

**档位从哪来**：站点给的 `caption` 就是画质（AniCh 的 `全集(全高清-1080P) · 1080P`）。一集里十来条线路常常是同一档的几个镜像，所以按画质去重成一个档位、点哪档落到该档第一条线（`client.js:7427`），死了由 `online/stream` 的候选表接着换。

**换档/换线要接着播**，靠宿主把 `start` 变成 ffmpeg 的 `-ss`。这里 `.92` 修了两个真 bug：

1. **没有 caption 的源，档位名是假的**。FQDM 这类 MacCMS 的线路就叫「新浪资源2」「番茄2线」，没有 caption，旧代码退成「线路 3」——正好把用户唯一能对上号的信息扔掉。现在 caption 为空时直接用站点给的真线路名（`client.js:7420`）。
2. **`start > 0` 时还走字节直通**。`passthroughOnline()` 只能从头吐字节，客户端传了 `start` 也白传：进度条显示 12:30、画面从片头开始。现在 `start > 0` 一律走转码（`index.js:4263`），HLS 和普通 mp4 都能真正跳；客户端也不再按 `type === 'm3u8'` 去猜，一律带上当前位置（`client.js:7446`）。

**证据（FQDM，真接口）**

```
# m3u8 线路（295|2|1，duration 1217 s）
start=1210   → 200，6.43 s 自己收尾，只 1258 字节（头，没有媒体数据）
start=0      → 同一集 40 s 内已吐 19 MB（被时限截断）

# 普通 mp4 直通线路（13620|3|1，duration 2611 s）
start=2600   → 200 video/mp4，9.47 s 自己收尾，599 304 字节（≈ 剩下 11 秒的量）
start=0      → 30 s 吐 7 603 588 字节仍未结束
```

「时间到就自己结束、字节量正好是剩余时长那么多」就是跳转生效的标志；忽略 `start` 的话，9 秒里不可能只吐 599 KB 就收尾。

**还差什么**：浮层在窗口里的实际排版（位置、遮挡、暗色下的可读性）要看一眼——这一项我给不了证据。

## 在线 fMP4 的时长与进度条（.85）

**问题**：在线流有两条路，容器都「没有长度」。直通的 mp4 只要宿主把 Range 转发上去，浏览器自己就知道总长；但转码出来的 fMP4 是 `frag_keyframe+empty_moov`，元素只能看见已缓冲的几秒，于是总长永远是 `--:--`，`accept-ranges: none` 又让拖拽无效。

**改了什么**

- `online/duration` 原来对 `type: 'auto'` 直接 `fetchText(target)` 把整条流当播放列表读——AniCh 的第一条线路是 660 MB 的 mp4，于是报 `Cannot create a string longer than 0x1fffffe8 characters`（2 GiB 上限），时长恒为 0。现在先 `fetchHead()` 取 2 KB：`#EXTM3U` 才当播放列表求和 `#EXTINF`（master 则跳到第一条 variant 再求和），否则交 `probeDurationSeconds()` 让 ffprobe 读 moov。
- `online/stream` 的直通判定按首字节决定（`type` 只是提示）：真是 mp4 就逐字节转发并转发 `Range`，容器自带 moov → 元素知道总长、拖拽是浏览器自己的字节 seek；是 HLS 才进 ffmpeg。
- 转码分支加了首字节等待：ffmpeg 15 s 内一个字节都没出，就把 stderr 尾巴当 JSON 错误回给页面，不再是「200 + 空响应体」那种没法排查的样子。
- 死线路自动换线：`/online/stream` 现在按「用户点的那条 → 后面几条」排一个最多六条的候选表（实测能播的线路常在列表第 5～11 位，而站点每次回的排序都不同，只试三条时经常三条全死）。这份判断只在失败的这一侧看得见，而且第一个字节之前什么都没写，所以还来得及改口。每条失败会打一行 `线路「X」不可用：<原因>`，成功的那条记进 `goodLine`，同一个番剧下次从它开始试——线路表每次请求顺序都会变，但「哪条能播」是稳定的，所以多试的代价只在第一次播放时付。
- 播放器（`client.js`）：`liveSource` 不看元素自己的 `duration`（转码流会给个 8 s 的假总长），只信 `/online/duration` 的提示；拖拽时先看目标秒是否落在已缓冲/MSE 区间内，在就写 `currentTime`，不在就 `offset = 目标秒` 并 `seekEpoch + 1` 让 `streamSrc` 带上 `&start=N&_e=M` 重新开流，宿主用 `ffmpeg -ss` 从那秒重发。

**实测（`DSH_PORT=40070 node dev/test-anich.mjs`，真接口）**

- 全链路：源 6 个（anich 在内）→ 搜索 50 条 → 集数 1 集 → 播放 **`200 video/mp4`，5 s 内 10 MB，首字节 `0000001c 66747970 … ftyp isom`**。换线日志显示它在第 1 条被判死后落到能播的那条上。
- `probe-anich-lines.mjs`：`servers` 11 条真实线路；`duration` **5600 秒**（修之前是 0）；这一轮落到的线路是转码分支（`content-type: video/mp4`、`accept-ranges: none`），也就是走虚拟时间轴的那种；落回直通线路时是 `content-length: 660198328` + `accept-ranges: bytes` + `Range` → **206** + `content-range: bytes 0-1048575/660198328`。
- 逐条线路试播（`dev/probe-anich-each-line.mjs`）：直通线路 3.3 s 出画面，转码线路 8–18 s；站点塞的死线路是 `403`、DNS 已回收、或 ffmpeg `allowed_segment_extensions` 拒收。

**还差什么**

- 进度条拖拽只在宿主侧证到了「有真实总长 + 有 206」，**拖动的手感要在窗口里点一次**（`seek rebuild start=N` 会打在宿主日志里，可以直接对时间）。
- 转码分支首帧要 9–17 s（`veryfast` + HLS 拉片头），直通是秒开。要不要给转码线路加 `-c copy` 试跑，等看到真实线路的编码再定。

**顺带发现的坑**

- AniCh 的 `/vod/{id}/{ep}` 里混着广告：caption 重复的那几条 `全集(全高清-1080P)` 其实是小红书 CDN 上的宣传片 m3u8。现在 `lib/anich.js` 的 `ADVERT_HOSTS` 在源头丢掉；不丢的话用户点到的第一条线路就是「转码没出画面」。
- 站点每次请求回的线路**顺序会变**，所以「线路N」不能只当展示用：`anichLines()` 按 (番剧,集) 缓存 3 分钟，保证界面上的第 N 条和点下去解析到的第 N 条是同一条，也免了拖拽重开流时反复打站点被限流。

## 预加载线条与 AniCh 详情（.86）

**问题**：进度条只有「已播／未播」两段，看不出一条流到底攒下了多少；而 `input[type=range]` 的轨道只认一个渐变，天然画不出第三段。另一头，AniCh 的列表行只有标题、封面和一行 `2026/冒险/科幻`，简介和集数都在 `/anich/detail` 后面，详情页和追番卡片都没去取。

**改了什么**

- 播放器新增 `loaded` 状态：`onProgress` / `onTimeUpdate` / `onSeeked` / `onLoadedMetadata` 都读一次 `video.buffered.end(last)`，MSE 那条路再叠上 `offsetRef`（元素报的是相对段内的秒数）。轨道改成
  `linear-gradient(蓝 0…--dshan-pl-ratio, 白 --dshan-pl-ratio…--dshan-pl-loaded, 灰 …100%)`，
  `loadedRatio` 取 `max(已播, 已缓冲)`，所以它永远不会缩回播放头后面。
- 详情页对 AniCh 条目补发 `/anich/detail`：简介、类型、年份、别名、集数都从那里来。合并用新的 `mergeDetail()`——空串、`null`、空数组不再覆盖列表行已有的值，否则一部还没打分的番会把列表里的分数、集数一起抹成空。
- 追番卡片：缺集数的 AniCh 条目会补问一次 detail（每个条目只问一次，失败就保持「已看 3 集」这种没有分母的样子，不让卡片消失）；外链标签也从写死的「AniList 页面」改成按 `source` 给 AniCh / Bangumi / AniList。详情页那个外链按钮同样修了——它以前对任何源都印「AniList」。
- `anichSubject()` 现在同时给 `url` 和 `siteUrl`、`sourceLabel`：只给 `url` 时详情页的外链按钮和卡片链接对 AniCh 一律不显示。

**顺带修掉的真 bug**

`lib/anich.js` 的 `detail()` 没看 `parsed.error`。站点未登录/令牌过期时回的是 **HTTP 200 + `{"error":true,"message":"unauthorized","body":{}}`**，于是它读出一部标题、简介、类型全空的番剧——详情页会静悄悄变成白页，看起来像「这部没资料」。现在直接抛 `AniCh：unauthorized`，界面就说得清是登录过期。

**实测（宿主 40070，真接口）**

```
GET /dsh-anime/api/anich/detail?id=39802
  ok=true  episodes=1  seasonYear=2026  genres=["动画","奇幻","冒险","科幻"]
  aliases=["メイドインアビス 目覚める神秘","劇場版 來自深淵：覺醒的神秘"]
  summary 长度 568
```

**还差什么**

- 预加载线条是纯 CSS 渐变，**要看一眼实际宽度和颜色**：白色 55% 的未播段在深色播放器上够不够明显，得在窗口里瞄一次（我不会替你说它好看）。
- 转码流里 `buffered` 只覆盖 MSE 真正喂进去的那一段，所以那条线会贴着播放头慢慢爬——这是对的，但和「整集都下好了」的观感差很远，介意的话要给宿主侧的喂流加预读窗口。

## Bangumi：断网、镜像、以及在能通的镜像上真跑通（.87 → .89）

**先量了一遍「到底是不是墙」**

- `api.bgm.tv` / `bgm.tv` 的 DNS 应答是投毒的：阿里 DoH 给 `108.160.161.20`，DNSPod 给 `157.240.3.50`（Facebook 的段）。
- 拿 Cloudflare 的 Anycast 地址直接带 SNI 连（`--resolve api.bgm.tv:443:172.67.73.67`）也不通，最快的那个 0.17 s 就断——名字级封锁，不是「没网」。
- 对照：`api.github.com` 200/397 ms、`registry.npmjs.org` 200/4 s、`graphql.anilist.co` 404（正常答）、`api.tvmaze.com` 200；而 `r.jina.ai`、`api.allorigins.win`、`api.jikan.moe` 全部超时。所以公共 CORS 代理这条路也堵着，不是换个公共网关就能通。

**找到并接上了一个能通的镜像（.88）**

逐个试候选域名，唯一答话的是 `https://bgmapi.anibt.net`（插件本来就接了 anibt 源，所以这个镜像不是陌生东西）：

```
GET  https://bgmapi.anibt.net/calendar                        → 200 (冷启动 19–27 s)
GET  https://bgmapi.anibt.net/v0/subjects/2                    → 200  1.5 s
GET  https://bgmapi.anibt.net/v0/episodes?subject_id=2&type=0  → 200  1.6 s
POST https://bgmapi.anibt.net/v0/search/subjects               → 200  1.8 s
POST https://bgmapi.anibt.net/oauth/access_token               → 连接失败（镜像没代理这个端点）
```

于是把它变成默认值，而不是让用户自己去搜：

- `lib/bangumi.js` 与 `index.js` 都加了镜像常量；**「API 地址」留空 = 用镜像**，填 `https://api.bgm.tv` 才是显式选官方（官方在这台机器上永远超时）。设置项默认值也改成镜像，说明文字写明「清空则回官方（本机访问不到）」。
- `bangumiCalendar` 的超时从 15 s 提到 45 s：镜像冷启动的 `/calendar` 实测 19–27 s，15 s 会直接把能通的请求判死。

**打宿主真路由的实测**（`DSH_PORT=40070`，重载插件后）

```
GET /dsh-anime/api/bangumi/calendar
→ 200 {"ok":true,"data":{"days":[{"weekday":{"id":1,"cn":"星期一",…},"items":[{"id":"bgm-390200",…}]}]}}
（冷启动 27.6 s；命中 shortCache 后瞬时）
```

这条结果同时说明三件事：镜像可达、`apiBase` 全链路生效（日历以前写死常量）、`rating` 读法改进后卡片里有真条目了。

**发现一个真 bug：`apiBase` 只对一半请求生效**

设置里的「API 地址」本来就是为了「本机访问不了 bgm.tv 时填一个能通的镜像」。但 `calendar`、`search`、`season` 三个 handler 写的是常量 `BANGUMI_ENDPOINT`，只有 `lib/bangumi.js` 那半边（详情、集数、收藏）走了 `apiBase`。也就是说：**即使填了能通的镜像，季度和搜索照样打被墙的原站**。

现在统一走 `bangumiEndpoint()`，并且 `bgm:*` 的缓存键尾上带了 `@<base>`——换镜像不会读到上一个镜像（或失败）留下的旧结果。

**评分恒为空**

v0 把分数放在 `subject.rating.score / rank`，代码读的是 `subject.score`。于是搜索和季度的卡片永远没有分数。现在先读 `rating`，再回退到旧形状。

**离线时怎么证明它是对的（不依赖墙外）**

`dev/mock-bgm.mjs` 起了个本地 `api.bgm.tv`（三条手写条目），`dev/probe-bangumi-mirror.mjs` 把设置里的 `apiBase` 指过去，然后**打宿主的真路由**：

```
桩上游 http://127.0.0.1:45149
health.sources.bangumi.endpoint = http://127.0.0.1:45149   ← 健康接口跟着 apiBase 走
搜索 "air"    → 200 ok=true items=1 首条=bgm-2 青空 score=7.9
季度 2026 FALL → 200 ok=true items=2 (39802,40001)
详情 39802    → 200 ok=true eps=1 score=8.1 name_cn=来自深渊：觉醒的神秘
集数 2        → 200 ok=true 条数=2 首集=1 风
日历          → 200 ok=true 天=7 条目=1
还原 apiBase 成功 → (默认)
```

跑完会把 `apiBase` 还原，不会覆盖你自己填的镜像。

**还差什么（说清楚，不粉饰）**

- **登录（OAuth）仍然要浏览器能打开 `bgm.tv`**：授权页和换 token 用的是 `OAUTH_AUTHORIZE` / `OAUTH_TOKEN` 两个常量，都在 `bgm.tv` 名下，而镜像 `/oauth/access_token` 实测连接失败。数据（季度/搜索/详情/集数/日历/收藏读取）已经能走镜像，登录不行——除非镜像也代理了这两个端点。没登录时收藏/追番同步仍然不可用，这是已知边界。


## AniCh 注册走到哪一步（.87 → .90）

**先说位置：登录和注册都在「设置 → 数据源 → AniCh 索引 → 偏好」里**

账号卡片原来是挂在在线源「AniCh」上的，于是它出现在两个地方：在线源的偏好面板，和全局的「设置 → 账号」。用户要它跟着数据源走，所以现在：

- `anich-data`（AniCh 索引）在 manifest 里声明 `account`，并在注册时传入同一个账号实现对象（登录 / 发码 / 注册 / 校验四个入口全在它身上）。
- 该账号实现带 `scoped: true`：`/accounts` 照样列出它（路由、凭据、登录态都不用改），但**设置 → 账号 会把它过滤掉**——一个账号只该在一个地方编辑。
- 在线源「AniCh」不再声明 `account`；它读的仍是账号存储里那条 `anich` 凭据，所以播放不受影响。

**顺带修掉一个真 bug（要不注册表单根本不可能出现）**

扩展偏好面板把宿主给的 provider 折成两种形态：

```js
kind: hostProvider.kind === 'qr' ? 'qr' : 'token'   // 修前
```

`password` 和 `oauth` 都被折成 `token`，而 `AccountCard` 的邮箱登录 + 「没有账号？点这里注册」只在 `info.kind === 'password'` 时渲染。也就是说：**哪怕账号声明全对，面板里也只会出现「粘贴 token」一个输入框**。现在原样透传 `password / oauth / qr`。同一个 `AccountsSection`（设置 → 账号）也有这行，一并改掉并加上了 `scoped` 过滤。

**证明**（不打开浏览器也能跑）

```bash
node dev/check-anich-account-placement.mjs     # 13 项全 PASS
```

它两头都查：

```
PASS  宿主报告 anich provider
PASS  kind 是 password — password
PASS  scoped=true（不重复出现在设置 → 账号） — true
PASS  归属 anich-data（AniCh 索引数据源） — anich-data
PASS  带登录/注册说明 — 用 AniCh 的邮箱 + 密码登录；没有账号可…
PASS  凭据仍然在（登录态没被搬动影响）
PASS  数据源声明 account=anich — anich
PASS  在线源不再重复声明 account —
PASS  prefs 面板不再把 password/oauth 折成 token
PASS  prefs 面板透传 password
PASS  设置 → 账号过滤 scoped provider
PASS  没有 settings 但声明了 account 也显示偏好按钮
PASS  注册表单只在 kind=password 且未登录时出现
```

前 8 项打的是**宿主真路由**（重载插件后 `GET /dsh-anime/api/accounts`、`/api/extensions`），后 5 项是页面源码的关键行断言——因为面板里的实际排版要开页面看，这一项仍是**待窗口实测**。

**注册本身到哪一步**

用户选择先不注册（不要发验证码）。代码路径已经验到底，按用户真邮箱跑时只要两条命令：

```bash
node -e "import('./lib/anich.js').then(m=>m.sendCode({base:'https://ani.emmmm.eu.org',email:'你@例子.com'}))"
# 收到信件后
node -e "import('./lib/anich.js').then(m=>m.register({base:'https://ani.emmmm.eu.org',email:'你@例子.com',code:'信里的6位',name:'用户名',password:'密码'}))"
```

`.invalid` 这类保留域名会被站点拒绝（「验证码获取失败」），所以这条流程必须用能收信的地址；`/register` 失败时回的是普通 JSON，代码现在会先看首字节是不是 `{`，把站点原文报出来，而不是只说「HTTP 200」。

`ani.emmmm.eu.org` 在 Cloudflare 后面，本机连它会时不时 connect timeout（三次里两次失败），`lib/anich.js` 的重试就是为这个加的。


## 可复跑的检查

```bash
node --check index.js && node --check client.js && node --check lib/bilibili.js
node dev/load-client.mjs                 # 客户端能挂上
node dev/render-check.mjs animeko season # 首屏结构
node dev/probe-routes.mjs                # 只读路由没有 ReferenceError
node dev/probe-chapters-route.mjs        # 章节映射（真接口，离线复刻）
node dev/probe-seek-stream.mjs 600       # manifest 是否带 start、章节、缓存统计
node dev/audit-routes.mjs | grep embed   # 应为空
node dev/test-extension-schema.mjs       # 扩展系统 schema（choice/text/coerce/停用闸门）
node dev/test-account-store.mjs          # 账号存储 v2 + 迁移 + registry 的 provider
node dev/test-accounts.mjs               # 账号路由（真接口，会打上游）
node dev/test-fqdm.mjs                   # FQDM：线路/搜索/集数/解析（真接口）
node dev/test-anich.mjs                  # AniCh 全链路：源/搜索/集数/线路/首字节
node dev/probe-anich-lines.mjs 39482     # AniCh 线路表 + 真实总长 + Range 206（真接口）
node dev/probe-anich-each-line.mjs 39482 # 逐条线路试播，分辨真线路与站点塞的广告
node dev/probe-anich-detail.mjs 39802    # AniCh detail/episodes 的真实字段（无 token 时只有 unauthorized）
node dev/probe-bangumi-mirror.mjs        # 把 apiBase 指向本地桩，验 Bangumi 搜索/季度/详情/集数/日历（真 HTTP）
node dev/probe-bangumi-live.mjs          # 直接打宿主路由，验真镜像 bgmapi.anibt.net（日历/搜索/季度/详情/集数）
node dev/probe-anich-register.mjs        # AniCh 发码/注册接口到哪一步为止（用 .invalid 邮箱，不建号）
node dev/probe-anich-raw.mjs             # 打 /register 并 dump 原始字节，核对解码形状
node dev/test-html.mjs                   # 小 HTML 解析器（含真站点结构检查）
```

## 环境限制（会影响判读）

- 沙箱里 `ffmpeg` 起不来（`spawn` 后退出码 `0xC0000142`），所以 `probe-seek-stream.mjs` 的 `seek video/audio` 两行必然是 0 字节，`online/stream` 与 FQDM 播放也只能报「没有找到 ffmpeg」；那是**探针环境**的限制，不是代码问题。seek 的真实时延、FQDM 的真实播放都只能在应用里看。
- 沙箱同时禁止写 `C:\Users\44516\.dsh\state\dsh-anime\*`（`EPERM … settings.json` / `accounts.json.tmp` / `torrent.*`），所以 `dev/test-extensions.mjs` 里 `extensions/toggle`、`extensions/save` 与 `dev/test-accounts.mjs` 的 `accounts/logout` 在本机会报 EPERM。那是**写权限**的限制：同样的调用在应用里（宿主有写权限）是正常的。`test-extensions.mjs` 现在会把这行 `!! EPERM…` 打出来，不再崩在 `undefined.slice`。
- `ops_bash` 偶发 `bash.exe: *** fatal error - CreateFileMapping … Win32 error 5`（间歇性），遇到换 `pwsh` 或改用 `read`/`grep`。
