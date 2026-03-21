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

  const parseUser = (data) => {
    const user = data?.user || data
    return {
      address: user?.walletAddress || null,
      username: user?.name || user?.username || null,
      avatar: user?.overrideProfilePictureUrl || null,
    }
  }

  try {
    if (address) {
      const r = await fetch(`https://backend.portal.abs.xyz/api/user/address/${address}`, { headers })
      if (r.ok) {
        const data = await r.json()
        return res.status(200).json(parseUser(data))
      }
    }

    if (username) {
      // Try exact username via streamer endpoint
      const r = await fetch(`https://backend.portal.abs.xyz/api/streamer/${username}`, { headers })
      if (r.ok) {
        const data = await r.json()
        const user = data?.user || data?.streamer || data
        if (user?.walletAddress) {
          return res.status(200).json(parseUser(data))
        }
      }
      // Try address endpoint if username looks like address
      if (username.startsWith('0x')) {
        const r2 = await fetch(`https://backend.portal.abs.xyz/api/user/address/${username}`, { headers })
        if (r2.ok) {
          const data = await r2.json()
          return res.status(200).json(parseUser(data))
        }
      }
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null, error: e.message })
  }
}
