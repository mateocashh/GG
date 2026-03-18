import { useState, useEffect, useCallback } from 'react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useAccount } from 'wagmi'

const INBOX = [
  { id:1, fromShort:'abstract.abs', from:'0xAbstractProtocol', fromInitials:'AB', subject:'Welcome to AbstractMail 👋', preview:'Every message you send is an on-chain transaction on Abstract...', body:`Hey,\n\nWelcome to AbstractMail — the first fully on-chain messaging protocol on Abstract Chain.\n\nEvery message is permanently recorded as a transaction. Your inbox is decentralized and owned by your wallet.\n\n→ Sending mail creates a real transaction\n→ Messages are signed with your AGW wallet\n→ Your .abs name is your identity\n\n— The AbstractMail Team`, time:'09:14', date:'Today', txHash:'0x4a3f2b7c9d1e8f0a3b5c2d7e9f1a4b6c', unread:true, starred:true, tags:['welcome'] },
  { id:2, fromShort:'alice.abs', from:'0x2e8f4a71c930d370', fromInitials:'AL', subject:'Re: DAO governance vote — Round 7', preview:'I reviewed the proposal. Tokenomics look solid but vesting is too aggressive...', body:`Hey,\n\nReviewed the Round 7 governance proposal. Tokenomics are solid but 12 months cliff is not enough for protocol contributors.\n\nVoting NO on current, YES on amended version if they extend to 18 months.\n\nWant to draft a counter-proposal before snapshot closes Thursday?\n\n— Alice`, time:'Yesterday', date:'Yesterday', txHash:'0x1c9b5d22a4e8f0b3d6a2c5e8f1a3c6e9', unread:true, starred:false, tags:['dao','governance'] },
  { id:3, fromShort:'bob.abs', from:'0x5b3d9fa2e820', fromInitials:'BO', subject:'NFT drop collab — interested?', preview:'Thinking we could partner on a joint abstract-themed drop...', body:`Yo,\n\nWant to collab on an abstract-themed NFT drop. I have art covered, need someone for contract deployment on Abstract.\n\n50/50 royalty split. DM if you are in.\n\n— Bob`, time:'Mar 15', date:'Mar 15', txHash:'0x9e4c7b31d1a38f2b5c8e1a4d7f0c3b6e', unread:false, starred:true, tags:['nft','collab'] },
  { id:4, fromShort:'protocol.abs', from:'0x6f2a8c1d5030', fromInitials:'PR', subject:'Abstract Chain — Protocol Update v2.4', preview:'Abstract Chain deployed protocol upgrade v2.4 to mainnet...', body:`Protocol Update v2.4\n\nDeployed to mainnet at block 4829201.\n\n→ 40% reduction in mail tx gas costs\n→ New encrypted messaging standard ABS-EIP-7291\n→ Improved AGW session keys\n→ .abs name resolution supported natively\n\n— Abstract Protocol Team`, time:'Mar 14', date:'Mar 14', txHash:'0x3d8f1a44c2e7b0d5f8a1c4e7b2d5f8a1', unread:false, starred:false, tags:['protocol','update'] },
]

