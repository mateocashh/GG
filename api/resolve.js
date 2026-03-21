export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  if (!address && !username) return res.status(400).json({ error: 'required' })

  try {
    // Get the Next.js build ID first
    const buildRes = await fetch('https://portal.abs.xyz/_next/static/chunks/pages/_app.js', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })

    // Try Next.js data API with common build id patterns
    const lookup = address || username
    
    // Try the __NEXT_DATA__ from the profile page HTML
    const profileRes = await fetch(`https://portal.abs.xyz/profile/${lookup}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    
    if (profileRes.ok) {
      const html = await profileRes.text()
      
      // Extract __NEXT_DATA__ which contains all page props
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (nextDataMatch) {
        const nextData = JSON.parse(nextDataMatch[1])
        const props = nextData?.props?.pageProps
        
        if (props) {
          // Look for user data in pageProps
          const user = props.user || props.profile || props.userData || props.data
          if (user) {
            const name = user.username || user.name || user.handle || null
            const avatar = user.profile_image_url || user.avatar_url || user.pfp || user.image || user.avatar || null
            if (name || avatar) {
              return res.status(200).json({ address: address || null, username: name, avatar })
            }
          }
          // Search all props for username/avatar
          const str = JSON.stringify(props)
          const unameMatch = str.match(/"username":"([^"]+)"/)
          const avatarMatch = str.match(/"(?:profile_image_url|avatar_url|pfp|image_url)":"([^"]+)"/)
          if (unameMatch || avatarMatch) {
            return res.status(200).json({
              address: address || null,
              username: unameMatch?.[1] || null,
              avatar: avatarMatch?.[1] || null
            })
          }
        }
      }
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null, error: e.message })
  }
}
