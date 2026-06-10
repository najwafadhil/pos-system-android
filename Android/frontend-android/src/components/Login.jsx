import React, { useState, useEffect } from 'react';

const styles = {
  page: {
    minHeight: '100vh',
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F7F3EB',
    padding: '20px',
  },
  blob1: {
    position: 'absolute', top: '-100px', right: '-100px',
    width: '400px', height: '400px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(45,90,63,0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  blob2: {
    position: 'absolute', bottom: '-100px', left: '-100px',
    width: '400px', height: '400px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(200,168,78,0.1) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  blob3: {
    display: 'none',
  },
  card: {
    position: 'relative', zIndex: 1,
    width: '100%', maxWidth: '420px',
    background: '#ffffff',
    border: '1px solid rgba(45,90,63,0.08)',
    borderRadius: '28px',
    padding: '44px 40px',
    boxShadow: '0 20px 40px rgba(45,90,63,0.08)',
  },
  header: { textAlign: 'center', marginBottom: '36px' },
  logoBox: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '76px', height: '76px',
    background: '#2D5A3F',
    borderRadius: '22px',
    boxShadow: '0 8px 24px rgba(45,90,63,0.3)',
    marginBottom: '16px',
    fontSize: '36px',
    overflow: 'hidden',
  },
  title: { fontSize: '28px', fontWeight: 800, color: '#2D3B2D', margin: 0, letterSpacing: '-0.5px' },
  subtitle: { fontSize: '14px', color: '#6B7B6B', marginTop: '6px' },
  error: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '12px',
    padding: '12px 16px',
    color: '#7B2D3A',
    fontSize: '13px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  fieldGroup: { marginBottom: '16px' },
  label: {
    display: 'block', fontSize: '13px', fontWeight: 600,
    color: '#4b5563', marginBottom: '8px', letterSpacing: '0.02em',
  },
  input: {
    width: '100%', padding: '13px 16px',
    background: '#FDFBF7',
    border: '1px solid #D6CEBC',
    borderRadius: '12px',
    color: '#2D3B2D', fontSize: '15px',
    outline: 'none', transition: 'all 0.2s',
  },
  btn: {
    width: '100%', padding: '14px',
    background: '#2D5A3F',
    border: 'none', borderRadius: '14px',
    color: '#fff', fontSize: '15px', fontWeight: 700,
    marginTop: '8px', letterSpacing: '0.02em',
    boxShadow: '0 4px 20px rgba(45,90,63,0.3)',
    transition: 'all 0.2s', cursor: 'pointer',
  },
};

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState('');
  const abortControllerRef = React.useRef(null);
  const [logoSrc, setLogoSrc] = useState(localStorage.getItem('app_logo') || '/Logo.jpeg');

  useEffect(() => {
    const handleSettingsChange = () => {
      setLogoSrc(localStorage.getItem('app_logo') || '/Logo.jpeg');
    };
    window.addEventListener('app_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('app_settings_changed', handleSettingsChange);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // AbortController untuk timeout & cancel manual
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 detik timeout

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.success) {
        onLogin(data.token, data.user);
      } else {
        setError(data.error || 'Username atau password salah');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setError('Login dibatalkan atau server tidak merespons. Silakan coba lagi.');
      } else {
        setError('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleCancelLogin = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const inputStyle = (field) => ({
    ...styles.input,
    borderColor: focusedField === field ? '#2D5A3F' : '#D6CEBC',
    background: focusedField === field ? '#ffffff' : '#FDFBF7',
    boxShadow: focusedField === field ? '0 0 0 3px rgba(45,90,63,0.15)' : 'none',
  });

  return (
    <div style={styles.page}>
      <div style={styles.blob1} />
      <div style={styles.blob2} />
      <div style={styles.blob3} />

      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logoBox}>
            <img src={logoSrc} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.onerror = null; e.target.src = '/Logo.jpeg'; }} />
          </div>
          <h1 style={styles.title}>{localStorage.getItem('app_name') || 'RestoPOS'}</h1>
          <p style={styles.subtitle}>Sistem Kasir Restoran Digital</p>
        </div>

        {/* Error */}
        {error && (
          <div style={styles.error}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>USERNAME</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onFocus={() => setFocusedField('username')}
              onBlur={() => setFocusedField('')}
              placeholder="Masukkan username"
              required
              style={inputStyle('username')}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>PASSWORD</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField('')}
              placeholder="Masukkan password"
              required
              style={inputStyle('password')}
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            style={{
              ...styles.btn,
              opacity: loading ? 0.7 : 1,
              transform: loading ? 'scale(0.98)' : 'scale(1)',
            }}
            onMouseEnter={e => { if (!loading) e.target.style.transform = 'scale(1.02)'; }}
            onMouseLeave={e => { e.target.style.transform = 'scale(1)'; }}
          >
            {loading ? '⏳ Memproses...' : '🔐  Masuk'}
          </button>
          {loading && (
            <button
              type="button"
              onClick={handleCancelLogin}
              style={{
                width: '100%', padding: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '14px',
                color: '#dc2626', fontSize: '14px', fontWeight: 600,
                marginTop: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              ✕ Batalkan Login
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
