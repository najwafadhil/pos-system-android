// =============================================
// DEXIE.JS DATABASE - Offline Data Storage
// =============================================
// Dexie.js menyediakan wrapper yang lebih stabil dan mudah
// dibanding raw IndexedDB API. Semua operasi menggunakan Promise.
// =============================================

import Dexie from 'dexie';
import { v4 as uuidv4 } from 'uuid';

// =============================================
// DATABASE SCHEMA DEFINITION
// =============================================
const db = new Dexie('POSDatabase');

// Definisi skema database:
// - '++id' = auto-increment primary key
// - '&field' = unique index
// - 'field' = non-unique index
// - '[field1+field2]' = compound index
//
// PENTING: Versi harus LEBIH TINGGI dari versi IndexedDB yang
// sudah ada di browser. Browser ini memiliki versi 20 dari sesi
// sebelumnya, jadi kita gunakan versi 21.
// Jika masih error VersionError, naikkan angka ini lebih tinggi.
db.version(22).stores({
    // Tabel offline_transactions:
    // Primary key = 'id' (UUID v4 string, diisi manual dari client)
    // Index: transaction_code (unique), sync_status, created_at
    offline_transactions: 'id, &transaction_code, sync_status, created_at',

    // Tabel menu_items: cache katalog menu dari server
    menu_items: 'id, category, is_available',

    // Tabel app_settings: key-value store untuk konfigurasi LOKAL (device-specific)
    // Contoh: bt_printer_mac, dll.
    app_settings: 'key',

    // Tabel categories: cache daftar kategori dari server (sinkronisasi)
    categories: 'id, name',

    // Tabel global_settings: cache pengaturan global dari server (sinkronisasi)
    // Contoh: app_name, app_logo, receipt_address
    global_settings: 'key',

    // Hapus tabel lama (set null agar Dexie menghapusnya)
    pending_transactions: null,
});

// =============================================
// DATABASE MANAGER CLASS
// =============================================
// Kelas ini membungkus semua operasi Dexie dalam satu interface
// agar mudah digunakan di seluruh aplikasi React.
// =============================================
class DexieDBManager {
    constructor() {
        this.db = db;
    }

    // =============================================
    // INITIALIZE DATABASE
    // =============================================
    async init() {
        try {
            await this.db.open();
            console.log('✅ Dexie IndexedDB initialized successfully');
            return this.db;
        } catch (error) {
            console.error('❌ Dexie init error:', error);
            throw error;
        }
    }

    // =============================================
    // GENERATE UUID v4
    // =============================================
    // UUID v4 digunakan sebagai primary key transaksi offline.
    // Ini mencegah bentrok ID (primary key collision) saat
    // transaksi disinkronisasi ke database PostgreSQL utama.
    // =============================================
    generateUUID() {
        return uuidv4();
    }

    // =============================================
    // OFFLINE TRANSACTIONS OPERATIONS
    // =============================================

    /**
     * Menyimpan transaksi baru ke antrian offline.
     * ID menggunakan UUID v4 yang di-generate di client.
     * @param {Object} transaction - Data transaksi dari kasir
     * @returns {string} UUID dari transaksi yang disimpan
     */
    async addPendingTransaction(transaction) {
        try {
            const id = this.generateUUID();
            const transactionData = {
                id,
                ...transaction,
                created_at: transaction.created_at || new Date().toISOString(),
                sync_status: 'pending',
                retry_count: 0,
                max_retries: 10,
                last_attempt: null,
                last_error: null,
            };

            await this.db.offline_transactions.add(transactionData);
            console.log('📝 Transaction added to offline queue:', id);
            return id;
        } catch (error) {
            console.error('❌ Error adding offline transaction:', error);
            throw error;
        }
    }

    /**
     * Mengambil semua transaksi yang belum disinkronisasi.
     * @returns {Array} Daftar transaksi dengan sync_status = 'pending'
     */
    async getPendingTransactions() {
        try {
            return await this.db.offline_transactions
                .where('sync_status')
                .equals('pending')
                .toArray();
        } catch (error) {
            console.error('❌ Error getting pending transactions:', error);
            return [];
        }
    }

    /**
     * Mengambil semua transaksi offline (termasuk yang sudah disinkronisasi).
     * @returns {Array} Seluruh isi tabel offline_transactions
     */
    async getAllOfflineTransactions() {
        try {
            return await this.db.offline_transactions.toArray();
        } catch (error) {
            console.error('❌ Error getting all offline transactions:', error);
            return [];
        }
    }

    /**
     * Menandai transaksi sebagai 'synced' setelah berhasil dikirim ke server.
     * Data TIDAK langsung dihapus agar bisa dijadikan log audit lokal.
     * @param {string} id - UUID transaksi
     */
    async markTransactionSynced(id) {
        try {
            await this.db.offline_transactions.update(id, {
                sync_status: 'synced',
                synced_at: new Date().toISOString(),
            });
            console.log('✅ Transaction marked as synced:', id);
        } catch (error) {
            console.error('❌ Error marking transaction synced:', error);
            throw error;
        }
    }

