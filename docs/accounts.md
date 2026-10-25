# 账号（设置 → 账号）

三个登录源都在这里，登录成功后卡片会立刻显示**头像 + 昵称**：

| 来源 | 登录方式 | 昵称 / 头像取自 |
| --- | --- | --- |
| 哔哩哔哩 | 扫码 | `/x/web-interface/nav` 的 `uname` / `face` |
| AniList | Personal Access Token | GraphQL `Viewer { name avatar { medium } }` |
| Bangumi | Access Token | `/v0/me` 的 `username` / `avatar.large` |

凭据只写入 `accounts.json`（本机），页面永远只收到 `loggedIn / name / face|avatar / masked`，看不到凭据原文。

写操作（保存 token、退出登录、扫码生成与轮询）的响应里直接带着刚保存的账号，所以卡片会立即翻转成「已登录」，不依赖下一次刷新；文件级读取也按 mtime 校验，两个宿主实例同时存在时不会互相读到旧缓存。
