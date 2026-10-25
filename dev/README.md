# dev/ — 开发期脚本

这里的东西**不是运行时依赖**，删掉插件照样跑。保留它们是因为每一条都对应一个踩过的坑：
能复现「为什么这么写」，也能在改了 `client.js` / `index.js` 之后当回归守卫。

两类脚本：

- **不需要 DSH 的**：纯读文件做断言，或者用假 React 走一遍组件树。随手就能跑。
- **需要运行中宿主的**：打真接口，默认从 `DSH_PORT`（DSH Web 的端口）拼出
  `http://127.0.0.1:<port>/dsh-anime/api`，个别脚本认 `DSH_ANIME_API` 直接给完整前缀。

```bash
# 在仓库根目录
node dev/load-client.mjs
DSH_PORT=13196 node dev/test-anich.mjs
```

## 不需要宿主的

| 脚本 | 干什么 |
| --- | --- |
| `load-client.mjs` | 桩 `window.__ModuleLoader__` + 桩 `require` 载入 `client.js` 并调用 `apply(ctx)`，打印注册到的 slot（应为 `main:dsh-anime \| sidebar.panellist:dsh-anime`）。改完 `client.js` 先跑这个：`Cannot access 'X' before initialization` 这类模块初始化顺序错误在编辑器里看不出来，这里会直接报 |
| `render-check.mjs <tab> [id]` | 用假 React 走完整组件树，渲染指定标签页（`anilist` / `animeko` / `search` / `downloads` / `extensions` …），断言没有裸 React 元素泄漏、首屏有字 |
| `audit-tkeys.mjs` | `T('key')` 用到的每个键是否在 `ZH` / `EN` 两份字典里都存在 |
| `audit-routes.mjs` | Host 路由与 Client 调用是否对得上（有没有调用不存在的路由） |
| `audit-libs.mjs` | `lib/*.js` 的导出是否都被用到、有没有引用不存在的文件 |
| `audit-index.mjs` / `audit-engine.mjs` / `audit-css-hooks.mjs` / `audit-tabbar.mjs` | 索引结构、BT 引擎接线、CSS 钩子、标签栏的静态一致性检查 |
| `check-default-sources.mjs` | 空设置下应当**只有 AniList** 是开着的；给默认关闭的源改设置不能把它隐式打开；显式打开后改设置不能被关回去 |
| `check-theme-player.mjs` | 主题曲面板必须渲染项目自己的 `Player`，不能退回原生 `<video controls>`；qn 阶梯、`startAt/onTime`、关闭按钮都在位 |
| `check-anich-account-placement.mjs` | AniCh 账号卡是否挂在「AniCh 索引」这个数据源上（`scoped`）、偏好面板是否真的渲染邮箱登录而不是「粘贴 token」 |
| `check-css.mjs` / `check-extensions-state.mjs` / `check-backups-visible.mjs` | 样式表完整性、扩展启用状态、源码备份文件可见性 |
| `preview-browse.mjs` / `preview-detail-order.mjs` | 从 `client.js` 里抽出真样式表 + 拉真数据，生成本地 HTML 预览（写完用 `python -m http.server` 起个静态服务看）。GUI 需要带令牌的地址才能打开，所以排版问题一般靠这个先看 |
| `count-tree.cjs` | 统计目录大小 / 文件数 |
| `compress-vendor.mjs` | 给 `assets/vendor/` 里的大文件生成 `.br` / `.gz` sidecar（宿主会优先发它们） |

## 需要运行中宿主的

### 回归测试（`test-*`）

| 脚本 | 覆盖 |
| --- | --- |
| `test-host.mjs` | 全部 Host 路由的端到端冒烟（真 `node:http` + 假 ctx） |
| `test-stream.mjs` / `test-bili-video.mjs` | 哔哩哔哩：搜索 → 季度 → 播放地址 → Range 流；投稿视频路径 |
| `test-torrent-routes.mjs` / `test-torrent-engine.mjs` | 种子：搜索 → 加入 → 元数据 → Range 流（真磁力，几十秒）；qBittorrent 客户端 |
| `test-reload.mjs` | `apply → dispose → apply`：重载后不能撞重复路由，且必须由新代码应答 |
| `test-extension-*.mjs` / `test-extensions.mjs` / `test-toggle.mjs` / `test-sources.mjs` | 扩展注册表、schema 夹取、启用开关、片源页收发 |
| `test-account-store.mjs` / `test-accounts.mjs` | 账号存储：一个实例保存，另一个必须立刻看到（mtime 校验） |
| `test-settings-routes.mjs` / `test-mutations.mjs` | 设置读写、写操作路由 |
| `test-download-live.mjs` | 下载器是否真的落盘（起一个小视频，打印 received 与磁盘字节） |
| `test-anibt.mjs` / `test-anibt-fast.mjs` / `test-animetosho.mjs` / `test-fqdm.mjs` / `test-fqdm-lines.mjs` / `test-anich.mjs` / `test-bangumi.mjs` | 各片源的真接口 |
| `test-seek.mjs` / `test-xpath.mjs` / `test-html.mjs` / `test-websource.mjs` | 跳转链路、XPath / HTML 解析、声明式源 |
| `test-action.mjs` / `test-source-save.mjs` / `test-source-restore.mjs` / `test-extension-source.mjs` | 片源卡片的动作、源码查看 / 保存 / 还原 |

### 探测脚本（`probe-*`）

按主题分：

| 主题 | 脚本 |
| --- | --- |
| AniCh | `probe-anich`、`-api`、`-raw`、`-vod`、`-decode`、`-detail`、`-lines`、`-each-line`、`-stream`、`-login`、`-register`、`-detail`（配套 `anich-schema.mjs` 解加密响应） |
| FQDM | `probe-fqdm-line`、`-playlist`、`-search-dom`、`-covers` |
| 哔哩哔哩 | `probe-bili`、`-2` … `-6`、`probe-bili-video`、`probe-chapters-route`、`probe-pgc-chapters`、`probe-seek-stream`、`probe-seek-latency` |
| Bangumi | `probe-bangumi-live`、`probe-bangumi-mirror` |
| 主题曲 / 字幕 | `probe-animethemes`、`probe-a4k-lib`、`probe-libplacebo`、`probe-ass` |
| 在线流抽象 | `probe-online-boxes`、`probe-online-play`、`probe-source-page`、`probe-rule`、`probe-viewpoints`、`probe-title-variants` |
| 其他 | `probe-accounts`、`probe-guard`、`probe-routes`、`probe-takeover`、`probe-torrent`、`probe-anibt`、`probe-anibt-bundle`、`probe-anchor`、`probe-download-stream` |

常用环境变量：`ONLINE_SOURCE` / `ONLINE_ID` / `ONLINE_LINE`（在线流抽象）、`ANICH_BASE` / `ANICH_HOST`、
`DSH_ANIME_STATE`、`DSH_BANGUMI_TOKEN`。

## 注意

- 这些脚本**会写真东西**：`test-source-save` 会改 `index.js` 再还原（备份在
  `$DSH_HOME/state/dsh-anime/backups/`），`test-download-live` 会往下载目录写文件。
- `dev/` 下生成的 `.html` / `.png` / `.torrent-cache/` 都在 `.gitignore` 里，不要提交。
