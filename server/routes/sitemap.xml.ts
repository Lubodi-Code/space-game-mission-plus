export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://space-game-mission-plus.vercel.app/</loc></url>
  <url><loc>https://space-game-mission-plus.vercel.app/jugar</loc></url>
</urlset>`
})
