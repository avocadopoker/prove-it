import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const WINDOWS = [
  { key: 1, label: '1Y' },
  { key: 2, label: '2Y' },
  { key: 5, label: '5Y' },
  { key: 10, label: '10Y' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [recovery, setRecovery] = useState(false)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (booting) return <div className="loading">Loading…</div>
  if (recovery) return <ResetPassword onDone={() => setRecovery(false)} />
  if (!session) return <Auth />
  return <Main session={session} />
}

/* ---------------- AUTH ---------------- */

function Auth() {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg(error.message)
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
      if (error) setMsg(error.message)
      else setMsg('Account created. You can log in now.')
    } else if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://prove-it-now.netlify.app',
      })
      if (error) setMsg(error.message)
      else setMsg('Check your email for the reset link.')
    }
    setBusy(false)
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <span className="mark">PROVE</span>
        <span className="mark-it">IT</span>
      </div>
      <p className="auth-tag">You don't pick the challenge. The challenge picks you.</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && (
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== 'forgot' && (
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        )}
        <button className="btn-primary" disabled={busy}>
          {mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>
      {msg && <p className="auth-msg">{msg}</p>}
      <div className="auth-links">
        {mode !== 'login' && <button onClick={() => setMode('login')}>Log in</button>}
        {mode !== 'signup' && <button onClick={() => setMode('signup')}>Create account</button>}
        {mode !== 'forgot' && <button onClick={() => setMode('forgot')}>Forgot password?</button>}
      </div>
    </div>
  )
}

function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setMsg(error.message)
    else {
      setMsg('Password updated.')
      setTimeout(onDone, 1200)
    }
  }
  return (
    <div className="auth">
      <div className="auth-brand"><span className="mark">NEW</span><span className="mark-it">PASS</span></div>
      <form onSubmit={submit} className="auth-form">
        <input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn-primary">Update password</button>
      </form>
      {msg && <p className="auth-msg">{msg}</p>}
    </div>
  )
}

/* ---------------- MAIN ---------------- */

function Main({ session }) {
  const uid = session.user.id
  const [tab, setTab] = useState('home')
  const [overlay, setOverlay] = useState(null) // {type:'settings'} | {type:'profile',userId} | {type:'assignment',id}
  const [profile, setProfile] = useState(null)
  const [active, setActive] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])
  const openProfile = useCallback((userId) => setOverlay({ type: 'profile', userId }), [])
  const openAssignment = useCallback((id) => setOverlay({ type: 'assignment', id }), [])

  useEffect(() => {
    ;(async () => {
      await supabase.rpc('expire_overdue_assignments')
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', uid).single()
      setProfile(prof)
      const { data: a } = await supabase.from('assignments')
        .select('*, challenge:challenges(*), submissions(*)')
        .eq('user_id', uid).in('status', ['active', 'submitted'])
        .order('assigned_at', { ascending: false }).limit(1).maybeSingle()
      setActive(a || null)
    })()
  }, [uid, refreshKey])

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">PROVE<b>IT</b></span>
        <button className="name-btn" onClick={() => setOverlay({ type: 'settings' })}>
          {profile?.name || 'Athlete'} <span className="cog">⚙</span>
        </button>
      </header>

      <main className="screen">
        {tab === 'home' && <Home uid={uid} active={active} openProfile={openProfile} openAssignment={openAssignment} />}
        {tab === 'challenge' && <ChallengeScreen uid={uid} active={active} onChange={bump} />}
        {tab === 'ranks' && <RanksScreen uid={uid} openProfile={openProfile} />}
        {tab === 'friends' && <FriendsScreen uid={uid} openProfile={openProfile} />}
      </main>

      <nav className="tabbar">
        <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>Home</button>
        <button className={tab === 'challenge' ? 'on' : ''} onClick={() => setTab('challenge')}>Challenge</button>
        <button className={tab === 'ranks' ? 'on' : ''} onClick={() => setTab('ranks')}>Ranks</button>
        <button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>Friends</button>
      </nav>

      {overlay?.type === 'settings' && <Settings uid={uid} onClose={() => setOverlay(null)} />}
      {overlay?.type === 'profile' && (
        <ProfileView uid={uid} userId={overlay.userId} onClose={() => setOverlay(null)} openAssignment={openAssignment} />
      )}
      {overlay?.type === 'assignment' && (
        <AssignmentDetail uid={uid} assignmentId={overlay.id} onClose={() => setOverlay(null)} openProfile={openProfile} />
      )}
    </div>
  )
}

