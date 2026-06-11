// =============================================
// APP.JS - Main Application Entry Point
// =============================================
// Arsitektur Offline-First:
// 1. useOnlineStatus hook mendeteksi koneksi secara real-time
// 2. useSync hook mengelola sinkronisasi transaksi pending
// 3. Service Worker menyimpan aset statis untuk akses offline
// 4. Dexie.js (IndexedDB) menyimpan transaksi saat offline
// =============================================

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import dbManager from './utils/indexedDB';

import useOnlineStatus from './hooks/useOnlineStatus';
import useSync from './hooks/useSync';
import { lazyWithDelay } from './utils/lazyImport';
import PageLoader from './components/PageLoader';

// Komponen yang dimuat langsung (kecil, selalu dibutuhkan)
import Login from './components/Login';
import OfflineIndicator from './components/OfflineIndicator';
import Navigation from './components/Navigation';

// =============================================
// LAZY-LOADED PAGE COMPONENTS
// =============================================
// Setiap halaman di-lazy load sehingga PageLoader tampil
// saat user berpindah halaman. Ini memberi waktu agar
// semua komponen dan fungsi di halaman siap sebelum tampil.
// =============================================
const Cashier = lazyWithDelay(() => import('./components/Cashier'));
const MenuManagement = lazyWithDelay(() => import('./components/MenuManagement'));
const Dashboard = lazyWithDelay(() => import('./components/Dashboard'));
const Settings = lazyWithDelay(() => import('./components/Settings'));
const Customers = lazyWithDelay(() => import('./components/Customers'));



function ProtectedRoute({ children, isAuthenticated, user, allowedRoles }) {
  // PENTING: Jika belum login, langsung redirect tanpa render children
  if (!isAuthenticated) return <Navigate to='/login' replace />;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Jika tidak memiliki akses, arahkan kasir ke halaman /cashier
    return <Navigate to='/cashier' replace />;
  }
  return children;
}

