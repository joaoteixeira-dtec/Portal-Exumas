import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthProvider'
import { getAuth } from 'firebase/auth'
import { db } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import logoExumas from '../Logo Exumas - branco.png'

// Particle component for background effect
function Particles() {
  const particles = useMemo(() => 
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      size: Math.random() * 4 + 1,
      x: Math.random() * 100,
      y: Math.random() * 100,
      duration: Math.random() * 20 + 10,
      delay: Math.random() * -20,
      opacity: Math.random() * 0.5 + 0.1,
    })), []
  )

  return (
    <div className="login-particles">
      {particles.map(p => (
        <div
          key={p.id}
          className="particle"
          style={{
            '--size': `${p.size}px`,
            '--x': `${p.x}%`,
            '--y': `${p.y}%`,
            '--duration': `${p.duration}s`,
            '--delay': `${p.delay}s`,
            '--opacity': p.opacity,
          }}
        />
      ))}
    </div>
  )
}

// Animated rings component
function AnimatedRings() {
  return (
    <div className="login-rings">
      <div className="ring ring-1" />
      <div className="ring ring-2" />
      <div className="ring ring-3" />
    </div>
  )
}

// Glowing orbs
function GlowingOrbs() {
  return (
    <div className="login-orbs">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const { login, profile } = useAuth?.() || { login: async () => {}, profile: null }
  const formRef = useRef(null)

  // === Campos do formulário ===
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [authOk, setAuthOk] = useState(false)
  const [error, setError] = useState('')
  const [focusedField, setFocusedField] = useState(null)

  // === Roteamento por role (igual ao teu) ===
  const routeByRole = (role) => {
    const map = {
      admin: '/admin',
      gestor: '/gestor',
      cliente: '/cliente',
      armazem: '/armazem',
      compras: '/compras',
      faturacao: '/faturacao',
      rotas: '/rotas',
      motorista: '/motorista',
    }
    return map[role] || '/gestor'
  }

  const resolveRole = async (fallbackEmail) => {
    try {
      const auth = getAuth()
      const uid = auth?.currentUser?.uid
      if (uid) {
        const snap = await getDoc(doc(db, 'users', uid))
        if (snap.exists()) {
          const data = snap.data()
          if (data?.role) return data.role
        }
      }
    } catch (_) {}
    if (profile?.role) return profile.role
    const m = (fallbackEmail || '').toLowerCase()
    if (m.includes('@demo') || m.includes('@exumas')) {
      if (m.startsWith('admin')) return 'admin'
      if (m.startsWith('gestor')) return 'gestor'
      if (m.startsWith('cliente')) return 'cliente'
      if (m.startsWith('armazem')) return 'armazem'
      if (m.startsWith('compra')) return 'compras'
      if (m.startsWith('faturacao')) return 'faturacao'
      if (m.startsWith('rotas')) return 'rotas'
      if (m.startsWith('motorista')) return 'motorista'
    }
    return 'gestor'
  }

  // === Rotina de login extraída (para form e para DEV panel) ===
  const attemptLogin = async (eEmail, ePass) => {
    setError('')
    setSubmitting(true)
    try {
      await login(eEmail, ePass)
      setAuthOk(true)
      const role = await resolveRole(eEmail)
      setTimeout(() => {
        navigate(routeByRole(role), { replace: true })
      }, 1800)
    } catch (err) {
      const msg =
        err?.message?.includes('auth/invalid-credential') ||
        err?.message?.includes('INVALID_LOGIN_CREDENTIALS')
          ? 'Credenciais inválidas.'
          : err?.message || 'Não foi possível iniciar sessão.'
      setError(msg)
      setSubmitting(false)
      setAuthOk(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    await attemptLogin(email, pass)
  }

  // === DEV container (apenas em dev / local) ===
  const showDevLogin = useMemo(() => {
    const forced = typeof window !== 'undefined' && localStorage.getItem('devLogin') === '1'
    return import.meta.env.MODE !== 'production' || forced
  }, [])

  const DEV_CREDENTIALS = [
    { key: '1', label: 'Gestor 2', role: 'gestor', email: 'gestor2@exumas.pt', pass: 'NRERGZ' },
    { key: '2', label: 'Admin 1', role: 'admin', email: 'admin1@exumas.pt', pass: 'DQ4WXF' },
    { key: '3', label: 'Armazém 1', role: 'armazem', email: 'armazem1@exumas.pt', pass: 'VP3U7F' },
    { key: '4', label: 'Faturação 1', role: 'faturacao', email: 'faturacao1@exumas.pt', pass: 'T4BBFE' },
    { key: '5', label: 'Compras 1', role: 'compras', email: 'compra1@exumas.pt', pass: '5KD8WS' },
    { key: '6', label: 'Rotas 1', role: 'rotas', email: 'rotas1@exumas.pt', pass: 'EW5WPB' },
    { key: '7', label: 'Motorista 1', role: 'motorista', email: 'motorista1@exumas.pt', pass: 'G32AR6' },
  ]

  const [devOpen, setDevOpen] = useState(false)
  const [autoLogin, setAutoLogin] = useState(true)

  const fillCred = async (cred, runNow = false) => {
    if (submitting || authOk) return
    setEmail(cred.email)
    setPass(cred.pass)
    if (autoLogin || runNow) {
      await attemptLogin(cred.email, cred.pass)
    }
  }

  // Atalhos: Alt+1..7 para preencher+entrar rapidamente
  useEffect(() => {
    if (!showDevLogin) return
    const onKey = (e) => {
      if (e.altKey) {
        const idx = parseInt(e.key, 10)
        const found = DEV_CREDENTIALS.find(c => c.key === String(idx))
        if (found) {
          e.preventDefault()
          fillCred(found, true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showDevLogin, submitting, authOk])

  return (
    <div className={`login-page ${authOk ? 'is-authenticated' : ''}`}>
      {/* Background Effects */}
      <div className="login-bg">
        <div className="login-gradient" />
        <Particles />
        <AnimatedRings />
        <GlowingOrbs />
        <div className="login-grid-pattern" />
      </div>

      {/* Main Content */}
      <div className="login-container">
        {/* Left Side - Branding */}
        <div className="login-branding">
          <div className="login-brand-content">
            <div style={{ marginBottom: '16px' }}>
              <img 
                src={logoExumas} 
                alt="Exumas Group" 
                style={{ height: '90px', width: 'auto', objectFit: 'contain' }}
              />
            </div>
            
            <p className="login-brand-tagline" style={{ fontSize: '16px', marginTop: '8px' }}>
              Sistema integrado de gestão empresarial
            </p>

            <div className="login-features">
              <div className="feature">
                <div className="feature-icon">📦</div>
                <div className="feature-text">Gestão de Encomendas</div>
              </div>
              <div className="feature">
                <div className="feature-icon">🚛</div>
                <div className="feature-text">Controlo de Rotas</div>
              </div>
              <div className="feature">
                <div className="feature-icon">📊</div>
                <div className="feature-text">Analytics em Tempo Real</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="login-form-side">
          <div className={`login-card ${submitting ? 'is-loading' : ''}`} ref={formRef}>
            <div className="card-glow" />
            
            <div className="login-header">
              <h2 className="login-title">Bem-vindo de volta</h2>
              <p className="login-subtitle">Entre na sua conta para continuar</p>
            </div>

            <form onSubmit={submit} className="login-form">
              <div className={`login-field ${focusedField === 'email' ? 'is-focused' : ''} ${email ? 'has-value' : ''}`}>
                <div className="field-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Email"
                  autoComplete="username"
                  disabled={submitting || authOk}
                />
                <div className="field-highlight" />
              </div>

              <div className={`login-field ${focusedField === 'pass' ? 'is-focused' : ''} ${pass ? 'has-value' : ''}`}>
                <div className="field-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  onFocus={() => setFocusedField('pass')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Palavra-passe"
                  autoComplete="current-password"
                  disabled={submitting || authOk}
                />
                <button
                  type="button"
                  className="field-toggle"
                  onClick={() => setShowPass((s) => !s)}
                  aria-label={showPass ? 'Ocultar' : 'Mostrar'}
                  disabled={submitting || authOk}
                >
                  {showPass ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
                <div className="field-highlight" />
              </div>

              {error && (
                <div className="login-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                className={`login-submit ${submitting ? 'is-submitting' : ''}`} 
                disabled={submitting || authOk}
              >
                <span className="btn-text">
                  {submitting ? 'A validar...' : 'Entrar'}
                </span>
                <span className="btn-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </span>
                <div className="btn-shine" />
              </button>
            </form>

            <div className="login-footer">
              <span>Powered by</span>
              <strong>Exumas Tech</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Success Overlay */}
      {authOk && (
        <div className="login-success-overlay">
          <div className="success-content">
            <div className="success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div className="success-ring" />
            </div>
            <h3>Autenticado com sucesso</h3>
            <p>A preparar o seu ambiente...</p>
            <div className="success-loader">
              <div className="loader-bar" />
            </div>
          </div>
        </div>
      )}

      {/* DEV Panel */}
      {showDevLogin && (
        <>
          <button
            type="button"
            onClick={() => setDevOpen((s) => !s)}
            className="dev-toggle"
            title="Atalhos de login (DEV)"
          >
            <span>👨‍💻</span>
            DEV
          </button>

          <div className={`dev-panel ${devOpen ? 'is-open' : ''}`}>
            <div className="dev-header">
              <strong>Atalhos de Login</strong>
              <span>Alt+1..7</span>
            </div>

            <div className="dev-options">
              <label>
                <input
                  type="checkbox"
                  checked={autoLogin}
                  onChange={() => setAutoLogin((s) => !s)}
                />
                Auto-entrar ao clicar
              </label>
            </div>

            <div className="dev-list">
              {DEV_CREDENTIALS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => fillCred(c)}
                  className="dev-cred"
                  disabled={submitting || authOk}
                >
                  <span className="cred-key">{c.key}</span>
                  <span className="cred-info">
                    <strong>{c.label}</strong>
                    <small>{c.email}</small>
                  </span>
                  <code>{c.pass}</code>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