    /**
     * Menghapus satu transaksi dari antrian offline.
     * HANYA dipanggil setelah backend mengembalikan HTTP 200 OK.
     * @param {string} id - UUID transaksi
     */
    async deletePendingTransaction(id) {
        try {
            await this.db.offline_transactions.delete(id);
            console.log('🗑️ Transaction deleted from offline queue:', id);
        } catch (error) {
            console.error('❌ Error deleting transaction:', error);
            throw error;
        }
    }

    /**
     * Menandai transaksi sebagai 'failed' jika sinkronisasi gagal.
     * @param {string} id - UUID transaksi
     * @param {string} errorMessage - Pesan error dari server
     */
    async markTransactionFailed(id, errorMessage) {
        try {
            await this.db.offline_transactions.update(id, {
                sync_status: 'failed',
                last_error: errorMessage,
                last_attempt: new Date().toISOString(),
            });
        } catch (error) {
            console.error('❌ Error marking transaction failed:', error);
        }
    }

    /**
     * Menghapus semua transaksi yang sudah berhasil disinkronisasi.
     * Dipanggil untuk membersihkan data lokal secara berkala.
     */
    async clearSyncedTransactions() {
        try {
            await this.db.offline_transactions
                .where('sync_status')
                .equals('synced')
                .delete();
            console.log('🧹 Synced transactions cleared');
        } catch (error) {
            console.error('❌ Error clearing synced transactions:', error);
        }
    }

    /**
     * Menghapus seluruh isi tabel offline_transactions.
     */
    async clearAllPendingTransactions() {
        try {
            await this.db.offline_transactions.clear();
            console.log('🧹 All offline transactions cleared');
        } catch (error) {
            console.error('❌ Error clearing offline transactions:', error);
        }
    }

    /**
     * Mengambil transaksi yang gagal sync (sync_status = 'failed').
     * @returns {Array} Daftar transaksi yang gagal
     */
    async getFailedTransactions() {
        try {
            return await this.db.offline_transactions
                .where('sync_status')
                .equals('failed')
                .toArray();
        } catch (error) {
            console.error('❌ Error getting failed transactions:', error);
            return [];
        }
    }

    /**
     * Mengambil semua transaksi yang bisa di-retry:
     * - sync_status = 'pending' (belum pernah dicoba)
     * - sync_status = 'failed' DAN retry_count < max_retries
     * @returns {Array} Daftar transaksi yang siap disinkronisasi
     */
    async getRetryableTransactions() {
        try {
            const all = await this.db.offline_transactions
                .where('sync_status')
                .anyOf('pending', 'failed')
                .toArray();
            // Filter: hanya transaksi yang belum melebihi max_retries
            return all.filter(tx => {
                const maxRetries = tx.max_retries || 10;
                const retryCount = tx.retry_count || 0;
                return retryCount < maxRetries;
            });
        } catch (error) {
            console.error('❌ Error getting retryable transactions:', error);
            return [];
        }
    }

    /**
     * Increment retry_count dan update last_attempt timestamp.
     * @param {string} id - UUID transaksi
     */
    async incrementRetryCount(id) {
        try {
            const tx = await this.db.offline_transactions.get(id);
            if (tx) {
                await this.db.offline_transactions.update(id, {
                    retry_count: (tx.retry_count || 0) + 1,
                    last_attempt: new Date().toISOString(),
                });
            }
        } catch (error) {
            console.error('❌ Error incrementing retry count:', error);
        }
    }

    /**
     * Reset semua transaksi 'failed' kembali ke 'pending' agar di-retry.
     * Dipanggil saat koneksi kembali online.
     */
    async resetFailedForRetry() {
        try {
            const failed = await this.getFailedTransactions();
            for (const tx of failed) {
                const maxRetries = tx.max_retries || 10;
                const retryCount = tx.retry_count || 0;
                if (retryCount < maxRetries) {
                    await this.db.offline_transactions.update(tx.id, {
                        sync_status: 'pending',
                    });
                }
            }
            console.log(`🔄 Reset ${failed.length} failed transactions for retry`);
        } catch (error) {
            console.error('❌ Error resetting failed transactions:', error);
        }
    }

    // =============================================
    // MENU ITEMS OPERATIONS
    // =============================================

    /**
     * Menyimpan/memperbarui seluruh katalog menu ke cache lokal.
     * Data lama dihapus dulu agar item yang sudah di-delete di server
     * tidak muncul kembali.
     * @param {Array} items - Array menu items dari API server
     */
    async saveMenuItems(items) {
        try {
            await this.db.transaction('rw', this.db.menu_items, async () => {
                await this.db.menu_items.clear();
                await this.db.menu_items.bulkAdd(items);
            });
            console.log('📦 Menu items cached:', items.length, 'items');
        } catch (error) {
            console.error('❌ Error saving menu items:', error);
            throw error;
        }
    }

