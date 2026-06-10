// =============================================
// HOOK: useOnlineStatus (Capacitor Native Network)
// =============================================

import { useState, useEffect, useRef } from 'react';
import { Network } from '@capacitor/network';

/**
 * Hook untuk mendeteksi status online/offline menggunakan Native Capacitor.
 * 
 * @param {Object} options - Opsi konfigurasi
 * @param {Function} options.onOnline - Callback saat koneksi kembali online
 * @param {Function} options.onOffline - Callback saat koneksi terputus
 * @returns {{ isOnline: boolean }} Status koneksi saat ini
 */
export default function useOnlineStatus({ onOnline, onOffline } = {}) {
    // Default true, lalu segera diupdate setelah pengecekan Native
    const [isOnline, setIsOnline] = useState(true);

    const onOnlineRef = useRef(onOnline);
    const onOfflineRef = useRef(onOffline);

    useEffect(() => {
        onOnlineRef.current = onOnline;
        onOfflineRef.current = onOffline;
    });

    useEffect(() => {
        let listener = null;

        // Cek status awal saat hook di-mount
        const initNetworkCheck = async () => {
            const status = await Network.getStatus();
            setIsOnline(status.connected);
        };
        initNetworkCheck();

        // Daftarkan Native Network Listener
        Network.addListener('networkStatusChange', (status) => {
            if (status.connected) {
                console.log('🌐 Connection restored - Online (Native Capacitor)');
                setIsOnline(true);
                if (typeof onOnlineRef.current === 'function') {
                    onOnlineRef.current();
                }
            } else {
                console.log('📡 Connection lost - Offline (Native Capacitor)');
                setIsOnline(false);
                if (typeof onOfflineRef.current === 'function') {
                    onOfflineRef.current();
                }
            }
        }).then(handler => {
            listener = handler;
        });

        // Cleanup
        return () => {
            if (listener) {
                listener.remove();
            } else {
                Network.removeAllListeners();
            }
        };
    }, []);

    return { isOnline };
}
