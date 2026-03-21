export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query

  try {
    // Try Abstract Portal API first (server-side, no CORS)
    if (address) {
      const portalRes = await fetch(`https://api.portal.abs.xyz/v1/users/${address}`, {
        headers: { 'Content-Type': 'application/json' }
      })
      if (portalRes.ok) {
        const data = await portalRes.json()
        const name = data.username || data.name || null
        const avatar = data.profile_image_url || data.avatar_url || data.pfp || data.image || null
        if (name || avatar) {
          return res.status(200).json({ address, username: name, avatar })
        }
      }
    }

    if (username) {
      const portalRes = await fetch(`https://api.portal.abs.xyz/v1/users?username=${username}`, {
        headers: { 'Content-Type': 'application/json' }
      })
      if (portalRes.ok) {
        const data = await portalRes.json()
        const user = Array.isArray(data) ? data[0] : data
        if (user) {
          return res.status(200).json({
            address: user.address || user.wallet_address || null,
            username: user.username || username,
            avatar: user.profile_image_url || user.avatar_url || user.pfp || null,
          })
        }
      }
    }

    // Fallback: Privy without auth (returns public data)
    const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'
    const endpoint = address
      ? `https://auth.privy.io/api/v1/users/address/${address}`
      : `https://auth.privy.io/api/v1/users/username/${username}`

    const r = await fetch(endpoint, {
      headers: { 'privy-app-id': PRIVY_APP_ID, 'Content-Type': 'application/json' }
    })
    if (r.ok) {
      const data = await r.json()
      const accounts = data.linked_accounts || []
      const wallet = accounts.find(a => a.type === 'smart_wallet' || a.type === 'wallet')
      const uname = accounts.find(a => a.type === 'username')
      const twitter = accounts.find(a => a.type === 'twitter_oauth')
      const google = accounts.find(a => a.type === 'google_oauth')
      const avatarAccount = accounts.find(a => a.profile_picture_url)
      return res.status(200).json({
        address: wallet?.address || address || null,
        username: uname?.username || twitter?.username || google?.name || null,
        avatar: avatarAccount?.profile_picture_url || null,
      })
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null })
  }
}
