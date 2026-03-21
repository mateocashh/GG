export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  if (!address && !username) return res.status(400).json({ error: 'required' })

  const tryFetch = async (url, headers = {}) => {
    try {
      const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...headers } })
      if (r.ok) return await r.json()
    } catch {}
    return null
  }

  // Try every known Abstract Portal API pattern
  const endpoints = address ? [
    `https://portal.abs.xyz/api/profile/${address}`,
    `https://portal.abs.xyz/api/users/${address}`,
    `https://portal.abs.xyz/api/v1/users/${address}`,
    `https://portal.abs.xyz/api/v1/profile/${address}`,
    `https://api.portal.abs.xyz/v1/users/${address}`,
    `https://api.portal.abs.xyz/v1/profile/${address}`,
    `https://api.abs.xyz/v1/users/${address}`,
    `https://api.abs.xyz/v1/profile/${address}`,
    `https://abs.xyz/api/profile/${address}`,
    `https://abs.xyz/api/users/${address}`,
  ] : [
    `https://portal.abs.xyz/api/profile/username/${username}`,
    `https://portal.abs.xyz/api/users/username/${username}`,
    `https://api.portal.abs.xyz/v1/users/username/${username}`,
  ]

  for (const url of endpoints) {
    const data = await tryFetch(url)
    if (data) {
      const name = data.username || data.name || data.handle || null
      const avatar = data.profile_image_url || data.avatar_url || data.pfp || data.image || data.avatar || null
      if (name || avatar) {
        return res.status(200).json({ address: address || null, username: name, avatar, _source: url })
      }
    }
  }

  return res.status(200).json({ address: address || null, username: null, avatar: null })
}
