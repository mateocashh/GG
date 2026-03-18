import { useState, useEffect, useCallback, useRef } from 'react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useAccount } from 'wagmi'

// ── Mock .abs name directory (replace with real resolver later) ──────────────
const ABS_DIRECTORY = [
  { name: 'alice.abs', addr: '0x2e8f4a71c930d370beef', initials: 'AL' },
  { name: 'bob.abs', addr: '0x5b3d9fa2e820cafe1234', initials: 'BO' },
  { name: 'vitalik.abs', addr: '0xd8da6bf26964af9d7eed9e03e53415d37aa9604', initials: 'VB' },
  { name: 'abstract.abs', addr: '0xAbstractProtocolDead', initials: 'AB' },
  { name: 'protocol.abs', addr: '0x6f2a8c1d50301234abcd', initials: 'PR' },
  { name: 'mateo.abs', addr: '0x1a2b3c4d5e6f7a8b9c0d', initials: 'MT' },
  { name: 'crypto.abs', addr: '0x9f8e7d6c5b4a3f2e1d0c', initials: 'CR' },
  { name: 'defi.abs', addr: '0x0c1d2e3f4a5b6c7d8e9f', initials: 'DF' },
]

const INBOX_INIT = [
  { id:1, fromShort:'abstract.abs', from:'0xAbstractProtocolDead', fromInitials:'AB', subject:'Welcome to AbstractMail ✦', preview:'Every message you send is an on-chain transaction on Abstract...', body:`Hey,\n\nWelcome to AbstractMail — the first fully on-chain messaging protocol on Abstract Chain.\n\nEvery message is permanently recorded as a transaction. Your inbox is decentralized and owned by your wallet.\n\n✦ Sending mail creates a real transaction\n✦ Messages are signed with your AGW wallet\n✦ Your .abs name is your on-chain identity\n✦ End-to-end encrypted by default\n\n— The AbstractMail Team`, time:'09:14', date:'Today', txHash:'0x4a3f2b7c9d1e8f0a3b5c2d7e9f1a4b6c', encrypted:true, unread:true, starred:true, tags:['welcome'] },
  { id:2, fromShort:'alice.abs', from:'0x2e8f4a71c930d370beef', fromInitials:'AL', subject:'Re: DAO governance vote — Round 7', preview:'I reviewed the proposal. Tokenomics look solid but vesting is too aggressive...', body:`Hey,\n\nReviewed the Round 7 governance proposal. Tokenomics are solid but 12 months cliff is not enough for protocol contributors.\n\nVoting NO on current, YES on amended version if they extend to 18 months.\n\nWant to draft a counter-proposal before snapshot closes Thursday?\n\n— Alice`, time:'Yesterday', date:'Yesterday', txHash:'0x1c9b5d22a4e8f0b3d6a2c5e8f1a3c6e9', encrypted:true, unread:true, starred:false, tags:['dao','governance'] },
  { id:3, fromShort:'bob.abs', from:'0x5b3d9fa2e820cafe1234', fromInitials:'BO', subject:'NFT drop collab — interested?', preview:'Thinking we could partner on a joint abstract-themed drop...', body:`Yo,\n\nWant to collab on an abstract-themed NFT drop. I have art covered, need someone for contract deployment on Abstract.\n\n50/50 royalty split. DM if you are in.\n\n— Bob`, time:'Mar 15', date:'Mar 15', txHash:'0x9e4c7b31d1a38f2b5c8e1a4d7f0c3b6e', encrypted:false, unread:false, starred:true, tags:['nft','collab'] },
  { id:4, fromShort:'protocol.abs', from:'0x6f2a8c1d50301234abcd', fromInitials:'PR', subject:'Abstract Chain — Protocol Update v2.4', preview:'Abstract Chain deployed protocol upgrade v2.4 to mainnet...', body:`Protocol Update v2.4\n\nDeployed to mainnet at block 4829201.\n\n✦ 40% reduction in mail tx gas costs\n✦ New encrypted messaging standard ABS-EIP-7291\n✦ Improved AGW session keys\n✦ .abs name resolution supported natively\n\n— Abstract Protocol Team`, time:'Mar 14', date:'Mar 14', txHash:'0x3d8f1a44c2e7b0d5f8a1c4e7b2d5f8a1', encrypted:true, unread:false, starred:false, tags:['protocol','update'] },
]

// ── Simple XOR encryption (visual only — replace with real crypto later) ──────
function encryptMsg(text, key) {
  return btoa(text.split('').map((c,i)=>String.fromCharCode(c.charCodeAt(0)^key.charCodeAt(i%key.length))).join(''))
}
function decryptMsg(enc, key) {
  try {
    const decoded = atob(enc)
    return decoded.split('').map((c,i)=>String.fromCharCode(c.charCodeAt(0)^key.charCodeAt(i%key.length))).join('')
  } catch { return enc }
}

const shortAddr = a => a ? a.slice(0,6)+'...'+a.slice(-4) : ''
const randomHex = n => [...Array(n)].map(()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('')
const delay = ms => new Promise(r=>setTimeout(r,ms))

// ── To Field with .abs suggestions ───────────────────────────────────────────
function ToField({ value, onChange }) {
  const isAddress = value.startsWith('0x') && value.length >= 6
  const isName = value.length >= 2 && !value.startsWith('0x')
  const showCard = isAddress || isName

  return (
    <div className="to-field-wrap" style={{position:'relative',flex:1}}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0x address or portal username..."
        style={{width:'100%',background:'none',border:'none',outline:'none',color:'var(--text-primary)',fontFamily:'var(--font-main)',fontSize:'.88rem'}}
      />
      {showCard && (
        <div style={{
          position:'absolute',top:'calc(100% + 8px)',left:0,right:0,
          background:'var(--bg-card)',border:'1px solid var(--abs-green-border)',
          borderRadius:'10px',overflow:'hidden',zIndex:999,
          boxShadow:'0 8px 24px rgba(0,0,0,.5)'
        }}>
          
            href={`https://portal.abs.xyz/profile/${value}`}
            target="_blank"
            rel="noreferrer"
            style={{textDecoration:'none',display:'flex',alignItems:'center',gap:'10px',padding:'12px 14px'}}
          >
            <div style={{
              width:'32px',height:'32px',borderRadius:'50%',
              background:'var(--abs-green-pale)',border:'1px solid var(--abs-green-border)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:'.7rem',color:'var(--abs-green)',fontFamily:'var(--font-mono)',
              fontWeight:'700',flexShrink:0
            }}>
              {value.startsWith('0x') ? value.slice(2,4).toUpperCase() : value.slice(0,2).toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:'.85rem',fontWeight:'600',color:'var(--text-primary)',marginBottom:'2px'}}>
                {value}
              </div>
              <div style={{fontSize:'.7rem',color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>
                View on Abstract Portal ↗
              </div>
            </div>
            <div style={{fontSize:'.7rem',color:'var(--abs-green)',fontFamily:'var(--font-mono)'}}>
              verify →
            </div>
          </a>
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
    <div className="mo
