// =============================================
// HOOK: useSync
// =============================================
// Custom React Hook yang mengelola sinkronisasi transaksi
// offline ke backend server DAN master data (categories, settings).
//
// Logika Sinkronisasi:
// 1. Saat koneksi kembali online → ambil semua data dari
//    offline_transactions di Dexie.js
// 2. Kirim data ke backend via fetch (mendukung bulk)
// 3. Hapus data dari Dexie.js HANYA JIKA backend mengembalikan
//    status HTTP 200 OK
// 4. Jika gagal → tandai transaksi sebagai 'failed' untuk retry
//
// Master Data Sync:
// - fetchMasterData() dijalankan saat app boot (online)
// - Mengambil categories dan global settings dari server
// - Disimpan ke IndexedDB sebagai cache offline
// - Dispatch event 'master-data-updated' agar komponen lain refresh
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
 * Hook untuk mengelola sinkronisasi transaksi offline dan master data.
 * 
 * Fitur:
 * - Auto-sync saat koneksi kembali online (Capacitor Network + window event)
 * - Exponential backoff untuk retry transaksi gagal
 * - Periodic background sync sebagai safety net
 * - Strict HTTP 200 OK validation sebelum menghapus dari queue
 * - fetchMasterData: sinkronisasi categories & settings dari server
 * 
 * @returns {Object} State dan fungsi sinkronisasi
 * @property {number} pendingSyncCount - Jumlah transaksi menunggu sync
 * @property {boolean} isSyncing - Apakah sedang dalam proses sync
 * @property {string|null} lastSyncError - Pesan error terakhir
 * @property {string|null} lastSyncTime - Waktu sinkronisasi terakhir
 * @property {number} syncVersion - Counter yang naik setiap sync selesai
 * @property {Function} syncNow - Fungsi untuk memicu sync manual
 * @property {Function} refreshPendingCount - Refresh jumlah pending
 * @property {Function} fetchMasterData - Fetch categories & settings dari server
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
    // Ref to prevent concurrent master data fetch
    const masterDataFetchingRef = useRef(false);
    // Ref to track if localStorage migration has been attempted
    const migrationDoneRef = useRef(false);
    // Ref for Web Worker instance (Phase 4: offload heavy sync to background thread)
    const workerRef = useRef(null);

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
    // FETCH MASTER DATA (Categories & Settings)
    // =============================================
    // Mengambil data master dari server dan menyimpan ke IndexedDB.
    // Dipanggil saat:
    // 1. App boot (saat online)
    // 2. Network reconnection
    // 3. Manual refresh dari komponen
    //
    // Juga menjalankan one-time migration dari localStorage
    // ke server API jika data lokal ada tapi server belum punya.
    // =============================================
    const fetchMasterData = useCallback(async () => {
        if (!navigator.onLine) {
            console.log('⏸️ Master data fetch skipped: browser is offline');
            return;
        }

        if (masterDataFetchingRef.current) {
            console.log('⏸️ Master data fetch skipped: already in progress');
            return;
        }

        masterDataFetchingRef.current = true;
        const authToken = localStorage.getItem('auth_token');
        if (!authToken) {
            masterDataFetchingRef.current = false;
            return;
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
        };

        try {
            // ── ONE-TIME MIGRATION from localStorage → API ──
            // Hanya dijalankan sekali per session app.
            if (!migrationDoneRef.current) {
                migrationDoneRef.current = true;
                try {
                    // Migrate categories
                    const localCats = localStorage.getItem('pos_custom_categories');
                    if (localCats) {
                        const parsed = JSON.parse(localCats);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            console.log('🔄 Migrating localStorage categories to server...');
                            for (const catName of parsed) {
                                try {
                                    await fetch(`${API_BASE}/api/categories`, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify({ action: 'create', name: catName }),
                                    });
                                } catch (_) { /* ignore individual failures */ }
                            }
                            // Remove localStorage entry after migration
                            localStorage.removeItem('pos_custom_categories');
                            console.log('✅ Categories migration complete');
                        }
                    }

                    // Migrate app_name
                    const localAppName = localStorage.getItem('app_name');
                    if (localAppName) {
                        try {
                            await fetch(`${API_BASE}/api/settings`, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify({ key: 'app_name', value: localAppName }),
                            });
                            localStorage.removeItem('app_name');
                            console.log('✅ app_name migration complete');
                        } catch (_) { /* ignore */ }
                    }

                    // Migrate app_logo
                    const localAppLogo = localStorage.getItem('app_logo');
                    if (localAppLogo) {
                        try {
                            await fetch(`${API_BASE}/api/settings`, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify({ key: 'app_logo', value: localAppLogo }),
                            });
                            localStorage.removeItem('app_logo');
                            console.log('✅ app_logo migration complete');
                        } catch (_) { /* ignore */ }
                    }
                } catch (migrationError) {
                    console.warn('⚠️ localStorage migration error (non-fatal):', migrationError.message);
                }
            }

            // ── FETCH CATEGORIES ──
            try {
                const catRes = await fetch(`${API_BASE}/api/categories`, { headers });
                if (catRes.ok) {
                    const catData = await catRes.json();
                    if (catData.success && Array.isArray(catData.data)) {
                        await dbManager.saveCategories(catData.data);
                        console.log('✅ Categories synced:', catData.data.length);
                    }
                }
            } catch (catError) {
                console.warn('⚠️ Failed to fetch categories:', catError.message);
            }

            // ── FETCH GLOBAL SETTINGS ──
            try {
                const settingsRes = await fetch(`${API_BASE}/api/settings`, { headers });
                if (settingsRes.ok) {
                    const settingsData = await settingsRes.json();
                    if (settingsData.success && Array.isArray(settingsData.data)) {
                        for (const setting of settingsData.data) {
                            await dbManager.saveGlobalSetting(setting.key, setting.value);
                        }
                        console.log('✅ Global settings synced:', settingsData.data.length);
                    }
                }
            } catch (settingsError) {
                console.warn('⚠️ Failed to fetch settings:', settingsError.message);
            }

            // ── DISPATCH EVENT ──
            // Notify semua komponen bahwa master data sudah diperbarui
            window.dispatchEvent(new CustomEvent('master-data-updated', {
                detail: { timestamp: new Date().toISOString() }
            }));

        } catch (error) {
            console.error('❌ fetchMasterData error:', error);
        } finally {
            masterDataFetchingRef.current = false;
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
    // BULK SYNC VIA WEB WORKER (Phase 4)
    // =============================================
    // Offloads JSON.stringify + fetch to a background thread.
    // The worker chunks transactions into batches of 50 and
    // sends them sequentially. For each batch, it reports back
    // synced/failed IDs so Dexie can be updated progressively
    // on the main thread (partial success handling).
    //
    // IMPORTANT: Dexie (IndexedDB) operations stay on the main
    // thread to avoid Capacitor/WebView locking issues.
    //
    // SAFETY:
    // - 30s timeout prevents hanging if Android OS suspends the worker
    // - BULK_NOT_FOUND handling gracefully falls back to single sync
    //   if the /bulk endpoint returns 404
    // =============================================
    const WORKER_TIMEOUT_MS = 30000; // 30 seconds

    const syncBulk = (transactions) => {
        return new Promise((resolve) => {
            const worker = workerRef.current;

            // If worker is not available, fallback immediately
            if (!worker) {
                console.warn('\u26a0\ufe0f Web Worker not available, falling back to single sync');
                resolve(false);
                return;
            }

            let totalSynced = 0;
            let totalFailed = 0;
            let settled = false;

            // --- Fix 2: Timeout guard ---
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                worker.removeEventListener('message', handleMessage);
                console.error('\u23f0 Worker sync timed out after 30s. Terminating and restarting worker.');

                // Terminate the stuck worker and create a fresh one
                try {
                    worker.terminate();
                    workerRef.current = new Worker(
                        new URL('../workers/sync.worker.js', import.meta.url)
                    );
                    console.log('\u2705 Sync Web Worker restarted after timeout');
                } catch (restartErr) {
                    console.warn('\u26a0\ufe0f Worker restart failed:', restartErr.message);
                    workerRef.current = null;
                }

                // Resolve false so syncNow falls back to single sync
                resolve(false);
            }, WORKER_TIMEOUT_MS);

            const handleMessage = async (event) => {
                const msg = event.data;

                if (msg.type === 'CHUNK_RESULT') {
                    const { synced_ids, failed } = msg.payload;

                    // \u2705 Process synced transactions on main thread (Dexie)
                    for (const syncedId of synced_ids) {
                        try {
                            await dbManager.markTransactionSynced(syncedId);
                            await dbManager.deletePendingTransaction(syncedId);
                            totalSynced++;
                        } catch (dbErr) {
                            console.error('\u274c Dexie error processing synced ID:', syncedId, dbErr);
                        }
                    }

                    // \u274c Mark failed transactions on main thread (Dexie)
                    for (const fail of failed) {
                        try {
                            await dbManager.markTransactionFailed(fail.id, fail.error);
                            totalFailed++;
                        } catch (dbErr) {
                            console.error('\u274c Dexie error marking failed ID:', fail.id, dbErr);
                        }
                    }

                    console.log(`\ud83d\udce6 Chunk processed: +${synced_ids.length} synced, +${failed.length} failed`);
                }

                // --- Fix 3: Bulk endpoint not found (404) ---
                // Don't mark transactions as failed; just fallback to single sync
                if (msg.type === 'BULK_NOT_FOUND') {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    worker.removeEventListener('message', handleMessage);
                    console.warn('\u26a0\ufe0f Bulk endpoint returned 404. Falling back to single sync.');
                    resolve(false);
                    return;
                }

                if (msg.type === 'SYNC_COMPLETE') {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    worker.removeEventListener('message', handleMessage);
                    console.log(`\u2705 Worker bulk sync complete: ${totalSynced} synced, ${totalFailed} failed`);
                    resolve(totalSynced > 0); // true if at least some succeeded
                }

                if (msg.type === 'SYNC_FATAL_ERROR') {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    worker.removeEventListener('message', handleMessage);
                    console.error('\u274c Worker fatal error:', msg.error);
                    resolve(false);
                }
            };

            worker.addEventListener('message', handleMessage);

            // Dispatch work to the Web Worker
            worker.postMessage({
                type: 'START_SYNC',
                payload: {
                    transactions: transactions,
                    apiUrl: API_BASE,
                    token: localStorage.getItem('auth_token') || ''
                }
            });
        });
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
    // Both trigger syncNow() AND fetchMasterData() immediately
    // when connection is restored.
    // The syncInProgressRef guard prevents duplicate concurrent syncs.
    // =============================================
    useEffect(() => {
        isMountedRef.current = true;
        let capacitorListener = null;

        // ------------------------------------------
        // INITIALIZE WEB WORKER (Phase 4)
        // ------------------------------------------
        try {
            workerRef.current = new Worker(
                new URL('../workers/sync.worker.js', import.meta.url)
            );
            console.log('✅ Sync Web Worker initialized');
        } catch (workerErr) {
            console.warn('⚠️ Web Worker init failed (will fallback to main thread):', workerErr.message);
            workerRef.current = null;
        }

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
                                fetchMasterData();
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
                    fetchMasterData();
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
        // INITIAL: Refresh pending count + fetch master data
        // ------------------------------------------
        refreshPendingCount();
        // Fetch master data on initial mount (if online)
        if (navigator.onLine) {
            fetchMasterData();
        }

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

            // Terminate Web Worker
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
                console.log('🧹 Sync Web Worker terminated');
            }
        };
    }, [syncNow, refreshPendingCount, fetchMasterData]);

    return {
        pendingSyncCount,
        isSyncing,
        lastSyncError,
        lastSyncTime,
        syncVersion,
        syncNow,
        refreshPendingCount,
        fetchMasterData,
    };
}

