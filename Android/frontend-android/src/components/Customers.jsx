// =============================================
// DATA PELANGGAN COMPONENT
// =============================================
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const Customers = ({ isOnline, syncVersion = 0 }) => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState([]);
    const [summary, setSummary] = useState(null);
    const [period, setPeriod] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('total_spent');
    const [sortDir, setSortDir] = useState('desc');

    // =============================================
    // LOAD CUSTOMER DATA
    // =============================================
    const loadCustomerData = useCallback(async () => {
        if (period === 'custom' && (!startDate || !endDate)) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            let qs = `?period=${period}`;
            if (period === 'custom') {
                qs += `&startDate=${startDate}&endDate=${endDate}`;
            }

            const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/customers${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
            const json = await res.json();

            if (json.success) {
                setCustomers(json.data || []);
                setSummary(json.summary || null);
            }
        } catch (error) {
            console.error('Error loading customers:', error);
        } finally {
            setLoading(false);
        }
    }, [period, startDate, endDate]);

    useEffect(() => {
        if (isOnline) {
            loadCustomerData();
        }
    }, [isOnline, loadCustomerData]);

    // Auto-refresh after sync
    useEffect(() => {
        if (syncVersion > 0 && isOnline) {
            loadCustomerData();
        }
    }, [syncVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    // =============================================
    // SORT & FILTER
    // =============================================
    const handleSort = (field) => {
        if (sortBy === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDir('desc');
        }
    };

    const filteredCustomers = customers
        .filter(c => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (c.customer_name || '').toLowerCase().includes(q) ||
                   (c.customer_phone || '').toLowerCase().includes(q);
        })
        .sort((a, b) => {
            let valA, valB;
            switch (sortBy) {
                case 'customer_name':
                    valA = (a.customer_name || '').toLowerCase();
                    valB = (b.customer_name || '').toLowerCase();
                    return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'total_transactions':
                    valA = parseInt(a.total_transactions) || 0;
                    valB = parseInt(b.total_transactions) || 0;
                    break;
                case 'total_spent':
                    valA = parseFloat(a.total_spent) || 0;
                    valB = parseFloat(b.total_spent) || 0;
                    break;
                case 'last_transaction':
                    valA = new Date(a.last_transaction).getTime();
                    valB = new Date(b.last_transaction).getTime();
                    break;
                case 'avg_transaction':
                    valA = parseFloat(a.avg_transaction) || 0;
                    valB = parseFloat(b.avg_transaction) || 0;
                    break;
                default:
                    valA = parseFloat(a.total_spent) || 0;
                    valB = parseFloat(b.total_spent) || 0;
            }
            return sortDir === 'asc' ? valA - valB : valB - valA;
        });

    // =============================================
    // EXPORT PDF
    // =============================================
    const exportToPDF = async () => {
        const doc = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 14;
        let y = 20;

        const fmtRp = (v) => `Rp ${Math.round(parseFloat(v) || 0).toLocaleString('id-ID')}`;

        const getPeriodLabel = () => {
            if (period === 'all') return 'Semua Waktu';
            if (period === 'weekly') return '7 Hari Terakhir';
            if (period === 'monthly') return '30 Hari Terakhir';
            if (period === 'custom' && startDate && endDate) {
                return `${new Date(startDate).toLocaleDateString('id-ID')} - ${new Date(endDate).toLocaleDateString('id-ID')}`;
            }
            return period;
        };

        const addFooter = (pageNum, totalPages) => {
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'italic');
            doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, margin, pageH - 10);
            doc.text(`Halaman ${pageNum} / ${totalPages}`, pageW - margin, pageH - 10, { align: 'right' });
        };

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(45, 90, 63);
        doc.text(localStorage.getItem('app_name') || 'Warung Nasi Rames Bu Rofi', margin, y);
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text('Laporan Data Pelanggan', pageW - margin, y, { align: 'right' });
        y += 10;

        doc.setDrawColor(45, 90, 63);
        doc.setLineWidth(0.8);
        doc.line(margin, y, pageW - margin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
        y += 5;
        doc.text(`Periode: ${getPeriodLabel()}`, margin, y);
        y += 10;

        // Summary table
        if (summary) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(40, 40, 40);
            doc.text('Ringkasan Pelanggan', margin, y);
            y += 2;

            autoTable(doc, {
                startY: y,
                head: [['Metrik', 'Nilai']],
                body: [
                    ['Total Pelanggan Unik', `${summary.total_customers} pelanggan`],
                    ['Total Transaksi', `${summary.total_transactions} transaksi`],
                    ['Total Pengeluaran Semua Pelanggan', fmtRp(summary.total_spent)],
                    ['Rata-rata Pengeluaran per Pelanggan', fmtRp(summary.avg_spent_per_customer)],
                ],
                theme: 'grid',
                headStyles: { fillColor: [45, 90, 63], textColor: 255, fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 9 },
                alternateRowStyles: { fillColor: [234, 242, 236] },
                margin: { left: margin, right: margin },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // Customer table
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(40, 40, 40);
        doc.text(`Daftar Pelanggan (${filteredCustomers.length} pelanggan)`, margin, y);
        y += 2;

        autoTable(doc, {
            startY: y,
            head: [['No', 'Nama', 'No. Telepon', 'Total TRX', 'Total Belanja', 'Rata-rata', 'Terakhir TRX']],
            body: filteredCustomers.map((c, i) => [
                i + 1,
                c.customer_name || '-',
                c.customer_phone || '-',
                c.total_transactions,
                fmtRp(c.total_spent),
                fmtRp(c.avg_transaction),
                new Date(c.last_transaction).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
            ]),
            theme: 'grid',
            headStyles: { fillColor: [45, 90, 63], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [234, 242, 236] },
            margin: { left: margin, right: margin },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 35 },
                2: { cellWidth: 30 },
                3: { cellWidth: 18, halign: 'center' },
                4: { cellWidth: 30, halign: 'right' },
                5: { cellWidth: 28, halign: 'right' },
                6: { cellWidth: 30 },
            },
        });

        // Add page numbers
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            addFooter(i, totalPages);
        }

        const fileName = `data-pelanggan-${getPeriodLabel().replace(/\s/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
        
        if (Capacitor.isNativePlatform()) {
            try {
                // Konversi PDF ke base64
                const base64PDF = doc.output('datauristring').split(',')[1];
                
                // Simpan ke Cache
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64PDF,
                    directory: Directory.Cache,
                });
                
                // Buka dialog share/buka file
                await Share.share({
                    title: fileName,
                    text: 'Data Pelanggan PDF',
                    url: savedFile.uri,
                    dialogTitle: 'Buka atau Bagikan PDF'
                });
            } catch (err) {
                console.error("PDF Save Error: ", err);
                alert("Gagal menyimpan PDF: " + err.message);
            }
        } else {
            doc.save(fileName);
        }
    };

    // =============================================
    // SORT INDICATOR
    // =============================================
    const SortIcon = ({ field }) => {
        if (sortBy !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
        return <span style={{ marginLeft: '4px', color: '#2D5A3F' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    // =============================================
    // RENDER
    // =============================================
    if (!isOnline) {
        return (
            <div className="container mx-auto p-6">
                <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 rounded">
                    <p className="text-yellow-700">
                        ⚠️ Data pelanggan memerlukan koneksi internet. Silakan hubungkan ke internet untuk melihat data.
                    </p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="container mx-auto p-6 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading data pelanggan...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '16px', maxWidth: '100%' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                <div>
                    <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '0 0 8px 0' }}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Kembali
                    </button>
                    <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 800, color: '#2D3B2D', margin: 0 }}>Data Pelanggan</h1>
                </div>
                {/* Controls */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    {period === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexWrap: 'wrap' }}>
                            <input
                                type="date"
                                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', cursor: 'pointer', minWidth: '130px' }}
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                            <span style={{ color: '#9ca3af', fontWeight: 700 }}>–</span>
                            <input
                                type="date"
                                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', cursor: 'pointer', minWidth: '130px' }}
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                    )}
                    <select
                        id="customer-period-filter"
                        style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                    >
                        <option value="all">Semua Waktu</option>
                        <option value="weekly">7 Hari Terakhir</option>
                        <option value="monthly">30 Hari Terakhir</option>
                        <option value="custom">Custom Tanggal</option>
                    </select>
                    <button
                        id="customer-export-pdf"
                        style={{ padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onClick={exportToPDF}
                    >
                        📄 Export PDF
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px'
                }}>
                    {[
                        { label: 'Total Pelanggan', value: summary.total_customers, color: '#3b82f6', icon: '👥' },
                        { label: 'Total Transaksi', value: summary.total_transactions, color: '#16a34a', icon: '🧾' },
                        { label: 'Total Pengeluaran', value: `Rp ${parseFloat(summary.total_spent || 0).toLocaleString('id-ID')}`, color: '#2D5A3F', icon: '💰' },
                        { label: 'Rata-rata / Pelanggan', value: `Rp ${parseFloat(summary.avg_spent_per_customer || 0).toLocaleString('id-ID')}`, color: '#7c3aed', icon: '📊' },
                    ].map((card, i) => (
                        <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <span style={{ fontSize: '18px' }}>{card.icon}</span>
                                <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{card.label}</p>
                            </div>
                            <p style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 800, color: card.color, lineHeight: 1.2, wordBreak: 'break-all', margin: 0 }}>{card.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Search Bar */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ position: 'relative', maxWidth: '400px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#9ca3af' }}>🔍</span>
                    <input
                        id="customer-search"
                        type="text"
                        placeholder="Cari nama atau no. telepon..."
                        style={{
                            width: '100%', padding: '10px 14px 10px 38px', border: '1px solid #e2e8f0',
                            borderRadius: '10px', fontSize: '14px', outline: 'none', background: '#fff',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'border-color 0.2s',
                        }}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onFocus={e => e.target.style.borderColor = '#2D5A3F'}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    />
                </div>
            </div>

            {/* Customer Table */}
            <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D3B2D', margin: 0 }}>Daftar Pelanggan</h2>
                        <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>{filteredCustomers.length} pelanggan ditemukan</p>
                    </div>
                </div>

                {filteredCustomers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
                        <p style={{ fontWeight: 600 }}>Belum ada data pelanggan</p>
                        <p style={{ fontSize: '13px' }}>Data akan muncul setelah ada transaksi dengan nama pelanggan</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                            <thead>
                                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                    <th style={{ ...thStyle, width: '50px' }}>No</th>
                                    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('customer_name')}>
                                        Nama Pelanggan <SortIcon field="customer_name" />
                                    </th>
                                    <th style={thStyle}>No. Telepon</th>
                                    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('total_transactions')}>
                                        Total TRX <SortIcon field="total_transactions" />
                                    </th>
                                    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleSort('total_spent')}>
                                        Total Belanja <SortIcon field="total_spent" />
                                    </th>
                                    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleSort('avg_transaction')}>
                                        Rata-rata <SortIcon field="avg_transaction" />
                                    </th>
                                    <th style={thStyle}>Metode Bayar</th>
                                    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('last_transaction')}>
                                        Terakhir TRX <SortIcon field="last_transaction" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.map((c, idx) => (
                                    <tr key={idx} style={{
                                        borderBottom: '1px solid #f3f4f6',
                                        transition: 'background 0.15s',
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#EAF2EC'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#9ca3af' }}>{idx + 1}</td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{
                                                    width: '34px', height: '34px', borderRadius: '50%',
                                                    background: `hsl(${(c.customer_name || '').charCodeAt(0) * 7 % 360}, 55%, 50%)`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0,
                                                }}>
                                                    {(c.customer_name || '?')[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: 600, color: '#2D3B2D' }}>{c.customer_name || '-'}</span>
                                            </div>
                                        </td>
                                        <td style={{ ...tdStyle, color: '#6b7280' }}>
                                            {c.customer_phone !== '-' ? (
                                                <span style={{ padding: '2px 8px', background: '#f0fdf4', color: '#16a34a', borderRadius: '20px', fontSize: '12px' }}>
                                                    📞 {c.customer_phone}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#d1d5db', fontSize: '13px' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <span style={{
                                                padding: '3px 10px', background: '#eff6ff', color: '#3b82f6',
                                                borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                            }}>
                                                {c.total_transactions}x
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                                            Rp {parseFloat(c.total_spent || 0).toLocaleString('id-ID')}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280', fontSize: '13px' }}>
                                            Rp {parseFloat(c.avg_transaction || 0).toLocaleString('id-ID')}
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {(c.payment_methods || '').split(', ').map((pm, pi) => (
                                                    <span key={pi} style={{
                                                        padding: '2px 8px', background: '#2D3B2D', color: '#fff',
                                                        borderRadius: '20px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                                                    }}>
                                                        {pm}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: '13px', color: '#6b7280' }}>
                                            {new Date(c.last_transaction).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// =============================================
// SHARED STYLES
// =============================================
const thStyle = {
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'left',
    whiteSpace: 'nowrap',
};

const tdStyle = {
    padding: '12px 16px',
    fontSize: '14px',
};

export default Customers;
