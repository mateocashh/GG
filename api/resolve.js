export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address, token } = req.query
  const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'

  try {
    // If we have a user's own auth token, use /users/me
    if (token) {
      const r = await fetch('https://auth.privy.io/api/v1/users/me', {
        headers: {
          'privy-app-id': PRIVY_APP_ID,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
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
    }

    // Fallback: try address/username lookup (works if same app)
    if (address || username) {
      const endpoint = address
        ? `https://auth.privy.io/api/v1/users/address/${address}`
        : `https://auth.privy.io/api/v1/users/username/${username}`
      const r = await fetch(endpoint, {
        headers: { 'privy-app-id': PRIVY_APP_ID, 'Content-Type': 'application/json' }
      })
      if (r.ok) {
        const data = await r.json()
        const accounts = data.linked_accounts || []
        const uname = accounts.find(a => a.type === 'username')
        const twitter = accounts.find(a => a.type === 'twitter_oauth')
        const google = accounts.find(a => a.type === 'google_oauth')
        const avatarAccount = accounts.find(a => a.profile_picture_url)
        return res.status(200).json({
          address: address || null,
          username: uname?.username || twitter?.username || google?.name || null,
          avatar: avatarAccount?.profile_picture_url || null,
        })
      }
    }

    return res.status(200).json({ address: address || null, username: null, avatar: null })
  } catch (e) {
    return res.status(200).json({ address: address || null, username: null, avatar: null })
  }
}
