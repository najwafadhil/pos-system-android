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
db.version(21).stores({
    // Tabel offline_transactions:
    // Primary key = 'id' (UUID v4 string, diisi manual dari client)
    // Index: transaction_code (unique), sync_status, created_at
    offline_transactions: 'id, &transaction_code, sync_status, created_at',

    // Tabel menu_items: cache katalog menu dari server
    menu_items: 'id, category, is_available',

    // Tabel app_settings: key-value store untuk konfigurasi lokal
    app_settings: 'key',

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


    async clearAllData() {
        try {
            await this.db.transaction(
                'rw',
                this.db.offline_transactions,
                this.db.menu_items,
                this.db.app_settings,
                async () => {
                    await this.db.offline_transactions.clear();
                    await this.db.menu_items.clear();
                    await this.db.app_settings.clear();
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
