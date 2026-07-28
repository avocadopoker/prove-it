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
  const [mode, setMode] = useState('login') // login | signup | forgot
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      })
      if (error) setMsg(error.message)
      else setMsg('Account created. You can log in now.')
    } else if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
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
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {mode !== 'forgot' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
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
      <div className="auth-brand">
        <span className="mark">NEW</span>
        <span className="mark-it">PASS</span>
      </div>
      <form onSubmit={submit} className="auth-form">
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn-primary">Update password</button>
      </form>
      {msg && <p className="auth-msg">{msg}</p>}
    </div>
  )
}

/* ---------------- MAIN ---------------- */

function Main({ session }) {
  const uid = session.user.id
  const [tab, setTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [active, setActive] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    ;(async () => {
      await supabase
        .from('assignments')
        .update({ status: 'failed' })
        .eq('user_id', uid)
        .eq('status', 'active')
        .lt('deadline', new Date().toISOString())

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', uid).single()
      setProfile(prof)

      const { data: a } = await supabase
        .from('assignments')
        .select('*, challenge:challenges(*), submissions(*)')
        .eq('user_id', uid)
        .in('status', ['active', 'submitted'])
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setActive(a || null)
    })()
  }, [uid, refreshKey])

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">PROVE<b>IT</b></span>
        <span className="hello">{profile?.name || 'Athlete'}</span>
      </header>

      <main className="screen">
        {tab === 'overview' && <Overview uid={uid} active={active} />}
        {tab === 'challenge' && <ChallengeScreen uid={uid} active={active} onChange={bump} />}
        {tab === 'ranks' && <RanksScreen uid={uid} />}
        {tab === 'settings' && <Settings uid={uid} profile={profile} onChange={bump} />}
      </main>

      <nav className="tabbar">
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Home</button>
        <button className={tab === 'challenge' ? 'on' : ''} onClick={() => setTab('challenge')}>Challenge</button>
        <button className={tab === 'ranks' ? 'on' : ''} onClick={() => setTab('ranks')}>Ranks</button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Settings</button>
      </nav>
    </div>
  )
}

/* ---------------- OVERVIEW ---------------- */

