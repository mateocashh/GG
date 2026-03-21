export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  if (!address && !username) return res.status(400).json({ error: 'address or username required' })

  try {
    // Scrape Abstract Portal public profile page
    const profileUrl = address
      ? `https://portal.abs.xyz/profile/${address}`
      : `https://portal.abs.xyz/profile/${username}`

    const r = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; absmail/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      }
    })

    if (r.ok) {
      const html = await r.text()

      // Extract username from og:title or profile-specific meta tags
      let name = null
      let avatar = null

      // Try og:title — Abstract Portal sets it to the username
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)
      if (ogTitle) {
        const t = ogTitle[1].trim()
        if (t && !t.toLowerCase().includes('abstract') && t !== 'Profile') name = t
      }

      // Try og:image for avatar
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
      if (ogImage) {
        const img = ogImage[1].trim()
        if (img && !img.includes('default') && !img.includes('favicon')) avatar = img
      }

      // Try twitter:title as fallback for name
      if (!name) {
        const twTitle = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:title["']/i)
        if (twTitle) {
          const t = twTitle[1].trim()
          if (t && !t.toLowerCase().includes('abstract') && t !== 'Profile') name = t
        }
      }

      // Try twitter:image as fallback for avatar
      if (!avatar) {
        const twImage = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i)
        if (twImage) {
          const img = twImage[1].trim()
          if (img && !img.includes('default') && !img.includes('favicon')) avatar = img
        }
      }

      if (name || avatar) {
        return res.status(200).json({ address: address || null, username: name, avatar })
      }
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null })
  }
}
