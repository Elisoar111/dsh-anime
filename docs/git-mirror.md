# 走镜像推送（github.com 直连不稳时）

本机到 `github.com:443` 时通时不通（一次 `git push` 报
`Failed to connect to github.com port 443 after 21170 ms`，第三次才成功）。
下面这套是实测可用的镜像通路，仓库里不需要改任何代码。

## 结论：用 `ghfast.top`

| 动作 | 直连 | 走镜像 |
| --- | --- | --- |
| 拉（`git-upload-pack`） | 时通时断 | ✅ `200` |
| 推（`git-receive-pack`） | 时通时断 | ✅ 可用（需带凭据，见下） |

镜像的 URL 形式就是把完整 GitHub 地址接在后面：

```
https://ghfast.top/https://github.com/Elisoar111/dsh-anime.git
```

`receive-pack` 在没带凭据时返回 `401` —— 这是 GitHub 自己的未授权响应，
带上 token 就能推。**所以镜像不是只读的。**

## 一次性配置

```bash
# 拉：给 fetch 用的镜像远端
git remote add mirror https://ghfast.top/https://github.com/Elisoar111/dsh-anime.git
git fetch mirror

# 想从镜像拉主分支
git pull mirror main
```

## 推送

推送需要 token（`gh auth token` 就是本机已登录的那个）。**不要把 token 写进
`.git/config`**，用一次性 URL 传：

```powershell
$t = (gh auth token).Trim()
git push "https://x-access-token:$t@ghfast.top/https://github.com/Elisoar111/dsh-anime.git" main
```

```bash
# macOS / Linux
git push "https://x-access-token:$(gh auth token)@ghfast.top/https://github.com/Elisoar111/dsh-anime.git" main
```

- token 只在这次命令里出现，命令结束即失效，不会落盘。
- 如果终端会回显命令，用 `$(...)` / `$()` 形式，**不要**把 token 明码写进命令行。

## 验证

```bash
git ls-remote https://ghfast.top/https://github.com/Elisoar111/dsh-anime.git main
# 应该打印远端 main 的 sha

gh api repos/Elisoar111/dsh-anime/commits --jq '.[0].sha[0:7] + " " + (.[0].commit.message | split("\n")[0])'
```

## 其它镜像（本机实测）

| 域名 | 状态 |
| --- | --- |
| `ghfast.top` | ✅ 拉可用、推可用 |
| `kkgithub.com` | ❌ 连不上 |
| `hub.fastgit.xyz` | ❌ 连不上 |
| `github.moeyy.xyz` | ❌ 连不上 |
| `ghproxy.net` | ❌ 连不上 |
| `gitclone.com` | ❌ 连不上（且只支持拉） |
| `gh.llkk.cc` | ❌ 连不上 |

镜像会变。换不到时先 `Test-NetConnection <域名> -Port 443`，再把
`https://ghfast.top/` 换成新的前缀即可，`.git` 后面的部分不用动。
