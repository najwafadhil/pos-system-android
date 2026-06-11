// =============================================
// BACKEND API REFERENCE — Categories & Settings
// =============================================
// Salin route handlers ini ke Express backend Anda.
// Pastikan SQL migrations sudah dijalankan terlebih dahulu.
//
// SQL Migrations:
// =============================================
/*
-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default categories
INSERT INTO categories (name) VALUES ('Makanan'), ('Minuman'), ('Lainnya')
ON CONFLICT (name) DO NOTHING;

-- Global settings table (key-value store)
CREATE TABLE IF NOT EXISTS global_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed defaults
INSERT INTO global_settings (key, value) VALUES
    ('app_name', 'RestoPOS'),
    ('app_logo', '')
ON CONFLICT (key) DO NOTHING;
*/

// =============================================
// ROUTE: GET /api/categories
// =============================================
// Returns all non-deleted categories.
// Response: { success: true, data: [{ id, name }] }
// =============================================
router.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name FROM categories WHERE is_deleted = FALSE ORDER BY id ASC'
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, error: 'Gagal mengambil kategori' });
    }
});

// =============================================
// ROUTE: POST /api/categories
// =============================================
// Handles create, rename, and soft-delete of categories.
//
// Body for CREATE:  { action: 'create', name: 'New Category' }
// Body for RENAME:  { action: 'rename', oldName: 'Old', newName: 'New' }
// Body for DELETE:  { action: 'delete', name: 'Category to Delete' }
//
// Response: { success: true, data: { id, name } | null, message: '...' }
// =============================================
router.post('/api/categories', authenticateToken, async (req, res) => {
    const { action, name, oldName, newName } = req.body;

    try {
        switch (action) {
            case 'create': {
                if (!name || !name.trim()) {
                    return res.status(400).json({ success: false, error: 'Nama kategori wajib diisi' });
                }

                // Check if category exists (including soft-deleted)
                const existing = await pool.query(
                    'SELECT id, is_deleted FROM categories WHERE LOWER(name) = LOWER($1)',
                    [name.trim()]
                );

                if (existing.rows.length > 0) {
                    if (existing.rows[0].is_deleted) {
                        // Resurrect soft-deleted category
                        const result = await pool.query(
                            'UPDATE categories SET is_deleted = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, name',
                            [existing.rows[0].id]
                        );
                        return res.json({ success: true, data: result.rows[0], message: 'Kategori berhasil diaktifkan kembali' });
                    }
                    return res.status(409).json({ success: false, error: 'Kategori sudah ada' });
                }

                const result = await pool.query(
                    'INSERT INTO categories (name) VALUES ($1) RETURNING id, name',
                    [name.trim()]
                );
                return res.json({ success: true, data: result.rows[0], message: 'Kategori berhasil ditambahkan' });
            }

            case 'rename': {
                if (!oldName || !newName || !newName.trim()) {
                    return res.status(400).json({ success: false, error: 'Nama kategori lama dan baru wajib diisi' });
                }

                if (oldName.toLowerCase() === 'lainnya') {
                    return res.status(400).json({ success: false, error: 'Kategori Lainnya tidak dapat diedit' });
                }

                // Check if newName already exists
                const dupCheck = await pool.query(
                    'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE',
                    [newName.trim()]
                );
                if (dupCheck.rows.length > 0) {
                    return res.status(409).json({ success: false, error: 'Kategori tujuan sudah ada' });
                }

                const result = await pool.query(
                    'UPDATE categories SET name = $1, updated_at = NOW() WHERE name = $2 AND is_deleted = FALSE RETURNING id, name',
                    [newName.trim(), oldName]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ success: false, error: 'Kategori tidak ditemukan' });
                }

                // Also update menu_items with old category name
                const menuUpdate = await pool.query(
                    'UPDATE menu_items SET category = $1 WHERE category = $2',
                    [newName.trim(), oldName]
                );

                return res.json({
                    success: true,
                    data: result.rows[0],
                    updatedCount: menuUpdate.rowCount,
                    message: `Kategori diubah. ${menuUpdate.rowCount} item diperbarui.`
                });
            }

            case 'delete': {
                if (!name) {
                    return res.status(400).json({ success: false, error: 'Nama kategori wajib diisi' });
                }

                if (name.toLowerCase() === 'lainnya') {
                    return res.status(400).json({ success: false, error: 'Kategori Lainnya tidak dapat dihapus' });
                }

                // Soft-delete the category
                const result = await pool.query(
                    'UPDATE categories SET is_deleted = TRUE, updated_at = NOW() WHERE name = $1 AND is_deleted = FALSE RETURNING id',
                    [name]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ success: false, error: 'Kategori tidak ditemukan' });
                }

                // Move menu items to 'Lainnya'
                const menuUpdate = await pool.query(
                    'UPDATE menu_items SET category = $1 WHERE category = $2',
                    ['Lainnya', name]
                );

                return res.json({
                    success: true,
                    updatedCount: menuUpdate.rowCount,
                    message: `Kategori dihapus. ${menuUpdate.rowCount} item dipindah ke Lainnya.`
                });
            }

            default:
                return res.status(400).json({ success: false, error: 'Action tidak valid. Gunakan: create, rename, delete' });
        }
    } catch (error) {
        console.error('Error managing category:', error);
        res.status(500).json({ success: false, error: 'Gagal mengelola kategori' });
    }
});

// =============================================
// ROUTE: GET /api/settings
// =============================================
// Returns all global settings as key-value pairs.
// Response: { success: true, data: [{ key, value }] }
// =============================================
router.get('/api/settings', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT key, value FROM global_settings ORDER BY key ASC'
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, error: 'Gagal mengambil pengaturan' });
    }
});

// =============================================
// ROUTE: POST /api/settings
// =============================================
// Upsert a global setting.
// Body: { key: 'app_name', value: 'My Restaurant' }
//   or: { settings: [{ key: 'app_name', value: '...' }, { key: 'app_logo', value: '...' }] }
//
// Response: { success: true, message: 'Pengaturan berhasil disimpan' }
// =============================================
router.post('/api/settings', authenticateToken, async (req, res) => {
    try {
        const { key, value, settings } = req.body;

        // Batch mode: multiple settings at once
        if (Array.isArray(settings)) {
            for (const setting of settings) {
                if (!setting.key) continue;
                await pool.query(
                    `INSERT INTO global_settings (key, value, updated_at)
                     VALUES ($1, $2, NOW())
                     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                    [setting.key, setting.value || '']
                );
            }
            return res.json({ success: true, message: `${settings.length} pengaturan berhasil disimpan` });
        }

        // Single mode
        if (!key) {
            return res.status(400).json({ success: false, error: 'Key wajib diisi' });
        }

        await pool.query(
            `INSERT INTO global_settings (key, value, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, value || '']
        );

        res.json({ success: true, message: 'Pengaturan berhasil disimpan' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ success: false, error: 'Gagal menyimpan pengaturan' });
    }
});