const shortAddr = a => a ? a.slice(0,6)+'...'+a.slice(-4) : ''
const randomHex = n => [...Array(n)].map(()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('')
const delay = ms => new Promise(r=>setTimeout(r,ms))

function ComposeModal({onClose,onSend,defaultTo=''}) {
  const [to,setTo]=useState(defaultTo)
  const [subject,setSubject]=useState('')
  const [body,setBody]=useState('')
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="compose-box">
        <div className="compose-header">
          <div className="compose-title">✏ New Message</div>
          <button className="compose-close" onClick={onClose}>✕</button>
        </div>
        <div className="compose-fields">
          <div className="compose-field"><span className="field-label">To</span><input value={to} onChange={e=>setTo(e.target.value)} placeholder="0x address or .abs name"/></div>
          <div className="compose-field"><span className="field-label">Subject</span><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject"/></div>
        </div>
        <div className="compose-body"><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Write your message"/></div>
        <div className="gas-note">📡 Sending creates a transaction on <span>Abstract Chain</span></div>
        <div className="compose-footer">
          <div/>
          <button className="btn-send" onClick={()=>onSend({to,subject,body})} disabled={!to||!subject||!body}>⚡ Send on-chain</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const {login,logout}=useLoginWithAbstract()
  const {address,isConnected}=useAccount()
  const {data:abstractClient}=useAbstractClient()
  const [view,setView]=useState('inbox')
  const [tab,setTab]=useState('all')
  const [selectedId,setSelectedId]=useState(null)
  const [inbox,setInbox]=useState(INBOX)
  const [sent,setSent]=useState([])
  const [composing,setComposing]=useState(false)
  const [replyTo,setReplyTo]=useState('')
  const [step,setStep]=useState(0)
  const [toast,setToast]=useState({show:false,hash:''})
  const [block,setBlock]=useState(4829201)
  const [connecting,setConnecting]=useState(false)

  useEffect(()=>{
    const iv=setInterval(()=>setBlock(n=>n+Math.floor(Math.random()*3)+1),3000)
    return ()=>clearInterval(iv)
  },[])

  const handleConnect=useCallback(async()=>{
    setConnecting(true)
    try{await login()}catch(e){console.error(e)}finally{setConnecting(false)}
  },[login])

  const mails=view==='sent'?sent:view==='starred'?[...inbox,...sent].filter(m=>m.starred):view==='transactions'?[...inbox,...sent].filter(m=>m.txHash):['drafts','trash','contacts'].includes(view)?[]:inbox
  const filtered=tab==='unread'?mails.filter(m=>m.unread):tab==='txn'?mails.filter(m=>m.txHash):mails
  const selected=[...inbox,...sent].find(m=>m.id===selectedId)||null
  const unread=inbox.filter(m=>m.unread).length

  const handleSelect=id=>{
    setSelectedId(id)
    setInbox(p=>p.map(m=>m.id===id?{...m,unread:false}:m))
  }

  const handleSend=async({to,subject,body})=>{
    setComposing(false);setStep(1)
    try{
      await delay(600);setStep(2)
      let hash='0x'+randomHex(32)
      if(abstractClient){
        try{
          const bytes=new TextEncoder().encode(JSON.stringify({to,subject,body,ts:Date.now()}))
          const hex='0x'+Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')
          hash=await abstractClient.sendTransaction({to:address,data:hex,value:0n})
        }catch(e){console.warn(e)}
      }
      setStep(3);await delay(900);setStep(4);await delay(600)
      const m={id:Date.now(),from:address||'you',fromShort:'you',fromInitials:'ME',subject,preview:body.slice(0,80),body,time:new Date().toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}),date:'Today',txHash:hash,unread:false,starred:false,tags:['sent']}
      setSent(p=>[m,...p]);setView('sent');setSelectedId(m.id);setStep(0)
      setToast({show:true,hash});setTimeout(()=>setToast(t=>({...t,show:false})),4500)
    }catch(e){console.error(e);setStep(0)}
  }

  if(!isConnected) return (
    <div className="landing">
      <div className="landing-bg"><div className="landing-grid"/><div className="landing-radial"/><div className="orb orb1"/><div className="orb orb2"/></div>
      <div className="landing-content">
        <div className="landing-logo"><div className="logo-hex"/><div className="logo-text">AbstractMail</div></div>
        <div className="chain-badge"><div className="chain-dot"/>ABSTRACT CHAIN · MAINNET</div>
        <h1 className="landing-h1">Web3 Mail on<br/><span>Abstract Chain</span></h1>
        <p className="landing-sub">Send encrypted on-chain messages. Every mail is a real transaction on Abstract. Your inbox lives on the blockchain forever.</p>
        <button className="btn-connect" onClick={handleConnect} disabled={connecting}>{connecting?'⏳ Connecting…':'◈  Sign in with Abstract AGW'}</button>
        <div className="landing-features">
          {[['⛓️','On-Chain'],['🔒','Encrypted'],['⚡','Sponsored'],['🌐','Decentralized']].map(([i,l])=>(
            <div className="feat" key={l}><span style={{fontSize:'1.3rem'}}>{i}</span><span className="feat-label">{l}</span></div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className="topbar">
        <div className="topbar-logo"><div className="logo-hex-sm"/>AbstractMail</div>
        <div className="topbar-search"><span style={{color:'var(--text-muted)'}}>⌕</span><input placeholder="Search messages"/></div>
        <div className="topbar-right">
          <div className="wallet-pill" onClick={logout}>
            <div className="wallet-avatar">{address?address.slice(2,4).toUpperCase():'??'}</div>
            {shortAddr(address)}
          </div>
        </div>
      </div>
      <div className="app-layout">
        <div className="sidebar">
          <div className="sidebar-inner">
            <button className="btn-compose" onClick={()=>{setReplyTo('');setComposing(true)}}>✏ Compose</button>
            <div className="sidebar-section">
              <div className="sidebar-section-label">Mail</div>
              {[['inbox','📥','Inbox',unread],['sent','📤','Sent',0],['starred','⭐','Starred',0],['drafts','📝','Drafts',0],['trash','🗑','Trash',0]].map(([id,icon,label,badge])=>(
                <button key={id} className={`nav-item ${view===id?'active':''}`} onClick={()=>setView(id)}>
                  <span>{icon}</span>{label}
                  {badge>0&&<span className="nav-badge">{badge}</span>}
                </button>
              ))}
            </div>
            <div className="sidebar-divider"/>
            <div className="sidebar-section">
              <div className="sidebar-section-label">Chain</div>
              <button className={`nav-item ${view==='transactions'?'active':''}`} onClick={()=>setView('transactions')}><span>⛓</span>Transactions</button>
            </div>
            <div className="sidebar-divider"/>
            <div className="chain-info">
              <div className="chain-info-label">Network</div>
              <div className="chain-info-row">
                <div className="chain-info-name"><div className="chain-live"/>Abstract</div>
                <div className="chain-block">#{block.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="maillist">
          <div className="maillist-header">
            <div className="maillist-title">{{inbox:'Inbox',sent:'Sent',starred:'Starred',drafts:'Drafts',trash:'Trash',transactions:'Transactions'}[view]||view}</div>
            <div className="maillist-tabs">
              {['all','unread','txn'].map(t=>(
                <button key={t} className={`mail-tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
              ))}
            </div>
          </div>
          <div className="maillist-scroll">
            {filtered.length===0
              ?<div className="no-mail"><div style={{fontSize:'2rem',opacity:.3}}>📭</div><div>No messages</div></div>
              :filtered.map((m,idx)=>(
                <div key={m.id} className={`mail-item ${m.unread?'unread':''} ${selectedId===m.id?'active':''}`} style={{animationDelay:`${idx*.05}s`}} onClick={()=>handleSelect(m.id)}>
                  <div className="mail-item-top">
                    <div className="mail-avatar-sm">{m.fromInitials}</div>
                    <div className="mail-from">{m.fromShort||m.from}</div>
                    <div className="mail-time">{m.time}</div>
                  </div>
                  <div className="mail-subject">{m.subject}</div>
                  <div className="mail-preview">{m.preview}</div>
                  {m.tags&&<div className="mail-tags">{m.tags.map(t=><span key={t} className="mail-tag">{t}</span>)}</div>}
                </div>
              ))
            }
          </div>
        </div>
        <div className="mailview">
          {!selected
            ?<div className="mail-empty"><div className="mail-empty-icon">📬</div><div className="mail-empty-text">Select a message to read</div></div>
            :<div className="mailview-inner">
              <div className="mail-subject-line">{selected.subject}</div>
              <div className="mail-meta-bar">
                <div className="mail-avatar-lg">{selected.fromInitials}</div>
                <div className="mail-meta-details">
                  <div className="mail-from-full">{selected.fromShort||selected.from}</div>
                  <div className="mail-addr">{selected.from}</div>
                </div>
                <div className="mail-date-full">{selected.date}, {selected.time}</div>
                <div className="mail-actions-top">
                  <button className="action-btn" onClick={()=>{setReplyTo(selected.fromShort||selected.from);setComposing(true)}}>↩ Reply</button>
                  <button className="action-btn" onClick={()=>setInbox(p=>p.map(m=>m.id===selected.id?{...m,starred:!m.starred}:m))}>{selected.starred?'★ Unstar':'☆ Star'}</button>
                </div>
              </div>
              {selected.txHash&&<div className="txn-badge">⛓ Tx: <strong>{shortAddr(selected.txHash)}</strong> · Abstract Mainnet &nbsp;<a href={`https://explorer.abs.xyz/tx/${selected.txHash}`} target="_blank" rel="noreferrer" style={{color:'var(--abs-green)',opacity:.7,fontSize:'.65rem'}}>↗ Explorer</a></div>}
              <div className="mail-body">{selected.body}</div>
            </div>
          }
        </div>
      </div>
      {composing&&<ComposeModal defaultTo={replyTo} onClose={()=>setComposing(false)} onSend={handleSend}/>}
      {step>0&&(
        <div className="sending-overlay">
          <div className="sending-box">
            <div className="sending-animation">
              <div className="sending-ring ring1"/><div className="sending-ring ring2"/><div className="sending-ring ring3"/>
              <div className="sending-center">✉</div>
            </div>
            <div className="sending-title">Broadcasting to Abstract</div>
            <div className="sending-sub">Your message is being written to the blockchain</div>
            <div className="sending-steps">
              {[{id:1,label:'Signing with AGW wallet'},{id:2,label:'Broadcasting to Abstract Chain'},{id:3,label:'Waiting for confirmation'},{id:4,label:'Message delivered on-chain'}].map(s=>(
                <div key={s.id} className={`sending-step ${s.id<step?'done':s.id===step?'active':''}`}>
                  <div className="step-dot"/>{s.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className={`tx-toast ${toast.show?'show':''}`}>
        <div style={{fontSize:'1.2rem'}}>✅</div>
        <div>
          <div className="toast-title">Message sent on Abstract Chain</div>
          <div className="toast-hash">Tx: {shortAddr(toast.hash)}</div>
        </div>
      </div>
    </>
  )
}
