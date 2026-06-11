import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import dbManager from '../utils/indexedDB';

const formatRupiah = (amount) => {
  const number = parseFloat(amount) || 0;
  return 'Rp. ' + Math.round(number).toLocaleString('id-ID');
};

export default function MenuManagement() {
  const navigate = useNavigate();
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', cost_price: '', profit: '',
    category: 'Makanan', is_available: true, discount_percent: 0, discount_nominal: 0, is_discount_active: false,
    options: []
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const fileInputRef = useRef(null);

  // Default categories sebagai fallback jika server/IndexedDB kosong
  const defaultCategories = ['Makanan', 'Minuman', 'Lainnya'];
  const [customCategories, setCustomCategories] = useState(defaultCategories);
  
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');

  // Categories are derived ONLY from customCategories — orphan item categories
  // no longer resurrect deleted categories. Orphan items render under 'Lainnya'.
  const categories = [...customCategories];

  // =============================================
  // LOAD CATEGORIES from IndexedDB (cached from server)
  // =============================================
  const loadCategories = useCallback(async () => {
    try {
      const cached = await dbManager.getCategories();
      if (cached && cached.length > 0) {
        setCustomCategories(cached.map(c => c.name));
      }
    } catch (err) {
      console.warn('⚠️ Failed to load categories from IndexedDB:', err);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Listen for master-data-updated events (fired by useSync after fetchMasterData)
  useEffect(() => {
    const handleMasterDataUpdate = () => {
      loadCategories();
    };
    window.addEventListener('master-data-updated', handleMasterDataUpdate);
    return () => window.removeEventListener('master-data-updated', handleMasterDataUpdate);
  }, [loadCategories]);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      let url = filterCategory ? `${process.env.REACT_APP_API_URL || ""}/api/menu?category=${filterCategory}` : `${process.env.REACT_APP_API_URL || ""}/api/menu`;
      url += (url.includes('?') ? '&' : '?') + `t=${new Date().getTime()}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
      const data = await res.json();
      if (data.success) setMenuItems(data.data);
    } catch (err) {
      console.error('Failed to load menu:', err);
    } finally {
      setLoading(false);
    }
  }, [filterCategory]);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const method = editItem ? 'PUT' : 'POST';
      const url = editItem ? `${process.env.REACT_APP_API_URL || ""}/api/menu/${editItem.id}` : `${process.env.REACT_APP_API_URL || ""}/api/menu`;

      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('description', form.description);
      formData.append('cost_price', form.cost_price);
      formData.append('profit', form.profit);
      formData.append('category', form.category);
      formData.append('is_available', form.is_available);
      formData.append('discount_percent', form.discount_percent);
      formData.append('discount_nominal', form.discount_nominal);
      formData.append('is_discount_active', form.is_discount_active);
      formData.append('options', JSON.stringify(form.options || []));
      if (imageFile) formData.append('image', imageFile);

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        showMsg(editItem ? '✅ Menu berhasil diupdate!' : '✅ Menu berhasil ditambah!');
        resetForm();
        loadMenu();
      } else {
        showMsg('❌ ' + (data.error || 'Gagal menyimpan'), 'error');
      }
    } catch (err) {
      showMsg('❌ Gagal menyimpan menu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Hapus "${name}"? Data akan terhapus secara permanen.`)) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/menu/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      const data = await res.json();
      if (data.success) { showMsg('🗑️ Menu berhasil dihapus'); loadMenu(); }
      else { showMsg('❌ ' + (data.error || 'Gagal menghapus'), 'error'); }
    } catch (err) { showMsg('❌ Gagal menghapus menu', 'error'); }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({
      name: item.name,
      description: item.description || '',
      cost_price: item.cost_price || '',
      profit: item.profit || '',
      category: item.category,
      is_available: item.is_available,
      discount_percent: item.discount_percent ? parseFloat(item.discount_percent) : 0,
      discount_nominal: item.discount_nominal ? parseFloat(item.discount_nominal) : 0,
      is_discount_active: item.is_discount_active || false,
      options: item.options || [],
    });
    setImageFile(null);
    setImagePreview(item.image_url ? item.image_url : null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditItem(null);
    setImageFile(null);
    setImagePreview(null);
    setForm({ name: '', description: '', cost_price: '', profit: '', category: 'Makanan', is_available: true, discount_percent: 0, discount_nominal: 0, is_discount_active: false, options: [] });
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    if (categories.includes(newCatName.trim())) { alert('Kategori sudah ada!'); return; }

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({ action: 'create', name: newCatName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setCustomCategories([...customCategories, newCatName.trim()]);
        setNewCatName('');
        // Refresh IndexedDB cache
        loadCategories();
        showMsg('✅ Kategori berhasil ditambahkan');
      } else {
        alert(data.error || 'Gagal menambahkan kategori');
      }
    } catch (e) {
      showMsg('Gagal menambahkan kategori', 'error');
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (cat === 'Lainnya') { alert('Kategori Lainnya tidak dapat dihapus'); return; }
    if (!window.confirm(`Hapus kategori "${cat}"? Semua menu di dalamnya akan otomatis dipindah ke "Lainnya".`)) return;
    
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({ action: 'delete', name: cat })
      });
      const data = await res.json();
      if (data.success) {
        setCustomCategories(customCategories.filter(c => c !== cat));
        loadMenu();
        loadCategories();
        showMsg(`Kategori dihapus. ${data.updatedCount || 0} item dipindah ke Lainnya.`);
      } else {
        showMsg(data.error || 'Gagal menghapus kategori', 'error');
      }
    } catch (e) { showMsg('Gagal menghapus kategori', 'error'); }
  };

  const handleRenameCategory = async (oldCat, newCat) => {
    if (!newCat.trim() || oldCat === newCat) { setEditingCat(null); return; }
    if (categories.includes(newCat.trim()) && oldCat !== newCat.trim()) { alert('Kategori sudah ada!'); return; }
    if (oldCat === 'Lainnya') { alert('Kategori Lainnya tidak dapat diedit'); return; }

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({ action: 'rename', oldName: oldCat, newName: newCat.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setCustomCategories(customCategories.map(c => c === oldCat ? newCat.trim() : c));
        if (form.category === oldCat) setForm({...form, category: newCat.trim()});
        setEditingCat(null);
        loadMenu();
        loadCategories();
        showMsg(`Kategori diubah. ${data.updatedCount || 0} item diperbarui.`);
      } else {
        showMsg(data.error || 'Gagal mengubah kategori', 'error');
      }
    } catch (e) { showMsg('Gagal mengubah kategori', 'error'); }
  };

  const cost = parseFloat(form.cost_price) || 0;
  const prof = parseFloat(form.profit) || 0;
  const sellingPrice = cost + prof;
  const profitPercentage = cost > 0 ? ((prof / cost) * 100).toFixed(1) : 0;

  // FIX: Group items whose category is NOT in customCategories under 'Lainnya'
  const grouped = categories.reduce((acc, cat) => {
    acc[cat] = [];
    return acc;
  }, {});
  menuItems.forEach(item => {
    const targetCat = customCategories.includes(item.category) ? item.category : 'Lainnya';
    if (grouped[targetCat]) {
      grouped[targetCat].push(item);
    } else {
      // Safety fallback — if 'Lainnya' key somehow missing
      grouped['Lainnya'] = grouped['Lainnya'] || [];
      grouped['Lainnya'].push(item);
    }
  });
  // When filtering, only show the filtered category
  const displayGroups = filterCategory
    ? Object.entries(grouped).filter(([cat]) => cat === filterCategory)
    : Object.entries(grouped);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-5 sm:py-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-slate-500 text-sm font-semibold pb-2 bg-transparent border-none cursor-pointer hover:text-slate-700 transition-colors min-h-[44px]"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Kembali
          </button>
          <h1 className="text-xl sm:text-[22px] font-bold text-[#2D3B2D] m-0">Manajemen Menu</h1>
          <p className="text-gray-400 text-[13px] mt-0.5">{menuItems.length} item terdaftar</p>
        </div>
        <button
          id="menu-add-btn"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] bg-[#2D5A3F] text-white border-none rounded-[10px] font-bold text-sm cursor-pointer shadow-[0_4px_14px_rgba(45,90,63,0.3)] transition-transform duration-200 hover:scale-[1.03] active:scale-95 w-full sm:w-auto"
        >
          + Tambah Menu
        </button>
      </div>

      {/* Message */}
      {message.text && (
        <div className={`mb-4 px-4 py-3 rounded-[10px] text-sm font-medium border ${
          message.type === 'error'
            ? 'bg-red-100 text-red-600 border-red-300'
            : 'bg-green-100 text-green-600 border-green-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="mb-6 bg-white border border-slate-200 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-4 sm:p-6">
          <h2 className="text-base font-bold text-[#2D3B2D] mt-0 mb-5">{editItem ? '✏️ Edit Menu' : '➕ Tambah Menu Baru'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nama */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Nama Menu *</label>
                <input
                  id="menu-form-name"
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Contoh: Nasi Goreng"
                  className="w-full p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none bg-white text-[#2D3B2D] focus:border-[#2D5A3F] focus:ring-1 focus:ring-[#2D5A3F]/20 transition-colors"
                />
              </div>

              {/* Kategori */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Kategori *</label>
                <select
                  id="menu-form-category"
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none bg-white text-[#2D3B2D] cursor-pointer focus:border-[#2D5A3F] focus:ring-1 focus:ring-[#2D5A3F]/20 transition-colors"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Harga Modal */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Harga Modal *</label>
                <input
                  id="menu-form-cost"
                  type="text"
                  value={form.cost_price ? formatRupiah(form.cost_price) : ''}
                  onChange={e => setForm({ ...form, cost_price: e.target.value.replace(/\D/g, '') })}
                  required
                  placeholder="Rp. 15.000"
                  className="w-full p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none bg-white text-[#2D3B2D] focus:border-[#2D5A3F] focus:ring-1 focus:ring-[#2D5A3F]/20 transition-colors"
                />
              </div>

              {/* Profit */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Profit *</label>
                  {prof > 0 && cost > 0 && (
                    <span className="text-green-600 bg-green-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      +{profitPercentage}%
                    </span>
                  )}
                </div>
                <input
                  id="menu-form-profit"
                  type="text"
                  value={form.profit ? formatRupiah(form.profit) : ''}
                  onChange={e => setForm({ ...form, profit: e.target.value.replace(/\D/g, '') })}
                  required
                  placeholder="Rp. 10.000"
                  className="w-full p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none bg-white text-[#2D3B2D] focus:border-[#2D5A3F] focus:ring-1 focus:ring-[#2D5A3F]/20 transition-colors"
                />
              </div>

              {/* Harga Jual (auto-calculated) */}
              <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-[#EAF2EC] to-[#E0EDE3] border border-[#2D5A3F]/20 rounded-[10px] p-3.5 sm:px-[18px] flex items-center justify-between">
                <div>
                  <p className="m-0 text-xs text-gray-400 font-semibold uppercase tracking-wide">Harga Jual Otomatis (Modal + Profit)</p>
                  <p className="mt-1 mb-0 text-xl font-bold text-[#2D5A3F]">{formatRupiah(sellingPrice)}</p>
                </div>
                <span className="text-[28px]">🏷️</span>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
                <select
                  id="menu-form-status"
                  value={form.is_available}
                  onChange={e => setForm({ ...form, is_available: e.target.value === 'true' })}
                  className="w-full p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none bg-white text-[#2D3B2D] cursor-pointer focus:border-[#2D5A3F] focus:ring-1 focus:ring-[#2D5A3F]/20 transition-colors"
                >
                  <option value="true">✅ Tersedia</option>
                  <option value="false">❌ Tidak Tersedia</option>
                </select>
              </div>

              {/* Diskon */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pengaturan Diskon</label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-500 font-semibold">
                    <input type="checkbox" checked={form.is_discount_active} onChange={e => setForm({ ...form, is_discount_active: e.target.checked })} className="w-[18px] h-[18px] cursor-pointer accent-[#2D5A3F]" />
                    Aktifkan Diskon
                  </label>
                </div>
                
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${form.is_discount_active ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1.5">Diskon Nominal</label>
                    <div className="flex items-center bg-white border border-slate-200 rounded-[10px] overflow-hidden">
                      <span className="px-3 text-slate-500 font-semibold text-sm border-r border-slate-200">Rp</span>
                      <input 
                        type="number" 
                        min="0" 
                        value={form.discount_nominal} 
                        onChange={e => {
                          const nominal = parseFloat(e.target.value) || 0;
                          const basePrice = (parseFloat(form.cost_price) || 0) + (parseFloat(form.profit) || 0);
                          const percent = basePrice > 0 ? (nominal / basePrice) * 100 : 0;
                          setForm({ ...form, discount_nominal: nominal, discount_percent: percent.toFixed(2) });
                        }} 
                        placeholder="0" 
                        className="flex-1 p-3 min-h-[44px] border-none text-sm outline-none bg-white text-[#2D3B2D]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1.5">Diskon Persentase</label>
                    <div className="flex items-center bg-white border border-slate-200 rounded-[10px] overflow-hidden">
                      <input 
                        type="number" 
                        min="0" 
                        max="100" 
                        step="0.01"
                        value={form.discount_percent} 
                        onChange={e => {
                          const percent = parseFloat(e.target.value) || 0;
                          const basePrice = (parseFloat(form.cost_price) || 0) + (parseFloat(form.profit) || 0);
                          const nominal = basePrice * (percent / 100);
                          setForm({ ...form, discount_percent: percent, discount_nominal: Math.round(nominal) });
                        }} 
                        placeholder="0" 
                        className="flex-1 p-3 min-h-[44px] border-none text-sm outline-none bg-white text-[#2D3B2D]"
                      />
                      <span className="px-3 text-slate-500 font-semibold text-sm border-l border-slate-200">%</span>
                    </div>
                  </div>
                </div>

                {form.is_discount_active && (parseFloat(form.discount_nominal) > 0) && (
                  <div className="mt-3 p-2.5 sm:px-3 bg-white border border-dashed border-slate-300 rounded-lg">
                    <p className="m-0 mb-1 text-xs text-slate-500">Simulasi Harga (Setelah Diskon):</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-semibold">Harga Jual:</span>
                      <span className="text-sm font-extrabold text-red-600">
                        {formatRupiah(((parseFloat(form.cost_price) || 0) + (parseFloat(form.profit) || 0)) - parseFloat(form.discount_nominal))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[13px] font-semibold">Profit Bersih:</span>
                      <span className={`text-sm font-extrabold ${(parseFloat(form.profit) || 0) - parseFloat(form.discount_nominal) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatRupiah((parseFloat(form.profit) || 0) - parseFloat(form.discount_nominal))} 
                        <span className="text-[11px] font-semibold ml-1">
                          ({parseFloat(form.cost_price) > 0 ? (((parseFloat(form.profit) || 0) - parseFloat(form.discount_nominal)) / parseFloat(form.cost_price) * 100).toFixed(1) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Foto */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Foto Menu</label>
                <div
                  onClick={() => fileInputRef.current.click()}
                  className="border-2 border-dashed border-slate-200 rounded-[10px] p-3 cursor-pointer flex items-center gap-3 min-h-[44px] transition-colors hover:border-[#2D5A3F]"
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="preview" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 bg-slate-50 rounded-lg flex items-center justify-center text-[22px] flex-shrink-0">📷</div>
                  )}
                  <div className="min-w-0">
                    <p className="m-0 text-[13px] font-semibold text-[#2D3B2D]">{imagePreview ? 'Ganti Foto' : 'Upload Foto'}</p>
                    <p className="m-0 mt-0.5 text-[11px] text-gray-400">JPG, PNG, WEBP maks. 5MB</p>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </div>

              {/* Deskripsi */}
              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Deskripsi</label>
                <textarea
                  id="menu-form-desc"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Deskripsi singkat menu..."
                  className="w-full p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none bg-white text-[#2D3B2D] resize-none focus:border-[#2D5A3F] focus:ring-1 focus:ring-[#2D5A3F]/20 transition-colors"
                />
              </div>

              {/* ═══ OPSI MENU (Variants) ═══ */}
              <div className="col-span-1 md:col-span-2 bg-slate-50 border border-gray-200 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opsi Menu (Varian)</label>
                  <button type="button" onClick={() => {
                    setForm({ ...form, options: [...(form.options || []), { name: '', choices: [''] }] });
                  }} className="px-3.5 py-2 min-h-[44px] sm:min-h-0 bg-[#2D5A3F] text-white border-none rounded-lg text-xs font-semibold cursor-pointer hover:bg-[#234A32] transition-colors active:scale-95">
                    + Tambah Grup Opsi
                  </button>
                </div>

                {(!form.options || form.options.length === 0) && (
                  <p className="text-gray-400 text-[13px] my-2 italic">Belum ada opsi. Klik "Tambah Grup Opsi" untuk menambah (misal: Level Pedas, Topping, dll.)</p>
                )}

                {(form.options || []).map((optGroup, gi) => (
                  <div key={gi} className="bg-white border border-slate-200 rounded-[10px] p-3.5 mb-2.5">
                    <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center mb-2.5">
                      <input
                        type="text"
                        placeholder="Nama Grup (Opsional)"
                        value={optGroup.name}
                        onChange={e => {
                          const opts = [...form.options];
                          opts[gi] = { ...opts[gi], name: e.target.value };
                          setForm({ ...form, options: opts });
                        }}
                        className="flex-1 p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none bg-white text-[#2D3B2D] focus:border-[#2D5A3F] transition-colors"
                      />
                      <button type="button" onClick={() => {
                        const opts = form.options.filter((_, i) => i !== gi);
                        setForm({ ...form, options: opts });
                      }} className="px-3 py-2 min-h-[44px] bg-red-100 text-red-600 border-none rounded-lg font-bold cursor-pointer text-[13px] flex-shrink-0 hover:bg-red-200 transition-colors active:scale-95">
                        🗑️ Hapus Grup
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      {optGroup.choices.map((choice, ci) => (
                        <div key={ci} className="flex gap-1 items-center">
                          <input
                            type="text"
                            placeholder={`Pilihan ${ci + 1}`}
                            value={choice}
                            onChange={e => {
                              const opts = [...form.options];
                              const ch = [...opts[gi].choices];
                              ch[ci] = e.target.value;
                              opts[gi] = { ...opts[gi], choices: ch };
                              setForm({ ...form, options: opts });
                            }}
                            className="w-[140px] p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none bg-white text-[#2D3B2D] focus:border-[#2D5A3F] transition-colors"
                          />
                          {optGroup.choices.length > 1 && (
                            <button type="button" onClick={() => {
                              const opts = [...form.options];
                              const ch = opts[gi].choices.filter((_, i) => i !== ci);
                              opts[gi] = { ...opts[gi], choices: ch };
                              setForm({ ...form, options: opts });
                            }} className="bg-transparent border-none cursor-pointer text-red-600 font-bold text-base p-1 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors">×</button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => {
                        const opts = [...form.options];
                        opts[gi] = { ...opts[gi], choices: [...opts[gi].choices, ''] };
                        setForm({ ...form, options: opts });
                      }} className="px-3 py-2 min-h-[44px] bg-slate-100 border border-dashed border-slate-400 rounded-lg text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors">
                        + Pilihan
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div className="col-span-1 md:col-span-2 flex flex-col sm:flex-row gap-3">
                <button
                  id="menu-form-save"
                  type="submit"
                  disabled={saving}
                  className={`flex-1 p-3 min-h-[44px] text-white border-none rounded-[10px] font-bold text-sm transition-all duration-200 ${saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#2D5A3F] cursor-pointer hover:bg-[#234A32] active:scale-[0.98]'}`}
                >
                  {saving ? '⏳ Menyimpan...' : editItem ? '💾 Update Menu' : '➕ Simpan Menu'}
                </button>
                <button
                  id="menu-form-cancel"
                  type="button"
                  onClick={resetForm}
                  className="px-6 p-3 min-h-[44px] bg-slate-100 text-gray-500 border-none rounded-[10px] font-semibold text-sm cursor-pointer hover:bg-slate-200 transition-colors active:scale-[0.98]"
                >
                  Batal
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-5 flex-wrap items-center">
        <button
          onClick={() => setFilterCategory('')}
          className={`px-4 py-2 min-h-[44px] rounded-full border-none cursor-pointer text-[13px] font-semibold transition-all duration-150 ${!filterCategory ? 'bg-[#2D5A3F] text-white' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'}`}
        >Semua</button>
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setFilterCategory(c)}
            className={`px-4 py-2 min-h-[44px] rounded-full border-none cursor-pointer text-[13px] font-semibold transition-all duration-150 ${filterCategory === c ? 'bg-[#2D5A3F] text-white' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'}`}
          >{c}</button>
        ))}
        <button
          onClick={() => setShowCategoryModal(true)}
          className="px-4 py-2 min-h-[44px] rounded-full border border-dashed border-[#2D5A3F] cursor-pointer text-[13px] font-semibold bg-transparent text-[#2D5A3F] transition-all duration-150 hover:bg-[#EAF2EC] ml-auto"
        >⚙️ Kelola Kategori</button>
      </div>

      {/* Menu List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-[15px]">⏳ Memuat menu...</div>
      ) : (
        <div className="flex flex-col gap-5">
          {displayGroups.map(([cat, items]) => (
            <div key={cat} className="bg-white rounded-[14px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100 overflow-hidden">
              {/* Category Header */}
              <div className="px-4 sm:px-5 py-3 bg-gradient-to-br from-[#2D3B2D] to-[#3d3d3d] flex items-center justify-between">
                <h3 className="m-0 font-bold text-white text-sm">{cat}</h3>
                <span className="text-[11px] text-white/50 bg-white/10 px-2.5 py-0.5 rounded-full">{items.length} item</span>
              </div>

              {items.length === 0 ? (
                <p className="text-gray-300 text-[13px] text-center py-6">Belum ada menu di kategori ini</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                  {items.map(item => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] hover:border-[#2D5A3F]">
                      {/* Image */}
                      <div className="w-full h-[120px] overflow-hidden bg-slate-200 flex-shrink-0 relative">
                        {item.image_url ? (
                          <img src={item.image_url.startsWith('/') ? `${process.env.REACT_APP_API_URL || ""}${item.image_url}` : item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                        )}
                        {/* Status badge */}
                        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${item.is_available ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                          {item.is_available ? '✅ Tersedia' : '❌ Habis'}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="p-3 flex-1 flex flex-col gap-1.5">
                        <p className="m-0 font-bold text-[#2D3B2D] text-sm leading-tight">{item.name}</p>
                        {item.description && (
                          <p className="m-0 text-[11px] text-gray-400 leading-snug">{item.description.substring(0, 60)}{item.description.length > 60 ? '…' : ''}</p>
                        )}

                        {/* Prices */}
                        <div className="flex justify-between items-center mt-auto pt-2 border-t border-slate-200">
                          <div>
                            <p className="m-0 text-[10px] text-gray-400 font-semibold uppercase">Harga Jual</p>
                            {item.is_discount_active && (item.discount_percent > 0 || item.discount_nominal > 0) ? (
                              <>
                                <p className="m-0 font-semibold text-gray-400 text-xs line-through">{formatRupiah(item.price)}</p>
                                <p className="m-0 font-extrabold text-red-600 text-base">
                                  {formatRupiah(item.price - (item.discount_nominal > 0 ? parseFloat(item.discount_nominal) : item.price * parseFloat(item.discount_percent) / 100))} 
                                  <span className="text-[10px] bg-red-100 text-red-600 px-1 py-0.5 rounded ml-1">
                                    {item.discount_nominal > 0 ? `-Rp ${parseFloat(item.discount_nominal).toLocaleString('id-ID')}` : `-${parseFloat(item.discount_percent)}%`}
                                  </span>
                                </p>
                              </>
                            ) : (
                              <p className="m-0 font-extrabold text-[#2D5A3F] text-base">{formatRupiah(item.price)}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="m-0 text-[10px] text-gray-400">Modal: {formatRupiah(item.cost_price || 0)}</p>
                            <p className="m-0 text-[10px] text-green-600 font-semibold">Profit: {formatRupiah(item.profit || 0)}</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-2">
                          <button
                            id={`menu-edit-${item.id}`}
                            onClick={() => handleEdit(item)}
                            className="flex-1 p-2 min-h-[44px] bg-blue-50 text-blue-600 border-none rounded-lg text-xs font-semibold cursor-pointer transition-colors hover:bg-blue-100 active:scale-95"
                          >✏️ Edit</button>
                          <button
                            id={`menu-delete-${item.id}`}
                            onClick={() => handleDelete(item.id, item.name)}
                            className="flex-1 p-2 min-h-[44px] bg-red-50 text-red-600 border-none rounded-lg text-xs font-semibold cursor-pointer transition-colors hover:bg-red-100 active:scale-95"
                          >🗑️ Hapus</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={e => { if (e.target === e.currentTarget) setShowCategoryModal(false); }}>
          <div className="bg-white p-5 sm:p-6 rounded-2xl w-11/12 max-w-md shadow-[0_10px_30px_rgba(0,0,0,0.2)] max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 className="m-0 text-lg text-[#2D3B2D] font-bold">Kelola Kategori</h2>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="bg-transparent border-none text-xl cursor-pointer text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >✕</button>
            </div>

            <div className="flex gap-2 mb-5 flex-shrink-0">
              <input
                type="text"
                placeholder="Nama kategori baru..."
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                className="flex-1 p-3 min-h-[44px] border border-slate-200 rounded-[10px] text-sm outline-none focus:border-[#2D5A3F] transition-colors"
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              />
              <button
                onClick={handleAddCategory}
                className="px-4 py-3 min-h-[44px] bg-[#2D5A3F] text-white border-none rounded-[10px] font-bold cursor-pointer hover:bg-[#234A32] transition-colors active:scale-95 flex-shrink-0"
              >Tambah</button>
            </div>

            <div className="overflow-y-auto flex flex-col gap-2 flex-1 min-h-0">
              {categories.map(cat => (
                <div key={cat} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-[10px]">
                  {editingCat === cat ? (
                    <input
                      autoFocus
                      type="text"
                      value={editCatName}
                      onChange={e => setEditCatName(e.target.value)}
                      onBlur={() => handleRenameCategory(cat, editCatName)}
                      onKeyDown={e => e.key === 'Enter' && handleRenameCategory(cat, editCatName)}
                      className="flex-1 px-2.5 py-1.5 min-h-[44px] border border-[#2D5A3F] rounded-md text-sm outline-none mr-2"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-[#2D3B2D] flex-1">{cat}</span>
                  )}
                  
                  {cat !== 'Lainnya' && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => { setEditingCat(cat); setEditCatName(cat); }}
                        className="bg-blue-50 text-blue-600 border-none p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md cursor-pointer hover:bg-blue-100 transition-colors"
                      >✏️</button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="bg-red-100 text-red-600 border-none p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md cursor-pointer hover:bg-red-200 transition-colors"
                      >🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