    /**
     * Mengambil semua menu items dari cache lokal.
     * @returns {Array} Daftar semua menu items
     */
    async getMenuItems() {
        try {
            return await this.db.menu_items.toArray();
        } catch (error) {
            console.error('❌ Error getting menu items:', error);
            return [];
        }
    }

    /**
     * Mengambil hanya menu items yang tersedia (is_available = true).
     * IndexedDB/Dexie tidak bisa filter boolean via index secara langsung,
     * jadi kita filter manual di sisi JavaScript.
     * @returns {Array} Daftar menu items yang tersedia
     */
    async getAvailableMenuItems() {
        try {
            const all = await this.db.menu_items.toArray();
            return all.filter(item => item.is_available === true || item.is_available === 1);
        } catch (error) {
            console.error('❌ Error getting available menu items:', error);
            return [];
        }
    }

    // =============================================
    // APP SETTINGS OPERATIONS
    // =============================================

    /**
     * Menyimpan setting key-value ke storage lokal.
     * @param {string} key - Nama setting
     * @param {*} value - Nilai setting (bisa objek/array/primitif)
     */
    async saveSetting(key, value) {
        try {
            await this.db.app_settings.put({
                key,
                value,
                updated_at: new Date().toISOString(),
            });
        } catch (error) {
            console.error('❌ Error saving setting:', error);
        }
    }

    /**
     * Mengambil nilai setting berdasarkan key.
     * @param {string} key - Nama setting
     * @returns {*} Nilai setting, atau null jika tidak ditemukan
     */
    async getSetting(key) {
        try {
            const result = await this.db.app_settings.get(key);
            return result ? result.value : null;
        } catch (error) {
            console.error('❌ Error getting setting:', error);
            return null;
        }
    }

    // =============================================
    // CATEGORIES OPERATIONS (Server-Synced)
    // =============================================

    /**
     * Menyimpan/memperbarui seluruh daftar kategori dari server.
     * Data lama dihapus dulu agar sinkron dengan server.
     * @param {Array} categories - Array kategori dari API server [{id, name}]
     */
    async saveCategories(categories) {
        try {
            await this.db.transaction('rw', this.db.categories, async () => {
                await this.db.categories.clear();
                await this.db.categories.bulkAdd(categories);
            });
            console.log('📦 Categories cached:', categories.length, 'items');
        } catch (error) {
            console.error('❌ Error saving categories:', error);
            throw error;
        }
    }

    /**
     * Mengambil semua kategori dari cache lokal.
     * @returns {Array} Daftar semua kategori [{id, name}]
     */
    async getCategories() {
        try {
            return await this.db.categories.toArray();
        } catch (error) {
            console.error('❌ Error getting categories:', error);
            return [];
        }
    }

    // =============================================
    // GLOBAL SETTINGS OPERATIONS (Server-Synced)
    // =============================================

    /**
     * Menyimpan setting global (sinkronisasi dari server).
     * @param {string} key - Nama setting (e.g. 'app_name', 'app_logo')
     * @param {string} value - Nilai setting
     */
    async saveGlobalSetting(key, value) {
        try {
            await this.db.global_settings.put({
                key,
                value,
                updated_at: new Date().toISOString(),
            });
        } catch (error) {
            console.error('❌ Error saving global setting:', error);
        }
    }

    /**
     * Mengambil nilai setting global berdasarkan key.
     * @param {string} key - Nama setting
     * @returns {string|null} Nilai setting, atau null jika tidak ditemukan
     */
    async getGlobalSetting(key) {
        try {
            const result = await this.db.global_settings.get(key);
            return result ? result.value : null;
        } catch (error) {
            console.error('❌ Error getting global setting:', error);
            return null;
        }
    }

    /**
     * Mengambil semua setting global dari cache lokal.
     * @returns {Array} Daftar semua setting [{key, value}]
     */
    async getAllGlobalSettings() {
        try {
            return await this.db.global_settings.toArray();
        } catch (error) {
            console.error('❌ Error getting all global settings:', error);
            return [];
        }
    }

    // =============================================
    // CLEAR ALL DATA
    // =============================================

    async clearAllData() {
        try {
            await this.db.transaction(
                'rw',
                this.db.offline_transactions,
                this.db.menu_items,
                this.db.app_settings,
                this.db.categories,
                this.db.global_settings,
                async () => {
                    await this.db.offline_transactions.clear();
                    await this.db.menu_items.clear();
                    await this.db.app_settings.clear();
                    await this.db.categories.clear();
                    await this.db.global_settings.clear();
                }
            );
            console.log('🧹 All IndexedDB data cleared');
        } catch (error) {
            console.error('❌ Error clearing all data:', error);
        }
    }


    close() {
        this.db.close();
    }
}

const dbManager = new DexieDBManager();
export default dbManager;

