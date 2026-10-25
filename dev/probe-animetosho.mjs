// Inspect AnimeTosho search HTML structure to write a robust parser.
const url = 'https://animetosho.org/search?q=' + encodeURIComponent('Frieren') + '&order=date-desc'
const response = await fetch(url, {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    accept: 'text/html',
  },
})
const html = await response.text()
console.log('status', response.status, 'bytes', html.length)

const marks = ['home_list_entry', 'torrent_list', 'batch', 'seeders', 'links', 'size', 'magnet', 'nyaa:', 'view/', 'download/']
for (const mark of marks) {
  console.log(mark, (html.match(new RegExp(mark.replace(/[/:]/g, '\\$&'), 'g')) || []).length)
}

const first = html.indexOf('home_list_entry')
console.log('\n=== first 2600 chars from first entry ===\n')
console.log(html.slice(Math.max(0, first - 200), first + 2400))
