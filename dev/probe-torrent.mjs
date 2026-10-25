// Probe: local torrent clients + torrent index reachability.
const targets = [
  { name: 'qbittorrent-8080', url: 'http://127.0.0.1:8080/api/v2/app/version' },
  { name: 'qbittorrent-8081', url: 'http://127.0.0.1:8081/api/v2/app/version' },
  { name: 'qbittorrent-6363', url: 'http://127.0.0.1:6363/api/v2/app/version' },
  { name: 'qbittorrent-8080-alt', url: 'http://localhost:8080/api/v2/app/webapiVersion' },
  { name: 'transmission-9091', url: 'http://127.0.0.1:9091/transmission/rpc' },
  { name: 'nyaa-rss', url: 'https://nyaa.si/?page=rss&q=frieren&c=1_2&f=0' },
  { name: 'nyaa-html', url: 'https://nyaa.si/?q=frieren&c=1_2&f=0' },
  { name: 'animetosho', url: 'https://animetosho.org/search?q=frieren' },
  { name: 'animetosho-api', url: 'https://animetosho.org/api/search?q=frieren' },
  { name: 'sukebei', url: 'https://sukebei.nyaa.si/' },
  { name: 'acgrip', url: 'https://acg.rip/.json?term=frieren' },
  { name: 'mikan', url: 'https://mikanani.me/RSS/Search?searchstr=frieren' },
]

const out = []
for (const target of targets) {
  const started = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    const response = await fetch(target.url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept: '*/*',
      },
      redirect: 'follow',
    })
    const text = await response.text()
    clearTimeout(timer)
    out.push({
      name: target.name,
      status: response.status,
      ms: Date.now() - started,
      bytes: text.length,
      server: response.headers.get('server'),
      type: response.headers.get('content-type'),
      head: text.slice(0, 160).replace(/\s+/g, ' '),
    })
  } catch (error) {
    out.push({ name: target.name, error: String(error.message || error), ms: Date.now() - started })
  }
}
console.log(JSON.stringify(out, null, 2))
