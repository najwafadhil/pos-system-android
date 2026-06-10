import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

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

  const defaultCategories = ['Makanan', 'Minuman', 'Lauk', 'Camilan', 'Lainnya'];
  const [customCategories, setCustomCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_custom_categories')) || defaultCategories; }
    catch { return defaultCategories; }
  });
  
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');

  const categories = [...new Set([...customCategories, ...menuItems.map(i => i.category)])].filter(Boolean);

  useEffect(() => {
    localStorage.setItem('pos_custom_categories', JSON.stringify(customCategories));
  }, [customCategories]);

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

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    if (categories.includes(newCatName.trim())) { alert('Kategori sudah ada!'); return; }
    setCustomCategories([...customCategories, newCatName.trim()]);
    setNewCatName('');
  };

  const handleDeleteCategory = async (cat) => {
    if (cat === 'Lainnya') { alert('Kategori Lainnya tidak dapat dihapus'); return; }
    if (!window.confirm(`Hapus kategori "${cat}"? Semua menu di dalamnya akan otomatis dipindah ke "Lainnya".`)) return;
    
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/menu/category/delete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({ category: cat })
      });
      const data = await res.json();
      if (data.success) {
        setCustomCategories(customCategories.filter(c => c !== cat));
        loadMenu();
        showMsg(`Kategori dihapus. ${data.updatedCount} item dipindah ke Lainnya.`);
      }
    } catch (e) { showMsg('Gagal menghapus kategori', 'error'); }
  };

  const handleRenameCategory = async (oldCat, newCat) => {
    if (!newCat.trim() || oldCat === newCat) { setEditingCat(null); return; }
    if (categories.includes(newCat.trim()) && oldCat !== newCat.trim()) { alert('Kategori sudah ada!'); return; }
    if (oldCat === 'Lainnya') { alert('Kategori Lainnya tidak dapat diedit'); return; }

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/menu/category/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({ oldCategory: oldCat, newCategory: newCat.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setCustomCategories(customCategories.map(c => c === oldCat ? newCat.trim() : c));
        if (form.category === oldCat) setForm({...form, category: newCat.trim()});
        setEditingCat(null);
        loadMenu();
        showMsg(`Kategori diubah. ${data.updatedCount} item diperbarui.`);
      }
    } catch (e) { showMsg('Gagal mengubah kategori', 'error'); }
  };

  const cost = parseFloat(form.cost_price) || 0;
  const prof = parseFloat(form.profit) || 0;
  const sellingPrice = cost + prof;
  const profitPercentage = cost > 0 ? ((prof / cost) * 100).toFixed(1) : 0;

  const grouped = categories.reduce((acc, cat) => {
    const items = menuItems.filter(i => i.category === cat);
    if (items.length > 0 || !filterCategory) acc[cat] = items;
    return acc;
  }, {});

  const inp = {
    width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px',
    fontSize: '14px', outline: 'none', background: '#fff', color: '#2D3B2D',
    boxSizing: 'border-box',
  };
  const label = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '28px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '0 0 8px 0' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Kembali
          </button>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D3B2D', margin: 0 }}>Manajemen Menu</h1>
          <p style={{ color: '#888', fontSize: '13px', margin: '2px 0 0' }}>{menuItems.length} item terdaftar</p>
        </div>
        <button
          id="menu-add-btn"
          onClick={() => { resetForm(); setShowForm(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#2D5A3F', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(45,90,63,0.3)', transition: 'all 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          + Tambah Menu
        </button>
      </div>

      {/* Message */}
      {message.text && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 500, background: message.type === 'error' ? '#fee2e2' : '#dcfce7', color: message.type === 'error' ? '#dc2626' : '#16a34a', border: `1px solid ${message.type === 'error' ? '#fca5a5' : '#86efac'}` }}>
          {message.text}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{ marginBottom: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#2D3B2D', marginTop: 0, marginBottom: '20px' }}>{editItem ? '✏️ Edit Menu' : '➕ Tambah Menu Baru'}</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Nama */}
              <div>
                <label style={label}>Nama Menu *</label>
                <input id="menu-form-name" type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Contoh: Nasi Goreng" style={inp} />
              </div>

              {/* Kategori */}
              <div>
                <label style={label}>Kategori *</label>
                <select id="menu-form-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...inp, cursor: 'pointer' }}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Harga Modal */}
              <div>
                <label style={label}>Harga Modal *</label>
                <input id="menu-form-cost" type="text" value={form.cost_price ? formatRupiah(form.cost_price) : ''} onChange={e => setForm({ ...form, cost_price: e.target.value.replace(/\D/g, '') })} required placeholder="Rp. 15.000" style={inp} />
              </div>

              {/* Profit */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ ...label, marginBottom: 0 }}>Profit *</label>
                  {prof > 0 && cost > 0 && (
                    <span style={{ color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                      +{profitPercentage}%
                    </span>
                  )}
                </div>
                <input id="menu-form-profit" type="text" value={form.profit ? formatRupiah(form.profit) : ''} onChange={e => setForm({ ...form, profit: e.target.value.replace(/\D/g, '') })} required placeholder="Rp. 10.000" style={inp} />
              </div>

              {/* Harga Jual (auto-calculated) */}
              <div style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, #EAF2EC, #E0EDE3)', border: '1px solid rgba(45,90,63,0.2)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '12px', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Harga Jual Otomatis (Modal + Profit)</p>
                  <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color: '#2D5A3F' }}>{formatRupiah(sellingPrice)}</p>
                </div>
                <span style={{ fontSize: '28px' }}>🏷️</span>
              </div>

              {/* Status */}
              <div>
                <label style={label}>Status</label>
                <select id="menu-form-status" value={form.is_available} onChange={e => setForm({ ...form, is_available: e.target.value === 'true' })} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="true">✅ Tersedia</option>
                  <option value="false">❌ Tidak Tersedia</option>
                </select>
              </div>

              {/* Diskon */}
              <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ ...label, marginBottom: 0 }}>Pengaturan Diskon</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#555', fontWeight: 600 }}>
                    <input type="checkbox" checked={form.is_discount_active} onChange={e => setForm({ ...form, is_discount_active: e.target.checked })} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                    Aktifkan Diskon
                  </label>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', opacity: form.is_discount_active ? 1 : 0.5, pointerEvents: form.is_discount_active ? 'auto' : 'none' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Diskon Nominal</label>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <span style={{ padding: '0 12px', color: '#64748b', fontWeight: 600, fontSize: '14px', borderRight: '1px solid #e2e8f0' }}>Rp</span>
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
                        style={{ ...inp, border: 'none', borderRadius: 0 }} 
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Diskon Persentase</label>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
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
                        style={{ ...inp, border: 'none', borderRadius: 0 }} 
                      />
                      <span style={{ padding: '0 12px', color: '#64748b', fontWeight: 600, fontSize: '14px', borderLeft: '1px solid #e2e8f0' }}>%</span>
                    </div>
                  </div>
                </div>

                {form.is_discount_active && (parseFloat(form.discount_nominal) > 0) && (
                  <div style={{ marginTop: '12px', padding: '10px 12px', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#64748b' }}>Simulasi Harga (Setelah Diskon):</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>Harga Jual:</span>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#dc2626' }}>
                        {formatRupiah(((parseFloat(form.cost_price) || 0) + (parseFloat(form.profit) || 0)) - parseFloat(form.discount_nominal))}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>Profit Bersih:</span>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: (parseFloat(form.profit) || 0) - parseFloat(form.discount_nominal) < 0 ? '#dc2626' : '#16a34a' }}>
                        {formatRupiah((parseFloat(form.profit) || 0) - parseFloat(form.discount_nominal))} 
                        <span style={{ fontSize: '11px', fontWeight: 600, marginLeft: '4px' }}>
                          ({parseFloat(form.cost_price) > 0 ? (((parseFloat(form.profit) || 0) - parseFloat(form.discount_nominal)) / parseFloat(form.cost_price) * 100).toFixed(1) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Foto */}
              <div>
                <label style={label}>Foto Menu</label>
                <div
                  onClick={() => fileInputRef.current.click()}
                  style={{ border: '2px dashed #e2e8f0', borderRadius: '10px', padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#2D5A3F'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="preview" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px' }} />
                  ) : (
                    <div style={{ width: '56px', height: '56px', background: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>📷</div>
                  )}
                  <div>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#2D3B2D' }}>{imagePreview ? 'Ganti Foto' : 'Upload Foto'}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#aaa' }}>JPG, PNG, WEBP maks. 5MB</p>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
              </div>

              {/* Deskripsi */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={label}>Deskripsi</label>
                <textarea id="menu-form-desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Deskripsi singkat menu..." style={{ ...inp, resize: 'none' }} />
              </div>

              {/* ═══ OPSI MENU (Variants) ═══ */}
              <div style={{ gridColumn: '1 / -1', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ ...label, marginBottom: 0 }}>Opsi Menu (Varian)</label>
                  <button type="button" onClick={() => {
                    setForm({ ...form, options: [...(form.options || []), { name: '', choices: [''] }] });
                  }} style={{ padding: '6px 14px', background: '#2D5A3F', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                    + Tambah Grup Opsi
                  </button>
                </div>

                {(!form.options || form.options.length === 0) && (
                  <p style={{ color: '#9ca3af', fontSize: '13px', margin: '8px 0', fontStyle: 'italic' }}>Belum ada opsi. Klik "Tambah Grup Opsi" untuk menambah (misal: Level Pedas, Topping, dll.)</p>
                )}

                {(form.options || []).map((optGroup, gi) => (
                  <div key={gi} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Nama Grup (Opsional)"
                        value={optGroup.name}
                        onChange={e => {
                          const opts = [...form.options];
                          opts[gi] = { ...opts[gi], name: e.target.value };
                          setForm({ ...form, options: opts });
                        }}
                        style={{ ...inp, flex: 1 }}
                      />
                      <button type="button" onClick={() => {
                        const opts = form.options.filter((_, i) => i !== gi);
                        setForm({ ...form, options: opts });
                      }} style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>
                        🗑️ Hapus Grup
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {optGroup.choices.map((choice, ci) => (
                        <div key={ci} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
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
                            style={{ ...inp, width: '140px' }}
                          />
                          {optGroup.choices.length > 1 && (
                            <button type="button" onClick={() => {
                              const opts = [...form.options];
                              const ch = opts[gi].choices.filter((_, i) => i !== ci);
                              opts[gi] = { ...opts[gi], choices: ch };
                              setForm({ ...form, options: opts });
                            }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: '16px', padding: '2px' }}>×</button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => {
                        const opts = [...form.options];
                        opts[gi] = { ...opts[gi], choices: [...opts[gi].choices, ''] };
                        setForm({ ...form, options: opts });
                      }} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px dashed #94a3b8', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                        + Pilihan
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px' }}>
                <button id="menu-form-save" type="submit" disabled={saving} style={{ flex: 1, padding: '12px', background: saving ? '#aaa' : '#2D5A3F', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
                  {saving ? '⏳ Menyimpan...' : editItem ? '💾 Update Menu' : '➕ Simpan Menu'}
                </button>
                <button id="menu-form-cancel" type="button" onClick={resetForm} style={{ padding: '12px 24px', background: '#f1f5f9', color: '#555', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
                  Batal
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setFilterCategory('')} style={{ padding: '7px 18px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: !filterCategory ? '#2D5A3F' : '#f1f5f9', color: !filterCategory ? '#fff' : '#555', transition: 'all 0.15s' }}>Semua</button>
        {categories.map(c => (
          <button key={c} onClick={() => setFilterCategory(c)} style={{ padding: '7px 18px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: filterCategory === c ? '#2D5A3F' : '#f1f5f9', color: filterCategory === c ? '#fff' : '#555', transition: 'all 0.15s' }}>{c}</button>
        ))}
        <button onClick={() => setShowCategoryModal(true)} style={{ padding: '7px 18px', borderRadius: '20px', border: '1px dashed #2D5A3F', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: 'transparent', color: '#2D5A3F', transition: 'all 0.15s', marginLeft: 'auto' }}>⚙️ Kelola Kategori</button>
      </div>

      {/* Menu List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#aaa', fontSize: '15px' }}>⏳ Memuat menu...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} style={{ background: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0', overflow: 'hidden' }}>
              {/* Category Header */}
              <div style={{ padding: '12px 20px', background: 'linear-gradient(135deg, #2D3B2D, #3d3d3d)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontWeight: 700, color: '#FFFFFF', fontSize: '14px' }}>{cat}</h3>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: '20px' }}>{items.length} item</span>
              </div>

              {items.length === 0 ? (
                <p style={{ color: '#bbb', fontSize: '13px', textAlign: 'center', padding: '24px' }}>Belum ada menu di kategori ini</p>
              ) : (
                /* Responsive Card Grid — auto-fill columns, min 220px each */
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '12px',
                  padding: '16px',
                }}>
                  {items.map(item => (
                    <div key={item.id} style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'box-shadow 0.2s, border-color 0.2s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = '#2D5A3F'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >
                      {/* Image */}
                      <div style={{ width: '100%', height: '120px', overflow: 'hidden', background: '#e2e8f0', flexShrink: 0, position: 'relative' }}>
                        {item.image_url ? (
                          <img src={item.image_url.startsWith('/') ? `${process.env.REACT_APP_API_URL || ""}${item.image_url}` : item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>🍽️</div>
                        )}
                        {/* Status badge */}
                        <span style={{
                          position: 'absolute', top: '8px', right: '8px',
                          padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                          background: item.is_available ? '#dcfce7' : '#fee2e2',
                          color: item.is_available ? '#16a34a' : '#dc2626',
                        }}>
                          {item.is_available ? '✅ Tersedia' : '❌ Habis'}
                        </span>
                      </div>

                      {/* Info */}
                      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: '#2D3B2D', fontSize: '14px', lineHeight: 1.3 }}>{item.name}</p>
                        {item.description && (
                          <p style={{ margin: 0, fontSize: '11px', color: '#aaa', lineHeight: 1.4 }}>{item.description.substring(0, 60)}{item.description.length > 60 ? '…' : ''}</p>
                        )}

                        {/* Prices */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: '10px', color: '#aaa', fontWeight: 600, textTransform: 'uppercase' }}>Harga Jual</p>
                            {item.is_discount_active && (item.discount_percent > 0 || item.discount_nominal > 0) ? (
                              <>
                                <p style={{ margin: 0, fontWeight: 600, color: '#aaa', fontSize: '12px', textDecoration: 'line-through' }}>{formatRupiah(item.price)}</p>
                                <p style={{ margin: 0, fontWeight: 800, color: '#dc2626', fontSize: '16px' }}>
                                  {formatRupiah(item.price - (item.discount_nominal > 0 ? parseFloat(item.discount_nominal) : item.price * parseFloat(item.discount_percent) / 100))} 
                                  <span style={{fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '2px 4px', borderRadius: '4px', marginLeft: '4px'}}>
                                    {item.discount_nominal > 0 ? `-Rp ${parseFloat(item.discount_nominal).toLocaleString('id-ID')}` : `-${parseFloat(item.discount_percent)}%`}
                                  </span>
                                </p>
                              </>
                            ) : (
                              <p style={{ margin: 0, fontWeight: 800, color: '#2D5A3F', fontSize: '16px' }}>{formatRupiah(item.price)}</p>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>Modal: {formatRupiah(item.cost_price || 0)}</p>
                            <p style={{ margin: 0, fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>Profit: {formatRupiah(item.profit || 0)}</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            id={`menu-edit-${item.id}`}
                            onClick={() => handleEdit(item)}
                            style={{ flex: 1, padding: '7px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
                            onMouseLeave={e => e.currentTarget.style.background = '#eff6ff'}
                          >✏️ Edit</button>
                          <button
                            id={`menu-delete-${item.id}`}
                            onClick={() => handleDelete(item.id, item.name)}
                            style={{ flex: 1, padding: '7px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fef2f2'}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#2D3B2D' }}>Kelola Kategori</h2>
              <button onClick={() => setShowCategoryModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input type="text" placeholder="Nama kategori baru..." value={newCatName} onChange={e => setNewCatName(e.target.value)} style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none' }} onKeyDown={e => e.key === 'Enter' && handleAddCategory()} />
              <button onClick={handleAddCategory} style={{ padding: '10px 16px', background: '#2D5A3F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>Tambah</button>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {categories.map(cat => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  {editingCat === cat ? (
                    <input autoFocus type="text" value={editCatName} onChange={e => setEditCatName(e.target.value)} onBlur={() => handleRenameCategory(cat, editCatName)} onKeyDown={e => e.key === 'Enter' && handleRenameCategory(cat, editCatName)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #2D5A3F', borderRadius: '6px', fontSize: '14px', outline: 'none', marginRight: '8px' }} />
                  ) : (
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#2D3B2D', flex: 1 }}>{cat}</span>
                  )}
                  
                  {cat !== 'Lainnya' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { setEditingCat(cat); setEditCatName(cat); }} style={{ background: '#eff6ff', color: '#2563eb', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}>✏️</button>
                      <button onClick={() => handleDeleteCategory(cat)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}>🗑️</button>
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


