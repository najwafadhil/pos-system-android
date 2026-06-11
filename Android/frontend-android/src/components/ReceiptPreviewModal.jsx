// =============================================
// RECEIPT PREVIEW MODAL
// =============================================
import React, { useState, useEffect, useCallback } from 'react';
import {
    generateReceiptData,
    checkPrinterStatus,
    executeDirectPrint,
    executeShare
} from '../utils/printer';

const ReceiptPreviewModal = ({ isOpen, onClose, transaction, transactionCode, isOffline }) => {
    const [receiptData, setReceiptData] = useState(null);
    const [isLoadingReceipt, setIsLoadingReceipt] = useState(true);
    const [printerStatus, setPrinterStatus] = useState({ isConnected: false, message: 'Mengecek...', printerName: null });
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [isPrinted, setIsPrinted] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message: string }

    // =============================================
    // Load receipt data on mount
    // =============================================
    useEffect(() => {
        if (!isOpen || !transaction || !transactionCode) return;
        setReceiptData(null);
        setIsLoadingReceipt(true);
        setIsPrinted(false);
        setFeedback(null);

        generateReceiptData(transaction, transactionCode)
            .then(data => {
                setReceiptData(data);
                setIsLoadingReceipt(false);
            })
            .catch(() => {
                setIsLoadingReceipt(false);
            });
    }, [isOpen, transaction, transactionCode]);

    // =============================================
    // Check printer status on mount
    // =============================================
    const refreshPrinterStatus = useCallback(async () => {
        setIsCheckingStatus(true);
        try {
            const status = await checkPrinterStatus();
            setPrinterStatus(status);
        } catch {
            setPrinterStatus({ isConnected: false, message: 'Gagal mengecek status.', printerName: null });
        } finally {
            setIsCheckingStatus(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            refreshPrinterStatus();
        }
    }, [isOpen, refreshPrinterStatus]);

    // =============================================
    // Handlers
    // =============================================
    const handleDirectPrint = async () => {
        setIsPrinting(true);
        setFeedback(null);
        try {
            await executeDirectPrint(transaction, transactionCode);
            setIsPrinted(true);
            setFeedback({ type: 'success', message: '✅ Struk berhasil dicetak!' });
        } catch (error) {
            console.error('Direct print failed:', error);
            setFeedback({ type: 'error', message: '❌ Gagal mencetak: ' + (error.message || 'Unknown error') });
        } finally {
            setIsPrinting(false);
        }
    };

    const handleShare = async () => {
        setIsSharing(true);
        setFeedback(null);
        try {
            await executeShare(transaction, transactionCode);
            setFeedback({ type: 'success', message: '✅ Struk berhasil dibagikan!' });
        } catch (error) {
            console.error('Share failed:', error);
            setFeedback({ type: 'error', message: '❌ Gagal membagikan struk: ' + (error.message || 'Unknown error') });
        } finally {
            setIsSharing(false);
        }
    };

    if (!isOpen) return null;

    // =============================================
    // STYLES
    // =============================================
    const dividerStyle = {
        borderTop: '1px dashed #000',
        margin: '6px 0',
    };

    // =============================================
    // RENDER
    // =============================================
    return (
        <>
            {/* Backdrop */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
            }} onClick={onClose} />

            {/* Modal Container */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 201,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '16px',
                pointerEvents: 'none',
            }}>
                <div style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    width: '100%',
                    maxWidth: '420px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.3)',
                    pointerEvents: 'auto',
                    overflow: 'hidden',
                    animation: 'receiptModalFadeIn 0.25s ease-out',
                }}>
                    {/* ===== Save Status Banner ===== */}
                    <div style={{
                        padding: '10px 16px',
                        background: isOffline ? '#FFF7ED' : '#F0FDF4',
                        borderBottom: `1px solid ${isOffline ? '#FED7AA' : '#BBF7D0'}`,
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isOffline ? '#9A3412' : '#166534',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <span>{isOffline ? '📴' : '☁️'}</span>
                        <span>{isOffline ? 'Tersimpan Offline (Menunggu Sinkronisasi)' : 'Tersimpan Online'}</span>
                    </div>

                    {/* ===== Header ===== */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px 10px',
                        borderBottom: '1px solid #f1f5f9',
                    }}>
                        <h2 style={{
                            margin: 0, fontSize: '18px', fontWeight: 800, color: '#282828',
                        }}>Pratinjau Struk</h2>
                        <button onClick={onClose} style={{
                            background: '#f1f5f9', border: 'none', borderRadius: '50%',
                            width: '34px', height: '34px', cursor: 'pointer', fontSize: '16px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#6b7280', fontWeight: 700,
                            transition: 'background 0.15s',
                        }}>✕</button>
                    </div>

                    {/* ===== Connection Status Indicator ===== */}
                    <div
                        onClick={!isCheckingStatus ? refreshPrinterStatus : undefined}
                        style={{
                            margin: '10px 16px',
                            padding: '10px 14px',
                            background: printerStatus.isConnected ? '#F0FDF4' : '#FEF2F2',
                            border: `1px solid ${printerStatus.isConnected ? '#BBF7D0' : '#FECACA'}`,
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            cursor: isCheckingStatus ? 'wait' : 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        <span style={{
                            fontSize: '18px',
                            display: 'inline-block',
                            animation: isCheckingStatus ? 'receiptModalSpin 1s linear infinite' : 'none',
                        }}>
                            {isCheckingStatus ? '🔄' : (printerStatus.isConnected ? '🟢' : '🔴')}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                                margin: 0, fontSize: '14px', fontWeight: 700,
                                color: printerStatus.isConnected ? '#166534' : '#991B1B',
                            }}>
                                {isCheckingStatus
                                    ? 'Mengecek koneksi...'
                                    : printerStatus.isConnected
                                        ? `${printerStatus.printerName} — Siap`
                                        : 'Printer Terputus'
                                }
                            </p>
                            {!isCheckingStatus && !printerStatus.isConnected && (
                                <p style={{
                                    margin: '2px 0 0', fontSize: '11px', color: '#9ca3af',
                                }}>
                                    {printerStatus.message}
                                </p>
                            )}
                        </div>
                        {!isCheckingStatus && (
                            <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>
                                Tap untuk refresh
                            </span>
                        )}
                    </div>

                    {/* ===== Feedback Banner ===== */}
                    {feedback && (
                        <div style={{
                            margin: '0 16px 6px',
                            padding: '10px 14px',
                            background: feedback.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                            border: `1px solid ${feedback.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: feedback.type === 'success' ? '#166534' : '#991B1B',
                        }}>
                            {feedback.message}
                        </div>
                    )}

                    {/* ===== Receipt Preview (Rich Visual) ===== */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '0 16px',
                        margin: '4px 0',
                        minHeight: 0,
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            padding: '20px 16px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        }}>
                            {isLoadingReceipt || !receiptData ? (
                                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: '14px' }}>
                                    {isLoadingReceipt ? '⏳ Memuat pratinjau...' : '⚠️ Gagal memuat data struk.'}
                                </p>
                            ) : (
                                <>
                                    {/* Logo */}
                                    {receiptData.logoSrc && (
                                        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                                            <img
                                                src={receiptData.logoSrc}
                                                alt="Logo"
                                                style={{
                                                    width: '70px', height: 'auto',
                                                    filter: 'grayscale(100%)',
                                                    display: 'block', margin: '0 auto',
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* App Name */}
                                    <div style={{
                                        textAlign: 'center', fontWeight: 'bold',
                                        fontSize: '16px', marginBottom: '4px',
                                        wordWrap: 'break-word', color: '#000',
                                        fontFamily: "'Arial', 'Helvetica', sans-serif",
                                    }}>
                                        {receiptData.appName}
                                    </div>

                                    {/* Store Address */}
                                    <div style={{
                                        textAlign: 'center', fontSize: '10px',
                                        marginBottom: '8px', wordWrap: 'break-word',
                                        color: '#000', lineHeight: 1.3,
                                        fontFamily: "'Arial', 'Helvetica', sans-serif",
                                    }}>
                                        {receiptData.storeAddress}
                                    </div>

                                    <div style={dividerStyle} />

                                    {/* Info Table */}
                                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', color: '#000', fontFamily: "'Arial', 'Helvetica', sans-serif" }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '50px', paddingBottom: '2px', verticalAlign: 'top' }}>Waktu</td>
                                                <td style={{ paddingBottom: '2px' }}>{receiptData.timestamp}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ paddingBottom: '2px', verticalAlign: 'top' }}>Kasir</td>
                                                <td style={{ paddingBottom: '2px' }}>{receiptData.cashierName}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ paddingBottom: '2px', verticalAlign: 'top' }}>Trx</td>
                                                <td style={{ paddingBottom: '2px', wordBreak: 'break-all' }}>{receiptData.transactionCode}</td>
                                            </tr>
                                            {receiptData.customerName && (
                                                <tr>
                                                    <td style={{ paddingBottom: '2px', verticalAlign: 'top' }}>Plg</td>
                                                    <td style={{ paddingBottom: '2px' }}>{receiptData.customerName}</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>

                                    <div style={dividerStyle} />

                                    {/* Items */}
                                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', color: '#000', fontFamily: "'Arial', 'Helvetica', sans-serif" }}>
                                        <tbody>
                                            {receiptData.items.map((item, idx) => (
                                                <React.Fragment key={idx}>
                                                    {/* Item Name */}
                                                    <tr>
                                                        <td colSpan="2" style={{ paddingTop: idx > 0 ? '6px' : '2px', fontWeight: 'bold' }}>
                                                            {item.name}
                                                        </td>
                                                    </tr>
                                                    {/* Discount Info */}
                                                    {item.discount && (
                                                        <tr>
                                                            <td style={{ fontSize: '11px', color: '#555' }}>{item.originalPrice}</td>
                                                            <td style={{ textAlign: 'right', fontSize: '11px', color: '#555' }}>{item.discount}</td>
                                                        </tr>
                                                    )}
                                                    {/* Qty x Price — Subtotal */}
                                                    <tr>
                                                        <td style={{ color: '#000' }}>{item.qtyPrice}</td>
                                                        <td style={{ textAlign: 'right', color: '#000' }}>{item.subtotal}</td>
                                                    </tr>
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div style={dividerStyle} />

                                    {/* Total & Payment */}
                                    <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse', fontWeight: 'bold', color: '#000', fontFamily: "'Arial', 'Helvetica', sans-serif" }}>
                                        <tbody>
                                            <tr>
                                                <td>TOTAL</td>
                                                <td style={{ textAlign: 'right' }}>{receiptData.total}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', color: '#000', marginTop: '2px', fontFamily: "'Arial', 'Helvetica', sans-serif" }}>
                                        <tbody>
                                            <tr>
                                                <td>BAYAR</td>
                                                <td style={{ textAlign: 'right' }}>{receiptData.paymentMethod}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <div style={dividerStyle} />

                                    {/* Footer */}
                                    <div style={{
                                        textAlign: 'center', marginTop: '10px', marginBottom: '4px',
                                        fontSize: '12px', color: '#000',
                                        fontFamily: "'Arial', 'Helvetica', sans-serif",
                                    }}>
                                        Terima Kasih<br />Atas Kunjungan Anda
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* ===== Action Buttons ===== */}
                    <div style={{
                        padding: '12px 16px 16px',
                        borderTop: '1px solid #f1f5f9',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}>
                        {/* Direct Print Button */}
                        <button
                            onClick={handleDirectPrint}
                            disabled={isPrinting}
                            style={{
                                width: '100%',
                                padding: '14px',
                                background: isPrinting ? '#9ca3af' : (isPrinted ? '#166534' : '#2D5A3F'),
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '12px',
                                fontWeight: 800,
                                fontSize: '15px',
                                cursor: isPrinting ? 'wait' : 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                            }}
                        >
                            {isPrinting
                                ? '⏳ Mencetak...'
                                : isPrinted
                                    ? '✅ Berhasil — Cetak Ulang'
                                    : '🖨️ Direct Print'
                            }
                        </button>

                        {/* Share Button */}
                        <button
                            onClick={handleShare}
                            disabled={isSharing}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: '#ffffff',
                                color: '#2D5A3F',
                                border: '2px solid #2D5A3F',
                                borderRadius: '12px',
                                fontWeight: 700,
                                fontSize: '14px',
                                cursor: isSharing ? 'wait' : 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                            }}
                        >
                            {isSharing ? '⏳ Memproses...' : '📤 Share / Bagikan'}
                        </button>

                        {/* Done / Close Button */}
                        <button
                            onClick={onClose}
                            style={{
                                width: '100%',
                                padding: '11px',
                                background: '#f1f5f9',
                                color: '#6b7280',
                                border: 'none',
                                borderRadius: '10px',
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: 'pointer',
                                transition: 'background 0.15s',
                            }}
                        >
                            Selesai
                        </button>
                    </div>
                </div>
            </div>

            {/* Keyframe animations */}
            <style>{`
                @keyframes receiptModalFadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes receiptModalSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </>
    );
};

export default ReceiptPreviewModal;