/* ---------------- HOME ---------------- */

function Home({ uid, active, openProfile, openAssignment }) {
  const [feed, setFeed] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.rpc('get_activity_feed', { p_user: uid, p_limit: 30 })
      setFeed(data || [])
      setLoading(false)
    })()
  }, [uid])

  return (
    <div className="home">
      <div className="current-card">
        <span className="eyebrow">YOUR CURRENT CHALLENGE</span>
        {active ? (
          <>
            <p className="current-title">{active.challenge.title}</p>
            <Countdown deadline={active.deadline} />
          </>
        ) : (
          <p className="current-empty">No active challenge — head to Challenge to claim one.</p>
        )}
      </div>

      <span className="section-head">RECENT ACTIVITY</span>
      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : feed.length === 0 ? (
        <p className="muted-line">Follow people or add friends to see their wins here.</p>
      ) : (
        <div className="feed">
          {feed.map((f) => (
            <button key={f.assignment_id} className="feed-item" onClick={() => openAssignment(f.assignment_id)}>
              <span className="feed-avatar" onClick={(e) => { e.stopPropagation(); openProfile(f.owner_id) }}>
                {(f.owner_name || '?').charAt(0).toUpperCase()}
              </span>
              <span className="feed-body">
                <span className="feed-line"><b>{f.owner_name || 'Someone'}</b> proved it</span>
                <span className="feed-challenge">{f.challenge_title}</span>
              </span>
              <span className="feed-pts">+{f.points}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Countdown({ deadline }) {
  const [left, setLeft] = useState(msLeft(deadline))
  useEffect(() => {
    const t = setInterval(() => setLeft(msLeft(deadline)), 1000)
    return () => clearInterval(t)
  }, [deadline])
  if (left <= 0) return <span className="countdown over">Time's up</span>

  const HOUR = 3600000
  const DAY = 86400000

  if (left > 2 * DAY) {
    const d = Math.ceil(left / DAY)
    return <span className="countdown">{d} {d === 1 ? 'Day' : 'Days'} left</span>
  }
  if (left > DAY) {
    const h = Math.ceil(left / HOUR)
    return <span className="countdown">{h} {h === 1 ? 'hour' : 'hours'} left</span>
  }
  const h = Math.floor(left / HOUR)
  const m = Math.floor((left % HOUR) / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return (
    <span className="countdown">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}
function msLeft(deadline) { return new Date(deadline).getTime() - Date.now() }

/* ---------------- CHALLENGE ---------------- */

const TIERS = [
  { key: 'easy', label: 'EASY', min: 1, max: 5, color: '#2ecc71' },
  { key: 'medium', label: 'MEDIUM', min: 6, max: 10, color: '#f1c40f' },
  { key: 'hard', label: 'HARD', min: 11, max: 15, color: '#e67e22' },
  { key: 'veryhard', label: 'VERY HARD', min: 16, max: 20, color: '#e5142d' },
]
function tierForPoints(pts) {
  return TIERS.find((t) => pts >= t.min && pts <= t.max) || TIERS[0]
}

function ChallengeScreen({ uid, active, onChange }) {
  const [spinning, setSpinning] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [err, setErr] = useState('')
  const [revealReady, setRevealReady] = useState(false)

  async function claim() {
    setErr('')
    setSpinning(true)
    setRevealReady(false)

    // Pick the challenge in the background first (user doesn't see it yet)
    const { data: assignmentId, error } = await supabase.rpc('assign_random_challenge')
    if (error) {
      setErr(error.message)
      setSpinning(false)
      return
    }
    const { data: a } = await supabase
      .from('assignments').select('challenge:challenges(points)').eq('id', assignmentId).single()
    const pts = a?.challenge?.points || 1
    const tierIndex = TIERS.findIndex((t) => t.key === tierForPoints(pts).key)

    // Wheel has 4 segments; spin several full turns then land centered on the tier segment
    const segmentDeg = 360 / TIERS.length
    const targetDeg = tierIndex * segmentDeg + segmentDeg / 2
    const spins = 5 * 360
    const finalRotation = spins + (360 - targetDeg)
    setWheelRotation(finalRotation)

    setTimeout(() => {
      setSpinning(false)
      setRevealReady(true)
    }, 3200)
  }

  function reveal() {
    setRevealReady(false)
    setWheelRotation(0)
    onChange()
  }

  if (!active && (spinning || revealReady)) {
    return (
      <div className="wheel-stage">
        <div className="wheel-wrap">
          <div className="wheel-pointer" />
          <div
            className="wheel"
            style={{ transform: `rotate(${wheelRotation}deg)`, transition: spinning ? 'transform 3.1s cubic-bezier(.17,.67,.16,1)' : 'none' }}
          >
            {TIERS.map((t, i) => (
              <div
                key={t.key}
                className="wheel-seg"
                style={{
                  transform: `rotate(${i * (360 / TIERS.length)}deg)`,
                  background: t.color,
                }}
              >
                <span className="wheel-seg-label" style={{ transform: `rotate(${180 / TIERS.length}deg)` }}>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
        {spinning ? (
          <p className="wheel-caption">Drawing your fate…</p>
        ) : (
          <button className="btn-primary big" onClick={reveal}>Reveal challenge</button>
        )}
      </div>
    )
  }

  if (!active) {
    return (
      <div className="challenge-empty">
        <p className="empty-eyebrow">NO ACTIVE CHALLENGE</p>
        <h2>Ready to prove it?</h2>
        <p className="empty-body">You don't choose. Claim a challenge and the clock starts. Miss the deadline and it's a loss.</p>
        <button className="btn-primary big" onClick={claim} disabled={spinning}>{spinning ? 'Drawing…' : 'Claim a challenge'}</button>
        {err && <p className="auth-msg">{err}</p>}
      </div>
    )
  }
  const submission = (active.submissions || []).find((s) => s.status !== 'rejected')
  return <ActiveChallenge active={active} submission={submission} uid={uid} onChange={onChange} />
}

function ActiveChallenge({ active, submission, uid, onChange }) {
  const c = active.challenge
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [err, setErr] = useState('')
  const [sheet, setSheet] = useState(null) // 'guides' | 'proof'

  async function submitProof(e) {
    e.preventDefault()
    if (!file) { setErr('Attach your proof first.'); return }
    setUploading(true); setErr('')
    const path = `${uid}/${active.id}-${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, file)
    if (upErr) { setErr(upErr.message); setUploading(false); return }
    const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)
    const { error: subErr } = await supabase.from('submissions').insert({
      assignment_id: active.id, user_id: uid, proof_url: pub.publicUrl, note,
    })
    if (subErr) { setErr(subErr.message); setUploading(false); return }
    await supabase.from('assignments').update({ status: 'submitted' }).eq('id', active.id)
    setUploading(false); onChange()
  }

  return (
    <div className="active">
      <div className="active-head">
        <span className="pts-badge">{c.points} PT{c.points === 1 ? '' : 'S'}</span>
        <Countdown deadline={active.deadline} />
      </div>
      <h2 className="active-title">{c.title}</h2>
      <p className="active-desc">{c.description}</p>

      <ProgressComposer assignmentId={active.id} uid={uid} />

      <div className="info-boxes">
        <button className="info-box" onClick={() => setSheet('guides')}>
          <span className="info-box-title">Guides</span>
          <span className="info-box-sub">Steps & paths to get it done</span>
        </button>
        <button className="info-box" onClick={() => setSheet('proof')}>
          <span className="info-box-title">Proof requirements</span>
          <span className="info-box-sub">What your proof must show</span>
        </button>
      </div>

      {submission ? (
        <div className="submitted-state">
          <span className="badge-pending">Submitted — under review</span>
          <p>The review team is checking your proof. Points release once it's accepted.</p>
        </div>
      ) : !showUpload ? (
        <button className="btn-primary big" onClick={() => setShowUpload(true)}>DONE</button>
      ) : (
        <form className="upload-form" onSubmit={submitProof}>
          <label className="file-drop">
            {file ? file.name : 'Tap to attach photo or video'}
            <input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files[0])} hidden />
          </label>
          <textarea placeholder="Add a note for the reviewer (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Submit proof'}</button>
          {err && <p className="auth-msg">{err}</p>}
        </form>
      )}

      {sheet && (
        <div className="overlay">
          <div className="overlay-head">
            <button className="back" onClick={() => setSheet(null)}>← Back</button>
            <span className="overlay-title">{sheet === 'guides' ? 'Guides' : 'Proof requirements'}</span>
          </div>
          <div className="overlay-body">
            <p className="sheet-text">
              {sheet === 'guides'
                ? (c.resources || 'No guide added for this challenge yet.')
                : (c.proof_requirements || 'Your face must be clearly visible in the proof, and it must show the full action being completed. No you, no points.')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressComposer({ assignmentId, uid }) {
  const [posts, setPosts] = useState([])
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('progress_posts').select('*')
      .eq('assignment_id', assignmentId).order('created_at', { ascending: false })
    setPosts(data || [])
  }, [assignmentId])
  useEffect(() => { load() }, [load])

  async function post(e) {
    e.preventDefault()
    if (!body.trim() && !file) return
    setBusy(true)
    let media_url = null
    if (file) {
      const path = `progress/${uid}/${assignmentId}-${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('proofs').upload(path, file)
      if (!error) media_url = supabase.storage.from('proofs').getPublicUrl(path).data.publicUrl
    }
    await supabase.from('progress_posts').insert({ assignment_id: assignmentId, user_id: uid, body, media_url })
    setBody(''); setFile(null); setBusy(false); load()
  }

  return (
    <div className="progress-block">
      <span className="section-head">PROGRESS</span>
      <form className="progress-form" onSubmit={post}>
        <textarea placeholder="Post an update so people can follow along…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="progress-actions">
          <label className="attach-mini">{file ? '1 file' : '+ media'}<input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files[0])} hidden /></label>
          <button className="btn-outline sm" disabled={busy}>{busy ? 'Posting…' : 'Post update'}</button>
        </div>
      </form>
      <ProgressList posts={posts} />
    </div>
  )
}

function ProgressList({ posts }) {
  if (!posts || posts.length === 0) return null
  return (
    <div className="progress-list">
      {posts.map((p) => (
        <div key={p.id} className="progress-post">
          {p.body && <p>{p.body}</p>}
          {p.media_url && <Media url={p.media_url} />}
          <span className="ago">{timeAgo(p.created_at)}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- RANKS ---------------- */

function RanksScreen({ uid, openProfile }) {
  const [view, setView] = useState('friends') // friends default
  const [win, setWin] = useState(1)
  const [board, setBoard] = useState([])

  useEffect(() => {
    ;(async () => {
      const since = new Date(Date.now() - win * YEAR_MS).toISOString()
      const rpc = view === 'friends' ? 'get_friends_leaderboard' : 'get_leaderboard'
      const args = view === 'friends' ? { p_user: uid, since } : { since }
      const { data } = await supabase.rpc(rpc, args)
      setBoard(data || [])
    })()
  }, [view, win, uid])

  return (
    <div className="ranks">
      <div className="seg">
        <button className={view === 'friends' ? 'on' : ''} onClick={() => setView('friends')}>Friends</button>
        <button className={view === 'leaderboard' ? 'on' : ''} onClick={() => setView('leaderboard')}>Leaderboard</button>
      </div>
      <div className="win-tabs">
        {WINDOWS.map((w) => (
          <button key={w.key} className={win === w.key ? 'on' : ''} onClick={() => setWin(w.key)}>{w.label}</button>
        ))}
      </div>
      <ol className="board">
        {board.map((r, i) => (
          <li key={r.user_id} className={r.user_id === uid ? 'me' : ''} onClick={() => openProfile(r.user_id)}>
            <span className="pos">{i + 1}</span>
            <span className="who">{r.name || 'Anonymous'}</span>
            <span className="pts">{r.points}</span>
          </li>
        ))}
        {board.length === 0 && <p className="muted-line">{view === 'friends' ? 'Add friends to see a friends board.' : 'No ranked players yet.'}</p>}
      </ol>
    </div>
  )
}

/* ---------------- FRIENDS ---------------- */

function FriendsScreen({ uid, openProfile }) {
  const [requests, setRequests] = useState([])
  const [friends, setFriends] = useState([])
  const [following, setFollowing] = useState([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)

  const load = useCallback(async () => {
    const { data: reqs } = await supabase.from('friendships')
      .select('*, requester_profile:profiles!friendships_requester_fkey(id,name)')
      .eq('addressee', uid).eq('status', 'pending')
    setRequests(reqs || [])

    const { data: fr } = await supabase.from('friendships')
      .select('requester, addressee, requester_profile:profiles!friendships_requester_fkey(id,name), addressee_profile:profiles!friendships_addressee_fkey(id,name)')
      .eq('status', 'accepted').or(`requester.eq.${uid},addressee.eq.${uid}`)
    setFriends((fr || []).map((row) => (row.requester === uid ? row.addressee_profile : row.requester_profile)))

    const { data: fol } = await supabase.from('follows').select('following_profile:profiles!follows_following_fkey(id,name)').eq('follower', uid)
    setFollowing((fol || []).map((r) => r.following_profile))
  }, [uid])
  useEffect(() => { load() }, [load])

  async function search() {
    if (!q.trim()) { setResults(null); return }
    const { data } = await supabase.from('profiles').select('id,name').ilike('name', `%${q}%`).neq('id', uid).limit(20)
    setResults(data || [])
  }

  async function accept(row) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', row.id)
    load()
  }
  async function decline(row) {
    await supabase.from('friendships').delete().eq('id', row.id)
    load()
  }

  function invite() {
    const url = 'https://prove-it-now.netlify.app'
    const text = `Think you've got the grit? Prove it. Join me on Prove It: ${url}`
    if (navigator.share) navigator.share({ title: 'Prove It', text, url }).catch(() => {})
    else { navigator.clipboard.writeText(text); alert('Invite link copied — send it to a friend.') }
  }

  return (
    <div className="friends">
      <button className="invite-btn" onClick={invite}>Invite a friend to Prove It</button>

      <div className="search-row">
        <input placeholder="Search people by name" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn-outline sm" onClick={search}>Search</button>
      </div>
      {results && (
        <div className="search-results">
          {results.length === 0 ? <p className="muted-line">No one found.</p> :
            results.map((r) => (
              <div key={r.id} className="person-row" onClick={() => openProfile(r.id)}>
                <span className="pavatar">{(r.name || '?').charAt(0).toUpperCase()}</span>
                <span className="pname">{r.name || 'Anonymous'}</span>
              </div>
            ))}
        </div>
      )}

      {requests.length > 0 && (
        <>
          <span className="section-head">FRIEND REQUESTS</span>
          {requests.map((row) => (
            <div key={row.id} className="request-row">
              <span className="pname" onClick={() => openProfile(row.requester_profile?.id)}>{row.requester_profile?.name || 'Someone'}</span>
              <div className="req-actions">
                <button className="btn-primary sm" onClick={() => accept(row)}>Accept</button>
                <button className="btn-ghost sm" onClick={() => decline(row)}>Decline</button>
              </div>
            </div>
          ))}
        </>
      )}

      <span className="section-head">FRIENDS</span>
      {friends.length === 0 ? <p className="muted-line">No friends yet — search or invite.</p> :
        friends.map((p) => (
          <div key={p.id} className="person-row" onClick={() => openProfile(p.id)}>
            <span className="pavatar">{(p.name || '?').charAt(0).toUpperCase()}</span>
            <span className="pname">{p.name || 'Anonymous'}</span>
          </div>
        ))}

      <span className="section-head">FOLLOWING</span>
      {following.length === 0 ? <p className="muted-line">You're not following anyone yet.</p> :
        following.map((p) => (
          <div key={p.id} className="person-row" onClick={() => openProfile(p.id)}>
            <span className="pavatar">{(p.name || '?').charAt(0).toUpperCase()}</span>
            <span className="pname">{p.name || 'Anonymous'}</span>
          </div>
        ))}
    </div>
  )
}

/* ---------------- PROFILE VIEW ---------------- */

function ProfileView({ uid, userId, onClose, openAssignment }) {
  const [profile, setProfile] = useState(null)
  const [active, setActive] = useState(null)
  const [progress, setProgress] = useState([])
  const [past, setPast] = useState([])
  const [rel, setRel] = useState({ following: false, friend: 'none' }) // none|pending|friends
  const isMe = userId === uid

  const load = useCallback(async () => {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(prof)
    const { data: a } = await supabase.from('assignments')
      .select('*, challenge:challenges(*)').eq('user_id', userId)
      .in('status', ['active', 'submitted']).order('assigned_at', { ascending: false }).limit(1).maybeSingle()
    setActive(a || null)
    if (a) {
      const { data: pp } = await supabase.from('progress_posts').select('*').eq('assignment_id', a.id).order('created_at', { ascending: false })
      setProgress(pp || [])
    } else setProgress([])
    const { data: hist } = await supabase.from('assignments')
      .select('*, challenge:challenges(title,points)').eq('user_id', userId)
      .in('status', ['completed', 'failed']).order('assigned_at', { ascending: false })
    setPast(hist || [])
    if (!isMe) {
      const { data: fol } = await supabase.from('follows').select('*').eq('follower', uid).eq('following', userId).maybeSingle()
      const { data: fr } = await supabase.from('friendships').select('*')
        .or(`and(requester.eq.${uid},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${uid})`).maybeSingle()
      setRel({ following: !!fol, friend: fr ? (fr.status === 'accepted' ? 'friends' : 'pending') : 'none' })
    }
  }, [userId, uid, isMe])
  useEffect(() => { load() }, [load])

  async function toggleFollow() {
    if (rel.following) await supabase.from('follows').delete().eq('follower', uid).eq('following', userId)
    else await supabase.from('follows').insert({ follower: uid, following: userId })
    load()
  }
  async function addFriend() {
    if (rel.friend !== 'none') return
    await supabase.from('friendships').insert({ requester: uid, addressee: userId, status: 'pending' })
    load()
  }

  return (
    <div className="overlay">
      <div className="overlay-head">
        <button className="back" onClick={onClose}>← Back</button>
      </div>
      <div className="overlay-body">
        {!profile ? <p className="muted-line">Loading…</p> : (
          <>
            <div className="profile-top">
              <span className="big-avatar">{(profile.name || '?').charAt(0).toUpperCase()}</span>
              <h2 className="profile-name">{profile.name || 'Anonymous'}</h2>
            </div>
            {!isMe && (
              <div className="profile-actions">
                <button className={rel.following ? 'btn-ghost' : 'btn-primary'} onClick={toggleFollow}>
                  {rel.following ? 'Following' : 'Follow'}
                </button>
                <button className="btn-outline" onClick={addFriend} disabled={rel.friend !== 'none'}>
                  {rel.friend === 'friends' ? 'Friends' : rel.friend === 'pending' ? 'Requested' : 'Add friend'}
                </button>
              </div>
            )}

            <span className="section-head">CURRENT CHALLENGE</span>
            {active ? (
              <button className="mini-challenge" onClick={() => openAssignment(active.id)}>
                <span>{active.challenge.title}</span>
                <span className="mini-pts">{active.challenge.points} pts</span>
              </button>
            ) : <p className="muted-line">No active challenge.</p>}

            {progress.length > 0 && (<><span className="section-head">PROGRESS</span><ProgressList posts={progress} /></>)}

            <span className="section-head">PAST CHALLENGES</span>
            {past.length === 0 ? <p className="muted-line">Nothing yet.</p> : (
              <ul className="history">
                {past.map((h) => (
                  <li key={h.id} className={`hist-${h.status}`}>
                    <span className="hist-title">{h.challenge?.title}</span>
                    <span className={`hist-badge ${h.status}`}>{h.status === 'completed' ? `+${h.challenge?.points}` : h.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------- ASSIGNMENT DETAIL (feed item / challenge thread) ---------------- */

function AssignmentDetail({ uid, assignmentId, onClose, openProfile }) {
  const [data, setData] = useState(null)
  const [progress, setProgress] = useState([])
  const [likes, setLikes] = useState({ count: 0, mine: false })
  const [comments, setComments] = useState([])
  const [canComment, setCanComment] = useState(false)
  const [body, setBody] = useState('')

  const load = useCallback(async () => {
    const { data: a } = await supabase.from('assignments')
      .select('*, challenge:challenges(*), owner:profiles!assignments_user_id_fkey(id,name)').eq('id', assignmentId).single()
    setData(a)
    const { data: pp } = await supabase.from('progress_posts').select('*').eq('assignment_id', assignmentId).order('created_at', { ascending: false })
    setProgress(pp || [])
    const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('assignment_id', assignmentId)
    const { data: mine } = await supabase.from('likes').select('*').eq('assignment_id', assignmentId).eq('user_id', uid).maybeSingle()
    setLikes({ count: count || 0, mine: !!mine })
    const { data: cm } = await supabase.from('comments')
      .select('*, author:profiles!comments_user_id_fkey(id,name)').eq('assignment_id', assignmentId).order('created_at', { ascending: true })
    setComments(cm || [])
    if (a && a.owner?.id !== uid) {
      const { data: fr } = await supabase.rpc('are_friends', { a: uid, b: a.owner.id })
      setCanComment(!!fr)
    } else setCanComment(!!a)
  }, [assignmentId, uid])
  useEffect(() => { load() }, [load])

  async function toggleLike() {
    if (likes.mine) await supabase.from('likes').delete().eq('assignment_id', assignmentId).eq('user_id', uid)
    else await supabase.from('likes').insert({ assignment_id: assignmentId, user_id: uid })
    load()
  }
  async function addComment(e) {
    e.preventDefault()
    if (!body.trim()) return
    await supabase.from('comments').insert({ assignment_id: assignmentId, user_id: uid, body })
    setBody(''); load()
  }

  return (
    <div className="overlay">
      <div className="overlay-head"><button className="back" onClick={onClose}>← Back</button></div>
      <div className="overlay-body">
        {!data ? <p className="muted-line">Loading…</p> : (
          <>
            <span className="feed-avatar big" onClick={() => openProfile(data.owner.id)}>{(data.owner?.name || '?').charAt(0).toUpperCase()}</span>
            <p className="by-line" onClick={() => openProfile(data.owner.id)}>{data.owner?.name || 'Someone'}</p>
            <h2 className="active-title">{data.challenge.title}</h2>
            <p className="active-desc">{data.challenge.description}</p>
            <span className={`status-chip ${data.status}`}>{data.status}</span>

            <div className="react-row">
              <button className={`like-btn ${likes.mine ? 'on' : ''}`} onClick={toggleLike}>♥ {likes.count}</button>
            </div>

            {progress.length > 0 && (<><span className="section-head">PROGRESS</span><ProgressList posts={progress} /></>)}

            <span className="section-head">COMMENTS</span>
            {comments.length === 0 ? <p className="muted-line">No comments yet.</p> : (
              <div className="comments">
                {comments.map((c) => (
                  <div key={c.id} className="comment">
                    <b onClick={() => openProfile(c.author?.id)}>{c.author?.name || 'Someone'}</b> {c.body}
                  </div>
                ))}
              </div>
            )}
            {canComment ? (
              <form className="comment-form" onSubmit={addComment}>
                <input placeholder="Add a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
                <button className="btn-outline sm">Send</button>
              </form>
            ) : <p className="muted-line small">Only friends can comment.</p>}
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------- SETTINGS ---------------- */

function Settings({ uid, onClose }) {
  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [groups, setGroups] = useState([])
  const [groupName, setGroupName] = useState('')

  const loadGroups = useCallback(async () => {
    const { data } = await supabase.from('group_members').select('group:groups(*)').eq('user_id', uid)
    setGroups((data || []).map((r) => r.group).filter(Boolean))
  }, [uid])
  useEffect(() => { loadGroups() }, [loadGroups])

  async function changePw(e) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: pw })
    setPwMsg(error ? error.message : 'Password updated.'); setPw('')
  }
  async function createGroup(e) {
    e.preventDefault()
    if (!groupName.trim()) return
    const { data: g, error } = await supabase.from('groups').insert({ name: groupName, owner_id: uid }).select().single()
    if (!error && g) { await supabase.from('group_members').insert({ group_id: g.id, user_id: uid }); setGroupName(''); loadGroups() }
  }
  async function logout() { await supabase.auth.signOut() }

  return (
    <div className="overlay">
      <div className="overlay-head"><button className="back" onClick={onClose}>← Back</button><span className="overlay-title">Settings</span></div>
      <div className="overlay-body">
        <section>
          <span className="section-head">CHANGE PASSWORD</span>
          <form onSubmit={changePw} className="stack">
            <input type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button className="btn-outline">Update password</button>
          </form>
          {pwMsg && <p className="auth-msg">{pwMsg}</p>}
        </section>
        <section>
          <span className="section-head">GROUPS</span>
          <p className="section-hint">Create a group to compete or team up with friends.</p>
          <form onSubmit={createGroup} className="row">
            <input placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            <button className="btn-outline">Create</button>
          </form>
          <ul className="group-list">
            {groups.map((g) => (
              <li key={g.id}><span>{g.name}</span>{g.owner_id === uid && <span className="owner-tag">owner</span>}</li>
            ))}
            {groups.length === 0 && <p className="muted-line">No groups yet.</p>}
          </ul>
        </section>
        <button className="btn-danger" onClick={logout}>Log out</button>
      </div>
    </div>
  )
}

/* ---------------- SHARED ---------------- */

function Media({ url }) {
  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)
  return isVideo ? <video src={url} controls className="post-media" /> : <img src={url} alt="" className="post-media" />
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
