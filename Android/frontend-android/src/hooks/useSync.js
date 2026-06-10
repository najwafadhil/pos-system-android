// =============================================
// HOOK: useSync
// =============================================
// Custom React Hook yang mengelola sinkronisasi transaksi
// offline ke backend server.
//
// Logika Sinkronisasi:
// 1. Saat koneksi kembali online → ambil semua data dari
//    offline_transactions di Dexie.js
// 2. Kirim data ke backend via fetch (mendukung bulk)
// 3. Hapus data dari Dexie.js HANYA JIKA backend mengembalikan
//    status HTTP 200 OK
// 4. Jika gagal → tandai transaksi sebagai 'failed' untuk retry
//
// Auto-Retry Mechanism:
// - Listens to Capacitor Network plugin AND window 'online' event
// - Immediately triggers sync when connection is restored
// - Exponential backoff for failed transactions (2s, 4s, 8s, ...)
// - Max 10 retries per transaction before giving up
// - Periodic background polling every 60s as safety net
// =============================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { Network } from '@capacitor/network';
import dbManager from '../utils/indexedDB';

const API_BASE = process.env.REACT_APP_API_URL || '';

// Retry configuration
const RETRY_CONFIG = {
    initialDelayMs: 2000,       // 2 seconds initial delay
    maxDelayMs: 60000,          // 60 seconds max delay
    backoffMultiplier: 2,       // Double delay each retry
    periodicSyncIntervalMs: 60000, // Background poll every 60s
};

/**
 * Menghitung delay dengan exponential backoff.
 * @param {number} retryCount - Jumlah retry yang sudah dilakukan
 * @returns {number} Delay dalam milidetik
 */
function getRetryDelay(retryCount) {
    const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount);
    return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * Hook untuk mengelola sinkronisasi transaksi offline.
 * 
 * Fitur:
 * - Auto-sync saat koneksi kembali online (Capacitor Network + window event)
 * - Exponential backoff untuk retry transaksi gagal
 * - Periodic background sync sebagai safety net
 * - Strict HTTP 200 OK validation sebelum menghapus dari queue
 * 
 * @returns {Object} State dan fungsi sinkronisasi
 * @property {number} pendingSyncCount - Jumlah transaksi menunggu sync
 * @property {boolean} isSyncing - Apakah sedang dalam proses sync
 * @property {string|null} lastSyncError - Pesan error terakhir
 * @property {string|null} lastSyncTime - Waktu sinkronisasi terakhir
 * @property {number} syncVersion - Counter yang naik setiap sync selesai
 * @property {Function} syncNow - Fungsi untuk memicu sync manual
 * @property {Function} refreshPendingCount - Refresh jumlah pending
 */
