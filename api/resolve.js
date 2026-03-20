export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { username, address } = req.query
  const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'

  try {
    // Try Abstract Portal public API first
    if (username) {
      const portalRes = await fetch(`https://portal.abs.xyz/api/users/by-username/${username}`)
      if (portalRes.ok) {
        const data = await portalRes.json()
        return res.status(200).json({
          address: data.wallet_address || data.address || null,
          username: data.username || username,
          avatar: data.profile_image_url || data.avatar_url || data.pfp || null,
        })
      }
    }

    if (address) {
      const portalRes = await fetch(`https://portal.abs.xyz/api/users/by-address/${address}`)
      if (portalRes.ok) {
        const data = await portalRes.json()
        return res.status(200).json({
          address: data.wallet_address || address,
          username: data.username || null,
          avatar: data.profile_image_url || data.avatar_url || data.pfp || null,
        })
      }
    }

    // Fallback: Privy auth endpoint
    const endpoint = address
      ? `https://auth.privy.io/api/v1/users/address/${address}`
      : `https://auth.privy.io/api/v1/users/username/${username}`

    const privyRes = await fetch(endpoint, {
      headers: {
        'privy-app-id': PRIVY_APP_ID,
        'Content-Type': 'application/json',
      },
    })

    if (!privyRes.ok) return res.status(404).json({ error: 'User not found' })

    const data = await privyRes.json()
    const wallet = data.linked_accounts?.find(a =>
      a.type === 'smart_wallet' || a.type === 'wallet'
    )
    const uname = data.linked_accounts?.find(a => a.type === 'username')
    const avatar = data.linked_accounts?.find(a => a.profile_picture_url)?.profile_picture_url || null

    return res.status(200).json({
      address: wallet?.address || (address || null),
      username: uname?.username || (username || null),
      avatar,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
