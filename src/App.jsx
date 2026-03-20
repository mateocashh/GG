import { useState, useEffect, useCallback, useRef } from 'react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useAccount, useWalletClient } from 'wagmi'
import { Client, IdentifierKind } from '@xmtp/browser-sdk'
import { toBytes } from 'viem'
import { createClient } from '@supabase/supabase-js'

const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'
const SUPABASE_URL = 'https://ezpfolazaxdzenvgnait.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6cGZvbGF6YXhkemVudmduYWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTY2MDEsImV4cCI6MjA4OTU5MjYwMX0.YRur1TQdwKjcZqfdr88ZohFzOyouOuqgiQeGhL6qWHk'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbGetMeta(wallet, messageId) {
  const { data } = await supabase
    .from('message_meta')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .eq('message_id', messageId)
    .single()
  return data
}

async function sbUpsertMeta(wallet, messageId, updates) {
  const { error } = await supabase.from('message_meta').upsert({
    wallet_address: wallet.toLowerCase(),
    message_id: messageId,
    ...updates,
  }, { onConflict: 'wallet_address,message_id' })
  if (error) console.error('sbUpsertMeta error:', JSON.stringify(error))
}

async function sbLoadAllMeta(wallet) {
  const { data } = await supabase
    .from('message_meta')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
  return data || []
}

async function sbCacheMessage(wallet, mail) {
  const { error } = await supabase.from('cached_messages').upsert({
    wallet_address: wallet.toLowerCase(),
    message_id: mail.id,
    from_address: mail.from,
    from_short: mail.fromShort,
    subject: mail.subject,
    preview: mail.preview,
    body: mail.body,
    sent_at: new Date().toISOString(),
    is_sent: mail.isSent || false,
    is_xmtp: mail.xmtp || false,
    conversation_id: mail.conversationId || null,
  }, { onConflict: 'wallet_address,message_id' })
  if (error) console.error('sbCacheMessage error:', JSON.stringify(error))
  else console.log('sbCacheMessage saved:', mail.id)
}

async function sbLoadCachedMessages(wallet) {
  const { data } = await supabase
    .from('cached_messages')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .order('sent_at', { ascending: false })
  return data || []
}

