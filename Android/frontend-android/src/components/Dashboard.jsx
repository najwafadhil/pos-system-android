// =============================================
// DASHBOARD & REPORTS COMPONENT
// =============================================
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
);

const Dashboard = ({ isOnline, syncVersion = 0 }) => {
    const navigate = useNavigate();
    const [dailyReport, setDailyReport] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [topItems, setTopItems] = useState([]);
    const [allTransactions, setAllTransactions] = useState([]);
    const [rawChartData, setRawChartData] = useState([]);
    const [period, setPeriod] = useState('weekly');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [txSortBy, setTxSortBy] = useState('created_at');
    const [txSortDir, setTxSortDir] = useState('desc');
    const [txSearchQuery, setTxSearchQuery] = useState('');

    const loadDashboardData = useCallback(async () => {
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

            const token = localStorage.getItem('auth_token');
            const fetchOpts = { headers: { Authorization: `Bearer ${token}` } };

            // Daily report
            const dailyRes = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/reports/daily`, fetchOpts);
            const dailyData = await dailyRes.json();
            setDailyReport(dailyData.data);

            // Chart data
            const chartRes = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/reports/chart${qs}`, fetchOpts);
            const chartJson = await chartRes.json();

            if (chartJson.success) {
                setRawChartData(chartJson.data || []);
                const labels = chartJson.data.map(d =>
                    new Date(d.date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })
                );
                const revenues = chartJson.data.map(d => parseFloat(d.revenue) || 0);
                const transactions = chartJson.data.map(d => parseInt(d.transactions) || 0);

                setChartData({
                    labels,
                    datasets: [
                        {
                            label: 'Revenue (Rp)',
                            data: revenues,
                            borderColor: 'rgb(59, 130, 246)',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            yAxisID: 'y'
                        },
                        {
                            label: 'Transactions',
                            data: transactions,
                            borderColor: 'rgb(16, 185, 129)',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            yAxisID: 'y1'
                        }
                    ]
                });
            }

            // Top items
            const topRes = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/reports/top-items${qs}&limit=10`, fetchOpts);
            const topData = await topRes.json();
            setTopItems(topData.data || []);

            // All transactions
            const txRes = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/transactions${qs}&limit=500`, fetchOpts);
            const txData = await txRes.json();
            setAllTransactions(txData.data || []);

        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    }, [period, startDate, endDate]);

    useEffect(() => {
        if (isOnline) {
            loadDashboardData();
        }
    }, [isOnline, loadDashboardData]);

    // =============================================
    // AUTO-REFRESH SETELAH SYNC SELESAI
    // =============================================
    // Ketika syncVersion berubah (artinya ada transaksi baru
    // yang berhasil disinkronisasi), refresh semua data dashboard.
    // =============================================
    useEffect(() => {
        if (syncVersion > 0 && isOnline) {
            console.log('🔄 Dashboard auto-refresh triggered by sync (version:', syncVersion, ')');
            loadDashboardData();
        }
    }, [syncVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    // =============================================
    // RESET DASHBOARD
    // =============================================
    const handleReset = () => {
        if (!window.confirm("Apakah Anda yakin ingin mereset tampilan dashboard menjadi 0? Data di database tidak akan terhapus.")) return;
        setDailyReport({
            total_transactions: 0,
            total_sales: 0,
            total_profit: 0,
            average_transaction: 0,
            highest_transaction: 0,
            lowest_transaction: 0
        });
        setChartData(null);
        setTopItems([]);
        setAllTransactions([]);
    };

    // =============================================
    // DELETE TRANSACTION
    // =============================================
    const handleDeleteTransaction = async (id) => {
        if (!window.confirm("Apakah Anda yakin ingin menghapus transaksi ini? Data akan dihapus secara permanen dari database.")) return;
        
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${process.env.REACT_APP_API_URL || ""}/api/transactions/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (data.success) {
                alert('Transaksi berhasil dihapus');
                loadDashboardData(); // Refresh data
            } else {
                alert('Gagal menghapus transaksi: ' + data.message);
            }
        } catch (error) {
            console.error('Error deleting transaction:', error);
            alert('Terjadi kesalahan saat menghapus transaksi');
        }
    };

    // =============================================
    // EXPORT TO PDF — Format Lengkap
    // =============================================
    const exportToPDF = async () => {
        const doc = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 14;
        let y = 20;

        // Helper: format Rupiah
        const fmtRp = (v) => `Rp ${Math.round(parseFloat(v) || 0).toLocaleString('id-ID')}`;

        // Helper: period label
        const getPeriodLabel = () => {
            if (period === 'weekly') return '7 Hari Terakhir';
            if (period === 'monthly') return '30 Hari Terakhir';
            if (period === 'custom' && startDate && endDate) {
                return `${new Date(startDate).toLocaleDateString('id-ID')} - ${new Date(endDate).toLocaleDateString('id-ID')}`;
            }
            return period;
        };

        // Helper: add footer to every page
        const addFooter = (pageNum, totalPages) => {
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'italic');
            doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, margin, pageH - 10);
            doc.text(`Halaman ${pageNum} / ${totalPages}`, pageW - margin, pageH - 10, { align: 'right' });
        };

        // Helper: check if we need a new page
        const checkPage = (needed) => {
            if (y + needed > pageH - 20) {
                doc.addPage();
                y = 20;
            }
        };

        // Helper: render chart to base64 image using offscreen canvas
        const renderChartToImage = (chartConfig, width, height) => {
            return new Promise((resolve) => {
                const canvas = document.createElement('canvas');
                canvas.width = width * 2;
                canvas.height = height * 2;
                const ctx = canvas.getContext('2d');
                ctx.scale(2, 2);

                const whiteBackgroundPlugin = {
                    id: 'customCanvasBackgroundColor',
                    beforeDraw: (chart) => {
                        const { ctx } = chart;
                        ctx.save();
                        ctx.globalCompositeOperation = 'destination-over';
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, chart.width, chart.height);
                        ctx.restore();
                    }
                };

                const chart = new ChartJS(ctx, {
                    ...chartConfig,
                    options: {
                        ...chartConfig.options,
                        responsive: false,
                        animation: false,
                        devicePixelRatio: 2,
                    },
                    plugins: [whiteBackgroundPlugin]
                });

                setTimeout(() => {
                    const img = canvas.toDataURL('image/jpeg', 0.8);
                    chart.destroy();
                    resolve(img);
                }, 300);
            });
        };

        // ════════════════════════════════════════════
        // PAGE 1: Header + Ringkasan Periode
        // ════════════════════════════════════════════

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(45, 90, 63);
        doc.text(localStorage.getItem('app_name') || 'Warung Nasi Rames Bu Rofi', margin, y);
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text('Laporan Penjualan', pageW - margin, y, { align: 'right' });
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

        // ── Ringkasan Periode (dari rawChartData) ──
        const periodTotalTx = rawChartData.reduce((s, d) => s + (parseInt(d.transactions) || 0), 0);
        const periodTotalRev = rawChartData.reduce((s, d) => s + (parseFloat(d.revenue) || 0), 0);
        const periodTotalProfit = rawChartData.reduce((s, d) => s + (parseFloat(d.profit) || 0), 0);
        const periodAvgDaily = rawChartData.length > 0 ? periodTotalRev / rawChartData.length : 0;
        const periodHighestDay = rawChartData.reduce((max, d) => Math.max(max, parseFloat(d.revenue) || 0), 0);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(40, 40, 40);
        doc.text('Ringkasan Periode', margin, y);
        y += 2;

        autoTable(doc, {
            startY: y,
            head: [['Metrik', 'Nilai']],
            body: [
                ['Total Transaksi', `${periodTotalTx} transaksi`],
                ['Total Pendapatan (Revenue)', fmtRp(periodTotalRev)],
                ['Total Profit (Keuntungan)', fmtRp(periodTotalProfit)],
                ['Rata-rata Harian', fmtRp(periodAvgDaily)],
                ['Pendapatan Tertinggi (1 hari)', fmtRp(periodHighestDay)],
                ['Jumlah Hari Aktif', `${rawChartData.length} hari`],
            ],
            theme: 'grid',
            headStyles: { fillColor: [45, 90, 63], textColor: 255, fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            alternateRowStyles: { fillColor: [234, 242, 236] },
            margin: { left: margin, right: margin },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
        });
        y = doc.lastAutoTable.finalY + 10;

        // ── Ringkasan Hari Ini ── (Dihapus sesuai permintaan)

        // ════════════════════════════════════════════
        // GRAPH: Trend Penjualan (Halaman 1)
        // ════════════════════════════════════════════
        if (rawChartData.length > 0) {
            checkPage(110);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(40, 40, 40);
            doc.text('Grafik Tren Penjualan', margin, y);
            y += 4;

            try {
                const trendLabels = rawChartData.map(d =>
                    new Date(d.date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })
                );
                const trendImg = await renderChartToImage({
                    type: 'line',
                    data: {
                        labels: trendLabels,
                        datasets: [{
                            label: 'Revenue (Rp)',
                            data: rawChartData.map(d => parseFloat(d.revenue) || 0),
                            borderColor: 'rgb(45, 90, 63)',
                            backgroundColor: 'rgba(45, 90, 63, 0.1)',
                            fill: true,
                            tension: 0.3,
                        }, {
                            label: 'Transaksi',
                            data: rawChartData.map(d => parseInt(d.transactions) || 0),
                            borderColor: 'rgb(59, 130, 246)',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            fill: false,
                            yAxisID: 'y1',
                        }],
                    },
                    options: {
                        scales: {
                            x: { ticks: { font: { size: 14, weight: '500' } } },
                            y: { position: 'left', title: { display: true, text: 'Revenue (Rp)', font: { size: 15, weight: 'bold' } }, ticks: { font: { size: 14 } } },
                            y1: { position: 'right', title: { display: true, text: 'Transaksi', font: { size: 15, weight: 'bold' } }, grid: { drawOnChartArea: false }, ticks: { font: { size: 14 } } },
                        },
                        plugins: { 
                            legend: { 
                                position: 'bottom',
                                labels: { font: { size: 16, weight: 'bold' }, color: '#333' }
                            } 
                        },
                    },
                }, 700, 300);

                const imgW = pageW - margin * 2;
                const imgH = imgW * (300 / 700);
                doc.addImage(trendImg, 'JPEG', margin, y, imgW, imgH, undefined, 'FAST');
                y += imgH + 10;
            } catch (err) {
                console.warn('Chart render failed:', err);
                y += 5;
            }
        }

        // ════════════════════════════════════════════
        // GRAPH: Top 10 Item Terlaris (Halaman 1)
        // ════════════════════════════════════════════
        if (topItems.length > 0) {
            checkPage(120);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(40, 40, 40);
            doc.text('Grafik Top 10 Item Terlaris', margin, y);
            y += 4;

            try {
                const barImg = await renderChartToImage({
                    type: 'bar',
                    data: {
                        labels: topItems.map(i => i.item_name.length > 18 ? i.item_name.substring(0, 18) + '…' : i.item_name),
                        datasets: [{
                            label: 'Qty Terjual',
                            data: topItems.map(i => parseInt(i.total_quantity)),
                            backgroundColor: 'rgba(45, 90, 63, 0.7)',
                            borderColor: 'rgb(45, 90, 63)',
                            borderWidth: 1,
                        }],
                    },
                    options: {
                        indexAxis: 'y',
                        scales: { 
                            x: { title: { display: true, text: 'Quantity', font: { size: 15, weight: 'bold' } }, ticks: { font: { size: 14 } } },
                            y: { ticks: { font: { size: 14, weight: '500' } } }
                        },
                        plugins: { legend: { display: false } },
                    },
                }, 700, 350);

                const imgW = pageW - margin * 2;
                const imgH = imgW * (350 / 700);
                doc.addImage(barImg, 'JPEG', margin, y, imgW, imgH, undefined, 'FAST');
                y += imgH + 10;
            } catch (err) {
                console.warn('Bar chart render failed:', err);
            }
        }

        // ════════════════════════════════════════════
        // GRAPH: Distribusi Jam Penjualan (Halaman 1)
        // ════════════════════════════════════════════
        const hourlyCounts = new Array(24).fill(0);
        allTransactions.forEach(tx => {
            const hour = new Date(tx.created_at).getHours();
            hourlyCounts[hour]++;
        });
        const activeHours = [];
        const activeCounts = [];
        hourlyCounts.forEach((count, hour) => {
            if (count > 0) {
                activeHours.push(`${String(hour).padStart(2, '0')}:00`);
                activeCounts.push(count);
            }
        });

        if (activeHours.length > 0) {
            checkPage(120);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(40, 40, 40);
            doc.text('Grafik Distribusi Jam Penjualan', margin, y);
            y += 4;

            try {
                const hourlyImg = await renderChartToImage({
                    type: 'bar',
                    data: {
                        labels: activeHours,
                        datasets: [{
                            label: 'Jumlah Transaksi',
                            data: activeCounts,
                            backgroundColor: 'rgba(200, 168, 78, 0.7)',
                            borderColor: 'rgb(200, 168, 78)',
                            borderWidth: 1,
                        }],
                    },
                    options: {
                        scales: { 
                            x: { ticks: { font: { size: 14, weight: '500' } } },
                            y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 14 } }, title: { display: true, text: 'Jumlah Transaksi', font: { size: 15, weight: 'bold' } } } 
                        },
                        plugins: { legend: { display: false } },
                    },
                }, 700, 300);

                const imgW = pageW - margin * 2;
                const imgH = imgW * (300 / 700);
                doc.addImage(hourlyImg, 'JPEG', margin, y, imgW, imgH, undefined, 'FAST');
                y += imgH + 10;
            } catch (err) {
                console.warn('Hourly chart render failed:', err);
            }
        }

        // ════════════════════════════════════════════
        // DAFTAR SEMUA TRANSAKSI + DETAIL (Halaman Baru, Tabel Tunggal)
        // ════════════════════════════════════════════
        if (allTransactions.length > 0) {
            doc.addPage();
            y = 20;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(40, 40, 40);
            doc.text(`Daftar Detail Transaksi (${allTransactions.length} transaksi)`, margin, y);
            y += 6;

            // Siapkan baris untuk tabel gabungan
            const combinedRows = [];
            let grandTotal = 0;
            let grandTotalProfit = 0;
            
            allTransactions.forEach((tx, idx) => {
                const validItems = (tx.items || []).filter(i => i && i.item_name);
                if (validItems.length === 0) return;

                const ts = new Date(tx.created_at);
                const dateTimeStr = ts.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const paymentMethod = (tx.payment_method || 'cash').toUpperCase();
                const customerName = tx.customer_name || '-';
                const totalAmount = fmtRp(tx.total_amount);
                grandTotal += parseFloat(tx.total_amount) || 0;
                
                let txProfit = 0;
                validItems.forEach(i => {
                    txProfit += (parseFloat(i.profit) || 0) * (parseInt(i.quantity) || 0);
                });
                grandTotalProfit += txProfit;
                
                const firstItem = validItems[0];
                
                // Tambahkan baris utama transaksi (informasi header per transaksi + item pertama)
                combinedRows.push([
                    { content: idx + 1, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
                    { content: dateTimeStr, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
                    { content: tx.transaction_code || '-', styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
                    { content: paymentMethod, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
                    { content: customerName, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
                    { content: firstItem.item_name, styles: { fillColor: [240, 240, 240] } },
                    { content: `${firstItem.quantity} x ${fmtRp(firstItem.unit_price)}`, styles: { fillColor: [240, 240, 240] } }
                ]);

                // Tambahkan baris untuk item berikutnya (jika ada lebih dari 1)
                for (let i = 1; i < validItems.length; i++) {
                    const item = validItems[i];
                    combinedRows.push([
                        '', // No
                        '', // Tanggal & Jam
                        '', // Kode
                        '', // Metode Pembayaran
                        '', // Pelanggan
                        item.item_name, // Nama Item
                        `${item.quantity} x ${fmtRp(item.unit_price)}` // Qty & Harga
                    ]);
                }

                // Tambahkan baris TOTAL per-transaksi HANYA jika item > 1
                if (validItems.length > 1) {
                    combinedRows.push([
                        '', '', '', '', '',
                        { content: 'TOTAL TRANSAKSI:', styles: { fontStyle: 'bold', halign: 'right' } },
                        { content: totalAmount, styles: { fontStyle: 'bold', textColor: [45, 90, 63] } }
                    ]);
                }
            });

            // Tambahkan baris GRAND TOTAL di paling bawah tabel
            if (combinedRows.length > 0) {
                combinedRows.push([
                    { content: 'GRAND TOTAL REVENUE SEMUA TRANSAKSI', colSpan: 6, styles: { fontStyle: 'bold', halign: 'right', fillColor: [45, 90, 63], textColor: 255 } },
                    { content: fmtRp(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [45, 90, 63], textColor: 255 } }
                ]);
                combinedRows.push([
                    { content: 'GRAND TOTAL PROFIT SEMUA TRANSAKSI', colSpan: 6, styles: { fontStyle: 'bold', halign: 'right', fillColor: [22, 163, 74], textColor: 255 } },
                    { content: fmtRp(grandTotalProfit), styles: { fontStyle: 'bold', halign: 'right', fillColor: [22, 163, 74], textColor: 255 } }
                ]);
            }

            autoTable(doc, {
                startY: y,
                head: [['No', 'Tanggal & Jam', 'Kode TRX', 'Metode', 'Pelanggan', 'Nama Item', 'Qty x Harga / Total']],
                body: combinedRows,
                theme: 'grid',
                headStyles: { fillColor: [45, 90, 63], textColor: 255, fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                margin: { left: margin, right: margin },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 35 },
                    3: { cellWidth: 15 },
                    4: { cellWidth: 25 },
                    5: { cellWidth: 40 },
                    6: { cellWidth: 35, halign: 'right' },
                },
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // ── Add page numbers to all pages ──
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            addFooter(i, totalPages);
        }

        // Save
        const fileName = `laporan-penjualan-${getPeriodLabel().replace(/\s/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
        
        if (Capacitor.isNativePlatform()) {
            try {
                // Konversi PDF ke base64 (tanpa prefix data URI)
                const base64PDF = doc.output('datauristring').split(',')[1];
                
                // Simpan ke direktori sementara (Cache) agar tidak butuh permission khusus
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64PDF,
                    directory: Directory.Cache,
                });
                
                // Panggil Share/Open dialog agar user bisa memilih untuk save, print, atau share
                await Share.share({
                    title: fileName,
                    text: 'Laporan Penjualan',
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


    if (!isOnline) {
        return (
            <div className="container mx-auto p-6">
                <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 rounded">
                    <p className="text-yellow-700">
                        ⚠️ Dashboard memerlukan koneksi internet. Silakan hubungkan ke internet untuk melihat laporan.
                    </p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="container mx-auto p-6 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading dashboard...</p>
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
                    <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 800, color: '#2D3B2D', margin: 0 }}>Dashboard</h1>
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
                        style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                    >
                        <option value="weekly">7 Hari Terakhir</option>
                        <option value="monthly">30 Hari Terakhir</option>
                        <option value="custom">Custom Tanggal</option>
                    </select>
                    <button
                        style={{ padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onClick={exportToPDF}
                    >
                        📄 Export PDF
                    </button>
                    <button
                        style={{ padding: '8px 14px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onClick={handleReset}
                    >
                        🔄 Reset
                    </button>
                </div>
            </div>

            {/* Stats Cards — Ringkasan Periode */}
            {(() => {
                const periodTx = rawChartData.reduce((s, d) => s + (parseInt(d.transactions) || 0), 0);
                const periodRev = rawChartData.reduce((s, d) => s + (parseFloat(d.revenue) || 0), 0);
                const periodProfit = rawChartData.reduce((s, d) => s + (parseFloat(d.profit) || 0), 0);
                const periodAvg = periodTx > 0 ? periodRev / periodTx : 0;
                const todayTx = parseInt(dailyReport?.total_transactions) || 0;
                const todaySales = parseFloat(dailyReport?.total_sales) || 0;
                const cards = [
                    { label: 'Total Transaksi (Periode)', value: periodTx, color: '#3b82f6' },
                    { label: 'Total Penjualan (Periode)', value: `Rp ${Math.round(periodRev).toLocaleString('id-ID')}`, color: '#16a34a' },
                    { label: 'Pendapatan Bersih (Periode)', value: `Rp ${Math.round(periodProfit).toLocaleString('id-ID')}`, color: '#2D5A3F' },
                    { label: 'Rata-rata / Transaksi', value: `Rp ${Math.round(periodAvg).toLocaleString('id-ID')}`, color: '#7c3aed' },
                    { label: 'Transaksi Hari Ini', value: todayTx, color: '#ea580c' },
                    { label: 'Penjualan Hari Ini', value: `Rp ${Math.round(todaySales).toLocaleString('id-ID')}`, color: '#0891b2' },
                ];
                return (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '14px',
                        marginBottom: '24px'
                    }}>
                        {cards.map((card, i) => (
                            <div key={i} style={{ background: '#fff', borderRadius: '12px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }}>
                                <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{card.label}</p>
                                <p style={{ fontSize: 'clamp(17px, 3vw, 22px)', fontWeight: 800, color: card.color, lineHeight: 1.2, wordBreak: 'break-all' }}>{card.value}</p>
                            </div>
                        ))}
                    </div>
                );
            })()}


            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 charts-grid">
                {chartData && (
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-bold mb-4">Tren Penjualan</h2>
                        <Line
                            data={chartData}
                            options={{
                                responsive: true,
                                interaction: { mode: 'index', intersect: false },
                                scales: {
                                    y: {
                                        type: 'linear',
                                        display: true,
                                        position: 'left',
                                        title: { display: true, text: 'Revenue (Rp)' }
                                    },
                                    y1: {
                                        type: 'linear',
                                        display: true,
                                        position: 'right',
                                        title: { display: true, text: 'Transactions' },
                                        grid: { drawOnChartArea: false },
                                        ticks: {
                                            stepSize: 1,
                                            precision: 0
                                        }
                                    }
                                }
                            }}
                        />
                    </div>
                )}

                {topItems.length > 0 && (
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-bold mb-4">Top 10 Item Terlaris</h2>
                        <Bar
                            data={{
                                labels: topItems.map(item => item.item_name.substring(0, 20)),
                                datasets: [{
                                    label: 'Quantity Sold',
                                    data: topItems.map(item => parseInt(item.total_quantity)),
                                    backgroundColor: 'rgba(59, 130, 246, 0.6)'
                                }]
                            }}
                            options={{
                                responsive: true,
                                indexAxis: 'y',
                                scales: {
                                    x: {
                                        title: { display: true, text: 'Quantity' },
                                        ticks: {
                                            stepSize: 1,
                                            precision: 0
                                        }
                                    }
                                }
                            }}
                        />
                    </div>
                )}

                {/* Distribusi Jam Penjualan — selalu tampil selama ada data transaksi */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4">Distribusi Jam Penjualan</h2>
                    {(() => {
                        // Hitung jumlah transaksi per jam dari allTransactions
                        const hourlyCounts = new Array(24).fill(0);
                        allTransactions.forEach(tx => {
                            const hour = new Date(tx.created_at).getHours();
                            hourlyCounts[hour]++;
                        });

                        // Filter hanya jam yang ada transaksinya untuk tampilan lebih bersih
                        const activeHours = [];
                        const activeCounts = [];
                        const activeColors = [];
                        const maxCount = Math.max(...hourlyCounts);

                        hourlyCounts.forEach((count, hour) => {
                            if (count > 0) {
                                activeHours.push(`${String(hour).padStart(2, '0')}:00`);
                                activeCounts.push(count);
                                // Warna semakin gelap = semakin ramai
                                const intensity = maxCount > 0 ? count / maxCount : 0;
                                activeColors.push(`rgba(45, 90, 63, ${0.3 + intensity * 0.7})`);
                            }
                        });

                        if (activeCounts.length === 0) {
                            return <p className="text-gray-400 text-center py-8">Belum ada data transaksi</p>;
                        }

                        return (
                            <Bar
                                data={{
                                    labels: activeHours,
                                    datasets: [{
                                        label: 'Jumlah Transaksi',
                                        data: activeCounts,
                                        backgroundColor: activeColors,
                                        borderColor: 'rgba(45, 90, 63, 1)',
                                        borderWidth: 1,
                                        borderRadius: 4,
                                    }]
                                }}
                                options={{
                                    responsive: true,
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            callbacks: {
                                                title: (items) => `Jam ${items[0].label}`,
                                                label: (item) => `${item.raw} transaksi`
                                            }
                                        }
                                    },
                                    scales: {
                                        x: {
                                            title: { display: true, text: 'Jam (WIB)' }
                                        },
                                        y: {
                                            title: { display: true, text: 'Jumlah Transaksi' },
                                            ticks: {
                                                stepSize: 1,
                                                precision: 0
                                            }
                                        }
                                    }
                                }}
                            />
                        );
                    })()}
                </div>
            </div>

            {/* Daftar Transaksi - Sortable Table */}
            {(() => {
                const handleTxSort = (field) => {
                    if (txSortBy === field) {
                        setTxSortDir(d => d === 'asc' ? 'desc' : 'asc');
                    } else {
                        setTxSortBy(field);
                        setTxSortDir('desc');
                    }
                };

                const TxSortIcon = ({ field }) => {
                    if (txSortBy !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
                    return <span style={{ marginLeft: '4px', color: '#2D5A3F' }}>{txSortDir === 'asc' ? '↑' : '↓'}</span>;
                };

                const txThStyle = {
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                };

                const txTdStyle = {
                    padding: '12px 16px',
                    fontSize: '14px',
                };

                const filteredTransactions = allTransactions
                    .filter(tx => {
                        if (!txSearchQuery) return true;
                        const q = txSearchQuery.toLowerCase();
                        const items = (tx.items || []).map(i => i.item_name || '').join(' ').toLowerCase();
                        return (tx.transaction_code || '').toLowerCase().includes(q) ||
                               (tx.customer_name || '').toLowerCase().includes(q) ||
                               (tx.payment_method || '').toLowerCase().includes(q) ||
                               items.includes(q);
                    })
                    .sort((a, b) => {
                        let valA, valB;
                        switch (txSortBy) {
                            case 'created_at':
                                valA = new Date(a.created_at).getTime();
                                valB = new Date(b.created_at).getTime();
                                break;
                            case 'total_amount':
                                valA = parseFloat(a.total_amount) || 0;
                                valB = parseFloat(b.total_amount) || 0;
                                break;
                            case 'total_qty':
                                valA = (a.items || []).reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);
                                valB = (b.items || []).reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);
                                break;
                            case 'customer_name':
                                valA = (a.customer_name || '').toLowerCase();
                                valB = (b.customer_name || '').toLowerCase();
                                return txSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                            case 'payment_method':
                                valA = (a.payment_method || '').toLowerCase();
                                valB = (b.payment_method || '').toLowerCase();
                                return txSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                            default:
                                valA = new Date(a.created_at).getTime();
                                valB = new Date(b.created_at).getTime();
                        }
                        return txSortDir === 'asc' ? valA - valB : valB - valA;
                    });

                return (
                    <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D3B2D', margin: 0 }}>Daftar Transaksi</h2>
                                <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>{filteredTransactions.length} transaksi ditemukan</p>
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ position: 'relative', maxWidth: '400px' }}>
                                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#9ca3af' }}>🔍</span>
                                <input
                                    type="text"
                                    placeholder="Cari kode, item, pelanggan, metode..."
                                    style={{
                                        width: '100%', padding: '10px 14px 10px 38px', border: '1px solid #e2e8f0',
                                        borderRadius: '10px', fontSize: '14px', outline: 'none', background: '#fff',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'border-color 0.2s',
                                    }}
                                    value={txSearchQuery}
                                    onChange={e => setTxSearchQuery(e.target.value)}
                                    onFocus={e => e.target.style.borderColor = '#2D5A3F'}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>
                        </div>

                        {filteredTransactions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                                <p style={{ fontWeight: 600 }}>Belum ada transaksi tercatat</p>
                                <p style={{ fontSize: '13px' }}>Data akan muncul setelah ada transaksi masuk</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px' }}>
                                    <thead>
                                        <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                            <th style={{ ...txThStyle, width: '50px' }}>No</th>
                                            <th style={{ ...txThStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTxSort('created_at')}>
                                                Tanggal <TxSortIcon field="created_at" />
                                            </th>
                                            <th style={txThStyle}>Kode TRX</th>
                                            <th style={txThStyle}>Item</th>
                                            <th style={{ ...txThStyle, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleTxSort('total_qty')}>
                                                Qty <TxSortIcon field="total_qty" />
                                            </th>
                                            <th style={{ ...txThStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTxSort('payment_method')}>
                                                Metode <TxSortIcon field="payment_method" />
                                            </th>
                                            <th style={{ ...txThStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTxSort('customer_name')}>
                                                Pelanggan <TxSortIcon field="customer_name" />
                                            </th>
                                            <th style={{ ...txThStyle, cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleTxSort('total_amount')}>
                                                Total <TxSortIcon field="total_amount" />
                                            </th>
                                            <th style={{ ...txThStyle, textAlign: 'center' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTransactions.map((tx, idx) => {
                                            const validItems = (tx.items || []).filter(i => i && i.item_name);
                                            const totalQty = validItems.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);
                                            const itemNames = validItems.map(i => `${i.item_name} (x${i.quantity})`).join(', ');
                                            const ts = new Date(tx.created_at);
                                            const timestamp = ts.toLocaleString('id-ID', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            });

                                            return (
                                                <tr key={tx.id} style={{
                                                    borderBottom: '1px solid #f3f4f6',
                                                    transition: 'background 0.15s',
                                                }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#EAF2EC'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ ...txTdStyle, textAlign: 'center', fontWeight: 700, color: '#9ca3af' }}>{idx + 1}</td>
                                                    <td style={{ ...txTdStyle, fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                                        🕐 {timestamp}
                                                    </td>
                                                    <td style={txTdStyle}>
                                                        <span style={{ padding: '3px 8px', background: '#f3f4f6', borderRadius: '6px', fontSize: '12px', fontWeight: 600, fontFamily: 'monospace' }}>
                                                            {tx.transaction_code || '-'}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...txTdStyle, maxWidth: '200px' }}>
                                                        <p style={{ margin: 0, fontSize: '13px', color: '#374151', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                            {itemNames || '-'}
                                                        </p>
                                                    </td>
                                                    <td style={{ ...txTdStyle, textAlign: 'center' }}>
                                                        <span style={{ padding: '3px 10px', background: '#eff6ff', color: '#3b82f6', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                                                            {totalQty}
                                                        </span>
                                                    </td>
                                                    <td style={txTdStyle}>
                                                        <span style={{ padding: '2px 8px', background: '#2D3B2D', color: '#fff', borderRadius: '20px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                                                            {tx.payment_method || 'cash'}
                                                        </span>
                                                    </td>
                                                    <td style={txTdStyle}>
                                                        {tx.customer_name ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span style={{ fontWeight: 600, color: '#2D3B2D', fontSize: '13px' }}>👤 {tx.customer_name}</span>
                                                                {tx.customer_phone && (
                                                                    <span style={{ fontSize: '11px', color: '#16a34a' }}>📞 {tx.customer_phone}</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: '#d1d5db', fontSize: '13px' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td style={{ ...txTdStyle, textAlign: 'right', fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                                                        Rp {parseFloat(tx.total_amount || 0).toLocaleString('id-ID')}
                                                    </td>
                                                    <td style={{ ...txTdStyle, textAlign: 'center' }}>
                                                        <button
                                                            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                                                            onClick={() => handleDeleteTransaction(tx.id)}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#f87171'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                                                            title="Hapus Transaksi"
                                                        >
                                                            🗑️ Hapus
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
};

export default Dashboard;
