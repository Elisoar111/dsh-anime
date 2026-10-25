# 追番 · dsh-anime

<p align="center">
  <img src="icon.svg" width="72" height="72" alt="dsh-anime">
</p>

在 [DeepSeek Harness](https://github.com/deepseek-ai) 里追番的一整页插件：季度新番、放送表、搜索、追番进度、
番剧详情、在线播放、种子播放、下载、主题曲。以「侧边栏图标 + 主面板」的形式注册
（`sidebar.panellist` id `dsh-anime` ⇄ `main` key `dsh-anime`），不是浮层、也不是小组件。

> An anime tracker as a DeepSeek Harness plugin: seasonal charts, airing schedule, search, watchlist, detail pages,
> streaming (bilibili / FQDM / AniCh), torrents, a download manager and OP/ED themes — with its own player
> (**PrismFlow**: MSE + libass + Anime4K) instead of a bare `<video>` tag.

- 版本：`1.0.13`（页面构建号 `2026-10-25.99`）
- 运行环境：DeepSeek Harness 桌面版（提供插件宿主与 Web 前端）
- 可选外部依赖：`ffmpeg`（转码 / 下载合流）、`mpv`（内嵌或外置播放）、`qBittorrent`（外部下载客户端）

---

## 目录

- [功能](#功能)
- [安装](#安装)
- [首次打开：只有一个源是开着的](#首次打开只有一个源是开着的)
- [数据源](#数据源)
- [播放](#播放)
- [追番与详情](#追番与详情)
- [主题曲（OP / ED）](#主题曲op--ed)
- [下载](#下载)
- [账号与隐私](#账号与隐私)
- [设置](#设置)
- [HTTP API](#http-api)
- [架构](#架构)
- [开发](#开发)
- [已知限制](#已知限制)
- [许可与第三方](#许可与第三方)

---

## 功能

| 页面 | 能做什么 |
| --- | --- |
| 本季新番 / 搜索 | AniList 风格的左侧筛选栏 + 海报网格：季度、年份、排序（热度 / 评分 / 开始时间）、类型、标签、放送状态、格式、评分区间、是否含成人内容；搜索页同一套网格 |
| 放送表 | 未来 7 天的排播，按星期分组，今日高亮；数据随页头选中的番剧库切换 |
| 我的追番 | 本地追番表：集数 +1 / −1、进度条、继续观看；追番卡片直接显示下一话与已看集数 |
| 番剧详情 | 横幅 / 封面 / 评分 / 类型 / 制作组 / 外链 / 预告 / 下一话倒计时；标签页：信息、在线流、种子流、观看顺序、主题曲、角色与关联 |
| 在线流 | 哔哩哔哩、FQDM、AniCh，以及 AnimeFlow 声明式源（`src-*`）：搜索 → 匹配季度 → 集数网格 → 播放；**真实线路名**、死线路自动换线 |
| 种子流 | AniBT / AnimeTosho：集数 + 分辨率 + 只看合集 + 精确标题过滤，带体积 / 集号 / 字幕组；内置 BT 引擎或交给 qBittorrent |
| 片源 | 已安装扩展 + Seanime Marketplace 目录；开关、偏好、以及每张卡右上角的 `<>` 源码查看 / 编辑 |
| 下载 | 在线流与种子流共用一张任务表（Motrix 风格），进度、速度、暂停、取消、打开目录 |
| 设置 | 播放、桌面播放器、种子流、下载与数据、界面语言等分区 |

页头还有一个**番剧库三选一**开关（AniList / Bangumi / Animeko），它决定本季新番、放送表、搜索从哪里读。
不做同屏混排——同一部番会带两套 id 出现两次。在线流与种子流与该开关无关。

## 安装

插件是一个普通的 DSH 插件包（`dsh.bundle.patch` + `dsh.client.platform = web`）。

**从本地目录安装（开发用）**——把仓库放到任意位置，然后在该 profile 的 `package.json` 里加一条依赖：

```json
{
  "dependencies": {
    "@local/dsh-anime": "link:D:/path/to/dsh-anime"
  }
}
```

文件在 `$DSH_HOME/profiles/<profile>/package.json`：Windows 默认 `%USERPROFILE%\.dsh\profiles\desktop\package.json`。
改完重启 DSH（或在插件市场里关 → 开一次），侧边栏出现「追番」。

**从 GitHub 安装**：仓库地址填进 profile 的依赖（`git+https://github.com/<you>/dsh-anime.git`），其余同上。

> 装好之后**只有 AniList 是开着的**，其它源需要自己到「片源」里打开——见下一节。

## 首次打开：只有一个源是开着的

九个内置源里除 AniList 外全部 `defaultEnabled: false`，AnimeFlow 的声明式源（`src-*`）同样默认关闭。
这样新用户可以先把页面跑起来，再按需要开源，而不是一屏十几张卡全是「未配置 / 网络不通」。

打开方式：「片源」→ 找到对应卡片 → 右下角开关。开关状态会写进
`$DSH_HOME/state/dsh-anime/settings.json` 的 `extensions.<id>.enabled`，之后就算你改这个源的偏好设置也不会被悄悄改回去
（这一点有 `dev/check-default-sources.mjs` 守着）。

## 数据源

| 源 | 提供什么 | 网络现状（实测） |
| --- | --- | --- |
| **AniList** `graphql.anilist.co` | 季度新番、热度、放送时间轴、搜索、详情（角色 / 关联 / 制作组 / 预告）、观看顺序 | 可用，1–8 秒 |
| **Bangumi** `api.bgm.tv` / 镜像 `bgmapi.anibt.net` | 每周放送表、中文搜索、按季度搜番、详情 / 集数 / 收藏 | 官方地址连接超时；数据接口默认走 anibt 镜像（可用）。**OAuth 登录仍指 `bgm.tv`**，镜像没有代理该端点，所以收藏同步需要自备代理 |
| **Animeko** `api.animeko.org` | 季度排期、放送表、搜索、条目详情；封面 `static.myani.org` | 可用，匿名免 token，1–2 秒；条目 id 与 Bangumi 同一 id 空间 |
| **哔哩哔哩** `api.bilibili.com` | 在线流（番剧 + 用户投稿）、主题曲第二源 | 可用；无 cookie 会 412 风控，宿主先取 `buvid3/buvid4` 再请求 |
| **FQDM** | 在线流（MacCMS 模板站） | 可用；线路表 `{name, sid, count}`，部分线路 CDN 已死（见「死线路自动换线」） |
| **AniCh** `ani.emmmm.eu.org` | 在线流（站点解析）+ 索引（季度 / 搜索 / 详情 / 集数） | 可用；解析出的 15 条线路里混着小红书 CDN 的宣传片，需要按域名过滤 |
| **AniBT** `anibt.net` | 种子流首选，中文字幕组 | 可用，1–4 秒 |
| **AnimeTosho** `animetosho.org` | 种子流兜底（HTML 解析） | 可用，但不少 tracker 已死 |
| **AnimeFlow 声明式源** `assets/sources/animeflow` | `src-girigiri` / `src-gpjda` / `src-mxdm` 等，规则驱动的在线源 | 取决于站点 |
| **Seanime Marketplace**（jsDelivr 镜像） | 「片源」页列出上游生态的在线流 / 种子流 provider（本次实测 71 + 28 个，随上游清单变化） | GitHub raw 不可达，走 jsDelivr |

所有上游都由**宿主代理并缓存**（短期 60 秒 / 中期 10 分钟 / 片源目录 6 小时）：浏览器直连会撞 CORS 与
Referer 防盗链，宿主侧没有这些限制，也不把上游 URL 暴露给页面。

### 中文名是怎么补的

AniList 只有罗马字 / 日文 / 英文标题，选它时海报墙天然是英文。宿主做了一层**中文名映射**：
条目自带的 `title.native` 若是中文（有汉字、无假名）直接用；否则去 Animeko 同一季排期表
（`/v1/schedule/season/{id}` 与 `/v1/schedule/airing`）建 `name + aliases` 索引做**精确**匹配。
只有精确命中才改名——早先试过「Animeko 搜索取第一条」，把「薬屋のひとりごと」配成了
「BanG Dream! 第三季」，比留着英文更糟，已废弃。索引缓存 6 小时；仍没命中的保留原名。

想要 100% 中文，切到 **Animeko** 数据源（它自带 `nameCn`）。

## 播放

### PrismFlow（默认引擎）

自研播放器组件：哔哩哔哩的 DASH 视频轨 / 音频轨由页面自己做 MSE 合流，字幕走 libass（真 ASS 渲染，
字体 / 字号 / 颜色 / 描边 / 阴影都在设置里改，落成服务端生成的 `[V4+ Styles]`），画面可选 Anime4K 锐化 / 超分。
不依赖外部进程，也不占独立窗口。

- 设置 → 播放 →「播放引擎」：`PrismFlow`（默认）或 `内嵌 mpv`（原生渲染，Anime4K 走 mpv 的 `--glsl-shaders-append`）。
- 同一套控制栏也用在别处：番剧、种子流、主题曲（OP/ED）播放器都是它，所以预加载段、清晰度菜单、
  键盘快捷键、画中画的表现一致。

### 在线流

1. 搜索：`/bili/search`、`/online/search`（FQDM / AniCh / `src-*` 走统一抽象）。
2. 集数：`/bili/season`、`/online/episodes`。
3. 解析：`/online/resolve` 内部完成；宿主带 `Referer` 拉流并**透传 Range**（206）。
4. 播放：`<video>`/MSE 读 `/online/stream`，或转码链路 `/torrent/transcode`。

**死线路自动换线**：`streamCandidates()` 会先问扩展要候选。FQDM 这类 MacCMS 站点的 `sid` 是每部番一份，
换线必须**重写集数 id**而不是只换名字（`lib/fqdm.js` 的 `alternates()`）；AniCh 的候选是画质档位。
候选按「用户点的那条 → 其余 → 记忆过能播的」排序，最多试 6 条，能播过的记进 `goodLine`。
（能播的线路常在列表第 5～11 位，只试三条时经常三条全死。）

**广告线路过滤**：AniCh 的 `/vod/{id}/{ep}` 里 `全集(全高清-1080P)` 那几条实际指向小红书 CDN 的宣传片，
宿主按域名丢掉，免得 ffmpeg 报 `not in allowed_segment_extensions` 或播出一段广告。

**清晰度**：哔哩哔哩走 qn 阶梯（4K / 1080P+ / 720P / 480P / 360P），换档时把当前秒数通过 `startAt` 带回去，
不回到片头；没有 caption 的源（FQDM / AniCh）档位名直接用站点给的真实线路名，而不是编一个「线路 3」。

### 种子流

- 默认**内置引擎**（`webtorrent`），加入磁力时**不能传 `announce: []`**，否则会覆盖磁力自带的 tracker，
  而本网络 DHT 不可靠，元数据永远拿不到。元数据通常 4–20 秒。
- `/torrent/stream?hash=&index=`：从 swarm 读文件、支持 Range（206）；元数据未就绪立刻返回
  **409 `metadata-pending`**，不让请求挂死。
- 播不了的编码（HEVC / 10bit / AV1）走 `/torrent/transcode`，ffmpeg 重封装或转码后再推给播放器。
- 也可切到 **qBittorrent**（`/api/v2`，`auth/login` 取 SID，403 自动重登重放）。
- 「用播放器打开」把流 URL 交给本机 mpv / VLC / PotPlayer（自动探测），并带上当前秒数与标题。

### 进度条、跳转与 fMP4

在线流的 fMP4 片段没有容器时长，因此这类流的总长显示 `--:--`、进度条不可拖——这是流本身的限制，
不是播放器的 bug。插件对能拿到时长的链路（转码、种子流、哔哩哔哩 DASH 的 `duration`）会显示真实长度；
哔哩哔哩的分段 DASH 没有索引表，拖动 = **换一条从目标秒开始的流**（`/bili/stream?…&start=秒`，
宿主用 ffmpeg `-ss` 起拼），页面把「已跳过多少秒」记在 `offset` 里，进度条显示 `offset + 流内秒数`。

拖动时用独立的 scrub 状态，松手才落回真实位置，不会被 `timeupdate` 抢回去；`±85s`、`←/→`、`A/D`
与进度条共用同一条 seek 路径。ffmpeg 转码流不支持 Range，那条链路上进度条是禁用的。

### 外部播放器与画质增强

播放器面板里的齿轮会列出本机检测到的 mpv / VLC / PotPlayer，点一下就把流交给它，并带上当前秒数
（mpv `--start=`、VLC `--start-time=`、PotPlayer `/seek=`）与本集标题。

- **Anime4K**：`off / 快速 / 均衡 / 高质量`，着色器随插件发布在 `assets/anime4k/`（49 个 `.glsl`），
  以 `--glsl-shaders-append=` 逐条交给 mpv；预设只用 `Restore_CNN_*` + `Upscale_CNN_x2_*` + `Clamp_Highlights`，
  GAN / UL / VL 在 1080p 实时解码下撑不住。VLC 与 PotPlayer 没有等价机制。
- **自定义命令**：设置里填模板即可接管播放器选择，占位符 `{url}` `{start}` `{title}` `{shaders}`。
- **内嵌 mpv**：`mpv --wid=<窗口句柄> --geometry=<面板矩形>` 直接画在面板区域，再走 `--input-ipc-server`
  把播放 / 暂停 / ±30s / 速度 / 音量 / 位置接回面板（`lib/mpv.js`）。拿不到窗口句柄时退化成独立窗口。

## 追番与详情

- **追番表**存在浏览器 `localStorage`（`dsh-anime:watchlist:v1`），不联网、不占宿主状态。
- **详情页**头部：横幅、封面、标题、别名、评分 / 类型 / 放送状态 / 季度 / 集数 / 制作组 / 来源、追番按钮、
  AniList 外链、预告、下一话倒计时。
- **观看顺序**（`anilist/watchorder`）：按 AniList 的 `relations` 拓扑排序给出「前作 → 本作 → 续作」链，
  当前番剧高亮，每一行带封面、类型、集数、年份；点任意一条跳到那部作品的详情，可层层返回。
- **角色与关联**：角色卡（声优、性别、年龄、生日、血型、简介）+ 关联作品。

## 主题曲（OP / ED）

详情页的「主题曲」标签里是**来源切换**（选中哪个才查哪个），默认 animethemes：

| 来源 | 说明 |
| --- | --- |
| animethemes.moe | 按 AniList id 取官方 OP/ED 片段（`/animethemes/themes`）。注意 `filter[has][]=resources` 这类**数组写法是必须的**，标量会被判 `The filter.resource must be an array` |
| 哔哩哔哩 | 复用 `bili/videos` 搜索 + `bili/video` 取 cid + `bili/stream` 代取字节，按视频标题搜「番名 OP」 |

本机 `api.animethemes.moe` 常被 Cloudflare 挑战（403 / 422 / 500），页面会把真实失败原因原文显示出来，
并提供一键切到哔哩哔哩。两个来源的播放器都是同款 `Player`（不是浏览器原生 `<video>`），
哔哩哔哩那条带 qn 阶梯，切换清晰度不丢位置。

## 下载

两种来源共用一张任务表，默认落盘到系统「下载」文件夹，历史写 `downloads.json`：

- **在线流**：播放器右下角下载图标 → `/downloads/stream`，宿主自己带 `Referer`/Cookie 抓流，
  先写 `名字.mp4.part` 再改名。**产物按扩展名交给 ffmpeg**（写 `.part` 时它认不出容器，会报
  `Unable to find a suitable output format`），所以实际是写 `.part` + 显式 `-f mp4`。
- **种子流**：`/downloads/torrent`，宿主轮询引擎进度，下完复制进下载目录。
- 两者都有进度、速度、取消（取消时删 `.part`）、打开所在目录；界面按 Motrix 的任务行 / 进度条 / 状态徽标做的。
- 下载目录三种用法：直接填路径、「浏览…」（宿主优先用 Electron `dialog.showOpenDialog`，取不到退回
  PowerShell + WinForms）、「用默认」。也可以用环境变量 `DSH_ANIME_DOWNLOAD_DIR` 覆盖。

## 账号与隐私

| 站点 | 登录方式 | 昵称 / 头像取自 |
| --- | --- | --- |
| 哔哩哔哩 | 扫码（或粘贴 `SESSDATA=...` Cookie） | `/x/web-interface/nav` 的 `uname` / `face` |
| AniList | Personal Access Token | `Viewer { name avatar { medium } }` |
| Bangumi | Access Token | `/v0/me` 的 `username` / `avatar.large` |
| AniCh | 邮箱 + 密码（账号卡内嵌在 **AniCh 索引** 这个数据源的偏好里，不在全局账号页） | 站点 `/ajax_login` 后取昵称与头像 |

凭据只写进本机的 `$DSH_HOME/state/dsh-anime/accounts.json`，**页面拿到的永远是掩码**
（`loggedIn / name / face / masked`），不把密钥回传渲染进程；`accounts.json` 按 mtime 校验再读，
两个宿主实例同时存在时不会互相读到旧缓存。仓库里不含任何账号或 token。

## 设置

左侧分组导航，右侧内容卡，改完点「保存设置」写回 `$DSH_HOME/state/dsh-anime/settings.json`；
「恢复默认」立刻重置并重建 BT 引擎。

| 分区 | 内容 |
| --- | --- |
| 界面 | 番剧名字用哪种语言（罗马音 / 日语原名 / 中文 / 英语）、插件界面语言（跟随应用 / 简体中文 / English） |
| 视频播放 | 内嵌还是外部播放器、默认清晰度、自动连播、非 MP4 片源怎么处理（自动 / 只重封装 / 必要时转码） |
| 桌面播放器 | 检测到的 mpv / VLC / PotPlayer，以及一条自定义命令模板 |
| 种子流 | 默认片源（自动 → AniBT → AnimeTosho）、上传限速、缓存目录、看完自动清理分钟数 |
| qBittorrent | 地址 / 用户名 / 密码（留空表示保留旧密码） |
| 下载 | 下载目录、完成后保留 `.torrent`、保留历史 |

**名字语言**（`ui.titleLanguage`）四组候选按顺序取第一个非空的，中文模式要求「含简体字标记」——
纯汉字的日文标题（如 `呪術廻戦 死滅回游 前編`）不会被误判成中文，会退化到下一个候选。

**界面语言**（`ui.locale`）：文案在 `client.js` 里是 `ZH` / `EN` 两份字典，通过
`ctx.locale.register(NS, { zh, en })` 交给宿主；`auto` 时跟随应用。`dev/audit-tkeys.mjs` 会检查
`T('key')` 用到的键在两边都存在。

## HTTP API

全部挂在 `/dsh-anime/api/` 下。上游失败统一回 `200 {ok:false, error:{message}}`（媒体流用 409），
404 只留给未知路由。写操作同时接受 `POST <route>` 和 `GET <route>?payload=<json>`
（DSH 桌面壳会把页面的 POST 以没有 body 的 GET 交给宿主）。

| 分组 | 路由 |
| --- | --- |
| 元数据 | `health`、`anilist/season|trending|airing|search|media|browse|watchorder`、`animeko/season|airing|search|subject`、`bangumi/calendar|search|season|subject|episodes|collection(s)|mark`、`anich/season|search|detail|episodes` |
| 在线流 | `online/sources|browse|search|episodes|servers|resolve|stream|duration`、`bili/search|season|episode|stream|videos|video|chapters` |
| 种子流 | `torrent/search|add|remove|files|stream|transcode|status|list|config|open-player` |
| 下载 | `downloads`、`downloads/bili|torrent|stream|cancel|remove|clear|reveal` |
| 账号 | `accounts`、`accounts/save|logout|qr|qr/status|code|password|register` |
| 扩展 | `extensions`、`extensions/save|toggle|action|source|source-save|source-restore` |
| 片源 / 主题曲 | `sources`、`sources/manifest`、`animethemes/themes` |
| 设置 / 播放器 | `settings`、`settings/save|reset|pick-dir`、`player/open|shaders|shaders/open`、`player/embed*` |
| 其他 | `stream/cache|stream/cache/clear`、`client/heartbeat` |

## 架构

```
package.json          dsh.bundle.patch + dsh.client（platform: web）
cordis.patch.yml      insert: id dsh-anime → name '@local/dsh-anime'
index.js              Host 半：数据源、代理与缓存、扩展注册表、BT 引擎、下载队列、播放器桥
client.js             Client 半：侧边栏图标 + 主面板（React，单文件自带样式与 i18n）
lib/anilist.js        AniList GraphQL（季度 / 搜索 / 详情 / 观看顺序）
lib/bangumi.js        Bangumi v0 + 镜像降级
lib/anich.js          AniCh 解析 + 索引（登录 / 注册 / 发码 / 线路过滤）
lib/fqdm.js           FQDM（MacCMS）线路、换线与封面
lib/bilibili.js       哔哩哔哩（搜索 / 季度 / DASH / 字幕 / 分段 seek）
lib/wbi.js            哔哩哔哩 WBI 签名
lib/chapters.js       章节 / 看点（pgc 时间轴）
lib/anibt.js          AniBT 片源（集号与合集识别）
lib/animetosho.js     AnimeTosho HTML 解析兜底
lib/websource.js      AnimeFlow 声明式源（JSON / HTML 规则 → 扩展）
lib/html.js           HTML 解析（声明式源共用）
lib/xpath.js          最小 XPath 实现（声明式源选择器）
lib/extensions.js     扩展注册表：manifest、schema 校验、启用状态、调用与超时
lib/torrent-engine.js 内置 webtorrent 引擎 + qBittorrent 客户端 + ffmpeg 转码 + 打开外部播放器
lib/render-stream.js  MSE manifest 生成（DASH 分片 / 时长 / 初始分片）
lib/mpv.js            内嵌 mpv（wid + JSON IPC）
lib/downloads.js      下载队列（在线流 / 种子流共用）
lib/accounts.js       账号存储（掩码输出、mtime 校验）
lib/settings.js       设置读写与字段校验
locale/{zh,en}.json   插件市场里显示的名称与简介
assets/anime4k/       Anime4K 着色器；assets/vendor/ 内置 libass、jassub、anime4k-webgpu
dev/                  开发期脚本（检查、探测、预览），见 dev/README.md
docs/status.md        开发日志：每一轮改了什么、拿什么证明、还差什么
```

**路由表是进程级的**：宿主不允许同一 exact 路由注册两次，而插件会被反复 `apply()`（重载、切面板、
第二实例）。所以每条路径在进程里只注册一次，注册的是转发器——它每次请求都从进程级表
（`globalThis[Symbol.for('dsh-anime.routes')]`）里取「最新一次 apply 发布的处理器」。
每次 apply 会在日志留一行 `routes published: N handlers … build <号>`，
页头出现「宿主需重启」标签说明 Host 与 Client 的 `EXPECTED_BUILD` 对不上。

**扩展即插件**：数据源、种子流、在线流三种扩展走同一个注册表，页面只读 manifest 就能画出卡片、
开关和偏好弹窗；关掉的扩展对应路由直接回「已停用」。AnimeFlow 的声明式源也注册成扩展（`src-*`）。

## 开发

```bash
# 结构检查（不需要 DSH）：client.js 能不能被载入、apply() 注册到几个 slot
node dev/load-client.mjs

# 文案键、CSS 钩子、路由、lib 依赖的静态审计
node dev/audit-tkeys.mjs && node dev/audit-routes.mjs && node dev/audit-libs.mjs

# 用假 React 走完整组件树，检查某个页面渲染不报错、没有裸 React 元素泄漏
node dev/render-check.mjs anilist 16498

# 默认源 / 主题曲播放器的回归守卫
node dev/check-default-sources.mjs && node dev/check-theme-player.mjs
```

需要**运行中的宿主**的测试（默认 `DSH_ANIME_API=http://127.0.0.1:<port>/dsh-anime/api`，端口是 DSH Web 的端口）：

```bash
node dev/test-host.mjs            # 全部 Host 路由的端到端冒烟（真 node:http + 假 ctx）
node dev/test-stream.mjs          # 哔哩哔哩：搜索 → 季度 → 播放地址 → Range 流
node dev/test-torrent-routes.mjs  # 种子：搜索 → 加入 → 元数据 → Range 流（真磁力，几十秒）
node dev/probe-anich.mjs          # AniCh：搜索 → 集数 → 线路 → 解析 → 首字节
node dev/test-reload.mjs          # apply → dispose → apply，重载后不撞重复路由且由新代码应答
```

**改完代码怎么让它生效**：`client.js` 在 DSH 窗口里按 `Ctrl+R` 重载；`index.js` / `lib/*.js` 改的是宿主半，
必须在插件市场里把「追番」关一次再打开（或重启 DSH）——只改文件不会热加载。

更多开发工具的分类清单见 [dev/README.md](dev/README.md)，历史决策与逐轮证据见 [docs/status.md](docs/status.md)。

## 已知限制

- **Bangumi OAuth**：数据接口能走镜像，但登录端点 `bgm.tv/oauth/access_token` 没有被镜像代理，
  需要自备代理或自建反代。
- **animethemes.moe**：本机常被 Cloudflare 挡住，主题曲默认落到哔哩哔哩。
- **在线流 fMP4 没有容器时长**：总长 `--:--`、进度条不可拖；有 `duration` 的链路正常。
- **种子 tracker 质量**：不少公开 tracker 已死，AnimeTosho 结果里常有 0 做种的条目。
- **AniCh 注册**需要邮箱验证码，插件只提供入口，不会代发。

## 许可与第三方

本项目以 **MIT** 许可发布（见 [LICENSE](LICENSE)）。

`assets/vendor/` 内是第三方构建产物，各自沿用原许可：
[libass-wasm](https://github.com/PrismarineJS/libass-wasm)、[jassub](https://github.com/ThaUnknown/jassub)、
[anime4k-webgpu](https://github.com/Anime4KWebBoost/anime4k-webgpu)、[Anime4K](https://github.com/bloc97/Anime4K)；
`assets/anime4k/*.glsl` 来自 Anime4K（MIT）。BT 引擎是 [WebTorrent](https://github.com/webtorrent/webtorrent)（MIT）。

数据来自 [AniList](https://anilist.co)、[Bangumi 番组计划](https://bgm.tv)、[Animeko](https://animeko.org)、
[哔哩哔哩](https://www.bilibili.com) 等公开接口；插件只做客户端聚合与播放，不托管任何内容。

界面与交互参考了 [Seanime](https://github.com/5rahim/seanime)（扩展 / 片源目录 / 播放器交互）与
[Motrix](https://github.com/agalwood/Motrix)（下载列表）。
