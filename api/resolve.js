export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  if (!address && !username) return res.status(400).json({ error: 'required' })

  try {
    const url = address
      ? `https://backend.portal.abs.xyz/api/user/address/${address}`
      : `https://backend.portal.abs.xyz/api/user/address/${username}`

    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'Origin': 'https://portal.abs.xyz',
        'Referer': 'https://portal.abs.xyz/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    })

    if (r.ok) {
      const data = await r.json()
      const user = data.user || data
      const avatar = user.overrideProfilePictureUrl || null
      return res.status(200).json({
        address: user.walletAddress || address || null,
        username: user.name || user.username || null,
        avatar,
      })
    }

    // Also try by username path
    if (username) {
      const r2 = await fetch(`https://backend.portal.abs.xyz/api/streamer/${username}`, {
        headers: {
          'Origin': 'https://portal.abs.xyz',
          'Referer': 'https://portal.abs.xyz/',
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        }
      })
      if (r2.ok) {
        const data = await r2.json()
        const user = data.user || data
        return res.status(200).json({
          address: user.walletAddress || null,
          username: user.name || user.username || null,
          avatar: user.overrideProfilePictureUrl || null,
        })
      }
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null, error: e.message })
  }
}