function Overview({ uid, active }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    ;(async () => {
      const since = new Date(Date.now() - YEAR_MS).toISOString()
      const { data: board } = await supabase.rpc('get_leaderboard', { since })
      let worldRank = null
      if (board) {
        const idx = board.findIndex((r) => r.user_id === uid)
        worldRank = idx >= 0 ? idx + 1 : null
      }

      const { count: done } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('status', 'approved')

      const { count: failed } = await supabase
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('status', 'failed')

      const { data: friendRank } = await supabase.rpc('get_friend_rank', { p_user: uid, since })

      setStats({ worldRank, done: done || 0, failed: failed || 0, friendRank })
    })()
  }, [uid])

  return (
    <div className="overview">
      <div className="rank-hero">
        <span className="rank-label">WORLD RANK · 1Y</span>
        <span className="rank-num">{stats?.worldRank ? `#${stats.worldRank}` : '—'}</span>
        <span className="rank-sub">Friends rank {stats?.friendRank ? `#${stats.friendRank}` : '—'}</span>
      </div>

      <div className="stat-row">
        <div className="stat done">
          <span className="stat-num">{stats?.done ?? '—'}</span>
          <span className="stat-label">Proven</span>
        </div>
        <div className="stat failed">
          <span className="stat-num">{stats?.failed ?? '—'}</span>
          <span className="stat-label">Failed</span>
        </div>
      </div>

      <div className="current-block">
        <span className="block-label">CURRENT CHALLENGE</span>
        {active ? (
          <>
            <p className="current-title">{active.challenge.title}</p>
            <Countdown deadline={active.deadline} />
          </>
        ) : (
          <p className="current-empty">No active challenge. Go claim one.</p>
        )}
      </div>
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
  const d = Math.floor(left / 86400000)
  const h = Math.floor((left % 86400000) / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return (
    <span className="countdown">
      {d > 0 && `${d}d `}
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')} left
    </span>
  )
}
function msLeft(deadline) {
  return new Date(deadline).getTime() - Date.now()
}

/* ---------------- CHALLENGE ---------------- */

function ChallengeScreen({ uid, active, onChange }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function claim() {
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc('assign_random_challenge')
    if (error) setErr(error.message)
    onChange()
    setBusy(false)
  }

  if (!active) {
    return (
      <div className="challenge-empty">
        <p className="empty-eyebrow">NO ACTIVE CHALLENGE</p>
        <h2>Ready to prove it?</h2>
        <p className="empty-body">
          You don't choose. Claim a challenge and the clock starts. Fail to submit proof in time and
          it counts as a loss.
        </p>
        <button className="btn-primary big" onClick={claim} disabled={busy}>
          {busy ? 'Drawing…' : 'Claim a challenge'}
        </button>
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

  async function submitProof(e) {
    e.preventDefault()
    if (!file) {
      setErr('Attach your proof first.')
      return
    }
    setUploading(true)
    setErr('')
    const path = `${uid}/${active.id}-${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, file)
    if (upErr) {
      setErr(upErr.message)
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)
    const { error: subErr } = await supabase.from('submissions').insert({
      assignment_id: active.id,
      user_id: uid,
      proof_url: pub.publicUrl,
      note,
    })
    if (subErr) {
      setErr(subErr.message)
      setUploading(false)
      return
    }
    await supabase.from('assignments').update({ status: 'submitted' }).eq('id', active.id)
    setUploading(false)
    onChange()
  }

  return (
    <div className="active">
      <div className="active-head">
        <span className="pts-badge">{c.points} PT{c.points === 1 ? '' : 'S'}</span>
        <Countdown deadline={active.deadline} />
      </div>
      <h2 className="active-title">{c.title}</h2>
      <p className="active-desc">{c.description}</p>

      {c.resources && (
        <div className="resources">
          <span className="block-label">HOW TO GET IT DONE</span>
          <p>{c.resources}</p>
        </div>
      )}

      <div className="proof-rule">Your face must be visible in the proof. No you, no points.</div>

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
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files[0])}
              hidden
            />
          </label>
          <textarea
            placeholder="Add a note for the reviewer (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn-primary" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Submit proof'}
          </button>
          {err && <p className="auth-msg">{err}</p>}
        </form>
      )}
    </div>
  )
}

/* ---------------- RANKS + HISTORY ---------------- */

function RanksScreen({ uid }) {
  const [win, setWin] = useState(1)
  const [board, setBoard] = useState([])
  const [history, setHistory] = useState([])
  const [view, setView] = useState('board') // board | history

  useEffect(() => {
    ;(async () => {
      const since = new Date(Date.now() - win * YEAR_MS).toISOString()
      const { data } = await supabase.rpc('get_leaderboard', { since })
      setBoard(data || [])
    })()
  }, [win])

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('assignments')
        .select('*, challenge:challenges(title, points)')
        .eq('user_id', uid)
        .order('assigned_at', { ascending: false })
      setHistory(data || [])
    })()
  }, [uid])

  return (
    <div className="ranks">
      <div className="seg">
        <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Leaderboard</button>
        <button className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}>My history</button>
      </div>

      {view === 'board' ? (
        <>
          <div className="win-tabs">
            {WINDOWS.map((w) => (
              <button key={w.key} className={win === w.key ? 'on' : ''} onClick={() => setWin(w.key)}>
                {w.label}
              </button>
            ))}
          </div>
          <ol className="board">
            {board.map((r, i) => (
              <li key={r.user_id} className={r.user_id === uid ? 'me' : ''}>
                <span className="pos">{i + 1}</span>
                <span className="who">{r.name || 'Anonymous'}</span>
                <span className="pts">{r.points}</span>
              </li>
            ))}
            {board.length === 0 && <p className="current-empty">No ranked players yet.</p>}
          </ol>
        </>
      ) : (
        <ul className="history">
          {history.map((h) => (
            <li key={h.id} className={`hist-${h.status}`}>
              <span className="hist-title">{h.challenge?.title}</span>
              <span className={`hist-badge ${h.status}`}>
                {h.status === 'completed' ? `+${h.challenge?.points}` : h.status}
              </span>
            </li>
          ))}
          {history.length === 0 && <p className="current-empty">No challenges yet.</p>}
        </ul>
      )}
    </div>
  )
}

/* ---------------- SETTINGS + GROUPS ---------------- */

function Settings({ uid, profile, onChange }) {
  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [groups, setGroups] = useState([])
  const [groupName, setGroupName] = useState('')

  const loadGroups = useCallback(async () => {
    const { data } = await supabase
      .from('group_members')
      .select('group:groups(*)')
      .eq('user_id', uid)
    setGroups((data || []).map((r) => r.group).filter(Boolean))
  }, [uid])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  async function changePw(e) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: pw })
    setPwMsg(error ? error.message : 'Password updated.')
    setPw('')
  }

  async function createGroup(e) {
    e.preventDefault()
    if (!groupName.trim()) return
    const { data: g, error } = await supabase
      .from('groups')
      .insert({ name: groupName, owner_id: uid })
      .select()
      .single()
    if (!error && g) {
      await supabase.from('group_members').insert({ group_id: g.id, user_id: uid })
      setGroupName('')
      loadGroups()
    }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="settings">
      <section>
        <span className="block-label">CHANGE PASSWORD</span>
        <form onSubmit={changePw} className="stack">
          <input
            type="password"
            placeholder="New password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button className="btn-outline">Update password</button>
        </form>
        {pwMsg && <p className="auth-msg">{pwMsg}</p>}
      </section>

      <section>
        <span className="block-label">GROUPS</span>
        <p className="section-hint">Create a group to compete or team up with friends.</p>
        <form onSubmit={createGroup} className="row">
          <input
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <button className="btn-outline">Create</button>
        </form>
        <ul className="group-list">
          {groups.map((g) => (
            <li key={g.id}>
              <span>{g.name}</span>
              {g.owner_id === uid && <span className="owner-tag">owner</span>}
            </li>
          ))}
          {groups.length === 0 && <p className="current-empty">No groups yet.</p>}
        </ul>
      </section>

      <button className="btn-danger" onClick={logout}>Log out</button>
    </div>
  )
}
