export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'
  const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || 'privy_app_secret_4ZFUss6rvf1cbGbCKf5ESYJLDrVjmG38yZsobThrV3cmyzffaXd7SczEyZNJ4ZNiWa4mqHAbEmon64fsemfTJ5mr'

  try {
    const creds = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64')
    const headers = {
      'Authorization': `Basic ${creds}`,
      'privy-app-id': PRIVY_APP_ID,
      'Content-Type': 'application/json',
    }

    let endpoint = address
      ? `https://auth.privy.io/api/v1/users/address/${address}`
      : `https://auth.privy.io/api/v1/users/username/${username}`

    const r = await fetch(endpoint, { headers })

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
