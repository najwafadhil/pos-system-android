// =============================================
// PAGE LOADER COMPONENT
// =============================================
// Loading screen premium yang tampil saat berpindah halaman.
// Menampilkan logo restoran + animasi yang sesuai tema aplikasi.
// Memberikan waktu agar semua komponen dan data halaman
// siap sebelum ditampilkan ke user.
// =============================================

import React, { useState, useEffect } from 'react';

// Daftar pesan loading yang ditampilkan secara acak
const loadingMessages = [
  'Menyiapkan halaman...',
  'Memuat komponen...',
  'Hampir siap...',
  'Mengatur tampilan...',
  'Sedang memproses...',
];

export default function PageLoader() {
  const [logoSrc] = useState(() => localStorage.getItem('app_logo') || '/Logo.jpeg');
  const [appName] = useState(() => localStorage.getItem('app_name') || 'RestoPOS');
  const [message] = useState(() => loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
  const [progress, setProgress] = useState(0);

  // Animasi progress bar simulasi
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        // Kecepatan progres melambat seiring mendekati 100
        const increment = Math.max(1, Math.floor((100 - prev) / 5));
        return Math.min(90, prev + increment);
      });
    }, 80);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={styles.container}>
      {/* Background decorative elements */}
      <div style={styles.bgPattern} />
      <div style={styles.bgGlow1} />
      <div style={styles.bgGlow2} />

      {/* Main content */}
      <div style={styles.content}>
        {/* Logo with animated rings */}
        <div style={styles.logoWrapper}>
          {/* Outer pulsing ring */}
          <div style={styles.pulseRingOuter} />
          {/* Inner spinning ring */}
          <div style={styles.spinRing} />
          {/* Logo */}
          <div style={styles.logoBox}>
            <img
              src={logoSrc}
              alt="Logo"
              style={styles.logoImg}
              onError={(e) => { e.target.onerror = null; e.target.src = '/Logo.jpeg'; }}
            />
          </div>
        </div>

        {/* App name */}
        <h2 style={styles.appName}>{appName}</h2>

        {/* Loading message */}
        <p style={styles.message}>{message}</p>

        {/* Progress bar */}
        <div style={styles.progressContainer}>
          <div style={styles.progressTrack}>
            <div style={{
              ...styles.progressBar,
              width: `${progress}%`,
            }} />
            <div style={styles.progressShimmer} />
          </div>
        </div>

        {/* Animated dots */}
        <div style={styles.dotsContainer}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                ...styles.dot,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pageLoaderPulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.1; }
        }
        @keyframes pageLoaderSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pageLoaderFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pageLoaderDotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes pageLoaderShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes pageLoaderFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

// =============================================
// STYLES
// =============================================
const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F7F3EB',
    zIndex: 9999,
    overflow: 'hidden',
    animation: 'pageLoaderFadeIn 0.3s ease-out',
  },
  bgPattern: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `radial-gradient(circle at 20% 50%, rgba(45, 90, 63, 0.03) 0%, transparent 50%),
                       radial-gradient(circle at 80% 20%, rgba(200, 168, 78, 0.04) 0%, transparent 50%),
                       radial-gradient(circle at 50% 80%, rgba(45, 90, 63, 0.02) 0%, transparent 50%)`,
    pointerEvents: 'none',
  },
  bgGlow1: {
    position: 'absolute',
    top: '-20%',
    right: '-10%',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(45,90,63,0.06) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: '-15%',
    left: '-10%',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(200,168,78,0.05) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0px',
    animation: 'pageLoaderFadeIn 0.4s ease-out 0.1s both',
  },
  logoWrapper: {
    position: 'relative',
    width: '100px',
    height: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
    animation: 'pageLoaderFloat 2.5s ease-in-out infinite',
  },
  pulseRingOuter: {
    position: 'absolute',
    inset: '-8px',
    borderRadius: '50%',
    border: '2px solid rgba(45, 90, 63, 0.15)',
    animation: 'pageLoaderPulse 2s ease-in-out infinite',
  },
  spinRing: {
    position: 'absolute',
    inset: '-4px',
    borderRadius: '50%',
    border: '3px solid transparent',
    borderTopColor: '#2D5A3F',
    borderRightColor: '#C8A84E',
    animation: 'pageLoaderSpin 1.2s linear infinite',
  },
  logoBox: {
    width: '72px',
    height: '72px',
    borderRadius: '20px',
    overflow: 'hidden',
    background: '#2D5A3F',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 32px rgba(45, 90, 63, 0.25), 0 2px 8px rgba(45, 90, 63, 0.15)',
  },
  logoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  appName: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#2D3B2D',
    margin: '0 0 6px 0',
    letterSpacing: '-0.3px',
    textAlign: 'center',
    animation: 'pageLoaderFadeIn 0.5s ease-out 0.2s both',
  },
  message: {
    fontSize: '14px',
    color: '#6B7B6B',
    margin: '0 0 24px 0',
    fontWeight: 500,
    textAlign: 'center',
    animation: 'pageLoaderFadeIn 0.5s ease-out 0.3s both',
  },
  progressContainer: {
    width: '200px',
    marginBottom: '20px',
    animation: 'pageLoaderFadeIn 0.5s ease-out 0.4s both',
  },
  progressTrack: {
    width: '100%',
    height: '4px',
    background: 'rgba(45, 90, 63, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    background: 'linear-gradient(90deg, #2D5A3F, #C8A84E)',
    borderRadius: '2px',
    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  progressShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '50%',
    height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
    animation: 'pageLoaderShimmer 1.5s ease-in-out infinite',
  },
  dotsContainer: {
    display: 'flex',
    gap: '8px',
    animation: 'pageLoaderFadeIn 0.5s ease-out 0.5s both',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#2D5A3F',
    animation: 'pageLoaderDotBounce 1.2s ease-in-out infinite',
  },
};
