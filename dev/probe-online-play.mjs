// Dumps what the Host actually sends for one online episode: status, headers,
// how many bytes arrive in a few seconds and the first box of the stream.
import http from 'node:http'

const PORT = process.env.DSH_PORT ?? '43194'
const SOURCE = process.env.ONLINE_SOURCE ?? 'fqdm'
const ID = process.env.ONLINE_ID ?? '13607'
const LINE = process.env.ONLINE_LINE ?? '无尽③'

const getJson = (path) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path }, (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => resolve(body))
      })
      .on('error', reject)
  })

const episodes = JSON.parse(await getJson(
  `/dsh-anime/api/online/episodes?source=${SOURCE}&id=${ID}&server=${encodeURIComponent(LINE)}`,
))
const list = episodes?.data?.items ?? []
console.log('episodes', list.length, list[0]?.id)

const path = `/dsh-anime/api/online/stream?source=${SOURCE}&episode=${encodeURIComponent(list[0].id)}&server=${encodeURIComponent(LINE)}`
console.log('GET', path)

await new Promise((resolve) => {
  const request = http.get({ host: '127.0.0.1', port: PORT, path }, (response) => {
    console.log('status', response.statusCode, response.headers['content-type'], response.headers['transfer-encoding'] ?? '')
    let total = 0
    let head = ''
    const started = Date.now()
    response.on('data', (chunk) => {
      if (head === '') head = chunk.subarray(0, 40).toString('latin1')
      total += chunk.length
      if (Date.now() - started > 4000) {
        console.log('after 4s bytes=', total, 'head=', JSON.stringify(head))
        request.destroy()
        resolve()
      }
    })
    response.on('end', () => {
      console.log('ended bytes=', total, 'head=', JSON.stringify(head))
      resolve()
    })
    response.on('error', (error) => {
      console.log('response error', error.message, 'bytes=', total)
      resolve()
    })
  })
  request.on('error', (error) => {
    console.log('request error', error.message)
    resolve()
  })
  setTimeout(() => {
    request.destroy()
    resolve()
  }, 8000)
})
