export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address, search } = req.query

  const headers = {
    'Origin': 'https://portal.abs.xyz',
    'Referer': 'https://portal.abs.xyz/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  }

  try {
    // Search mode — returns array of users
    if (search) {
      const r = await fetch(`https://backend.portal.abs.xyz/api/search/global?query=${encodeURIComponent(search)}`, { headers })
      if (r.ok) {
        const data = await r.json()
        // Extract users from results
        const users = data?.users || data?.results?.users || data?.data?.users || []
        const mapped = users.map(u => ({
          address: u.walletAddress || u.wallet_address || null,
          username: u.name || u.username || null,
          avatar: u.overrideProfilePictureUrl || u.avatar_url || null,
        })).filter(u => u.address)
        return res.status(200).json({ results: mapped, _raw: data })
      }
      return res.status(200).json({ results: [] })
    }

    // Address lookup
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
        })
      }
    }

    // Username search via global search
    if (username && !username.startsWith('0x')) {
      const r = await fetch(`https://backend.portal.abs.xyz/api/search/global?query=${encodeURIComponent(username)}`, { headers })
      if (r.ok) {
        const data = await r.json()
        const users = data?.users || data?.results?.users || data?.data?.users || []
        const match = users.find(u => (u.name||u.username||'').toLowerCase() === username.toLowerCase()) || users[0]
        if (match) {
          return res.status(200).json({
            address: match.walletAddress || match.wallet_address || null,
            username: match.name || match.username || null,
            avatar: match.overrideProfilePictureUrl || null,
          })
        }
      }
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null, error: e.message })
  }
}