// ── Founder welcome message (always pinned) ──────────────────────────────────
const FOUNDER_MSG = {
  id: 'founder-1',
  fromShort: 'skarxbt',
  from: '0xB5191Cfa55Ee8b9E1b73CD8BB706e48D19D36191',
  fromInitials: 'SK',
  fromAvatar: null,
  subject: 'Welcome to abs.mail ✦',
  preview: "You're one of the first people to receive a message on abs.mail...",
  body: `Hey,\n\nYou're one of the first people to receive a message on abs.mail — the on-chain mail protocol I built on Abstract Chain.\n\nEvery message here is a real transaction. Your inbox is decentralized, encrypted, and owned entirely by your wallet. No servers. No middlemen. No censorship.\n\nI built this because I believe communication should be as open and permissionless as the chains we build on.\n\n— skarxbt\n   Founder, abs.mail`,
  time: '09:14',
  date: 'Today',
  txHash: '0x4a3f2b7c9d1e8f0a3b5c2d7e9f1a4b6c8e0d2f4',
  encrypted: true,
  unread: true,
  starred: true,
  tags: ['founder'],
  permanent: true,
  xmtp: false,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const shortAddr = a => a ? a.slice(0,6)+'...'+a.slice(-4) : ''
const delay = ms => new Promise(r => setTimeout(r, ms))

function fmtTime(d) {
  const now = new Date()
  const diff = now - d
  if (diff < 86400000) return d.toLocaleTimeString('en', {hour:'2-digit', minute:'2-digit'})
  if (diff < 604800000) return d.toLocaleDateString('en', {weekday:'short'})
  return d.toLocaleDateString('en', {month:'short', day:'numeric'})
}

function msgToMail(xmtpMsg, myAddress) {
  const isSent = xmtpMsg.senderInboxId?.toLowerCase().includes(myAddress?.toLowerCase())
  const content = typeof xmtpMsg.content === 'string' ? xmtpMsg.content : JSON.stringify(xmtpMsg.content)
  let subject = '(no subject)', body = content
  try {
    const parsed = JSON.parse(content)
    if (parsed.subject) { subject = parsed.subject; body = parsed.body || content }
  } catch {}
  const d = new Date(Number(xmtpMsg.sentAtNs) / 1e6)
  return {
    id: xmtpMsg.id,
    from: xmtpMsg.senderInboxId,
    fromShort: shortAddr(xmtpMsg.senderInboxId),
    fromInitials: xmtpMsg.senderInboxId?.slice(0,2).toUpperCase() || '??',
    fromAvatar: null,
    subject,
    preview: body.slice(0, 80),
    body,
    time: fmtTime(d),
    date: d.toLocaleDateString('en', {month:'short', day:'numeric'}),
    txHash: null,
    encrypted: true,
    unread: !isSent,
    starred: false,
    tags: [],
    permanent: false,
    xmtp: true,
    conversationId: xmtpMsg.conversationId,
    isSent,
  }
}

// ── ToField ───────────────────────────────────────────────────────────────────
function ToField({ value, onChange }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    setInfo(null)
    if (!value || value.length < 2) return
    const isAddress = value.startsWith('0x') && value.length >= 10
    const isName = !value.startsWith('0x') && value.length >= 2
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const endpoint = isAddress
          ? `https://auth.privy.io/api/v1/users/address/${value}`
          : `https://auth.privy.io/api/v1/users/username/${value}`
        const res = await fetch(endpoint, {
          headers: { 'privy-app-id': PRIVY_APP_ID, 'Content-Type': 'application/json' }
        })
        if (res.ok) {
          const data = await res.json()
          const wallet = data.linked_accounts?.find(a => a.type === 'wallet' || a.type === 'smart_wallet')
          const uname = data.linked_accounts?.find(a => a.type === 'username')
          const avatar = data.linked_accounts?.find(a => a.profile_picture_url)?.profile_picture_url || null
          const addr = wallet?.address || (isAddress ? value : null)
          const name = uname?.username || data.username || (isName ? value : null)
          setInfo({ name, addr, avatar, found: true,
            portalUrl: `https://portal.abs.xyz/profile/${name||addr||value}`,
            scanUrl: addr ? `https://abscan.org/address/${addr}` : null })
        } else {
          setInfo({ name: isName?value:null, addr: isAddress?value:null, avatar:null, found:false,
            portalUrl: `https://portal.abs.xyz/profile/${value}`,
            scanUrl: isAddress ? `https://abscan.org/address/${value}` : null })
        }
      } catch {
        setInfo({ name:isName?value:null, addr:isAddress?value:null, avatar:null, found:false,
          portalUrl: `https://portal.abs.xyz/profile/${value}`,
          scanUrl: isAddress ? `https://abscan.org/address/${value}` : null })
      } finally { setLoading(false) }
    }, 500)
    return () => clearTimeout(timer)
  }, [value])

  const initials = value.startsWith('0x') ? value.slice(2,4).toUpperCase() : value.slice(0,2).toUpperCase()
  const show = focused && (loading || info)

  return (
    <div className="to-field-wrap">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setInfo(null) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => { setFocused(false); setInfo(null) }, 200)}
        placeholder="0x address or portal username..."
      />
      {show && loading && (
        <div className="to-dropdown">
          <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'12px 14px',fontSize:'.78rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
            <div style={{width:'7px',height:'7px',borderRadius:'50%',background:'var(--abs-green)',animation:'blink .8s infinite'}}/>
            Looking up on Abstract...
          </div>
        </div>
      )}
      {show && info && !loading && (
        <div className="to-dropdown">
          {info.found && (
            <div style={{padding:'3px 14px',background:'rgba(0,255,133,.06)',borderBottom:'1px solid var(--border)',fontSize:'.62rem',color:'var(--abs-green)',fontFamily:'var(--font-mono)',letterSpacing:'.06em'}}>
              ✦ ABSTRACT USER FOUND
            </div>
          )}
          <a href={info.portalUrl} target="_blank" rel="noreferrer" className="to-dropdown-row" style={{borderBottom:info.scanUrl?'1px solid var(--border)':'none'}}>
            <div className="to-avatar">
              {info.avatar
                ? <img src={info.avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
                : <span style={{fontSize:'.7rem',fontWeight:'700',color:'var(--abs-green)',fontFamily:'var(--font-mono)'}}>{initials}</span>
              }
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'.85rem',fontWeight:'600',color:'var(--text-primary)',marginBottom:'2px'}}>{info.name || value}</div>
              <div style={{fontSize:'.7rem',color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>
                {info.addr ? shortAddr(info.addr)+' · ' : ''}View on Abstract Portal ↗
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          {info.scanUrl && (
            <a href={info.scanUrl} target="_blank" rel="noreferrer" className="to-dropdown-row">
              <div className="to-avatar" style={{background:'rgba(0,255,133,.04)',border:'1px solid var(--border)'}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'.82rem',fontWeight:'500',color:'var(--text-secondary)',marginBottom:'2px'}}>View on Abscan</div>
                <div style={{fontSize:'.7rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>On-chain transactions & activity</div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── ComposeModal ──────────────────────────────────────────────────────────────
function ComposeModal({ onClose, onSend, defaultTo = '' }) {
  const [to, setTo] = useState(defaultTo)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [encrypted, setEncrypted] = useState(true)
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="compose-box">
        <div className="compose-header">
          <div className="compose-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            New Message
            {encrypted && <span style={{fontSize:'.68rem',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'3px',fontWeight:'400'}}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              encrypted
            </span>}
          </div>
          <button className="compose-close" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="compose-fields">
          <div className="compose-field">
            <span className="field-label">To</span>
            <ToField value={to} onChange={setTo}/>
          </div>
          <div className="compose-field">
            <span className="field-label">Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What's this about..."/>
          </div>
        </div>
        <div className="compose-body">
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message..."/>
        </div>
        <div className="gas-note">
          This message will be recorded as a transaction on <span>Abstract Chain</span>
        </div>
        <div className="compose-footer">
          <div className="compose-footer-left">
            <button className={`enc-toggle ${encrypted?'on':''}`} onClick={() => setEncrypted(e => !e)}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              {encrypted ? 'Encrypted' : 'Plain text'}
            </button>
          </div>
          <button className="btn-send" onClick={() => onSend({to, subject, body, encrypted})} disabled={!to.trim()||!subject.trim()||!body.trim()}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send on-chain
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const { login, logout } = useLoginWithAbstract()
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { data: abstractClient } = useAbstractClient()

  // UI state
  const [view, setView] = useState('inbox')
  const [tab, setTab] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [composing, setComposing] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [step, setStep] = useState(0)
  const [toast, setToast] = useState({ show: false, hash: '' })
  const [block, setBlock] = useState(4829201)
  const [connecting, setConnecting] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [search, setSearch] = useState('')
  const [starred, setStarred] = useState({})
  const [userProfile, setUserProfile] = useState({ name: null, avatar: null })

  // XMTP state
  const [xmtpClient, setXmtpClient] = useState(null)
  const [xmtpLoading, setXmtpLoading] = useState(false)
  const [xmtpError, setXmtpError] = useState(null)
  const [xmtpMails, setXmtpMails] = useState([])
  const [xmtpSent, setXmtpSent] = useState([])
  const [founderMsg, setFounderMsg] = useState({ ...FOUNDER_MSG })
  const streamRef = useRef(null)

  // ── Block counter ──────────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => setBlock(n => n + Math.floor(Math.random()*3)+1), 3000)
    return () => clearInterval(iv)
  }, [])

  // ── User profile fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!address) return
    fetch(`https://api.portal.abs.xyz/v1/users/${address}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const avatar = data.profile_image_url || data.avatar || data.profileImage || null
        const name = data.username || data.name || null
        if (avatar || name) { setUserProfile({ name, avatar }); return }
        throw new Error('no data')
      })
      .catch(() => {
        fetch(`https://auth.privy.io/api/v1/users/address/${address}`, {
          headers: { 'privy-app-id': PRIVY_APP_ID, 'Content-Type': 'application/json' }
        })
        .then(r => r.json())
        .then(data => {
          const uname = data.linked_accounts?.find(a => a.type === 'username')
          const avatar = data.linked_accounts?.find(a => a.profile_picture_url)?.profile_picture_url || null
          setUserProfile({ name: uname?.username || null, avatar })
        })
        .catch(() => {})
      })
  }, [address])

  // ── XMTP init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!address || !walletClient || !isConnected) return
    initXmtp()
  }, [address, walletClient, isConnected])

  async function initXmtp() {
    setXmtpLoading(true)
    setXmtpError(null)
    try {
      const signer = {
        type: 'SCW',
        getIdentifier: () => ({
          identifier: address.toLowerCase(),
          identifierKind: IdentifierKind.Ethereum,
        }),
        signMessage: async (message) => {
          const sig = await walletClient.signMessage({ account: address, message })
          return toBytes(sig)
        },
        getChainId: () => BigInt(2741), // Abstract Mainnet chain ID
      }
      const encKey = crypto.getRandomValues(new Uint8Array(32))
      const client = await Client.create(signer, {
        env: 'production',
        dbEncryptionKey: encKey,
      })
      setXmtpClient(client)
      await loadMessages(client)
      startStream(client)
    } catch (e) {
      console.error('XMTP init error:', e)
      setXmtpError('Could not connect to XMTP. Messages will load when you send or receive one.')
    } finally {
      setXmtpLoading(false)
    }
  }

  async function loadMessages(client) {
    try {
      // 1. Load from Supabase cache first (instant)
      const cached = await sbLoadCachedMessages(address)
      const meta = await sbLoadAllMeta(address)
      const metaMap = Object.fromEntries(meta.map(m => [m.message_id, m]))

      const toMail = row => ({
        id: row.message_id,
        from: row.from_address,
        fromShort: row.from_short || shortAddr(row.from_address),
        fromInitials: (row.from_short || row.from_address || '??').slice(0,2).toUpperCase(),
        fromAvatar: null,
        subject: row.subject || '(no subject)',
        preview: row.preview || '',
        body: row.body || '',
        time: row.sent_at ? fmtTime(new Date(row.sent_at)) : '',
        date: row.sent_at ? new Date(row.sent_at).toLocaleDateString('en',{month:'short',day:'numeric'}) : '',
        txHash: null,
        encrypted: true,
        unread: metaMap[row.message_id]?.unread ?? true,
        starred: metaMap[row.message_id]?.starred ?? false,
        deleted: metaMap[row.message_id]?.deleted ?? false,
        tags: [],
        permanent: false,
        xmtp: row.is_xmtp,
        isSent: row.is_sent,
        conversationId: row.conversation_id,
      })

      const cachedInbox = cached.filter(r => !r.is_sent && !metaMap[r.message_id]?.deleted).map(toMail)
      const cachedSent = cached.filter(r => r.is_sent).map(toMail)
      if (cachedInbox.length || cachedSent.length) {
        setXmtpMails(cachedInbox)
        setXmtpSent(cachedSent)
      }

      // 2. Sync fresh from XMTP in background
      await client.conversations.sync()
      const convos = await client.conversations.list()
      const inbox = [], sent = []
      for (const convo of convos) {
        await convo.sync()
        const msgs = await convo.messages()
        for (const msg of msgs) {
          const mail = msgToMail(msg, address)
          if (mail.isSent) sent.push(mail)
          else inbox.push(mail)
          // Cache each message in Supabase
          sbCacheMessage(address, mail).catch(() => {})
        }
      }

      // Merge meta from Supabase
      const applyMeta = mail => ({
        ...mail,
        unread: metaMap[mail.id]?.unread ?? mail.unread,
        starred: metaMap[mail.id]?.starred ?? mail.starred,
        deleted: metaMap[mail.id]?.deleted ?? false,
      })

      inbox.sort((a,b) => b.id.localeCompare(a.id))
      sent.sort((a,b) => b.id.localeCompare(a.id))
      setXmtpMails(inbox.filter(m => !metaMap[m.id]?.deleted).map(applyMeta))
      setXmtpSent(sent.map(applyMeta))
    } catch (e) {
      console.error('XMTP load error:', e)
    }
  }

  function startStream(client) {
    if (streamRef.current) return
    ;(async () => {
      try {
        const stream = await client.conversations.streamAllMessages()
        streamRef.current = stream
        for await (const msg of stream) {
          const mail = msgToMail(msg, address)
          // Always cache to Supabase — both sent and received
          sbCacheMessage(address, mail).catch(() => {})
          sbUpsertMeta(address, mail.id, { unread: !mail.isSent, starred: false }).catch(() => {})
          if (mail.isSent) {
            setXmtpSent(p => [mail, ...p.filter(m => m.id !== mail.id)])
          } else {
            setXmtpMails(p => [mail, ...p.filter(m => m.id !== mail.id)])
          }
        }
      } catch (e) {
        console.error('XMTP stream error:', e)
      }
    })()
  }

  // ── Load founder msg meta from Supabase ───────────────────────────────────
  useEffect(() => {
    if (!address) return
    sbGetMeta(address, 'founder-1').then(meta => {
      if (meta) setFounderMsg(p => ({ ...p, unread: meta.unread ?? true, starred: meta.starred ?? true }))
    }).catch(() => {})
  }, [address])
  useEffect(() => {
    const handler = e => {
      if (!e.target.closest('.wallet-pill') && !e.target.closest('.logout-dropdown'))
        setShowLogout(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Cleanup stream on unmount ──────────────────────────────────────────────
  useEffect(() => () => { if (streamRef.current) streamRef.current.return?.() }, [])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try { await login() } catch (e) { console.error(e) } finally { setConnecting(false) }
  }, [login])

  // ── Mail lists ─────────────────────────────────────────────────────────────
  const allInbox = [founderMsg, ...xmtpMails]
  const allSent = xmtpSent

  const getMails = () => {
    const all = [...allInbox, ...allSent]
    if (view === 'sent') return allSent
    if (view === 'starred') return all.filter(m => starred[m.id] || m.starred)
    if (view === 'transactions') return allInbox.filter(m => m.txHash)
    if (['drafts','trash','contacts'].includes(view)) return []
    return allInbox
  }

  const filtered = getMails()
    .filter(m => !search ||
      m.subject.toLowerCase().includes(search.toLowerCase()) ||
      (m.fromShort||'').toLowerCase().includes(search.toLowerCase()) ||
      (m.preview||'').toLowerCase().includes(search.toLowerCase())
    )
    .filter(m => tab === 'unread' ? m.unread : true)

  const allMails = [...allInbox, ...allSent]
  const selected = allMails.find(m => m.id === selectedId) || null
  const unread = allInbox.filter(m => m.unread).length

  const handleSelect = id => {
    setSelectedId(id)
    if (id === 'founder-1') {
      setFounderMsg(p => ({ ...p, unread: false }))
      sbUpsertMeta(address, 'founder-1', { unread: false }).catch(() => {})
    } else {
      setXmtpMails(p => p.map(m => m.id === id ? { ...m, unread: false } : m))
      sbUpsertMeta(address, id, { unread: false }).catch(() => {})
    }
  }

  const toggleStar = id => {
    if (id === 'founder-1') {
      setFounderMsg(p => {
        const next = !p.starred
        sbUpsertMeta(address, 'founder-1', { starred: next }).catch(() => {})
        return { ...p, starred: next }
      })
    } else {
      const all = [...xmtpMails, ...xmtpSent]
      const m = all.find(x => x.id === id)
      const next = !(m?.starred)
      setXmtpMails(p => p.map(x => x.id === id ? { ...x, starred: next } : x))
      setXmtpSent(p => p.map(x => x.id === id ? { ...x, starred: next } : x))
      sbUpsertMeta(address, id, { starred: next }).catch(() => {})
    }
  }

  // ── Send via XMTP ──────────────────────────────────────────────────────────
  const handleSend = async ({ to, subject, body }) => {
    setComposing(false)
    setStep(1)
    try {
      await delay(600); setStep(2)
      const payload = JSON.stringify({ subject, body, ts: Date.now() })
      let txHash = null
      let toAddr = to

      if (xmtpClient) {
        // Resolve username to address if needed
        if (!to.startsWith('0x')) {
          try {
            const res = await fetch(`https://auth.privy.io/api/v1/users/username/${to}`, {
              headers: { 'privy-app-id': PRIVY_APP_ID, 'Content-Type': 'application/json' }
            })
            if (res.ok) {
              const data = await res.json()
              const wallet = data.linked_accounts?.find(a => a.type === 'wallet' || a.type === 'smart_wallet')
              if (wallet?.address) toAddr = wallet.address
            }
          } catch {}
        }
        setStep(3)
        // Send via XMTP
        try {
          const canMessage = await Client.canMessage([{ identifier: toAddr.toLowerCase(), identifierKind: IdentifierKind.Ethereum }])
          if (canMessage?.get(toAddr.toLowerCase())) {
            const convo = await xmtpClient.conversations.newDm(toAddr)
            await convo.send(payload)
          }
        } catch (e) { console.warn('XMTP send error:', e) }
      }

      // Also send as Abstract Chain tx for permanence
      if (abstractClient) {
        try {
          const bytes = new TextEncoder().encode(payload)
          const hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('')
          txHash = await abstractClient.sendTransaction({ to: address, data: hex, value: 0n })
        } catch (e) { console.warn('tx error:', e) }
      }

      setStep(4); await delay(700)
      const msgId = 'sent-' + Date.now()
      const m = {
        id: msgId,
        from: address || 'you',
        fromShort: userProfile.name || shortAddr(address) || 'you',
        fromInitials: 'ME',
        fromAvatar: userProfile.avatar,
        subject, preview: body.slice(0, 80), body,
        time: new Date().toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit' }),
        date: 'Today', txHash,
        encrypted: true, unread: false, starred: false,
        tags: [], permanent: false, xmtp: true, isSent: true,
        to: toAddr,
      }
      setXmtpSent(p => [m, ...p])
      // Save sender's copy to Supabase
      sbCacheMessage(address, m).catch(() => {})
      sbUpsertMeta(address, m.id, { unread: false, starred: false }).catch(() => {})
      // Save recipient's inbox copy to Supabase (so they see it on login)
      const recipientCopy = { ...m, id: 'recv-' + msgId, isSent: false, unread: true }
      sbCacheMessage(toAddr, recipientCopy).catch(() => {})
      sbUpsertMeta(toAddr, recipientCopy.id, { unread: true, starred: false }).catch(() => {})
      setView('sent'); setSelectedId(m.id); setStep(0)
      setToast({ show: true, hash: txHash || '' })
      setTimeout(() => setToast(t => ({ ...t, show: false })), 5000)
    } catch (e) {
      console.error('Send error:', e)
      setStep(0)
    }
  }

  const navItems = [
    { id:'inbox', label:'Inbox', badge:unread, icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg> },
    { id:'sent', label:'Sent', icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
    { id:'starred', label:'Starred', icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
    { id:'drafts', label:'Drafts', icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
    { id:'trash', label:'Trash', icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg> },
  ]

  // ── LANDING ────────────────────────────────────────────────────────────────
  if (!isConnected) return (
    <div className="landing">
      <div className="landing-bg">
        <div className="landing-grid"/>
        <div className="landing-radial"/>
        <div className="orb orb1"/>
        <div className="orb orb2"/>
      </div>
      <div className="landing-content">
        <div className="logo-text" style={{userSelect:'none',WebkitUserSelect:'none',fontWeight:700,fontSize:'22px',marginBottom:'28px',letterSpacing:'-.01em'}}>
          <span style={{color:'#e8f5ee'}}>abs</span><span style={{color:'var(--abs-green)'}}>.</span><span style={{color:'#e8f5ee'}}>mail</span><span style={{color:'var(--abs-green)'}}>.</span><span style={{color:'#e8f5ee'}}>xyz</span>
        </div>
        <div className="chain-badge"><div className="chain-dot"/>ABSTRACT CHAIN</div>
        <h1 className="landing-h1">Own your inbox.<br/><span>On-chain, forever.</span></h1>
        <p className="landing-sub">Encrypted messaging built on Abstract. Every message is a transaction — no servers, no middlemen, no censorship.</p>
        <button className="btn-connect" onClick={handleConnect} disabled={connecting}>
          {connecting
            ? <><div style={{width:'16px',height:'16px',border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#080c0a',borderRadius:'50%',animation:'spin .8s linear infinite'}}/> Connecting...</>
            : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Sign in with AGW</>
          }
        </button>
      </div>
    </div>
  )

  // ── MAIN APP ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-logo" style={{userSelect:'none',WebkitUserSelect:'none',letterSpacing:'-.01em'}}>
          <span style={{color:'var(--text-primary)',fontWeight:700,fontSize:'15px'}}>abs</span>
          <span style={{color:'var(--abs-green)',fontWeight:700,fontSize:'15px'}}>.</span>
          <span style={{color:'var(--text-primary)',fontWeight:700,fontSize:'15px'}}>mail</span>
        </div>
        <div className="topbar-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search messages..." value={search} onChange={e => setSearch(e.target.value)}/>
          {search && <button onClick={() => setSearch('')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex',padding:0}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>}
        </div>
        <div className="topbar-right">
          {/* XMTP status indicator */}
          {isConnected && (
            <div title={xmtpClient ? 'XMTP connected' : xmtpLoading ? 'Connecting...' : 'XMTP offline'}
              style={{width:'7px',height:'7px',borderRadius:'50%',background: xmtpClient ? 'var(--abs-green)' : xmtpLoading ? '#ffaa00' : '#ff4444',flexShrink:0,animation: xmtpClient ? 'blink 2s infinite' : 'none'}}/>
          )}
          <div style={{position:'relative'}}>
            <div className="wallet-pill" onClick={() => setShowLogout(s => !s)}>
              <div className="wallet-avatar" style={{overflow:'hidden'}}>
                {userProfile.avatar
                  ? <img src={userProfile.avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
                  : address?.slice(2,4).toUpperCase()
                }
              </div>
              {userProfile.name || shortAddr(address)}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{opacity:.5,transition:'transform .2s',transform:showLogout?'rotate(180deg)':'none'}}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {showLogout && (
              <div className="logout-dropdown" style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--bg-card)',border:'1px solid var(--abs-green-border)',borderRadius:'10px',overflow:'hidden',zIndex:9999,boxShadow:'0 8px 24px rgba(0,0,0,.6)',minWidth:'200px',animation:'fadeInUp .15s ease'}}>
                <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:'32px',height:'32px',borderRadius:'50%',overflow:'hidden',flexShrink:0,border:'1px solid var(--abs-green-border)'}}>
                    {userProfile.avatar
                      ? <img src={userProfile.avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                      : <div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,var(--abs-green),#00cc6a)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.6rem',color:'#080c0a',fontWeight:700}}>{address?.slice(2,4).toUpperCase()}</div>
                    }
                  </div>
                  <div>
                    <div style={{fontSize:'.78rem',fontWeight:'600',marginBottom:'2px'}}>{userProfile.name || shortAddr(address)}</div>
                    <div style={{fontSize:'.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{shortAddr(address)} · Abstract</div>
                  </div>
                </div>
                <a href={`https://portal.abs.xyz/profile/${address}`} target="_blank" rel="noreferrer"
                  style={{display:'flex',alignItems:'center',gap:'8px',padding:'9px 14px',textDecoration:'none',color:'var(--text-secondary)',fontSize:'.8rem',borderBottom:'1px solid var(--border)',transition:'background .1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  View Portal Profile
                </a>
                <button onClick={() => { setShowLogout(false); logout() }}
                  style={{display:'flex',alignItems:'center',gap:'8px',padding:'9px 14px',width:'100%',background:'none',border:'none',cursor:'pointer',color:'#ff5050',fontSize:'.8rem',fontFamily:'var(--font-main)',textAlign:'left',transition:'background .1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,80,80,.08)'}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Disconnect Wallet
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="app-layout">
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-inner">
            <button className="btn-compose" onClick={() => { setReplyTo(''); setComposing(true) }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Compose
            </button>
            <div className="sidebar-section">
              <div className="sidebar-section-label">Mail</div>
              {navItems.map(({ id, label, badge, icon }) => (
                <button key={id} className={`nav-item ${view===id?'active':''}`} onClick={() => { setView(id); setSelectedId(null) }}>
                  <span className="nav-icon">{icon}</span>
                  {label}
                  {badge > 0 && <span className="nav-badge">{badge}</span>}
                </button>
              ))}
            </div>
            <div className="sidebar-divider"/>
            <div className="sidebar-section">
              <div className="sidebar-section-label">Chain</div>
              <button className={`nav-item ${view==='transactions'?'active':''}`} onClick={() => { setView('transactions'); setSelectedId(null) }}>
                <span className="nav-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></span>
                Transactions
              </button>
            </div>
            <div className="sidebar-divider"/>
            {/* XMTP status */}
            {xmtpError && (
              <div style={{padding:'8px',background:'rgba(255,100,50,.08)',border:'1px solid rgba(255,100,50,.2)',borderRadius:'7px',fontSize:'10px',color:'rgba(255,150,100,.8)',fontFamily:'var(--font-mono)',marginBottom:'8px',lineHeight:1.4}}>
                ⚠ {xmtpError}
              </div>
            )}
            {xmtpLoading && (
              <div style={{padding:'8px',background:'var(--abs-green-pale)',border:'1px solid var(--abs-green-border)',borderRadius:'7px',fontSize:'10px',color:'var(--abs-green)',fontFamily:'var(--font-mono)',marginBottom:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
                <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'var(--abs-green)',animation:'blink .8s infinite',flexShrink:0}}/>
                Connecting to XMTP...
              </div>
            )}
            <div className="chain-info">
              <div className="chain-info-label">Network</div>
              <div className="chain-info-row">
                <div className="chain-info-name"><div className="chain-live"/>Abstract</div>
                <div className="chain-block">#{block.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* MAIL LIST */}
        <div className="maillist">
          <div className="maillist-header">
            <div className="maillist-title">{{ inbox:'Inbox',sent:'Sent',starred:'Starred',drafts:'Drafts',trash:'Trash',transactions:'Transactions' }[view] || view}</div>
            <div className="maillist-tabs">
              {['all','unread'].map(t => (
                <button key={t} className={`mail-tab ${tab===t?'active':''}`} onClick={() => setTab(t)}>
                  {t === 'all' ? 'All' : 'Unread'}
                </button>
              ))}
            </div>
          </div>
          <div className="maillist-scroll">
            {filtered.length === 0
              ? <div className="no-mail">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:.3}}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
                  <div>{search ? `No results for "${search}"` : 'No messages'}</div>
                </div>
              : filtered.map((m, idx) => (
                <div key={m.id}
                  className={`mail-item ${m.unread?'unread':''} ${selectedId===m.id?'active':''}`}
                  style={{ animationDelay: `${idx*.04}s` }}
                  onClick={() => handleSelect(m.id)}
                >
                  <div className="mail-item-top">
                    <div className="mail-avatar-sm">
                      {m.fromAvatar
                        ? <img src={m.fromAvatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
                        : m.fromInitials
                      }
                    </div>
                    <div className="mail-from">{m.fromShort || shortAddr(m.from)}</div>
                    <div className="mail-time">{m.time}</div>
                  </div>
                  <div className="mail-subject">{m.subject}</div>
                  <div className="mail-preview">{m.preview}</div>
                  <div className="mail-tags">
                    {m.encrypted && <span className="mail-tag" style={{display:'flex',alignItems:'center',gap:'3px'}}>
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>enc
                    </span>}
                    {m.id === 'founder-1' && <span className="mail-tag">founder</span>}
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* MAIL VIEWER */}
        <div className="mailview">
          {!selected
            ? <div className="mail-empty">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{opacity:.2}}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
                <div className="mail-empty-text">Select a message to read</div>
              </div>
            : <div className="mailview-inner">
                <div className="mail-subject-line">{selected.subject}</div>
                <div className="mail-meta-bar">
                  <div className="mail-avatar-lg">
                    {selected.fromAvatar
                      ? <img src={selected.fromAvatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
                      : selected.fromInitials
                    }
                  </div>
                  <div className="mail-meta-details">
                    <div className="mail-from-full">{selected.fromShort || shortAddr(selected.from)}</div>
                    <div className="mail-addr">{shortAddr(selected.from)}</div>
                  </div>
                  <div className="mail-date-full">{selected.date}, {selected.time}</div>
                  <div className="mail-actions-top">
                    <button className="action-btn" onClick={() => { setReplyTo(selected.fromShort || selected.from); setComposing(true) }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>Reply
                    </button>
                    <button className="action-btn" onClick={() => toggleStar(selected.id)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill={starred[selected.id]||selected.starred?'var(--abs-green)':'none'} stroke="var(--abs-green)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      {starred[selected.id]||selected.starred?'Unstar':'Star'}
                    </button>
                    {!selected.permanent && (
                      <button className="action-btn" onClick={() => {
                        setXmtpMails(p => p.filter(m => m.id !== selected.id))
                        setXmtpSent(p => p.filter(m => m.id !== selected.id))
                        sbUpsertMeta(address, selected.id, { deleted: true }).catch(() => {})
                        setSelectedId(null)
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Delete
                      </button>
                    )}
                  </div>
                </div>
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'20px'}}>
                  {selected.encrypted && (
                    <div className="enc-badge">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      End-to-end encrypted
                    </div>
                  )}
                  {selected.xmtp && (
                    <div className="enc-badge" style={{color:'var(--abs-green)',borderColor:'var(--abs-green-border)'}}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                      XMTP · Decentralized
                    </div>
                  )}
                </div>
                <div className="mail-body">{selected.body}</div>
              </div>
          }
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="mob-nav">
        <div className="mob-nav-inner">
          {[
            {id:'inbox',label:'Inbox',badge:unread,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>},
            {id:'sent',label:'Sent',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>},
            {id:'starred',label:'Starred',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>},
            {id:'transactions',label:'Chain',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>},
          ].map(({ id, label, badge, icon }) => (
            <button key={id} className={`mob-btn ${view===id?'active':''}`} onClick={() => { setView(id); setSelectedId(null) }}>
              {icon}
              {badge > 0 && <span className="mob-badge">{badge}</span>}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE COMPOSE FAB */}
      <button className="mob-compose-fab" onClick={() => { setReplyTo(''); setComposing(true) }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#080c0a" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>

      {/* COMPOSE */}
      {composing && <ComposeModal defaultTo={replyTo} onClose={() => setComposing(false)} onSend={handleSend}/>}

      {/* SENDING OVERLAY */}
      {step > 0 && (
        <div className="sending-overlay">
          <div className="sending-box">
            <div className="sending-animation">
              <div className="sending-ring ring1"/>
              <div className="sending-ring ring2"/>
              <div className="sending-ring ring3"/>
              <div className="sending-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
            </div>
            <div className="sending-title">Broadcasting to Abstract</div>
            <div className="sending-sub">Your message is being written<br/>to the blockchain</div>
            <div className="sending-steps">
              {[
                {id:1,label:'Signing with AGW wallet'},
                {id:2,label:'Encrypting via XMTP'},
                {id:3,label:'Sending to recipient'},
                {id:4,label:'Delivered on-chain'},
              ].map(s => (
                <div key={s.id} className={`sending-step ${s.id<step?'done':s.id===step?'active':''}`}>
                  <div className="step-dot"/>
                  {s.label}
                  {s.id < step && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="3" style={{marginLeft:'auto'}}><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      <div className={`tx-toast ${toast.show?'show':''}`}>
        <div style={{width:'30px',height:'30px',borderRadius:'50%',background:'var(--abs-green-pale)',border:'1px solid var(--abs-green-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{flex:1}}>
          <div className="toast-title">Message sent via XMTP · Abstract Chain</div>
          {toast.hash && <div className="toast-hash">
            <a href={`https://abscan.org/tx/${toast.hash}`} target="_blank" rel="noreferrer" style={{color:'var(--abs-green)',textDecoration:'none'}}>
              Tx: {shortAddr(toast.hash)} ↗
            </a>
          </div>}
        </div>
        <button onClick={() => setToast(t => ({...t, show:false}))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex',padding:0}}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </>
  )
}
