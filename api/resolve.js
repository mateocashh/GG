export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'

  try {
    // Try Privy first
    let endpoint = address
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
      const resolvedAddress = wallet?.address || address || null
      const resolvedUsername = uname?.username || twitter?.username || google?.name || null
      const avatar = avatarAccount?.profile_picture_url || null

      return res.status(200).json({
        address: resolvedAddress,
        username: resolvedUsername,
        avatar,
      })
    }

    // Privy didn't find user — return address with generated avatar
    const resolvedAddress = address || null
    return res.status(200).json({
      address: resolvedAddress,
      username: null,
      // Use boring avatars for a nice generated pfp
      avatar: resolvedAddress ? `https://source.boringavatars.com/beam/40/${resolvedAddress}?colors=00FF85,0d1410,111a14,00cc6a,080c0a` : null,
    })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