export default function useSync() {
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncError, setLastSyncError] = useState(null);
    const [lastSyncTime, setLastSyncTime] = useState(null);
    // Counter yang naik setiap kali sync selesai.
    // Komponen lain (Dashboard, dll) bisa "watch" nilai ini
    // untuk otomatis me-refresh data tanpa reload halaman.
    const [syncVersion, setSyncVersion] = useState(0);

    // Ref untuk mencegah concurrent sync (race condition)
    const syncInProgressRef = useRef(false);
    // Ref for retry timer
    const retryTimerRef = useRef(null);
    // Ref for periodic sync interval
    const periodicSyncRef = useRef(null);
    // Ref for mounted state to prevent updates after unmount
    const isMountedRef = useRef(true);

    // =============================================
    // REFRESH PENDING COUNT
    // =============================================
    // Mengambil jumlah transaksi yang belum disinkronisasi
    // dari Dexie.js dan memperbarui state React.
    // =============================================
    const refreshPendingCount = useCallback(async () => {
        try {
            const pending = await dbManager.getPendingTransactions();
            const failed = await dbManager.getFailedTransactions();
            const totalPending = pending.length + failed.length;
            if (isMountedRef.current) {
                setPendingSyncCount(totalPending);
            }
            return totalPending;
        } catch (error) {
            console.error('Error checking pending transactions:', error);
            return 0;
        }
    }, []);

    // =============================================
    // SYNC SINGLE TRANSACTION
    // =============================================
    // Mengirim satu transaksi ke endpoint /api/transactions/sync.
    // Return true HANYA jika HTTP 200 OK, false jika gagal.
    //
    // CRITICAL: Transaksi dihapus dari IndexedDB HANYA setelah
    // menerima response.ok (HTTP 200). Jika gagal, transaksi
    // tetap berada di antrian untuk retry berikutnya.
    // =============================================
    const syncSingleTransaction = async (transaction) => {
        try {
            // Increment retry count SEBELUM mencoba sync
            await dbManager.incrementRetryCount(transaction.id);

            const headers = { 'Content-Type': 'application/json' };
            if (transaction.token) {
                headers['Authorization'] = `Bearer ${transaction.token}`;
            }

            const response = await fetch(`${API_BASE}/api/transactions/sync`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(transaction),
            });

            if (response.ok) {
                // ✅ HTTP 200 OK → SAFE to delete from IndexedDB
                // Ini adalah SATU-SATUNYA kondisi di mana transaksi dihapus.
                await dbManager.markTransactionSynced(transaction.id);
                await dbManager.deletePendingTransaction(transaction.id);
                console.log('✅ Synced & deleted:', transaction.transaction_code);
                return true;
            } else {
                // ❌ HTTP 4xx/5xx → tandai sebagai failed, JANGAN hapus
                const errorText = await response.text();
                await dbManager.markTransactionFailed(
                    transaction.id,
                    `HTTP ${response.status}: ${errorText}`
                );
                console.error('❌ Sync failed:', transaction.transaction_code, errorText);
                return false;
            }
        } catch (networkError) {
            // 🌐 Network error (offline lagi, timeout, dll)
            // Jangan hapus, biarkan retry di cycle berikutnya
            await dbManager.markTransactionFailed(
                transaction.id,
                `Network error: ${networkError.message}`
            );
            console.error('🌐 Network error syncing:', transaction.transaction_code, networkError.message);
            return false;
        }
    };

    // =============================================
    // BULK SYNC FUNCTION
    // =============================================
    // Mengirim semua transaksi pending sekaligus (bulk) ke
    // endpoint /api/transactions/sync/bulk untuk efisiensi.
    // Jika bulk endpoint gagal, fallback ke sync satu per satu.
    // =============================================
    const syncBulk = async (transactions) => {
        try {
            const response = await fetch(`${API_BASE}/api/transactions/sync/bulk`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ transactions }),
            });

            if (response.ok) {
                const result = await response.json();
                // ✅ Hapus HANYA transaksi yang berhasil (ada di synced_ids)
                for (const syncedId of (result.synced_ids || [])) {
                    await dbManager.markTransactionSynced(syncedId);
                    await dbManager.deletePendingTransaction(syncedId);
                }
                // ❌ Tandai yang gagal
                for (const failed of (result.failed || [])) {
                    await dbManager.markTransactionFailed(
                        failed.id,
                        failed.error
                    );
                }
                console.log(`✅ Bulk sync: ${result.synced_ids?.length || 0} synced, ${result.failed?.length || 0} failed`);
                return true;
            }
            return false; // Fallback ke single sync
        } catch (error) {
            console.error('Bulk sync endpoint not available, falling back to single sync');
            return false;
        }
    };

    // =============================================
    // MAIN SYNC FUNCTION
    // =============================================
    // Fungsi utama yang dipanggil saat:
    // 1. Event 'online' terdeteksi (Capacitor Network / window event)
    // 2. User menekan tombol "Sync Now" secara manual
    // 3. Periodic background timer
    //
    // Alur:
    // - Cek apakah sedang online (navigator.onLine)
    // - Cek apakah ada sync yang sedang berjalan (prevent race condition)
    // - Reset failed transactions back to pending untuk retry
    // - Ambil semua retryable transactions dari Dexie.js
    // - Coba bulk sync dulu, fallback ke single sync
    // - Schedule retry jika masih ada yang gagal
    // - Update pending count setelah selesai
    // =============================================
    const syncNow = useCallback(async () => {
        // Guard: jangan sync jika offline atau sudah ada sync berjalan
        if (!navigator.onLine) {
            console.log('⏸️ Sync skipped: browser is offline');
            return;
        }

        if (syncInProgressRef.current) {
            console.log('⏸️ Sync skipped: already in progress');
            return;
        }

        syncInProgressRef.current = true;
        if (isMountedRef.current) {
            setIsSyncing(true);
            setLastSyncError(null);
        }

        let didSync = false;
        let hasFailures = false;
        let highestRetryCount = 0;

        try {
            // Reset failed transactions back to retryable state
            await dbManager.resetFailedForRetry();

            // Ambil semua transaksi yang bisa di-retry
            const pending = await dbManager.getRetryableTransactions();

            if (pending.length === 0) {
                console.log('✅ No pending transactions to sync');
                return;
            }

            console.log(`🔄 Starting sync for ${pending.length} transactions...`);

            // Track highest retry count for backoff calculation
            highestRetryCount = Math.max(...pending.map(tx => tx.retry_count || 0));

            // Strategi: coba bulk sync dulu (lebih efisien)
            let bulkSuccess = false;
            if (pending.length > 1) {
                bulkSuccess = await syncBulk(pending);
            }

            // Jika bulk gagal atau hanya 1 transaksi → sync satu per satu
            if (!bulkSuccess) {
                let syncedCount = 0;
                let failedCount = 0;

                for (const tx of pending) {
                    const success = await syncSingleTransaction(tx);
                    if (success) {
                        syncedCount++;
                    } else {
                        failedCount++;
                    }
                }

                console.log(`📊 Sync result: ${syncedCount} synced, ${failedCount} failed`);

                if (failedCount > 0) {
                    hasFailures = true;
                    if (isMountedRef.current) {
                        setLastSyncError(`${failedCount} transaksi gagal disinkronisasi`);
                    }
                }
            }

            didSync = true;
            if (isMountedRef.current) {
                setLastSyncTime(new Date().toISOString());
            }
        } catch (error) {
            console.error('❌ Sync error:', error);
            hasFailures = true;
            if (isMountedRef.current) {
                setLastSyncError(error.message);
            }
        } finally {
            await refreshPendingCount();
            if (isMountedRef.current) {
                setIsSyncing(false);
            }
            syncInProgressRef.current = false;

            // Hanya naikkan syncVersion jika benar-benar ada transaksi yang disync.
            // Ini mencegah re-render cascading di Dashboard/Cashier saat tidak ada
            // data baru yang perlu di-refresh.
            if (didSync && isMountedRef.current) {
                setSyncVersion(v => v + 1);

                window.dispatchEvent(new CustomEvent('pos-sync-complete', {
                    detail: { timestamp: new Date().toISOString() }
                }));
            }

            // =============================================
            // SCHEDULE RETRY WITH EXPONENTIAL BACKOFF
            // =============================================
            // Jika masih ada transaksi yang gagal dan kita masih online,
            // jadwalkan retry dengan exponential backoff.
            if (hasFailures && navigator.onLine && isMountedRef.current) {
                const delay = getRetryDelay(highestRetryCount);
                console.log(`⏳ Scheduling retry in ${delay / 1000}s (retry #${highestRetryCount + 1})`);
                
                // Clear any existing retry timer
                if (retryTimerRef.current) {
                    clearTimeout(retryTimerRef.current);
                }
                retryTimerRef.current = setTimeout(() => {
                    if (isMountedRef.current && navigator.onLine) {
                        syncNow();
                    }
                }, delay);
            }
        }
    }, [refreshPendingCount]);

    // =============================================
    // AUTO-SYNC ON NETWORK RECONNECTION
    // =============================================
    // Dual listener strategy:
    // 1. Capacitor Network plugin (native, more reliable on Android)
    // 2. Window 'online' event (fallback for WebView/browser)
    //
    // Both trigger syncNow() immediately when connection is restored.
    // The syncInProgressRef guard prevents duplicate concurrent syncs.
    // =============================================
    useEffect(() => {
        isMountedRef.current = true;
        let capacitorListener = null;

        // ------------------------------------------
        // LISTENER 1: Capacitor Network Plugin (Native)
        // ------------------------------------------
        // Menggunakan Capacitor Network plugin untuk deteksi
        // native-level network changes. Lebih akurat dari
        // window.online/offline events di Android WebView.
        const setupCapacitorListener = async () => {
            try {
                capacitorListener = await Network.addListener('networkStatusChange', (status) => {
                    if (status.connected) {
                        console.log('🌐 [Capacitor] Connection restored — triggering auto-sync');
                        // Small delay to let the connection stabilize
                        setTimeout(() => {
                            if (isMountedRef.current) {
                                syncNow();
                            }
                        }, 1500);
                    } else {
                        console.log('📡 [Capacitor] Connection lost — sync paused');
                        // Cancel any pending retry timers
                        if (retryTimerRef.current) {
                            clearTimeout(retryTimerRef.current);
                            retryTimerRef.current = null;
                        }
                    }
                });
            } catch (error) {
                console.warn('⚠️ Capacitor Network plugin not available, using window events only:', error.message);
            }
        };
        setupCapacitorListener();

        // ------------------------------------------
        // LISTENER 2: Window 'online' Event (Fallback)
        // ------------------------------------------
        // Ini adalah fallback jika Capacitor Network plugin
        // tidak tersedia (misal saat development di browser).
        const handleOnline = () => {
            console.log('🌐 [Window] Connection restored — triggering auto-sync');
            setTimeout(() => {
                if (isMountedRef.current) {
                    syncNow();
                }
            }, 1500);
        };

        const handleOffline = () => {
            console.log('📡 [Window] Connection lost — sync paused');
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // ------------------------------------------
        // PERIODIC BACKGROUND SYNC (Safety Net)
        // ------------------------------------------
        // Sebagai jaring pengaman, sync dipicu secara berkala
        // setiap 60 detik. Ini menangkap kasus edge di mana
        // event online tidak terdeteksi (misalnya karena
        // reconnect yang lambat atau OS resume dari sleep).
        periodicSyncRef.current = setInterval(() => {
            if (isMountedRef.current && navigator.onLine && !syncInProgressRef.current) {
                console.log('🕐 Periodic background sync triggered');
                syncNow();
            }
        }, RETRY_CONFIG.periodicSyncIntervalMs);

        // ------------------------------------------
        // INITIAL: Refresh pending count on mount
        // ------------------------------------------
        refreshPendingCount();

        // ------------------------------------------
        // CLEANUP
        // ------------------------------------------
        return () => {
            isMountedRef.current = false;

            // Remove window listeners
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);

            // Remove Capacitor listener
            if (capacitorListener) {
                capacitorListener.remove();
            } else {
                // Fallback: remove all Network listeners if handle not captured
                try {
                    Network.removeAllListeners();
                } catch (_) {
                    // Swallow — plugin might not be available
                }
            }

            // Clear timers
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
            }
            if (periodicSyncRef.current) {
                clearInterval(periodicSyncRef.current);
            }
        };
    }, [syncNow, refreshPendingCount]);

    return {
        pendingSyncCount,
        isSyncing,
        lastSyncError,
        lastSyncTime,
        syncVersion,
        syncNow,
        refreshPendingCount,
    };
}
