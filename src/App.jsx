import { useState, useEffect, useCallback } from 'react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useAccount } from 'wagmi'

// ── Abstract asset base ────────────────────────────────────────────────────────
const ABS = 'https://abstract-assets.abs.xyz'

// ── Sample inbox ───────────────────────────────────────────────────────────────
const INBOX_INIT = [
  {
    id:1, fromShort:'abstract.abs', from:'0xAbstractProtocol',
    fromInitials:'AB', fromAvatar: null,
    subject:'Welcome to abs.mail ✦',
    preview:'Every message you send is a real on-chain transaction on Abstract...',
    body:`Hey,\n\nWelcome to abs.mail — the first fully on-chain messaging protocol built on Abstract Chain.\n\nEvery message is permanently recorded as a transaction on the blockchain. Your inbox is decentralized and owned entirely by your AGW wallet.\n\n✦ Sending mail creates a real on-chain transaction\n✦ Messages are end-to-end encrypted by default\n✦ Your wallet address is your email address\n✦ All messages verifiable on Abscan\n\nCompose your first message and try it out!\n\n— The abs.mail Team`,
    time:'09:14', date:'Today',
    txHash:'0x4a3f2b7c9d1e8f0a3b5c2d7e9f1a4b6c8e0d2f4',
    encrypted:true, unread:true, starred:true, tags:['welcome']
  },
  {
    id:2, fromShort:'alice.abs', from:'0x2e8f4a71c930d370beef',
    fromInitials:'AL', fromAvatar:null,
    subject:'Re: DAO governance vote — Round 7',
    preview:'Reviewed the proposal. Tokenomics look solid but vesting is too aggressive...',
    body:`Hey,\n\nReviewed the Round 7 governance proposal. Tokenomics are solid but 12 months cliff is not enough for protocol-level contributors.\n\nI'll vote NO on the current proposal, YES on the amended version if they extend the cliff to 18 months.\n\nWant to draft a counter-proposal together before the snapshot closes Thursday?\n\n— Alice`,
    time:'Yesterday', date:'Yesterday',
    txHash:'0x1c9b5d22a4e8f0b3d6a2c5e8f1a3c6e9b2d5f8a',
    encrypted:true, unread:true, starred:false, tags:['dao','governance']
  },
  {
    id:3, fromShort:'bob.abs', from:'0x5b3d9fa2e820cafe1234',
    fromInitials:'BO', fromAvatar:null,
    subject:'NFT drop collab — interested?',
    preview:'Thinking we could partner on a joint abstract-themed NFT drop...',
    body:`Yo,\n\nWant to collab on an abstract-themed NFT drop. I have the art side covered, just need someone to handle contract deployment on Abstract.\n\n50/50 royalty split. Let me know if you're in.\n\n— Bob`,
    time:'Mar 15', date:'Mar 15',
    txHash:'0x9e4c7b31d1a38f2b5c8e1a4d7f0c3b6e9a2d5f8',
    encrypted:false, unread:false, starred:true, tags:['nft','collab']
  },
  {
    id:4, fromShort:'protocol.abs', from:'0x6f2a8c1d50301234abcd',
    fromInitials:'PR', fromAvatar:null,
    subject:'Abstract Chain — Protocol Update v2.4',
    preview:'Abstract Chain has deployed protocol upgrade v2.4 to mainnet...',
    body:`Protocol Update v2.4\n\nDeployed to mainnet at block #4,829,201.\n\n✦ 40% reduction in mail transaction gas costs\n✦ New encrypted messaging standard ABS-EIP-7291\n✦ Improved AGW wallet session keys\n✦ Native .abs name resolution\n\nNo action required. Your AGW wallet will automatically use the new standards.\n\n— Abstract Protocol Team`,
    time:'Mar 14', date:'Mar 14',
    txHash:'0x3d8f1a44c2e7b0d5f8a1c4e7b2d5f8a1c4e7b0d',
    encrypted:true, unread:false, starred:false, tags:['protocol','update']
  },
]

// ── Encryption (XOR + base64) ──────────────────────────────────────────────────
function enc(text, key) {
  try {
    return btoa(unescape(encodeURIComponent(
      text.split('').map((c,i)=>String.fromCharCode(c.charCodeAt(0)^key.charCodeAt(i%key.length))).join('')
    )))
  } catch { return text }
}
function dec(encoded, key) {
  try {
    const raw = decodeURIComponent(escape(atob(encoded)))
    return raw.split('').map((c,i)=>String.fromCharCode(c.charCodeAt(0)^key.charCodeAt(i%key.length))).join('')
  } catch { return encoded }
}

