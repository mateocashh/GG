export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  if (!address && !username) return res.status(400).json({ error: 'required' })

  const headers = {
    'Origin': 'https://portal.abs.xyz',
    'Referer': 'https://portal.abs.xyz/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  }

  try {
    if (address || (username && username.startsWith('0x'))) {
      const addr = address || username
      const r = await fetch(`https://backend.portal.abs.xyz/api/user/address/${addr}`, { headers })
      if (r.ok) {
        const data = await r.json()
        const user = data?.user || data
        return res.status(200).json({
          address: user?.walletAddress || addr,
          username: user?.name || user?.username || null,
          avatar: user?.overrideProfilePictureUrl || null,
          _raw: data
        })
      }
    }

    if (username && !username.startsWith('0x')) {
      // Try multiple username endpoints
      const endpoints = [
        `https://backend.portal.abs.xyz/api/user/username/${username}`,
        `https://backend.portal.abs.xyz/api/streamer/${username}`,
        `https://backend.portal.abs.xyz/api/user/name/${username}`,
        `https://backend.portal.abs.xyz/api/search/users?q=${username}`,
        `https://backend.portal.abs.xyz/api/users/search?query=${username}`,
      ]
      for (const url of endpoints) {
        try {
          const r = await fetch(url, { headers })
          if (r.ok) {
            const data = await r.json()
            const user = data?.user || data?.streamer || data?.results?.[0] || data
            if (user?.walletAddress || user?.wallet_address) {
              return res.status(200).json({
                address: user.walletAddress || user.wallet_address,
                username: user.name || user.username || username,
                avatar: user.overrideProfilePictureUrl || user.avatar_url || null,
                _source: url
              })
            }
          }
        } catch {}
      }
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null, error: e.message })
  }
}
