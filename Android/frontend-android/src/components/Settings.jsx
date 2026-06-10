import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor, registerPlugin } from '@capacitor/core';

const EscPosPrinterPlugin = registerPlugin('EscPosPrinter');

// =============================================
// HELPER: Compress & resize image before storing
// =============================================
const compressImage = (dataUrl, maxSize = 200, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
      } else {
        if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

// Maksimal ukuran file logo (10MB)
const MAX_LOGO_SIZE = 10 * 1024 * 1024;

export default function Settings() {
  const navigate = useNavigate();
  const [appName, setAppName] = useState(localStorage.getItem('app_name') || 'RestoPOS');
  const [logoPreview, setLogoPreview] = useState(localStorage.getItem('app_logo') || null);
  const [logoFile, setLogoFile] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [checkingSync, setCheckingSync] = useState(false);
  const fileInputRef = useRef(null);

  // Bluetooth State
  const [isNative, setIsNative] = useState(false);
  const [btDevices, setBtDevices] = useState([]);
  const [selectedBtPrinter, setSelectedBtPrinter] = useState(localStorage.getItem('bt_printer_mac') || '');
  const [scanningBt, setScanningBt] = useState(false);
  const [btError, setBtError] = useState('');

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  const scanBluetoothPrinters = async () => {
    setScanningBt(true);
    setBtError('');
    setBtDevices([]);
    try {
      const result = await EscPosPrinterPlugin.listBluetoothDevices();
      const devices = result.devices || [];
      setBtDevices(devices);
      if (devices.length === 0) setBtError('Tidak ada perangkat Bluetooth printer yang pernah dipasangkan (paired).');
    } catch (err) {
      setBtError('Gagal memindai Bluetooth: ' + (err.message || JSON.stringify(err)));
    } finally {
      setScanningBt(false);
    }
  };

  const handleSelectPrinter = (macAddress) => {
    setSelectedBtPrinter(macAddress);
  };

  const checkSyncStatus = async () => {
    setCheckingSync(true);
    const API_BASE = process.env.REACT_APP_API_URL || '';
    try {
      const res = await fetch(`${API_BASE}/api/sync/status`, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data.data || []);
      } else {
        setSyncStatus('error');
      }
    } catch (e) {
      setSyncStatus('error');
    } finally {
      setCheckingSync(false);
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validasi ukuran file
    if (file.size > MAX_LOGO_SIZE) {
      setError(`Ukuran file terlalu besar (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimal 10MB.`);
      e.target.value = '';
      return;
    }

    setError('');
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setError('');
    try {
      if (appName.trim()) localStorage.setItem('app_name', appName.trim());
      if (logoPreview && logoFile) {
        const compressed = await compressImage(logoPreview);
        localStorage.setItem('app_logo', compressed);
        setLogoPreview(compressed);
        // Update favicon dynamically
        const link = document.querySelector("link[rel='icon']") || document.createElement('link');
        link.rel = 'icon';
        link.href = compressed;
        document.head.appendChild(link);
      }
      
      if (selectedBtPrinter) {
        localStorage.setItem('bt_printer_mac', selectedBtPrinter);
      } else {
        localStorage.removeItem('bt_printer_mac');
      }

      window.dispatchEvent(new Event('app_settings_changed'));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Save settings error:', err);
      setError('Gagal menyimpan logo. Coba gunakan gambar dengan ukuran lebih kecil.');
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    localStorage.removeItem('app_logo');
    // Reset favicon to default
    const link = document.querySelector("link[rel='icon']");
    if (link) link.href = '/Logo.jpeg';
    window.dispatchEvent(new Event('app_settings_changed'));
  };

  const card = {
    background: '#fff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
    padding: '28px',
    marginBottom: '20px',
  };

  const label = {
    display: 'block', fontSize: '12px', fontWeight: 700, color: '#555',
    marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em',
  };

  const inp = {
    width: '100%', padding: '12px 16px', border: '1.5px solid #e2e8f0',
    borderRadius: '10px', fontSize: '15px', outline: 'none',
    color: '#2D3B2D', background: '#fff', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ marginBottom: '28px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '0 0 8px 0' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Kembali
        </button>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D3B2D', margin: 0 }}>Pengaturan</h1>
        <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>Kustomisasi tampilan aplikasi</p>
      </div>

      {saved && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#dcfce7', color: '#16a34a', borderRadius: '10px', fontWeight: 600, fontSize: '14px', border: '1px solid #86efac' }}>
          ✅ Pengaturan berhasil disimpan!
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#fef2f2', color: '#dc2626', borderRadius: '10px', fontWeight: 600, fontSize: '14px', border: '1px solid #fecaca' }}>
          ⚠️ {error}
        </div>
      )}

      {/* App Name */}
      <div style={card}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#2D3B2D', marginTop: 0, marginBottom: '16px' }}>🏷️ Nama Aplikasi</h2>
        <label style={label}>Nama Resto / Aplikasi</label>
        <input
          type="text"
          value={appName}
          onChange={e => setAppName(e.target.value)}
          placeholder="Contoh: Warung Bahagia"
          style={inp}
          onFocus={e => e.target.style.borderColor = '#2D5A3F'}
          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
        />
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#aaa' }}>Nama ini akan tampil di sidebar kiri aplikasi.</p>
      </div>

      {/* Logo */}
      <div style={card}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#2D3B2D', marginTop: 0, marginBottom: '16px' }}>🖼️ Logo Restoran</h2>
        <label style={label}>Upload Logo</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Preview */}
          <div style={{ width: '80px', height: '80px', borderRadius: '14px', overflow: 'hidden', background: '#2D3B2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid #e2e8f0' }}>
            {logoPreview ? (
              <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '30px' }}>🍽️</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => fileInputRef.current.click()}
                style={{ padding: '9px 18px', background: '#2D5A3F', color: '#fff', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                📂 Pilih Gambar
              </button>
              {logoPreview && (
                <button
                  onClick={handleRemoveLogo}
                  style={{ padding: '9px 16px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '9px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  Hapus Logo
                </button>
              )}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#aaa' }}>Format: PNG, JPG, atau WEBP. Maksimal <strong style={{ color: '#2D5A3F' }}>10MB</strong>. Disarankan ukuran 200×200px.</p>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} style={{ display: 'none' }} />
      </div>

      {/* Sync Status Check */}
      <div style={card}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#2D3B2D', marginTop: 0, marginBottom: '16px' }}>🔄 Status Sinkronisasi Data</h2>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#555' }}>
          Gunakan fitur ini untuk memastikan apakah data transaksi offline Anda telah berhasil dikirim ke server.
        </p>
        <button
          onClick={checkSyncStatus}
          disabled={checkingSync}
          style={{ padding: '9px 18px', background: checkingSync ? '#e2e8f0' : '#2D5A3F', color: checkingSync ? '#94a3b8' : '#fff', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '13px', cursor: checkingSync ? 'not-allowed' : 'pointer', marginBottom: '16px' }}
        >
          {checkingSync ? '⏳ Memeriksa...' : '🔍 Cek Status Terkini'}
        </button>

        {syncStatus === 'error' && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
            ❌ Gagal terhubung ke server. Pastikan koneksi internet aktif.
          </div>
        )}

        {Array.isArray(syncStatus) && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px', color: '#64748b', fontWeight: 600 }}>Waktu</th>
                  <th style={{ padding: '10px', color: '#64748b', fontWeight: 600 }}>Kode Transaksi</th>
                  <th style={{ padding: '10px', color: '#64748b', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {syncStatus.length === 0 ? (
                  <tr><td colSpan="3" style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>Belum ada log sinkronisasi.</td></tr>
                ) : (
                  syncStatus.slice(0, 5).map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', color: '#334155' }}>{new Date(log.attempted_at).toLocaleString('id-ID')}</td>
                      <td style={{ padding: '10px', color: '#334155', fontWeight: 600 }}>{log.transaction_code || '-'}</td>
                      <td style={{ padding: '10px' }}>
                        {log.status === 'success' 
                          ? <span style={{ color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '11px' }}>✅ Berhasil</span>
                          : <span style={{ color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '11px' }}>❌ Gagal</span>
                        }
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {syncStatus.length > 5 && (
              <div style={{ padding: '8px', textAlign: 'center', background: '#f8fafc', color: '#64748b', fontSize: '11px' }}>
                Menampilkan 5 log terakhir
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bluetooth Printer (Native Only) */}
      {isNative && (
        <div style={card}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#2D3B2D', marginTop: 0, marginBottom: '16px' }}>🖨️ Printer Bluetooth (Native Android)</h2>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#555' }}>
            Hubungkan langsung ke printer kasir (Pastikan printer sudah di-pairing dengan HP Anda).
          </p>
          <button
            onClick={scanBluetoothPrinters}
            disabled={scanningBt}
            style={{ padding: '9px 18px', background: scanningBt ? '#e2e8f0' : '#2D5A3F', color: scanningBt ? '#94a3b8' : '#fff', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '13px', cursor: scanningBt ? 'not-allowed' : 'pointer', marginBottom: '16px' }}
          >
            {scanningBt ? '⏳ Mencari...' : '🔍 Cari Printer'}
          </button>

          {btError && (
            <div style={{ marginBottom: '12px', padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
              {btError}
            </div>
          )}

          {btDevices.length > 0 && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
              {btDevices.map(device => (
                <div 
                  key={device.address} 
                  onClick={() => handleSelectPrinter(device.address)}
                  style={{ 
                    padding: '12px', 
                    borderBottom: '1px solid #f1f5f9', 
                    cursor: 'pointer',
                    background: selectedBtPrinter === device.address ? '#eaf2ec' : '#fff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#334155' }}>{device.name || 'Unknown Device'}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{device.address}</div>
                  </div>
                  {selectedBtPrinter === device.address && <span style={{ color: '#2D5A3F', fontWeight: 800 }}>✓ Aktif</span>}
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '16px' }}>
            <label style={label}>Atau Masukkan MAC Address Manual</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="00:11:22:33:44:55"
                value={selectedBtPrinter}
                onChange={e => setSelectedBtPrinter(e.target.value.toUpperCase())}
                style={{ ...inp, flex: 1, textTransform: 'uppercase' }}
              />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#aaa' }}>Jika printer tidak terdeteksi, lihat MAC Address pada halaman pengaturan Bluetooth HP Anda lalu ketik manual di sini.</p>
          </div>
        </div>
      )}

      {/* Android App Download */}
      <div style={card}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#2D3B2D', marginTop: 0, marginBottom: '16px' }}>📱 Aplikasi Android (APK)</h2>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#555' }}>
          Unduh aplikasi kasir ini dalam format Android (.apk) agar tidak perlu membuka browser. Mendukung fitur pencetakan Bluetooth Native.
        </p>
        <a 
          href={`\${process.env.REACT_APP_API_URL || ""}/api/downloads/pos-resto.apk`} 
          download 
          style={{ display: 'inline-block', padding: '10px 20px', background: '#C8A84E', color: '#fff', textDecoration: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(200,168,78,0.3)', transition: 'transform 0.2s' }}
        >
          ⬇️ Download APK Android
        </a>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        style={{ width: '100%', padding: '14px', background: '#2D5A3F', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '15px', cursor: 'pointer', boxShadow: '0 6px 20px rgba(45,90,63,0.35)', transition: 'all 0.2s' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      >
        💾 Simpan Pengaturan
      </button>
    </div>
  );
}
