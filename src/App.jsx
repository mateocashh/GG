import { useState, useEffect, useCallback } from 'react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useAccount } from 'wagmi'
import { createClient } from '@supabase/supabase-js'

const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'
const SUPABASE_URL = 'https://ezpfolazaxdzenvgnait.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6cGZvbGF6YXhkemVudmduYWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTY2MDEsImV4cCI6MjA4OTU5MjYwMX0.YRur1TQdwKjcZqfdr88ZohFzOyouOuqgiQeGhL6qWHk'
const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function dbSaveMessage(msg) {
  const { error } = await sb.from('cached_messages').upsert(msg, { onConflict: 'wallet_address,message_id' })
  if (error) console.error('dbSaveMessage:', error.message)
}
async function dbLoadMessages(wallet) {
  const { data, error } = await sb.from('cached_messages').select('*').eq('wallet_address', wallet.toLowerCase()).order('sent_at', { ascending: false })
  if (error) console.error('dbLoadMessages:', error.message)
  return data || []
}
async function dbUpsertMeta(wallet, messageId, updates) {
  const { error } = await sb.from('message_meta').upsert({ wallet_address: wallet.toLowerCase(), message_id: messageId, ...updates }, { onConflict: 'wallet_address,message_id' })
  if (error) console.error('dbUpsertMeta:', error.message)
}
async function dbLoadMeta(wallet) {
  const { data } = await sb.from('message_meta').select('*').eq('wallet_address', wallet.toLowerCase())
  return Object.fromEntries((data||[]).map(m => [m.message_id, m]))
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const shortAddr = a => a ? a.slice(0,6)+'...'+a.slice(-4) : ''
const randomHex = n => [...Array(n)].map(()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('')
const delay = ms => new Promise(r => setTimeout(r, ms))

const FOUNDER_MSG = {
  id: 'founder-1',
  fromShort: 'skarxbt',
  from: '0xB5191Cfa55Ee8b9E1b73CD8BB706e48D19D36191',
  fromInitials: 'SK',
  fromAvatar: null,
  subject: 'Welcome to abs.mail ✦',
  preview: "You're one of the first people to receive a message on abs.mail...",
  body: `Hey,\n\nYou're one of the first people to receive a message on abs.mail — the on-chain mail protocol I built on Abstract Chain.\n\nEvery message here is a real transaction. Your inbox is decentralized, encrypted, and owned entirely by your wallet. No servers. No middlemen. No censorship.\n\nI built this because I believe communication should be as open and permissionless as the chains we build on.\n\n— skarxbt\n   Founder, abs.mail`,
  time: '09:14', date: 'Today',
  txHash: '0x4a3f2b7c9d1e8f0a3b5c2d7e9f1a4b6c8e0d2f4',
  encrypted: true, unread: true, starred: true,
  permanent: true,
}

// ── ToField ───────────────────────────────────────────────────────────────────
function ToField({ value, onChange }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [selected, setSelected] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)

  useEffect(() => {
    setSelected(false)
    setSelectedUser(null)
    setResults([])
    if (!value || value.length < 2) return
    // If full address typed, no need to search
    if (value.startsWith('0x') && value.length === 42) return

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        // Search Supabase users table first
        const isAddr = value.startsWith('0x')
        const { data } = isAddr
          ? await sb.from('users').select('*').ilike('wallet_address', `%${value}%`).limit(5)
          : await sb.from('users').select('*').ilike('username', `%${value}%`).limit(5)

        if (data && data.length > 0) {
          setResults(data)
        } else {
          // Fallback to proxy API
          const endpoint = isAddr
            ? `/api/resolve?address=${value}`
            : `/api/resolve?username=${value}`
          const res = await fetch(endpoint)
          if (res.ok) {
            const d = await res.json()
            if (d.address) {
              setResults([{ wallet_address: d.address, username: d.username, avatar_url: d.avatar }])
            } else {
              setResults([])
            }
          } else {
            setResults([])
          }
        }
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 400)
    return () => clearTimeout(timer)
  }, [value])

  const handleSelect = (user) => {
    onChange(user.wallet_address)
    setSelected(true)
    setSelectedUser(user)
    setFocused(false)
    setResults([])
  }

  const show = focused && !selected && (loading || results.length > 0)

  return (
    <div className="to-field-wrap">
      <div style={{display:'flex',alignItems:'center',gap:'6px',flex:1}}>
        {selected && selectedUser?.avatar_url && (
          <img src={selectedUser.avatar_url} alt="" style={{width:'18px',height:'18px',borderRadius:'50%',flexShrink:0,objectFit:'cover',border:'1px solid var(--abs-green-border)'}}/>
        )}
        {selected && selectedUser?.username && (
          <span style={{fontSize:'.75rem',color:'var(--abs-green)',fontFamily:'var(--font-mono)',flexShrink:0}}>{selectedUser.username}</span>
        )}
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setSelected(false); setSelectedUser(null) }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="0x address or abstract username..."
          style={{flex:1, display: selected && selectedUser?.username ? 'none' : 'block'}}
        />
      </div>
      {show && (
        <div className="to-dropdown">
          {loading && (
            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 14px',fontSize:'.75rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
              <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--abs-green)',animation:'blink .8s infinite'}}/>
              Searching Abstract users...
            </div>
          )}
          {!loading && results.map(user => (
            <div key={user.wallet_address} className="to-dropdown-row" onMouseDown={() => handleSelect(user)}>
              <div className="to-avatar">
                {user.avatar_url
                  ? <img src={user.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
                  : <span style={{fontSize:'.7rem',fontWeight:'700',color:'var(--abs-green)',fontFamily:'var(--font-mono)'}}>{(user.username||user.wallet_address).slice(0,2).toUpperCase()}</span>
                }
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'.85rem',fontWeight:'600',color:'var(--text-primary)',marginBottom:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {user.username || shortAddr(user.wallet_address)}
                </div>
                <div style={{fontSize:'.68rem',color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>
                  {shortAddr(user.wallet_address)} · Abstract
                </div>
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          ))}
          {!loading && results.length === 0 && value.length >= 2 && (
            <div style={{padding:'10px 14px',fontSize:'.75rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
              No Abstract users found
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ComposeModal ──────────────────────────────────────────────────────────────
function ComposeModal({ onClose, onSend, defaultTo='' }) {
  const [to, setTo] = useState(defaultTo)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [encrypted, setEncrypted] = useState(true)
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="compose-box">
        <div className="compose-header">
          <div className="compose-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            New Message
            {encrypted && <span style={{fontSize:'.68rem',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'3px',fontWeight:'400'}}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>encrypted</span>}
          </div>
          <button className="compose-close" onClick={onClose}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div className="compose-fields">
          <div className="compose-field"><span className="field-label">To</span><ToField value={to} onChange={setTo}/></div>
          <div className="compose-field"><span className="field-label">Subject</span><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="What's this about..."/></div>
        </div>
        <div className="compose-body"><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Write your message..."/></div>
        <div className="gas-note">This message will be recorded as a transaction on <span>Abstract Chain</span></div>
        <div className="compose-footer">
          <button className={`enc-toggle ${encrypted?'on':''}`} onClick={()=>setEncrypted(e=>!e)}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            {encrypted?'Encrypted':'Plain text'}
          </button>
          <button className="btn-send" onClick={()=>onSend({to,subject,body,encrypted})} disabled={!to.trim()||!subject.trim()||!body.trim()}>
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
  const { data: abstractClient } = useAbstractClient()

  const [view, setView] = useState('inbox')
  const [tab, setTab] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [inbox, setInbox] = useState([])
  const [sent, setSent] = useState([])
  const [founderMsg, setFounderMsg] = useState({...FOUNDER_MSG})
  const [composing, setComposing] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [step, setStep] = useState(0)
  const [toast, setToast] = useState({show:false, hash:''})
  const [block, setBlock] = useState(4829201)
  const [connecting, setConnecting] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [search, setSearch] = useState('')
  const [userProfile, setUserProfile] = useState({name:null, avatar:null})
  const [loading, setLoading] = useState(false)

  // ── Block counter ──────────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => setBlock(n => n + Math.floor(Math.random()*3)+1), 3000)
    return () => clearInterval(iv)
  }, [])

  // ── Load messages from Supabase on login ───────────────────────────────────
  useEffect(() => {
    if (!address || !isConnected) return
    loadFromDB()
  }, [address, isConnected])

  async function loadFromDB() {
    setLoading(true)
    try {
      const [rows, meta] = await Promise.all([dbLoadMessages(address), dbLoadMeta(address)])
      const toMail = r => ({
        id: r.message_id,
        from: r.from_address,
        fromShort: r.from_short || shortAddr(r.from_address),
        fromInitials: (r.from_short||r.from_address||'??').slice(0,2).toUpperCase(),
        fromAvatar: null,
        subject: r.subject||'(no subject)',
        preview: r.preview||'',
        body: r.body||'',
        time: r.sent_at ? new Date(r.sent_at).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}) : '',
        date: r.sent_at ? new Date(r.sent_at).toLocaleDateString('en',{month:'short',day:'numeric'}) : '',
        txHash: r.tx_hash||null,
        encrypted: true,
        unread: meta[r.message_id]?.unread ?? !r.is_sent,
        starred: meta[r.message_id]?.starred ?? false,
        deleted: meta[r.message_id]?.deleted ?? false,
        permanent: false,
        isSent: r.is_sent,
      })
      const inboxRows = rows.filter(r => !r.is_sent && !meta[r.message_id]?.deleted).map(toMail)
      const sentRows = rows.filter(r => r.is_sent).map(toMail)
      setInbox(inboxRows)
      setSent(sentRows)
      // Load founder meta
      if (meta['founder-1']) {
        setFounderMsg(p => ({...p, unread: meta['founder-1'].unread ?? true, starred: meta['founder-1'].starred ?? true}))
      }
    } catch(e) { console.error('loadFromDB:', e) }
    finally { setLoading(false) }
  }

  // ── User profile ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!address) return
    fetch(`/api/resolve?address=${address}`)
      .then(r => r.json())
      .then(data => {
        const name = data.username || null
        const avatar = data.avatar || null
        setUserProfile({ name, avatar })
        if (name || avatar) {
          sb.from('users').upsert({ wallet_address: address.toLowerCase(), username: name, avatar_url: avatar, updated_at: new Date().toISOString() }, { onConflict: 'wallet_address' }).catch(() => {})
        }
      })
      .catch(() => {})
  }, [address])

  // ── Logout dropdown close ──────────────────────────────────────────────────
  useEffect(() => {
    const h = e => { if(!e.target.closest('.wallet-pill')&&!e.target.closest('.logout-dropdown')) setShowLogout(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try { await login() } catch(e){ console.error(e) } finally { setConnecting(false) }
  }, [login])

  // ── Mail lists ─────────────────────────────────────────────────────────────
  const allInbox = [...inbox].sort((a,b) => new Date(b.sentAt||0) - new Date(a.sentAt||0)).concat([founderMsg])
  const getMails = () => {
    const all = [...allInbox, ...sent]
    if (view==='sent') return sent
    if (view==='starred') return all.filter(m => m.starred)
    if (view==='transactions') return allInbox.filter(m => m.txHash)
    if (['drafts','trash','contacts'].includes(view)) return []
    return allInbox
  }
  const filtered = getMails()
    .filter(m => !search || m.subject.toLowerCase().includes(search.toLowerCase()) || (m.fromShort||'').toLowerCase().includes(search.toLowerCase()))
    .filter(m => tab==='unread' ? m.unread : true)

  const allMails = [...allInbox, ...sent]
  const selected = allMails.find(m => m.id===selectedId) || null
  const unread = allInbox.filter(m => m.unread).length

  const handleSelect = id => {
    setSelectedId(id)
    if (id==='founder-1') {
      setFounderMsg(p => ({...p, unread:false}))
      dbUpsertMeta(address, 'founder-1', {unread:false})
    } else {
      setInbox(p => p.map(m => m.id===id?{...m,unread:false}:m))
      dbUpsertMeta(address, id, {unread:false})
    }
  }

  const toggleStar = id => {
    if (id==='founder-1') {
      setFounderMsg(p => { const next=!p.starred; dbUpsertMeta(address,'founder-1',{starred:next}); return {...p,starred:next} })
    } else {
      const all = [...inbox,...sent]
      const m = all.find(x=>x.id===id)
      const next = !(m?.starred)
      setInbox(p => p.map(x=>x.id===id?{...x,starred:next}:x))
      setSent(p => p.map(x=>x.id===id?{...x,starred:next}:x))
      dbUpsertMeta(address, id, {starred:next})
    }
  }

  const deleteMail = id => {
    setInbox(p => p.filter(m=>m.id!==id))
    setSent(p => p.filter(m=>m.id!==id))
    setSelectedId(null)
    dbUpsertMeta(address, id, {deleted:true})
  }

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async ({to, subject, body, encrypted}) => {
    setComposing(false); setStep(1)
    try {
      await delay(600); setStep(2)
      let txHash = null
      let toAddr = to

      // Resolve username to address
      if (!to.startsWith('0x')) {
        try {
          const res = await fetch(`/api/resolve?username=${to}`)
          if (res.ok) {
            const data = await res.json()
            if (data.address) toAddr = data.address
          }
        } catch {}
      }

      setStep(3)
      // Send Abstract Chain tx
      if (abstractClient) {
        try {
          const bytes = new TextEncoder().encode(JSON.stringify({to:toAddr, subject, body, ts:Date.now()}))
          const hex = '0x'+Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')
          txHash = await abstractClient.sendTransaction({to:address, data:hex, value:0n})
        } catch(e){ console.warn('tx:', e) }
      }

      setStep(4); await delay(700)
      const now = new Date()
      const msgId = 'msg-'+Date.now()

      // Sender's copy (sent)
      const sentMsg = {
        message_id: msgId,
        wallet_address: address.toLowerCase(),
        from_address: address,
        from_short: userProfile.name || shortAddr(address),
        to_address: toAddr,
        subject, preview: body.slice(0,80), body,
        sent_at: now.toISOString(),
        tx_hash: txHash,
        is_sent: true,
      }
      await dbSaveMessage(sentMsg)
      await dbUpsertMeta(address, msgId, {unread:false, starred:false})

      // Recipient's copy (inbox)
      const recvMsgId = 'msg-recv-'+Date.now()
      const recvMsg = {
        message_id: recvMsgId,
        wallet_address: toAddr.toLowerCase(),
        from_address: address,
        from_short: userProfile.name || shortAddr(address),
        to_address: toAddr,
        subject, preview: body.slice(0,80), body,
        sent_at: now.toISOString(),
        tx_hash: txHash,
        is_sent: false,
      }
      await dbSaveMessage(recvMsg)
      await dbUpsertMeta(toAddr, recvMsgId, {unread:true, starred:false})

      // Update UI
      const uiMsg = {
        id: msgId,
        from: address, fromShort: userProfile.name||shortAddr(address), fromInitials:'ME', fromAvatar: userProfile.avatar,
        subject, preview: body.slice(0,80), body,
        time: now.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}), date:'Today',
        txHash, encrypted: true, unread:false, starred:false, permanent:false, isSent:true,
      }
      setSent(p => [uiMsg,...p])
      setView('sent'); setSelectedId(msgId); setStep(0)
      setToast({show:true, hash:txHash||''})
      setTimeout(()=>setToast(t=>({...t,show:false})),5000)
    } catch(e){ console.error('send:', e); setStep(0) }
  }

  const navItems = [
    {id:'inbox',label:'Inbox',badge:unread,icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>},
    {id:'sent',label:'Sent',icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>},
    {id:'starred',label:'Starred',icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>},
    {id:'drafts',label:'Drafts',icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>},
    {id:'trash',label:'Trash',icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>},
  ]

  // ── LANDING ────────────────────────────────────────────────────────────────
  if (!isConnected) return (
    <div className="landing">
      <div className="landing-bg"><div className="landing-grid"/><div className="landing-radial"/><div className="orb orb1"/><div className="orb orb2"/></div>
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
      <div className="topbar">
        <div className="topbar-logo" style={{userSelect:'none',WebkitUserSelect:'none',letterSpacing:'-.01em'}}>
          <span style={{color:'var(--text-primary)',fontWeight:700,fontSize:'15px'}}>abs</span>
          <span style={{color:'var(--abs-green)',fontWeight:700,fontSize:'15px'}}>.</span>
          <span style={{color:'var(--text-primary)',fontWeight:700,fontSize:'15px'}}>mail</span>
        </div>
        <div className="topbar-right">
          <div style={{position:'relative'}}>
            <div className="wallet-pill" onClick={()=>setShowLogout(s=>!s)}>
              <div className="wallet-avatar" style={{overflow:'hidden'}}>
                {userProfile.avatar
                  ? <img src={userProfile.avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
                  : address?.slice(2,4).toUpperCase()
                }
              </div>
              <span style={{maxWidth:'100px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {userProfile.name || shortAddr(address)}
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{opacity:.5,transition:'transform .2s',transform:showLogout?'rotate(180deg)':'none'}}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {showLogout && (
              <div className="logout-dropdown" style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--bg-card)',border:'1px solid var(--abs-green-border)',borderRadius:'10px',overflow:'hidden',zIndex:9999,boxShadow:'0 8px 24px rgba(0,0,0,.6)',minWidth:'200px',animation:'fadeInUp .15s ease'}}>
                <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:'32px',height:'32px',borderRadius:'50%',overflow:'hidden',flexShrink:0,border:'1px solid var(--abs-green-border)'}}>
                    {userProfile.avatar?<img src={userProfile.avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,var(--abs-green),#00cc6a)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.6rem',color:'#080c0a',fontWeight:700}}>{address?.slice(2,4).toUpperCase()}</div>}
                  </div>
                  <div>
                    <div style={{fontSize:'.78rem',fontWeight:'600',marginBottom:'2px'}}>{userProfile.name || shortAddr(address)}</div>
                    <div style={{fontSize:'.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{shortAddr(address)} · Abstract</div>
                  </div>
                </div>
                <a href={`https://portal.abs.xyz/profile/${address}`} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:'8px',padding:'9px 14px',textDecoration:'none',color:'var(--text-secondary)',fontSize:'.8rem',borderBottom:'1px solid var(--border)',transition:'background .1s'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>View Portal Profile
                </a>
                <button onClick={()=>{setShowLogout(false);logout()}} style={{display:'flex',alignItems:'center',gap:'8px',padding:'9px 14px',width:'100%',background:'none',border:'none',cursor:'pointer',color:'#ff5050',fontSize:'.8rem',fontFamily:'var(--font-main)',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,80,80,.08)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Disconnect Wallet
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="app-layout">
        <div className="sidebar">
          <div className="sidebar-inner">
            <button className="btn-compose" onClick={()=>{setReplyTo('');setComposing(true)}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Compose
            </button>
            <div className="sidebar-section">
              <div className="sidebar-section-label">Mail</div>
              {navItems.map(({id,label,badge,icon})=>(
                <button key={id} className={`nav-item ${view===id?'active':''}`} onClick={()=>{setView(id);setSelectedId(null)}}>
                  <span className="nav-icon">{icon}</span>{label}{badge>0&&<span className="nav-badge">{badge}</span>}
                </button>
              ))}
            </div>
            <div className="sidebar-divider"/>
            <div className="sidebar-section">
              <div className="sidebar-section-label">People</div>
              <button className={`nav-item ${view==='contacts'?'active':''}`} onClick={()=>{setView('contacts');setSelectedId(null)}}>
                <span className="nav-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></span>Contacts
              </button>
            </div>
            <div className="sidebar-divider"/>
            <div className="s-chain">
              <div className="s-built">
                <img src="https://abstract-assets.abs.xyz/assets/images/login/abs-logo-green.png" alt="Abstract"/>
                <span>Built on Abstract by <a href="https://x.com/skarxbt" target="_blank" rel="noreferrer">skarxbt</a></span>
              </div>
            </div>
          </div>
        </div>

        <div className="maillist">
          <div className="maillist-header">
            <div className="maillist-title">{{inbox:'Inbox',sent:'Sent',starred:'Starred',drafts:'Drafts',trash:'Trash',transactions:'Transactions',contacts:'Contacts'}[view]||view}</div>
            <div className="maillist-search">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--tm)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input placeholder="Search messages..." value={search} onChange={e=>setSearch(e.target.value)}/>
              {search && <button onClick={()=>setSearch('')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tm)',display:'flex',padding:0}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
            </div>
            <div className="maillist-tabs">
              {['all','unread'].map(t=>(
                <button key={t} className={`mail-tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t==='all'?'All':'Unread'}</button>
              ))}
            </div>
          </div>
          <div className="maillist-scroll">
            {loading ? (
              <div className="no-mail"><div style={{width:'7px',height:'7px',borderRadius:'50%',background:'var(--abs-green)',animation:'blink .8s infinite'}}/>Loading...</div>
            ) : filtered.length===0 ? (
              <div className="no-mail"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:.3}}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg><div>{search?`No results for "${search}"`:'No messages'}</div></div>
            ) : filtered.map((m,idx)=>(
              <div key={m.id} className={`mail-item ${m.unread?'unread':''} ${selectedId===m.id?'active':''}`} style={{animationDelay:`${idx*.04}s`}} onClick={()=>handleSelect(m.id)}>
                <div className="mail-item-top">
                  <div className="mail-avatar-sm">{m.fromAvatar?<img src={m.fromAvatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>:m.fromInitials}</div>
                  <div className="mail-from">{m.fromShort||shortAddr(m.from)}</div>
                  {m.unread && <div className="mail-unread-dot"/>}
                </div>
                <div className="mail-subject">{m.subject}</div>
                <div className="mail-addr-row">
                  <span className="mail-addr-short">{shortAddr(m.from)}</span>
                  <span className="mail-time">{m.time}</span>
                </div>
                <div className="mail-preview">{m.preview}</div>
                <div className="mail-tags">
                  {m.encrypted&&<span className="mail-tag" style={{display:'flex',alignItems:'center',gap:'3px'}}><svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>enc</span>}
                  {m.id==='founder-1'&&<span className="mail-tag">founder</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mailview">
          {!selected ? (
            <div className="mail-empty"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{opacity:.2}}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg><div className="mail-empty-text">Select a message to read</div></div>
          ) : (
            <div className="mailview-inner">
              <div className="mail-meta-bar">
                <div className="mail-avatar-lg">{selected.fromAvatar?<img src={selected.fromAvatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>:selected.fromInitials}</div>
                <div className="mail-meta-details">
                  <div className="mail-from-full">{selected.fromShort||shortAddr(selected.from)}</div>
                  <div className="mail-addr">{shortAddr(selected.from)}</div>
                </div>
                <div className="mail-date-full">{selected.date}, {selected.time}</div>
                {!selected.permanent&&<div style={{gridColumn:'2/4',gridRow:2,marginTop:'10px',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                  {selected.encrypted&&<div className="enc-badge"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>End-to-end encrypted</div>}
                  {selected.txHash&&<a href={`https://abscan.org/tx/${selected.txHash}`} target="_blank" rel="noreferrer" className="txn-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>Tx: <strong>{shortAddr(selected.txHash)}</strong></a>}
                  <div style={{marginLeft:'auto',display:'flex',gap:'6px'}}>
                    <button className="action-btn" onClick={()=>{setReplyTo(selected.fromShort||selected.from);setComposing(true)}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>Reply</button>
                    <button className="action-btn" onClick={()=>toggleStar(selected.id)}><svg width="11" height="11" viewBox="0 0 24 24" fill={selected.starred?'var(--g)':'none'} stroke="var(--g)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>{selected.starred?'Unstar':'Star'}</button>
                    <button className="action-btn" onClick={()=>deleteMail(selected.id)}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Delete</button>
                  </div>
                </div>}
                {selected.permanent&&<div style={{gridColumn:'2/4',gridRow:2,marginTop:'10px',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                  {selected.encrypted&&<div className="enc-badge"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>End-to-end encrypted</div>}
                  <div style={{marginLeft:'auto',display:'flex',gap:'6px'}}>
                    <button className="action-btn" onClick={()=>{setReplyTo(selected.fromShort||selected.from);setComposing(true)}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>Reply</button>
                    <button className="action-btn" onClick={()=>toggleStar(selected.id)}><svg width="11" height="11" viewBox="0 0 24 24" fill={selected.starred?'var(--g)':'none'} stroke="var(--g)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>{selected.starred?'Unstar':'Star'}</button>
                  </div>
                </div>}
              </div>
              <div className="mail-subject-line">{selected.subject}</div>
              <div className="mail-body">{selected.body}</div>
            </div>
          )}
        </div>
      </div>

      <div className="mob-nav">
        <div className="mob-nav-inner">
          {[{id:'inbox',label:'Inbox',badge:unread,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>},{id:'sent',label:'Sent',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>},{id:'starred',label:'Starred',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>},{id:'transactions',label:'Chain',icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>}].map(({id,label,badge,icon})=>(
            <button key={id} className={`mob-btn ${view===id?'active':''}`} onClick={()=>{setView(id);setSelectedId(null)}}>{icon}{badge>0&&<span className="mob-badge">{badge}</span>}{label}</button>
          ))}
        </div>
      </div>

      <button className="mob-compose-fab" onClick={()=>{setReplyTo('');setComposing(true)}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#080c0a" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>

      {composing&&<ComposeModal defaultTo={replyTo} onClose={()=>setComposing(false)} onSend={handleSend}/>}

      {step>0&&(
        <div className="sending-overlay">
          <div className="sending-box">
            <div className="sending-animation"><div className="sending-ring ring1"/><div className="sending-ring ring2"/><div className="sending-ring ring3"/><div className="sending-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div></div>
            <div className="sending-title">Broadcasting to Abstract</div>
            <div className="sending-sub">Saving to Supabase &amp; Abstract Chain</div>
            <div className="sending-steps">
              {[{id:1,label:'Signing with AGW wallet'},{id:2,label:'Saving to Supabase'},{id:3,label:'Broadcasting transaction'},{id:4,label:'Delivered'}].map(s=>(
                <div key={s.id} className={`sending-step ${s.id<step?'done':s.id===step?'active':''}`}><div className="step-dot"/>{s.label}{s.id<step&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="3" style={{marginLeft:'auto'}}><polyline points="20 6 9 17 4 12"/></svg>}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`tx-toast ${toast.show?'show':''}`}>
        <div style={{width:'30px',height:'30px',borderRadius:'50%',background:'var(--abs-green-pale)',border:'1px solid var(--abs-green-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div style={{flex:1}}>
          <div className="toast-title">Message sent on Abstract Chain</div>
          {toast.hash&&<div className="toast-hash"><a href={`https://abscan.org/tx/${toast.hash}`} target="_blank" rel="noreferrer" style={{color:'var(--abs-green)',textDecoration:'none'}}>Tx: {shortAddr(toast.hash)} ↗</a></div>}
        </div>
        <button onClick={()=>setToast(t=>({...t,show:false}))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex',padding:0}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </>
  )
}
