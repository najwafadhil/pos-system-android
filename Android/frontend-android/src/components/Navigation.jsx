import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import dbManager from '../utils/indexedDB';

const IconCashier = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" />
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" />
    <path d="M12 12v4M10 14h4" stroke="currentColor" strokeLinecap="round" />
  </svg>
);
const IconDashboard = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" />
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" />
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" />
    <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" />
  </svg>
);
const IconMenu = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeLinecap="round" />
    <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" />
    <path d="M9 12h6M9 16h4" stroke="currentColor" strokeLinecap="round" />
  </svg>
);
const IconCustomers = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSettings = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <circle cx="12" cy="12" r="3" stroke="currentColor" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" />
  </svg>
);
const IconLogout = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeLinecap="round" />
    <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeLinecap="round" />
  </svg>
);
const IconHamburger = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
  </svg>
);

export default function Navigation({ user, onLogout }) {
  const navigate = useNavigate();
  const [appName, setAppName] = useState('RestoPOS');
  const [appLogo, setAppLogo] = useState('/Logo.jpeg');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleCloseSidebar = () => setMobileOpen(false);
    window.addEventListener('close-sidebar', handleCloseSidebar);
    return () => window.removeEventListener('close-sidebar', handleCloseSidebar);
  }, []);

  // Load settings from IndexedDB and listen for changes
  useEffect(() => {
    const loadFromDB = async () => {
      try {
        const savedName = await dbManager.getGlobalSetting('app_name');
        if (savedName) setAppName(savedName);

        const savedLogo = await dbManager.getGlobalSetting('app_logo');
        if (savedLogo) setAppLogo(savedLogo);
      } catch (err) {
        console.warn('⚠️ Navigation: Failed to load settings from IndexedDB:', err);
      }
    };

    loadFromDB();

    // Re-read from IndexedDB when settings change
    const handleSettingsChanged = () => loadFromDB();
    window.addEventListener('app_settings_changed', handleSettingsChanged);
    window.addEventListener('master-data-updated', handleSettingsChanged);
    return () => {
      window.removeEventListener('app_settings_changed', handleSettingsChanged);
      window.removeEventListener('master-data-updated', handleSettingsChanged);
    };
  }, []);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
    setMobileOpen(false);
  };

  const navItems = [
    { to: '/cashier', label: 'Kasir', icon: <IconCashier /> },
    ...(user?.role === 'admin' ? [
      { to: '/dashboard', label: 'Dashboard', icon: <IconDashboard /> },
      { to: '/menu', label: 'Menu', icon: <IconMenu /> },
      { to: '/customers', label: 'Pelanggan', icon: <IconCustomers /> },
      { to: '/settings', label: 'Pengaturan', icon: <IconSettings /> }
    ] : [])
  ];

  const navLinkStyle = (isActive, isCollapsed) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: isCollapsed ? '11px 0' : '11px 14px',
    borderRadius: '10px',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '14px',
    color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
    background: isActive ? '#C8A84E' : 'transparent',
    transition: 'all 0.18s',
    justifyContent: isCollapsed ? 'center' : 'flex-start',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  });

  const LogoArea = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, background: '#C8A84E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={appLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.onerror = null; e.target.src = '/logo192.png'; }} />
      </div>
      <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '13px', lineHeight: '1.3', wordBreak: 'break-word' }}>{appName}</span>
    </div>
  );

  return (
    <>
      {/* ===== DESKTOP SIDEBAR ===== */}
      <aside className="desktop-sidebar" style={{
        width: collapsed ? '72px' : '220px',
        minHeight: '100vh',
        background: '#2D5A3F',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s cubic-bezier(.4,0,.2,1)',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        overflow: 'hidden',
        zIndex: 40,
      }}>
        <div style={{ padding: collapsed ? '16px 0' : '16px 14px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', minHeight: '64px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, background: '#C8A84E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={appLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.onerror = null; e.target.src = '/logo192.png'; }} />
          </div>
          {!collapsed && <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '12.5px', lineHeight: '1.35', wordBreak: 'break-word', minWidth: 0, flex: 1 }}>{appName}</span>}
        </div>

        <button onClick={() => setCollapsed(c => !c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', margin: '8px 12px 0', borderRadius: '8px', transition: 'background 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}>
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.filter(i => i.to !== '/settings').map((item) => (
            <NavLink key={item.to} to={item.to} title={collapsed ? item.label : ''}
              style={({ isActive }) => navLinkStyle(isActive, collapsed)}
              onMouseEnter={e => { if (!e.currentTarget.style.background.includes('C8A84E')) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { if (!e.currentTarget.style.background.includes('C8A84E')) e.currentTarget.style.background = 'transparent'; }}>
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {user?.role === 'admin' && (
            <NavLink to="/settings" title={collapsed ? 'Pengaturan' : ''}
              style={({ isActive }) => navLinkStyle(isActive, collapsed)}
              onMouseEnter={e => { if (!e.currentTarget.style.background.includes('FC5602')) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { if (!e.currentTarget.style.background.includes('FC5602')) e.currentTarget.style.background = 'transparent'; }}>
              <span style={{ flexShrink: 0 }}><IconSettings /></span>
              {!collapsed && <span>Pengaturan</span>}
            </NavLink>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed ? '11px 0' : '11px 14px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#C8A84E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
              {(user?.full_name || user?.username || '?')[0].toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden' }}>
                <p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.full_name || user?.username}</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', textTransform: 'capitalize' }}>{user?.role}</p>
              </div>
            )}
          </div>

          <button id="nav-logout" onClick={handleLogout} title={collapsed ? 'Keluar' : ''}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: collapsed ? '11px 0' : '11px 14px', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(200,168,78,0.8)', fontWeight: 600, fontSize: '14px', transition: 'all 0.18s', justifyContent: collapsed ? 'center' : 'flex-start', whiteSpace: 'nowrap', width: '100%' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,168,78,0.15)'; e.currentTarget.style.color = '#C8A84E'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(200,168,78,0.8)'; }}>
            <span style={{ flexShrink: 0 }}><IconLogout /></span>
            {!collapsed && <span>Keluar</span>}
          </button>
        </div>
      </aside>

      {/* ===== MOBILE TOPBAR ===== */}
      <div className="mobile-topbar" style={{ display: 'none' }}>
        <LogoArea />
        <button onClick={() => {
          setMobileOpen(true);
          window.dispatchEvent(new Event('close-mobile-cart'));
        }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
          <IconHamburger />
        </button>
      </div>

      {/* ===== MOBILE SLIDE DRAWER ===== */}
      {mobileOpen && <div className="sidebar-overlay active" onClick={() => setMobileOpen(false)} />}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: '240px', background: '#2D5A3F', zIndex: 60,
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <LogoArea />
          <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', lineHeight: 1, cursor: 'pointer', padding: '4px' }}>✕</button>
        </div>
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
              style={({ isActive }) => navLinkStyle(isActive, false)}>
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', marginBottom: '4px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#C8A84E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '13px' }}>
              {(user?.full_name || user?.username || '?')[0].toUpperCase()}
            </div>
            <div>
              <p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 600 }}>{user?.full_name || user?.username}</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', textTransform: 'capitalize' }}>{user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(200,168,78,0.8)', fontWeight: 600, fontSize: '14px', width: '100%' }}>
            <IconLogout /><span>Keluar</span>
          </button>
        </div>
      </div>

      {/* ===== MOBILE BOTTOM NAV (hidden when sidebar open) ===== */}
      <nav className="mobile-bottom-nav" style={{ display: mobileOpen ? 'none' : undefined }}>
        {navItems.filter(i => i.to !== '/settings').map(item => (
          <NavLink key={item.to} to={item.to}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              color: isActive ? '#C8A84E' : 'rgba(255,255,255,0.45)',
              textDecoration: 'none', fontSize: '10px', fontWeight: 600,
              padding: '4px 8px', minWidth: '48px',
            })}>
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink to="/settings"
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              color: isActive ? '#C8A84E' : 'rgba(255,255,255,0.45)',
              textDecoration: 'none', fontSize: '10px', fontWeight: 600,
              padding: '4px 8px', minWidth: '48px',
            })}>
            <IconSettings />
            <span>Setting</span>
          </NavLink>
        )}
      </nav>
    </>
  );
}
