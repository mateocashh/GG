export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'

  try {
    let endpoint = null
    if (address) {
      endpoint = `https://auth.privy.io/api/v1/users/address/${address}`
    } else if (username) {
      endpoint = `https://auth.privy.io/api/v1/users/username/${username}`
    } else {
      return res.status(400).json({ error: 'address or username required' })
    }

    const r = await fetch(endpoint, {
      headers: {
        'privy-app-id': PRIVY_APP_ID,
        'Content-Type': 'application/json',
      },
    })

    if (!r.ok) return res.status(404).json({ error: 'User not found' })

    const data = await r.json()
    const accounts = data.linked_accounts || []

    // Get wallet address
    const wallet = accounts.find(a => a.type === 'smart_wallet' || a.type === 'wallet')
    // Get username
    const uname = accounts.find(a => a.type === 'username')
    // Get avatar - check all accounts for profile picture
    const avatarAccount = accounts.find(a => a.profile_picture_url)
    const avatar = avatarAccount?.profile_picture_url || null
    // Get display name - try twitter/google first
    const twitter = accounts.find(a => a.type === 'twitter_oauth')
    const google = accounts.find(a => a.type === 'google_oauth')
    const displayName = uname?.username || twitter?.username || google?.name || null

    return res.status(200).json({
      address: wallet?.address || address || null,
      username: displayName,
      avatar,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
