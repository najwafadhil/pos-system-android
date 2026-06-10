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
// =============================================

import { useState, useCallback, useRef, useEffect } from 'react';
import dbManager from '../utils/indexedDB';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Hook untuk mengelola sinkronisasi transaksi offline.
 * 
 * @returns {Object} State dan fungsi sinkronisasi
 * @property {number} pendingSyncCount - Jumlah transaksi menunggu sync
 * @property {boolean} isSyncing - Apakah sedang dalam proses sync
 * @property {string|null} lastSyncError - Pesan error terakhir
 * @property {string|null} lastSyncTime - Waktu sinkronisasi terakhir
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

    // =============================================
    // REFRESH PENDING COUNT
    // =============================================
    // Mengambil jumlah transaksi yang belum disinkronisasi
    // dari Dexie.js dan memperbarui state React.
    // =============================================
    const refreshPendingCount = useCallback(async () => {
        try {
            const pending = await dbManager.getPendingTransactions();
            setPendingSyncCount(pending.length);
            return pending.length;
        } catch (error) {
            console.error('Error checking pending transactions:', error);
            return 0;
        }
    }, []);

    // =============================================
    // SYNC SINGLE TRANSACTION
    // =============================================
    // Mengirim satu transaksi ke endpoint /api/transactions/sync.
    // Return true jika berhasil (HTTP 200), false jika gagal.
    // =============================================
    const syncSingleTransaction = async (transaction) => {
        try {
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
                // HTTP 200 OK → hapus dari Dexie.js
                // Ini memenuhi persyaratan: "Hapus data dari Dexie.js 
                // HANYA JIKA Backend mengembalikan status HTTP 200 OK"
                await dbManager.deletePendingTransaction(transaction.id);
                console.log('✅ Synced & deleted:', transaction.transaction_code);
                return true;
            } else {
                // HTTP 4xx/5xx → tandai sebagai failed, JANGAN hapus
                const errorText = await response.text();
                await dbManager.markTransactionFailed(
                    transaction.id,
                    `HTTP ${response.status}: ${errorText}`
                );
                console.error('❌ Sync failed:', transaction.transaction_code, errorText);
                return false;
            }
        } catch (networkError) {
            // Network error (offline lagi, timeout, dll)
            // Jangan hapus, biarkan retry di cycle berikutnya
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
                // Hapus transaksi yang berhasil disinkronisasi
                for (const syncedId of (result.synced_ids || [])) {
                    await dbManager.deletePendingTransaction(syncedId);
                }
                // Tandai yang gagal
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
    // 1. Event 'online' terdeteksi
    // 2. User menekan tombol "Sync Now" secara manual
    //
    // Alur:
    // - Cek apakah sedang online (navigator.onLine)
    // - Cek apakah ada sync yang sedang berjalan (prevent race condition)
    // - Ambil semua pending transactions dari Dexie.js
    // - Coba bulk sync dulu, fallback ke single sync
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
        setIsSyncing(true);
        setLastSyncError(null);

        let didSync = false;

        try {
            const pending = await dbManager.getPendingTransactions();

            if (pending.length === 0) {
                console.log('✅ No pending transactions to sync');
                return;
            }

            console.log(`🔄 Starting sync for ${pending.length} transactions...`);

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
                    setLastSyncError(`${failedCount} transaksi gagal disinkronisasi`);
                }
            }

            didSync = true;
            setLastSyncTime(new Date().toISOString());
        } catch (error) {
            console.error('❌ Sync error:', error);
            setLastSyncError(error.message);
        } finally {
            await refreshPendingCount();
            setIsSyncing(false);
            syncInProgressRef.current = false;

            // Hanya naikkan syncVersion jika benar-benar ada transaksi yang disync.
            // Ini mencegah re-render cascading di Dashboard/Cashier saat tidak ada
            // data baru yang perlu di-refresh.
            if (didSync) {
                setSyncVersion(v => v + 1);

                window.dispatchEvent(new CustomEvent('pos-sync-complete', {
                    detail: { timestamp: new Date().toISOString() }
                }));
            }
        }
    }, [refreshPendingCount]);

    // =============================================
    // AUTO-REFRESH PENDING COUNT ON MOUNT
    // =============================================
    useEffect(() => {
        refreshPendingCount();
    }, [refreshPendingCount]);

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