export default function App() {
  // =============================================
  // AUTH STATE - Cek session storage SEBELUM render apapun
  // =============================================
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  // Jalankan pengecekan auth sekali saat mount
  useEffect(() => {
    try {
      const token = localStorage.getItem('auth_token');
      const userData = localStorage.getItem('user_data');
      if (token && userData) {
        setIsAuthenticated(true);
        setUser(JSON.parse(userData));
      }
    } catch (e) {
      console.error('Auth check failed:', e);
    }
    // Inisialisasi favicon dari IndexedDB jika ada logo yang sudah disimpan
    const initFavicon = async () => {
      try {
        const savedLogo = await dbManager.getGlobalSetting('app_logo');
        if (savedLogo) {
          const link = document.querySelector("link[rel='icon']") || document.createElement('link');
          link.rel = 'icon';
          link.href = savedLogo;
          document.head.appendChild(link);
        }
      } catch (_) {}
    };
    initFavicon();
    // Tandai auth sudah dicek, baru boleh render routes
    setAuthReady(true);
  }, []);

  // =============================================
  // SYNC HOOK - Mengelola sinkronisasi transaksi offline
  // =============================================
  const {
    pendingSyncCount,
    isSyncing,
    lastSyncError,
    syncVersion,
    syncNow,
    refreshPendingCount,
    fetchMasterData,
  } = useSync();

  // =============================================
  // ONLINE STATUS HOOK - Deteksi koneksi real-time
  // =============================================
  // Saat koneksi kembali online → otomatis trigger sinkronisasi
  // Saat koneksi terputus → hanya update UI state
  // =============================================
  const handleOnline = useCallback(() => {
    console.log('🌐 Connection restored! Starting sync...');
    syncNow();
  }, [syncNow]);

  const handleOffline = useCallback(() => {
    console.log('📡 Connection lost. Transactions will be queued offline.');
  }, []);

  const { isOnline } = useOnlineStatus({
    onOnline: handleOnline,
    onOffline: handleOffline,
  });

  // =============================================
  // INITIALIZATION
  // =============================================
  // Saat app dimuat:
  // 1. Inisialisasi Dexie.js database
  // 2. Cek jumlah transaksi pending
  // 3. Listen pesan dari Service Worker (sync complete)
  // =============================================
  useEffect(() => {
    // Inisialisasi Dexie database
    dbManager.init()
      .then(() => {
        console.log('✅ Dexie database ready');
        dbManager.clearSyncedTransactions(); // Bersihkan sisa data tersinkronisasi
        refreshPendingCount();
      })
      .catch((err) => {
        console.error('❌ Dexie init failed:', err);
      });

    return () => {

    };
  }, [refreshPendingCount]);

  // =============================================
  // AUTH HANDLERS
  // =============================================
  const handleLogin = useCallback((token, userData) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  // =============================================
  // SAFARI IOS VIEWPORT FIX
  // =============================================
  useEffect(() => {
    const setAppHeight = () => {
      const h = window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    
    return () => {
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
    };
  }, []);

  // =============================================
  // LOADING GUARD - Jangan render apapun sebelum auth dicek
  // =============================================
  // Ini mencegah blinking/flash karena Cashier atau komponen
  // lain sempat render sebelum redirect ke /login terjadi
  // =============================================
  if (!authReady) {
    return <PageLoader />;
  }

  return (
    <Router>
      <div className='app-shell' style={{ background: '#F7F3EB' }}>
        {/* Global Toast Notification Provider */}
        <Toaster
          position="top-center"
          reverseOrder={false}
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '12px',
              background: '#282828',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              padding: '12px 20px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            },
            success: {
              iconTheme: { primary: '#2D5A3F', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#dc2626', secondary: '#fff' },
            },
          }}
        />
        {isAuthenticated && <Navigation user={user} onLogout={handleLogout} />}
        <div className='app-content-wrapper'>
          <OfflineIndicator
            isOnline={isOnline}
            pendingCount={pendingSyncCount}
            isSyncing={isSyncing}
            onSyncNow={syncNow}
          />
          {/* Error banner untuk sync error */}
          {lastSyncError && (
            <div style={{
              background: '#fef2f2',
              color: '#dc2626',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderBottom: '1px solid #fecaca',
              textAlign: 'center',
            }}>
              ⚠️ Sync Error: {lastSyncError}
            </div>
          )}
          <div className='main-content-area'>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path='/login' element={isAuthenticated ? <Navigate to='/cashier' replace /> : <Login onLogin={handleLogin} />} />
                <Route path='/cashier' element={<ProtectedRoute isAuthenticated={isAuthenticated} user={user} allowedRoles={['admin', 'cashier']}><Cashier isOnline={isOnline} onSyncUpdate={refreshPendingCount} syncVersion={syncVersion} /></ProtectedRoute>} />
                <Route path='/menu' element={<ProtectedRoute isAuthenticated={isAuthenticated} user={user} allowedRoles={['admin']}><MenuManagement isOnline={isOnline} /></ProtectedRoute>} />
                <Route path='/dashboard' element={<ProtectedRoute isAuthenticated={isAuthenticated} user={user} allowedRoles={['admin']}><Dashboard isOnline={isOnline} syncVersion={syncVersion} /></ProtectedRoute>} />
                <Route path='/settings' element={<ProtectedRoute isAuthenticated={isAuthenticated} user={user} allowedRoles={['admin']}><Settings /></ProtectedRoute>} />
                <Route path='/customers' element={<ProtectedRoute isAuthenticated={isAuthenticated} user={user} allowedRoles={['admin']}><Customers isOnline={isOnline} syncVersion={syncVersion} /></ProtectedRoute>} />
                {/* Catch-all: semua path yang tidak dikenal → redirect ke /login */}
                <Route path='*' element={<Navigate to={isAuthenticated ? '/cashier' : '/login'} replace />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </div>
    </Router>
  );
}
