// =============================================
// CASHIER/POS COMPONENT
// =============================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import dbManager from '../utils/indexedDB';
import { printReceipt } from '../utils/printer';


const Cashier = ({ isOnline, onSyncUpdate, syncVersion = 0 }) => {
    const [menuItems, setMenuItems] = useState([]);
    const [cart, setCart] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [optionsDialog, setOptionsDialog] = useState(null); // {item, selectedOptions: {groupName: choice}}

    // =============================================
    // LOAD MENU (Offline-First)
    // =============================================
    const loadMenu = useCallback(async () => {
        try {
            if (isOnline) {
                // ONLINE: Selalu ambil dari server untuk data terbaru
                const url = `${process.env.REACT_APP_API_URL || ""}/api/menu?available=true&t=${new Date().getTime()}`;
                const response = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
                const data = await response.json();

                if (data.success) {
                    setMenuItems(data.data || []);
                    // Simpan ke IndexedDB untuk offline
                    try {
                        await dbManager.saveMenuItems(data.data || []);
                    } catch (dbErr) {
                        console.warn('⚠️ Gagal cache ke IndexedDB:', dbErr.message);
                    }
                    return;
                }
            }

            // OFFLINE atau server gagal: coba dari IndexedDB
            try {
                const items = await dbManager.getAvailableMenuItems();
                setMenuItems(items);
            } catch (dbErr) {
                console.warn('⚠️ IndexedDB tidak tersedia:', dbErr.message);
                setMenuItems([]);
            }

        } catch (error) {
            console.error('Error loading menu:', error);
            setMenuItems([]);
        }
    }, [isOnline]);

    useEffect(() => {
        loadMenu();
    }, [loadMenu]);

    // Reload menu data saat sync selesai (kembali online)
    useEffect(() => {
        if (syncVersion > 0 && isOnline) {
            loadMenu();
        }
    }, [syncVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    // =============================================
    // FORMAT RUPIAH
    // =============================================
    const formatRupiah = (amount) => {
        const number = parseFloat(amount) || 0;
        return 'Rp. ' + Math.round(number).toLocaleString('id-ID');
    };

    // =============================================
    // CART OPERATIONS
    // =============================================
    const addToCart = useCallback((item) => {
        // Jika item punya opsi, tampilkan dialog pilihan
        const itemOptions = item.options || [];
        const activeOptions = itemOptions
            .filter(og => og.choices && og.choices.filter(c => c).length > 0)
            .map((og, i) => ({ ...og, name: og.name || `Pilihan Tambahan ${i + 1}` }));
            
        if (activeOptions.length > 0) {
            const defaults = {};
            activeOptions.forEach(og => { defaults[og.name] = og.choices.find(c => c) || ''; });
            setOptionsDialog({ item, selectedOptions: defaults, activeOptions });
            return;
        }

        addItemDirectly(item, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart]);

    const addItemDirectly = (item, selectedOptions) => {
        // Buat unique key berdasarkan id + opsi yang dipilih
        const optionsKey = Object.entries(selectedOptions).sort().map(([k,v]) => `${k}:${v}`).join('|');
        const cartKey = `${item.id}__${optionsKey}`;

        let actualPrice = item.price;
        let discountAmount = 0;
        if (item.is_discount_active) {
            if (item.discount_nominal > 0) {
                discountAmount = parseFloat(item.discount_nominal);
                actualPrice = item.price - discountAmount;
            } else if (item.discount_percent > 0) {
                discountAmount = item.price * (item.discount_percent / 100);
                actualPrice = item.price - discountAmount;
            }
        }

        const existingIndex = cart.findIndex(c => c.cartKey === cartKey);

        if (existingIndex >= 0) {
            const newCart = [...cart];
            newCart[existingIndex].quantity += 1;
            setCart(newCart);
        } else {
            const optionsLabel = Object.values(selectedOptions).filter(v => v).join(', ');
            setCart([...cart, {
                ...item,
                cartKey,
                quantity: 1,
                original_price: item.price,
                price: actualPrice,
                discount_amount: discountAmount,
                selected_options: selectedOptions,
                options_label: optionsLabel,
            }]);
        }
    };

    const handleConfirmOptions = () => {
        if (!optionsDialog) return;
        addItemDirectly(optionsDialog.item, optionsDialog.selectedOptions);
        setOptionsDialog(null);
    };

    const updateQuantity = (cartKey, newQuantity) => {
        if (newQuantity <= 0) {
            removeFromCart(cartKey);
            return;
        }

        setCart(cart.map(item =>
            item.cartKey === cartKey ? { ...item, quantity: newQuantity } : item
        ));
    };

    const removeFromCart = (cartKey) => {
        setCart(cart.filter(item => item.cartKey !== cartKey));
    };

    const clearCart = () => {
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
    };

    // =============================================
    // CALCULATE TOTAL
    // =============================================
    const calculateTotal = () => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    };

    // =============================================
    // PROCESS TRANSACTION
    // =============================================
    const processTransaction = async () => {
        if (cart.length === 0) {
            alert('Keranjang masih kosong!');
            return;
        }

        setIsProcessing(true);

        try {
            const total = calculateTotal();
            // UUID v4 sebagai transaction ID unik dari sisi klien
            // Mencegah bentrok/duplikasi data (primary key collision)
            // saat sinkronisasi ke database utama
            const transactionId = uuidv4();
            const transactionCode = `TRX-${Date.now()}-${transactionId.split('-')[0].toUpperCase()}`;

            const transactionData = {
                id: transactionId,
                transaction_code: transactionCode,
                total_amount: total,
                payment_method: paymentMethod,
                customer_name: customerName || null,
                customer_phone: customerPhone || null,
                items: cart.map(item => ({
                    menu_item_id: item.id,
                    item_name: item.options_label ? `${item.name} (${item.options_label})` : item.name,
                    quantity: item.quantity,
                    unit_price: item.price,
                    original_price: item.original_price || item.price,
                    discount_amount: item.discount_amount || 0,
                    cost_price: item.cost_price || 0,
                    profit: item.profit || 0,
                    subtotal: item.price * item.quantity,
                selected_options: item.selected_options || {},
                })),
                created_at: new Date().toISOString(),
                token: localStorage.getItem('auth_token') // Injeksi token untuk sinkronisasi offline
            };

            let savedOnline = false;

            if (isOnline) {
                // ONLINE: Coba kirim ke server
                try {
                    const response = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/transactions`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('auth_token')}` 
                        },
                        body: JSON.stringify(transactionData)
                    });

                    const contentType = response.headers.get('content-type');
                    if (response.ok) {
                        if (contentType && contentType.includes('application/json')) {
                            const result = await response.json();
                            if (result.success) {
                                savedOnline = true;
                            }
                        } else {
                            savedOnline = true; // Anggap sukses walau 2xx non-json
                        }
                    } else {
                        // JIKA SERVER MENOLAK (4xx/5xx), Lempar error agar TIDAK masuk ke antrian offline!
                        let errMsg = `Server error: ${response.status}`;
                        if (contentType && contentType.includes('application/json')) {
                            const errData = await response.json();
                            errMsg = errData.message || errMsg;
                        }
                        throw new Error(errMsg);
                    }
                } catch (networkErr) {
                    // Cek apakah murni kegagalan koneksi (Server down / Failed to fetch)
                    if (networkErr.message.includes('Failed to fetch') || networkErr.name === 'TypeError') {
                        console.warn('⚠️ Server tidak dapat dijangkau, fallback ke offline:', networkErr.message);
                    } else {
                        // Jika ini error penolakan server (seperti 400 Bad Request / 500), lemparkan!
                        throw networkErr;
                    }
                }
            }

            if (!savedOnline) {
                // OFFLINE atau server gagal: Simpan ke IndexedDB queue
                await dbManager.addPendingTransaction(transactionData);
                onSyncUpdate();
            }

            // =============================================
            // PENTING: Clear cart dan beri feedback SEBELUM print!
            // =============================================
            // Ini mencegah masalah dimana user stuck di halaman struk
            // karena printReceipt() gagal atau membuka app lain.
            // Transaksi sudah tersimpan, jadi cart aman untuk dibersihkan.
            // =============================================
            clearCart();
            setIsProcessing(false); // Reset UI SEBELUM print agar tidak stuck "Memproses..."
            alert(savedOnline 
                ? '✅ Transaksi berhasil!' 
                : '⚠️ Transaksi disimpan offline. Akan disinkronkan otomatis saat online.');

            // Print receipt — dalam try-catch terpisah agar kegagalan
            // print TIDAK menghalangi penyelesaian transaksi
            try {
                await printReceipt(transactionData, transactionCode);
            } catch (printError) {
                console.error('Print failed (transaksi sudah tersimpan):', printError);
                // Tidak perlu alert tambahan, printReceipt sudah handle error-nya sendiri
            }
        } catch (error) {
            console.error('Transaction error:', error);
            alert('❌ Gagal memproses transaksi: ' + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // =============================================
    // FILTER MENU
    // =============================================
    const filteredMenu = menuItems.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
        return matchSearch && matchCategory;
    });

    const categories = useMemo(() => ['all', ...new Set(menuItems.map(item => item.category))], [menuItems]);

    // Build a quick lookup: itemId → quantity in cart
    const cartQuantityMap = useMemo(() => {
        const map = {};
        cart.forEach(c => {
            // Sum quantities for same item.id (across different options)
            map[c.id] = (map[c.id] || 0) + c.quantity;
        });
        return map;
    }, [cart]);

    const [showMobileCart, setShowMobileCart] = useState(false);
    const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

    return (
        <div style={{ padding: '12px', maxWidth: '100%' }}>

            {/* ===== MOBILE: Cart toggle bar ===== */}
            {cartCount > 0 && (
                <div
                    style={{
                        display: 'none',
                        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 45,
                        background: '#2D5A3F', color: '#fff',
                        padding: '14px 20px',
                        alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer',
                        boxShadow: '0 -4px 16px rgba(45,90,63,0.35)',
                    }}
                    className="mobile-cart-bar"
                    onClick={() => setShowMobileCart(true)}
                >
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>🛒 {cartCount} item</span>
                    <span style={{ fontWeight: 800, fontSize: '16px' }}>{formatRupiah(calculateTotal())} →</span>
                </div>
            )}

            {/* ===== MOBILE: Cart bottom sheet overlay ===== */}
            {showMobileCart && (
                <div
                    style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 55 }}
                    onClick={() => setShowMobileCart(false)}
                />
            )}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
                background: '#fff', borderRadius: '20px 20px 0 0',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
                maxHeight: '100%', overflowY: 'auto',
                transform: showMobileCart ? 'translateY(0)' : 'translateY(100%)',
                transition: 'transform 0.3s cubic-bezier(.4,0,.2,1)',
                padding: '0 16px 80px',
            }} className="mobile-cart-sheet">
                {/* Handle + close */}
                <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
                    <div style={{ width: '40px', height: '4px', background: '#e2e8f0', borderRadius: '2px', margin: '0 auto 8px' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#282828' }}>Keranjang</h2>
                        <button onClick={() => setShowMobileCart(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                    </div>
                </div>
                {/* Cart content (same as desktop, repeated for mobile sheet) */}
                {cart.map(item => (
                    <div key={item.cartKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', padding: '10px 0' }}>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, fontSize: '14px', color: '#282828' }}>{item.name}</p>
                            {item.options_label && <p style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic', margin: '2px 0' }}>{item.options_label}</p>}
                            <p style={{ fontSize: '13px', fontWeight: 700, color: '#2D5A3F' }}>{formatRupiah(item.price)}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button style={{ width: '28px', height: '28px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }} onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}>-</button>
                            <span style={{ fontWeight: 700, width: '24px', textAlign: 'center' }}>{item.quantity}</span>
                            <button style={{ width: '28px', height: '28px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }} onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}>+</button>
                            <button style={{ marginLeft: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} onClick={() => removeFromCart(item.cartKey)}>🗑️</button>
                        </div>
                    </div>
                ))}
                {/* Customer + Payment + Checkout */}
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input type="text" placeholder="Nama Pelanggan (Opsional)" style={{ width: '100%', padding: '12px 14px', background: '#282828', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', outline: 'none' }} value={customerName} onChange={e => setCustomerName(e.target.value)} />
                    <input type="tel" placeholder="No. HP (Opsional)" style={{ width: '100%', padding: '12px 14px', background: '#282828', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', outline: 'none' }} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                    <select style={{ width: '100%', padding: '12px 14px', background: '#282828', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', outline: 'none' }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                        <option value="cash">Cash</option>
                        <option value="debit">Debit Card</option>
                        <option value="qris">QRIS</option>
                    </select>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid #f1f5f9' }}>
                        <span style={{ fontWeight: 700, fontSize: '16px', color: '#282828' }}>TOTAL:</span>
                        <span style={{ fontWeight: 800, fontSize: '22px', color: '#2D5A3F' }}>{formatRupiah(calculateTotal())}</span>
                    </div>
                    <button
                        style={{ width: '100%', padding: '14px', background: isProcessing || cart.length === 0 ? '#d1d5db' : '#2D5A3F', color: isProcessing || cart.length === 0 ? '#9ca3af' : '#fff', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '16px', cursor: isProcessing || cart.length === 0 ? 'not-allowed' : 'pointer' }}
                        onClick={processTransaction}
                        disabled={isProcessing || cart.length === 0}
                    >{isProcessing ? '⏳ Memproses...' : 'Bayar & Cetak'}</button>
                    <button style={{ width: '100%', padding: '11px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }} onClick={() => { clearCart(); setShowMobileCart(false); }}>Bersihkan Keranjang</button>
                </div>
            </div>

            {/* ===== DESKTOP + TABLET layout ===== */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)',
                gap: '16px',
                alignItems: 'start',
            }} className="cashier-grid">

                {/* LEFT: Menu */}
                <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', padding: '16px', minWidth: 0 }}>
                    <h2 style={{ fontSize: 'clamp(16px, 3vw, 22px)', fontWeight: 800, color: '#282828', marginBottom: '14px' }}>Menu Items</h2>

                    {/* Search */}
                    <input
                        type="text"
                        placeholder="🔍 Cari menu..."
                        style={{ width: '100%', padding: '10px 14px', background: '#282828', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' }}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />

                    {/* Category pills */}
                    <div className="category-scroll" style={{ display: 'flex', gap: '8px', paddingBottom: '8px', marginBottom: '14px' }}>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                style={{
                                    padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                                    fontSize: '13px', fontWeight: 600, flexShrink: 0,
                                    background: selectedCategory === cat ? '#2D5A3F' : '#f1f5f9',
                                    color: selectedCategory === cat ? '#fff' : '#282828',
                                    transition: 'background 0.15s, color 0.15s',
                                    WebkitTapHighlightColor: 'transparent',
                                }}
                            >{cat.charAt(0).toUpperCase() + cat.slice(1)}</button>
                        ))}
                    </div>

                    {/* Menu grid — auto-fill */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                        gap: '10px',
                    }}>
                        {filteredMenu.map(item => {
                            const qty = cartQuantityMap[item.id] || 0;
                            const inCart = qty > 0;
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => addToCart(item)}
                                    className="menu-card"
                                    style={{
                                        border: inCart ? '2px solid #2D5A3F' : '1px solid #e5e7eb',
                                        borderRadius: '12px',
                                        padding: '10px',
                                        cursor: 'pointer',
                                        background: inCart ? '#F0F7F2' : '#fafafa',
                                        position: 'relative',
                                    }}
                                >
                                    {/* FIX 3: Quantity badge */}
                                    {inCart && (
                                        <div className="menu-card-badge" key={qty}>
                                            {qty}
                                        </div>
                                    )}
                                    {item.image_url && (
                                        <img
                                            src={item.image_url.startsWith('/') ? `${process.env.REACT_APP_API_URL || ""}${item.image_url}` : item.image_url}
                                            alt={item.name}
                                            loading="lazy"
                                            style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px', display: 'block' }}
                                        />
                                    )}
                                    <p style={{ fontWeight: 700, fontSize: '13px', color: '#282828', marginBottom: '4px', lineHeight: 1.3 }}>{item.name}</p>
                                    {item.is_discount_active && (item.discount_percent > 0 || item.discount_nominal > 0) ? (
                                        <>
                                            <p style={{ fontWeight: 600, fontSize: '11px', color: '#aaa', textDecoration: 'line-through', marginBottom: '2px' }}>{formatRupiah(item.price)}</p>
                                            <p style={{ fontWeight: 800, fontSize: '13px', color: '#dc2626' }}>
                                                {formatRupiah(item.price - (item.discount_nominal > 0 ? parseFloat(item.discount_nominal) : item.price * parseFloat(item.discount_percent) / 100))} 
                                                <span style={{fontSize:'10px', background:'#fee2e2', padding:'2px 4px', borderRadius:'4px', marginLeft:'4px'}}>
                                                    {item.discount_nominal > 0 ? `-Rp ${parseFloat(item.discount_nominal).toLocaleString('id-ID')}` : `-${parseFloat(item.discount_percent)}%`}
                                                </span>
                                            </p>
                                        </>
                                    ) : (
                                        <p style={{ fontWeight: 800, fontSize: '13px', color: '#2D5A3F' }}>{formatRupiah(item.price)}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {filteredMenu.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>Tidak ada menu ditemukan</div>
                    )}
                </div>

                {/* RIGHT: Cart (desktop only — hidden on mobile via CSS) */}
                <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', padding: '16px', position: 'sticky', top: '16px' }} className="desktop-cart">
                    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#282828', marginBottom: '14px' }}>Keranjang</h2>

                    <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '12px' }}>
                        {cart.map(item => (
                            <div key={item.cartKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', padding: '8px 0' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontWeight: 600, fontSize: '13px', color: '#282828', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                                    {item.options_label && <p style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic', margin: '1px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.options_label}</p>}
                                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#2D5A3F' }}>{formatRupiah(item.price)}</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                    <button style={{ width: '26px', height: '26px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }} onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}>-</button>
                                    <span style={{ fontWeight: 700, fontSize: '13px', width: '20px', textAlign: 'center' }}>{item.quantity}</span>
                                    <button style={{ width: '26px', height: '26px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }} onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}>+</button>
                                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '2px' }} onClick={() => removeFromCart(item.cartKey)}>🗑️</button>
                                </div>
                            </div>
                        ))}
                        {cart.length === 0 && <p style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: '14px' }}>Keranjang kosong</p>}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input type="text" placeholder="Nama Pelanggan (Opsional)" style={{ width: '100%', padding: '10px 14px', background: '#282828', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} value={customerName} onChange={e => setCustomerName(e.target.value)} />
                        <input type="tel" placeholder="No. HP (Opsional)" style={{ width: '100%', padding: '10px 14px', background: '#282828', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                        <select style={{ width: '100%', padding: '10px 14px', background: '#282828', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                            <option value="cash">Cash</option>
                            <option value="debit">Debit Card</option>
                            <option value="qris">QRIS</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0', padding: '12px 0', borderTop: '2px solid #f1f5f9' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#282828' }}>TOTAL:</span>
                        <span style={{ fontWeight: 800, fontSize: '20px', color: '#2D5A3F' }}>{formatRupiah(calculateTotal())}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button
                            style={{ width: '100%', padding: '13px', background: isProcessing || cart.length === 0 ? '#d1d5db' : '#2D5A3F', color: isProcessing || cart.length === 0 ? '#9ca3af' : '#fff', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '15px', cursor: isProcessing || cart.length === 0 ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                            onClick={processTransaction}
                            disabled={isProcessing || cart.length === 0}
                        >{isProcessing ? '⏳ Memproses...' : 'Bayar & Cetak'}</button>
                        <button style={{ width: '100%', padding: '10px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }} onClick={clearCart} disabled={cart.length === 0}>Bersihkan Keranjang</button>
                    </div>
                </div>
            </div>

            {/* ===== OPTIONS SELECTION DIALOG ===== */}
            {optionsDialog && (
                <>
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} onClick={() => setOptionsDialog(null)} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        background: '#fff', borderRadius: '16px', padding: '24px', zIndex: 101,
                        width: '90%', maxWidth: '380px', maxHeight: '80vh', overflowY: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800, color: '#282828' }}>{optionsDialog.item.name}</h3>
                        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>Pilih opsi untuk menu ini:</p>

                        {(optionsDialog.activeOptions || []).map((optGroup, gi) => (
                            <div key={gi} style={{ marginBottom: '16px' }}>
                                <p style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{optGroup.name}</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {optGroup.choices.filter(c => c).map((choice, ci) => {
                                        const isSelected = optionsDialog.selectedOptions[optGroup.name] === choice;
                                        return (
                                            <button
                                                key={ci}
                                                type="button"
                                                onClick={() => {
                                                    setOptionsDialog({
                                                        ...optionsDialog,
                                                        selectedOptions: { ...optionsDialog.selectedOptions, [optGroup.name]: choice }
                                                    });
                                                }}
                                                style={{
                                                    padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                    border: isSelected ? '2px solid #2D5A3F' : '1px solid #e5e7eb',
                                                    background: isSelected ? '#EAF2EC' : '#fafafa',
                                                    color: isSelected ? '#2D5A3F' : '#555',
                                                }}
                                            >
                                                {isSelected && '✓ '}{choice}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                            <button
                                onClick={handleConfirmOptions}
                                style={{ flex: 1, padding: '12px', background: '#2D5A3F', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
                            >
                                + Tambah ke Keranjang
                            </button>
                            <button
                                onClick={() => setOptionsDialog(null)}
                                style={{ padding: '12px 20px', background: '#f1f5f9', color: '#555', border: 'none', borderRadius: '12px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
export default Cashier;

