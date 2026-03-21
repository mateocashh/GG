export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  if (!address && !username) return res.status(400).json({ error: 'required' })

  try {
    const url = address
      ? `https://backend.portal.abs.xyz/api/user/address/${address}`
      : `https://backend.portal.abs.xyz/api/user/username/${username}`

    const r = await fetch(url, {
      headers: {
        'Origin': 'https://portal.abs.xyz',
        'Referer': 'https://portal.abs.xyz/',
      }
    })

    if (r.ok) {
      const data = await r.json()
      const user = data.user || data
      return res.status(200).json({
        address: user.walletAddress || address || null,
        username: user.name || user.username || null,
        avatar: user.overrideProfilePictureUrl || null,
      })
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null, error: e.message })
  }
}