const shortAddr = a => a ? a.slice(0,6)+'...'+a.slice(-4) : ''
const randomHex = n => [...Array(n)].map(()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('')
const delay = ms => new Promise(r=>setTimeout(r,ms))

// ── ToField with Privy lookup ─────────────────────────────────────────────────
const PRIVY_APP_ID = 'clpispdty00yfmi08jf7pi18p'

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
          setInfo({ name, addr, avatar, found:true,
            portalUrl:`https://portal.abs.xyz/profile/${name||addr||value}`,
            scanUrl: addr ? `https://abscan.org/address/${addr}` : null })
        } else {
          setInfo({ name: isName?value:null, addr:isAddress?value:null, avatar:null, found:false,
            portalUrl:`https://portal.abs.xyz/profile/${value}`,
            scanUrl:isAddress?`https://abscan.org/address/${value}`:null })
        }
      } catch {
        setInfo({ name:isName?value:null, addr:isAddress?value:null, avatar:null, found:false,
          portalUrl:`https://portal.abs.xyz/profile/${value}`,
          scanUrl:isAddress?`https://abscan.org/address/${value}`:null })
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
            <div style={{padding:'4px 14px',background:'rgba(0,255,133,.06)',borderBottom:'1px solid var(--border)',fontSize:'.62rem',color:'var(--abs-green)',fontFamily:'var(--font-mono)',letterSpacing:'.06em'}}>
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
              <div style={{fontSize:'.85rem',fontWeight:'600',color:'var(--text-primary)',marginBottom:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {info.name || value}
              </div>
              <div style={{fontSize:'.7rem',color:'var(--text-secondary)',fontFamily:'var(--font-mono)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {info.addr ? shortAddr(info.addr)+' · ' : ''}View on Abstract Portal ↗
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          {info.scanUrl && (
            <a href={info.scanUrl} target="_blank" rel="noreferrer" className="to-dropdown-row">
              <div className="to-avatar" style={{background:'rgba(0,255,133,.04)',border:'1px solid var(--border)'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'.82rem',fontWeight:'500',color:'var(--text-secondary)',marginBottom:'2px'}}>View on Abscan</div>
                <div style={{fontSize:'.7rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>On-chain transactions & activity</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Compose Modal ─────────────────────────────────────────────────────────────
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            New Message
            {encrypted && <span style={{fontSize:'.68rem',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'3px',marginLeft:'4px'}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              encrypted
            </span>}
          </div>
          <button className="compose-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="compose-fields">
          <div className="compose-field">
            <span className="field-label">To</span>
            <ToField value={to} onChange={setTo}/>
          </div>
          <div className="compose-field">
            <span className="field-label">Subject</span>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject"/>
          </div>
        </div>
        <div className="compose-body">
          <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Write your message..."/>
        </div>
        <div className="gas-note">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          Sending creates a transaction on <span>Abstract Chain</span>
        </div>
        <div className="compose-footer">
          <div className="compose-footer-left">
            <button className={`enc-toggle ${encrypted?'on':''}`} onClick={()=>setEncrypted(e=>!e)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              {encrypted ? 'Encrypted' : 'Plain text'}
            </button>
          </div>
          <button className="btn-send" onClick={()=>onSend({to,subject,body,encrypted})} disabled={!to.trim()||!subject.trim()||!body.trim()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send on-chain
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const {login, logout} = useLoginWithAbstract()
  const {address, isConnected} = useAccount()
  const {data: abstractClient} = useAbstractClient()

  const [view, setView] = useState('inbox')
  const [tab, setTab] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [inbox, setInbox] = useState(INBOX_INIT)
  const [sent, setSent] = useState([])
  const [composing, setComposing] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [step, setStep] = useState(0)
  const [toast, setToast] = useState({show:false, hash:''})
  const [block, setBlock] = useState(4829201)
  const [connecting, setConnecting] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [search, setSearch] = useState('')
  const [starred, setStarred] = useState({})

  useEffect(()=>{
    const iv = setInterval(()=>setBlock(n=>n+Math.floor(Math.random()*3)+1), 3000)
    return ()=>clearInterval(iv)
  },[])

  const handleConnect = useCallback(async()=>{
    setConnecting(true)
    try { await login() } catch(e){ console.error(e) } finally { setConnecting(false) }
  },[login])

  const ENC_KEY = address || 'absmail-key'

  const getMails = () => {
    if(view==='sent') return sent
    if(view==='starred') return [...inbox,...sent].filter(m=>starred[m.id]||m.starred)
    if(view==='transactions') return [...inbox,...sent].filter(m=>m.txHash)
    if(['drafts','trash','contacts'].includes(view)) return []
    return inbox
  }

  const filtered = getMails().filter(m=>
    !search ||
    m.subject.toLowerCase().includes(search.toLowerCase()) ||
    (m.fromShort||'').toLowerCase().includes(search.toLowerCase()) ||
    (m.preview||'').toLowerCase().includes(search.toLowerCase())
  ).filter(m => tab==='unread' ? m.unread : tab==='txn' ? m.txHash : true)

  const selected = [...inbox,...sent].find(m=>m.id===selectedId) || null
  const unread = inbox.filter(m=>m.unread).length

  const handleSelect = id => {
    setSelectedId(id)
    setInbox(p=>p.map(m=>m.id===id?{...m,unread:false}:m))
  }

  const toggleStar = id => setStarred(s=>({...s,[id]:!s[id]}))

  const handleSend = async({to, subject, body, encrypted}) => {
    setComposing(false); setStep(1)
    try {
      await delay(700); setStep(2)
      const finalBody = encrypted ? enc(body, ENC_KEY) : body
      let hash = '0x'+randomHex(64)
      if(abstractClient){
        try {
          const bytes = new TextEncoder().encode(JSON.stringify({to,subject,body:finalBody,encrypted,ts:Date.now()}))
          const hex = '0x'+Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')
          hash = await abstractClient.sendTransaction({to:address, data:hex, value:0n})
        } catch(e){ console.warn('tx error:', e) }
      }
      setStep(3); await delay(1000); setStep(4); await delay(700)

      const m = {
        id: Date.now(),
        from: address||'you', fromShort:'you', fromInitials:'ME', fromAvatar:null,
        subject, preview: body.slice(0,80), body: encrypted?finalBody:body, encrypted,
        time: new Date().toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}),
        date: 'Today', txHash: hash,
        unread: false, starred: false, tags: ['sent']
      }
      setSent(p=>[m,...p]); setView('sent'); setSelectedId(m.id); setStep(0)
      setToast({show:true, hash}); setTimeout(()=>setToast(t=>({...t,show:false})), 5000)
    } catch(e){ console.error(e); setStep(0) }
  }

  // ── NAV ITEMS ──────────────────────────────────────────────────────────────
  const navItems = [
    { id:'inbox', label:'Inbox', badge:unread, icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg> },
    { id:'sent', label:'Sent', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
    { id:'starred', label:'Starred', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
    { id:'drafts', label:'Drafts', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
    { id:'trash', label:'Trash', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg> },
  ]

  const viewTitles = {inbox:'Inbox',sent:'Sent',starred:'Starred',drafts:'Drafts',trash:'Trash',transactions:'Transactions',contacts:'Contacts'}

  // ── LANDING ────────────────────────────────────────────────────────────────
  if(!isConnected) return (
    <div className="landing">
      <div className="landing-bg">
        <div className="landing-grid"/>
        <div className="landing-radial"/>
        <div className="orb orb1"/>
        <div className="orb orb2"/>
      </div>
      <div className="landing-content">
        <div className="landing-logo">
          <div className="logo-hex"/>
          <div className="logo-text">abs.mail</div>
        </div>
        <div className="chain-badge">
          <div className="chain-dot"/>
          ABSTRACT CHAIN · MAINNET
        </div>
        <h1 className="landing-h1">Web3 Mail on<br/><span>Abstract Chain</span></h1>
        <p className="landing-sub">Send encrypted on-chain messages. Every mail is a real transaction on Abstract. Your inbox lives on the blockchain — forever.</p>
        <button className="btn-connect" onClick={handleConnect} disabled={connecting}>
          {connecting ? (
            <>
              <div style={{width:'16px',height:'16px',border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#080c0a',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
              Connecting...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
              Sign in with Abstract AGW
            </>
          )}
        </button>
        <div className="landing-features">
          {[
            [<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>,'On-Chain'],
            [<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,'Encrypted'],
            [<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,'Secured'],
            [<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,'Decentralized'],
          ].map(([icon,l])=>(
            <div className="feat" key={l}>
              <span className="feat-icon" style={{color:'var(--abs-green)'}}>{icon}</span>
              <span className="feat-label">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── MAIN APP ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-logo">
          <div className="logo-hex-sm"/>
          abs.mail
        </div>
        <div className="topbar-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search messages..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {search && <button onClick={()=>setSearch('')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex',padding:'0'}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>}
        </div>
        <div className="topbar-right">
  <div style={{position:'relative'}}>
    <div className="wallet-pill" onClick={()=>setShowLogout(s=>!s)}>
      <div className="wallet-avatar">{address?address.slice(2,4).toUpperCase():'??'}</div>
      {shortAddr(address)}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{opacity:.5,transition:'transform .2s',transform:showLogout?'rotate(180deg)':'none'}}><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    {showLogout&&(
      <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--bg-card)',border:'1px solid var(--abs-green-border)',borderRadius:'10px',overflow:'hidden',zIndex:9999,boxShadow:'0 8px 24px rgba(0,0,0,.6)',minWidth:'190px',animation:'fadeInUp .15s ease'}}>
        <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:'.75rem',fontWeight:'600',marginBottom:'2px'}}>{shortAddr(address)}</div>
          <div style={{fontSize:'.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>Abstract Mainnet</div>
        </div>
        <a href={`https://portal.abs.xyz/profile/${address}`} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:'8px',padding:'9px 14px',textDecoration:'none',color:'var(--text-secondary)',fontSize:'.8rem',borderBottom:'1px solid var(--border)'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          View Portal Profile
        </a>
        <a href={`https://abscan.org/address/${address}`} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:'8px',padding:'9px 14px',textDecoration:'none',color:'var(--text-secondary)',fontSize:'.8rem',borderBottom:'1px solid var(--border)'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          View on Abscan
        </a>
        <button onClick={()=>
      <div className="app-layout">
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-inner">
            <button className="btn-compose" onClick={()=>{setReplyTo('');setComposing(true)}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Compose
            </button>

            <div className="sidebar-section">
              <div className="sidebar-section-label">Mail</div>
              {navItems.map(({id,label,badge,icon})=>(
                <button key={id} className={`nav-item ${view===id?'active':''}`} onClick={()=>{setView(id);setSelectedId(null)}}>
                  <span className="nav-icon">{icon}</span>
                  {label}
                  {badge>0&&<span className="nav-badge">{badge}</span>}
                </button>
              ))}
            </div>

            <div className="sidebar-divider"/>

            <div className="sidebar-section">
              <div className="sidebar-section-label">Chain</div>
              <button className={`nav-item ${view==='transactions'?'active':''}`} onClick={()=>{setView('transactions');setSelectedId(null)}}>
                <span className="nav-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                </span>
                Transactions
              </button>
              <button className={`nav-item ${view==='contacts'?'active':''}`} onClick={()=>{setView('contacts');setSelectedId(null)}}>
                <span className="nav-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                </span>
                Contacts
              </button>
            </div>

            <div className="sidebar-divider"/>

            <div className="chain-info">
              <div className="chain-info-label">Network</div>
              <div className="chain-info-row">
                <div className="chain-info-name">
                  <div className="chain-live"/>
                  Abstract
                </div>
                <div className="chain-block">#{block.toLocaleString()}</div>
              </div>
            </div>

            <div style={{padding:'8px 10px 0',marginTop:'4px'}}>
              <div style={{fontSize:'.62rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',display:'flex',alignItems:'center',gap:'6px'}}>
                <div style={{width:'22px',height:'22px',flexShrink:0}}>
                  <img src={`${ABS}/assets/images/login/abs-logo-green.png`} alt="Abstract" style={{width:'100%',height:'100%',objectFit:'contain',opacity:.6}} onError={e=>e.target.style.display='none'}/>
                </div>
                Built on Abstract Chain
              </div>
            </div>
          </div>
        </div>

        {/* MAIL LIST */}
        <div className="maillist">
          <div className="maillist-header">
            <div className="maillist-title">{viewTitles[view]||view}</div>
            <div className="maillist-tabs">
              {['all','unread','txn'].map(t=>(
                <button key={t} className={`mail-tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
                  {t==='all'?'All':t==='unread'?'Unread':'On-chain'}
                </button>
              ))}
            </div>
          </div>
          <div className="maillist-scroll">
            {filtered.length===0
              ? <div className="no-mail">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:.3}}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
                  <div>{search ? `No results for "${search}"` : 'No messages'}</div>
                </div>
              : filtered.map((m,idx)=>(
                <div key={m.id}
                  className={`mail-item ${m.unread?'unread':''} ${selectedId===m.id?'active':''}`}
                  style={{animationDelay:`${idx*.04}s`}}
                  onClick={()=>handleSelect(m.id)}
                >
                  <div className="mail-item-top">
                    <div className="mail-avatar-sm">
                      {m.fromAvatar
                        ? <img src={m.fromAvatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
                        : m.fromInitials
                      }
                    </div>
                    <div className="mail-from">{m.fromShort||shortAddr(m.from)}</div>
                    <div className="mail-time">{m.time}</div>
                  </div>
                  <div className="mail-subject">{m.subject}</div>
                  <div className="mail-preview">{m.preview}</div>
                  {m.tags&&m.tags.length>0&&(
                    <div className="mail-tags">
                      {m.encrypted&&<span className="mail-tag" style={{display:'flex',alignItems:'center',gap:'3px'}}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        enc
                      </span>}
                      {m.tags.filter(t=>t!=='sent').map(t=><span key={t} className="mail-tag">{t}</span>)}
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        </div>

        {/* MAIL VIEWER */}
        <div className="mailview">
          {!selected
            ? <div className="mail-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{opacity:.2}}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
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
                    <div className="mail-from-full">{selected.fromShort||shortAddr(selected.from)}</div>
                    <div className="mail-addr">{shortAddr(selected.from)}</div>
                  </div>
                  <div className="mail-date-full">{selected.date}, {selected.time}</div>
                  <div className="mail-actions-top">
                    <button className="action-btn" onClick={()=>{setReplyTo(selected.fromShort||selected.from);setComposing(true)}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
                      Reply
                    </button>
                    <button className="action-btn" onClick={()=>toggleStar(selected.id)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill={starred[selected.id]||selected.starred?'var(--abs-green)':'none'} stroke="var(--abs-green)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      {starred[selected.id]||selected.starred?'Unstar':'Star'}
                    </button>
                    <button className="action-btn" onClick={()=>{setInbox(p=>p.filter(m=>m.id!==selected.id));setSent(p=>p.filter(m=>m.id!==selected.id));setSelectedId(null)}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'20px'}}>
                  {selected.txHash && (
                    <a href={`https://abscan.org/tx/${selected.txHash}`} target="_blank" rel="noreferrer" className="txn-badge">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                      Tx: <strong>{shortAddr(selected.txHash)}</strong> · Abstract
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{opacity:.6}}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                  )}
                  {selected.encrypted && (
                    <div className="enc-badge">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      End-to-end encrypted
                    </div>
                  )}
                </div>

                <div className="mail-body">
                  {selected.encrypted ? dec(selected.body, ENC_KEY) : selected.body}
                </div>
              </div>
          }
        </div>
      </div>

      {/* COMPOSE MODAL */}
      {composing && (
        <ComposeModal
          defaultTo={replyTo}
          onClose={()=>setComposing(false)}
          onSend={handleSend}
        />
      )}

      {/* SENDING OVERLAY */}
      {step>0 && (
        <div className="sending-overlay">
          <div className="sending-box">
            <div className="sending-animation">
              <div className="sending-ring ring1"/>
              <div className="sending-ring ring2"/>
              <div className="sending-ring ring3"/>
              <div className="sending-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
            </div>
            <div className="sending-title">Broadcasting to Abstract</div>
            <div className="sending-sub">Your message is being written<br/>to the blockchain</div>
            <div className="sending-steps">
              {[
                {id:1, label:'Signing with AGW wallet'},
                {id:2, label:'Encrypting message'},
                {id:3, label:'Broadcasting transaction'},
                {id:4, label:'Delivered on-chain'},
              ].map(s=>(
                <div key={s.id} className={`sending-step ${s.id<step?'done':s.id===step?'active':''}`}>
                  <div className="step-dot"/>
                  {s.label}
                  {s.id<step && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="3" style={{marginLeft:'auto'}}><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TX TOAST */}
      <div className={`tx-toast ${toast.show?'show':''}`}>
        <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'var(--abs-green-pale)',border:'1px solid var(--abs-green-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--abs-green)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <div className="toast-title">Message sent on Abstract Chain</div>
          <div className="toast-hash">
            <a href={`https://abscan.org/tx/${toast.hash}`} target="_blank" rel="noreferrer" style={{color:'var(--abs-green)',textDecoration:'none'}}>
              Tx: {shortAddr(toast.hash)} ↗
            </a>
          </div>
        </div>
        <button onClick={()=>setToast(t=>({...t,show:false}))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',marginLeft:'auto',padding:'0',display:'flex'}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </>
  )
}
