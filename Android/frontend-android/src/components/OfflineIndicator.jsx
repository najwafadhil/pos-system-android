// =============================================
// OFFLINE STATUS INDICATOR - Enhanced
// =============================================
// Komponen ini menampilkan status koneksi di pojok kanan atas.
// Tiga state visual:
// 1. Hijau (Online) - koneksi aktif, tidak ada pending sync
// 2. Kuning (Syncing) - online tapi ada transaksi pending
// 3. Merah (Offline) - koneksi terputus
// =============================================
import React, { useState, useEffect } from 'react';

const OfflineIndicator = ({ isOnline, pendingCount, isSyncing, onSyncNow }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showPulse, setShowPulse] = useState(false);

    // Animasi pulse saat status berubah
    useEffect(() => {
        setShowPulse(true);
        const timer = setTimeout(() => setShowPulse(false), 2000);
        return () => clearTimeout(timer);
    }, [isOnline]);

    // Auto-expand saat offline atau ada pending
    useEffect(() => {
        if (!isOnline || pendingCount > 0) {
            setIsExpanded(true);
            const timer = setTimeout(() => {
                if (isOnline && pendingCount === 0) {
                    setIsExpanded(false);
                }
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [isOnline, pendingCount]);

    // Tentukan warna dan teks berdasarkan state
    let bgColor, textColor, statusText, statusIcon;

    if (!isOnline) {
        bgColor = '#dc2626';
        textColor = '#fff';
        statusText = pendingCount > 0 ? `Offline Mode (${pendingCount} pending)` : 'Offline Mode';
        statusIcon = '📡';
    } else if (isSyncing) {
        bgColor = '#d97706';
        textColor = '#fff';
        statusText = `Syncing...`;
        statusIcon = '🔄';
    } else if (pendingCount > 0) {
        bgColor = '#f59e0b';
        textColor = '#fff';
        statusText = `${pendingCount} pending`;
        statusIcon = '⏳';
    } else {
        bgColor = '#10b981';
        textColor = '#fff';
        statusText = 'Online';
        statusIcon = '✅';
    }

    return (
        <div
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
                position: 'fixed',
                top: '12px',
                right: '12px',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: bgColor,
                color: textColor,
                padding: isExpanded ? '8px 14px' : '0',
                borderRadius: '24px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(.4,0,.2,1)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: "'Inter', 'Segoe UI', sans-serif",
                overflow: 'hidden',
                maxWidth: isExpanded ? '300px' : '12px',
                height: isExpanded ? 'auto' : '12px',
                minHeight: '12px',
                minWidth: '12px',
                userSelect: 'none',
            }}
            title={statusText}
        >
            {/* Dot indicator (selalu terlihat) */}
            {!isExpanded && (
                <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: bgColor,
                    position: 'relative',
                }}>
                    {showPulse && (
                        <div style={{
                            position: 'absolute',
                            inset: '-4px',
                            borderRadius: '50%',
                            border: `2px solid ${bgColor}`,
                            opacity: 0.5,
                            animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                        }} />
                    )}
                </div>
            )}

            {/* Expanded content */}
            {isExpanded && (
                <>
                    <span style={{ fontSize: '14px' }}>{statusIcon}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{statusText}</span>

                    {/* Tombol Sync Now (hanya tampil jika ada pending dan online) */}
                    {isOnline && pendingCount > 0 && !isSyncing && onSyncNow && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSyncNow();
                            }}
                            style={{
                                background: 'rgba(255,255,255,0.25)',
                                color: textColor,
                                border: 'none',
                                borderRadius: '12px',
                                padding: '3px 10px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Sync
                        </button>
                    )}
                </>
            )}

            {/* Keyframe animation via style tag */}
            <style>{`
                @keyframes ping {
                    75%, 100% {
                        transform: scale(2.5);
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
};

export default OfflineIndicator;
