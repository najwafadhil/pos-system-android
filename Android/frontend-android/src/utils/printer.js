// =============================================
// THERMAL RECEIPT PRINTER (ESC/POS & HTML 58mm)
// =============================================

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import html2canvas from 'html2canvas';

// Daftarkan Custom Native Plugin
const EscPosPrinterPlugin = registerPlugin('EscPosPrinter');

export const printReceipt = async (transaction, transactionCode) => {
    try {
        if (Capacitor.isNativePlatform()) {
            // =============================================
            // PLATFORM NATIVE (Android APK via Capacitor)
            // =============================================
            // Urutan prioritas:
            // 1. Bluetooth Serial (jika bt_printer_mac tersimpan)
            // 2. Share sebagai gambar (untuk app printer seperti RawBT)
            // 3. Share sebagai teks (fallback terakhir)
            //
            // PENTING: JANGAN PERNAH panggil printThermalHTML() di sini!
            // printThermalHTML() menggunakan window.open() yang akan
            // membuka Chrome di Android, bukan print dialog.
            // =============================================
            const btMac = localStorage.getItem('bt_printer_mac');
            if (btMac) {
                try {
                    await printViaCapacitorBluetooth(transaction, transactionCode, btMac);
                    return; // Berhasil via BT Native
                } catch (btError) {
                    console.error('Bluetooth Native Print Error:', btError);
                    // Lanjut ke Share Intent jika BT gagal
                }
            }

            // Share sebagai gambar → fallback ke teks jika gagal
            try {
                await shareReceiptAsImage(transaction, transactionCode);
            } catch (shareError) {
                console.error('Share Image failed, trying text:', shareError);
                // Fallback: share sebagai plain text (bukan window.open!)
                try {
                    await shareReceiptAsText(transaction, transactionCode);
                } catch (textError) {
                    console.error('Share text also failed:', textError);
                    // Semua metode gagal — tampilkan pesan error tapi jangan block
                    alert('⚠️ Tidak dapat mencetak struk. Pastikan aplikasi printer (RawBT) sudah diinstall.');
                }
            }
            return;
        } else if (navigator.usb) {
            // Coba koneksi langsung ke printer thermal USB (ESC/POS)
            await printViaWebUSB(transaction, transactionCode);
            return;
        }
        
        // Fallback untuk browser desktop: HTML print dialog
        await printThermalHTML(transaction, transactionCode);
    } catch (error) {
        console.error('Print error:', error);
        if (Capacitor.isNativePlatform()) {
            // Di native, jangan fallback ke printThermalHTML!
            // Cukup tampilkan pesan error
            alert('⚠️ Gagal mencetak struk. Transaksi sudah tersimpan.');
        } else {
            // Di browser desktop, fallback ke HTML print
            await printThermalHTML(transaction, transactionCode);
        }
    }
};

// =============================================
// HELPER: Generate Dantsu ESC/POS String
// =============================================
const STORE_ADDRESS = 'Ruko The Hive Park Avenue, Jl.Park Avenue, Hive@Prive No.053, Perum Park Serpong, Legok, Kab.Tangerang.';

const generateReceiptText = (transaction, transactionCode) => {
    const appName = localStorage.getItem('app_name') || 'Warung Nasi Rames Bu Rofi';
    const kasirData = localStorage.getItem('user_data');
    const kasirName = kasirData ? JSON.parse(kasirData).full_name || JSON.parse(kasirData).username : '-';
    
    const items = (transaction.items || []).filter(i => i && i.item_name);
    const now = new Date();
    const timestamp = now.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    let text = "";
    text += `[C]<b>${appName.toUpperCase()}</b>\n`;
    text += `[C]${STORE_ADDRESS}\n`;
    text += `[C]--------------------------------\n`;
    text += `[L]Waktu[R]${timestamp}\n`;
    text += `[L]Kasir[R]${kasirName}\n`;
    text += `[L]Trx[R]${transactionCode}\n`;
    if (transaction.customer_name) text += `[L]Plg[R]${transaction.customer_name}\n`;
    text += `[C]--------------------------------\n`;

    // Items
    items.forEach(item => {
        text += `[L]<b>${item.item_name}</b>\n`;
        if (item.discount_amount > 0) {
            const original = Math.round(parseFloat(item.original_price || 0)).toLocaleString('id-ID');
            const discount = Math.round(parseFloat(item.discount_amount || 0)).toLocaleString('id-ID');
            text += `[L]  Harga Asli[R]Rp ${original}\n`;
            text += `[L]  Diskon[R]-Rp ${discount}\n`;
        }
        const qty = `${item.quantity}x @${Math.round(parseFloat(item.unit_price || 0)).toLocaleString('id-ID')}`;
        const price = Math.round(parseFloat(item.subtotal || 0)).toLocaleString('id-ID');
        text += `[L]${qty}[R]${price}\n`;
    });

    text += `[C]--------------------------------\n`;
    const total = Math.round(parseFloat(transaction.total_amount || 0)).toLocaleString('id-ID');
    const payment = (transaction.payment_method || 'cash').toUpperCase();
    
    text += `[L]<b>TOTAL</b>[R]<b>Rp ${total}</b>\n`;
    text += `[L]BAYAR[R]${payment}\n`;
    text += `[C]--------------------------------\n`;
    text += `[C]Terima Kasih\n`;
    text += `[C]Atas Kunjungan Anda\n\n\n`;

    return text;
};

// =============================================
// HELPER: Share Receipt as Image (Native View-to-Bitmap Fallback)
// =============================================
const shareReceiptAsImage = async (transaction, transactionCode) => {
    const appName = localStorage.getItem('app_name') || 'Warung Nasi Rames Bu Rofi';
    // Gunakan URL statis atau base64 untuk logo jika perlu. Di implementasi native sederhana kita skip logo dinamis untuk sementara 
    // atau biarkan ImageView kosong, karena render Bitmap sudah sempurna untuk teks.
    const kasirData = localStorage.getItem('user_data');
    const kasirName = kasirData ? JSON.parse(kasirData).full_name || JSON.parse(kasirData).username : '-';

    const now = new Date();
    const timestamp = now.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const items = (transaction.items || []).filter(i => i && i.item_name);
    const total = parseFloat(transaction.total_amount || 0);

    // Siapkan data JSON untuk Native Plugin
    const data = {
        appName: appName,
        storeAddress: STORE_ADDRESS,
        timestamp: timestamp,
        cashierName: kasirName,
        transactionCode: transactionCode,
        customerName: transaction.customer_name || "",
        total: "Rp " + Math.round(total).toLocaleString('id-ID'),
        paymentMethod: (transaction.payment_method || 'cash').toUpperCase(),
        logoBase64: (() => {
            const appLogo = localStorage.getItem('app_logo') || '';
            if (appLogo && appLogo.startsWith('data:')) {
                return appLogo.split(',')[1] || '';
            }
            return '';
        })(),
        items: items.map(item => ({
            name: item.item_name,
            qtyPrice: `${item.quantity}x @${Math.round(parseFloat(item.unit_price || 0)).toLocaleString('id-ID')}`,
            subtotal: Math.round(parseFloat(item.subtotal || 0)).toLocaleString('id-ID'),
            originalPrice: item.discount_amount > 0 ? `Normal: Rp${Math.round(parseFloat(item.original_price || 0)).toLocaleString('id-ID')}` : "",
            discount: item.discount_amount > 0 ? `Disc: -Rp${Math.round(parseFloat(item.discount_amount || 0)).toLocaleString('id-ID')}` : ""
        }))
    };

    try {
        let base64Image;
        try {
            // Panggil Native Method (Android UI Thread View-to-Bitmap)
            const result = await EscPosPrinterPlugin.generateReceiptImage({ data: data });
            base64Image = result.base64;
        } catch (nativeErr) {
            console.warn("⚠️ Native plugin gagal / belum di-compile. Fallback ke JS (html2canvas)...", nativeErr);
            // JS Fallback jika Native Plugin belum di-compile oleh user di Android Studio
            base64Image = await generateImageViaHtml2Canvas(transaction, transactionCode);
        }
        
        const fileName = `Struk-${transactionCode.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
        const writeResult = await Filesystem.writeFile({
            path: fileName,
            data: base64Image,
            directory: Directory.Cache
        });

        await Share.share({
            title: `Struk - ${transactionCode}`,
            url: writeResult.uri,
            dialogTitle: 'Bagikan / Cetak Struk'
        });
    } catch (e) {
        console.error("❌ Semua metode GenerateImage (Native & JS) gagal:", e);
        throw e; // Lemparkan error agar fallback terluar lari ke shareReceiptAsText
    }
};

// =============================================
// HELPER: Generate Image via JS (Fallback)
// =============================================
const generateImageViaHtml2Canvas = async (transaction, transactionCode) => {
    const appName = localStorage.getItem('app_name') || 'Warung Nasi Rames Bu Rofi';
    const appLogo = localStorage.getItem('app_logo') || '';
    const kasirData = localStorage.getItem('user_data');
    const kasirName = kasirData ? JSON.parse(kasirData).full_name || JSON.parse(kasirData).username : '-';
    
    const now = new Date();
    const timestamp = now.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const items = (transaction.items || []).filter(i => i && i.item_name);
    const total = parseFloat(transaction.total_amount || 0);

    const itemRows = items.map(item => `
        <tr>
            <td colspan="2" style="padding-top:4px; font-weight:bold; color:#000;">${item.item_name}</td>
        </tr>
        ${item.discount_amount > 0 ? `
        <tr>
            <td style="font-size: 11px; color: #000;">Normal: Rp${Math.round(parseFloat(item.original_price || 0)).toLocaleString('id-ID')}</td>
            <td style="text-align:right; font-size: 11px; color: #000;">Disc: -Rp${Math.round(parseFloat(item.discount_amount || 0)).toLocaleString('id-ID')}</td>
        </tr>
        ` : ''}
        <tr>
            <td style="color:#000;">${item.quantity}x @${Math.round(parseFloat(item.unit_price || 0)).toLocaleString('id-ID')}</td>
            <td style="text-align:right; color:#000;">${Math.round(parseFloat(item.subtotal || 0)).toLocaleString('id-ID')}</td>
        </tr>
    `).join('');

    // =============================================
    // STEP 1: Preload logo ke Canvas terlebih dahulu
    // FIX: Use raw base64 data URL directly in <img>.
    // Don't re-encode via canvas (which can fail in
    // Capacitor WebView). The raw data URL is already
    // valid and doesn't need a second conversion.
    // =============================================
    let logoDataUrl = '';
    if (appLogo) {
        try {
            logoDataUrl = await new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    // Just resolve the original data URL directly.
                    // Avoid re-drawing to a second canvas which can
                    // fail silently in WebView environments.
                    resolve(appLogo);
                };
                img.onerror = () => resolve('');
                img.src = appLogo;
                // Timeout: if after 5 detik belum load, skip
                setTimeout(() => resolve(''), 5000);
            });
        } catch (e) {
            logoDataUrl = '';
        }
    }

    // =============================================
    // STEP 2: Buat container HTML struk
    // FIX: Use explicit pixel dimensions, overflow visible,
    // and position off-screen to the LEFT (not top:0 which
    // can cause viewport clipping issues).
    // =============================================
    const container = document.createElement('div');
    container.style.cssText = [
        'position: fixed',
        'left: -9999px',
        'top: 0',
        'width: 384px',
        'min-height: 100px',
        'z-index: -9999',
        'background: #FFFFFF',
        'padding: 20px',
        'color: #000000',
        'font-family: monospace',
        'overflow: visible',
        'box-sizing: border-box',
    ].join(';');

    container.innerHTML = `
        ${logoDataUrl ? `<div style="text-align:center; margin-bottom:4px;"><img src="${logoDataUrl}" style="width:70px; height:auto; filter:grayscale(100%); display:block; margin:0 auto;"></div>` : ''}
        <div style="text-align:center; font-weight:bold; font-size: 24px; margin-bottom:4px; word-wrap:break-word;">${appName}</div>
        <div style="text-align:center; font-size: 14px; margin-bottom:10px; word-wrap:break-word;">${STORE_ADDRESS}</div>
        <hr style="border-top:1px dashed #000; margin:5px 0;">
        <table style="width:100%; font-size:14px; border-collapse:collapse;">
            <tr><td style="width:50px;">Waktu</td><td>: ${timestamp}</td></tr>
            <tr><td>Kasir</td><td>: ${kasirName}</td></tr>
            <tr><td>Trx</td><td>: ${transactionCode}</td></tr>
            ${transaction.customer_name ? `<tr><td>Plg</td><td>: ${transaction.customer_name}</td></tr>` : ''}
        </table>
        <hr style="border-top:1px dashed #000; margin:5px 0;">
        <table style="width:100%; font-size:14px; border-collapse:collapse;">
            ${itemRows}
        </table>
        <hr style="border-top:1px dashed #000; margin:5px 0;">
        <table style="width:100%; font-size:18px; border-collapse:collapse; font-weight:bold;">
            <tr><td>TOTAL</td><td style="text-align:right;">Rp ${Math.round(total).toLocaleString('id-ID')}</td></tr>
        </table>
        <table style="width:100%; font-size:14px; border-collapse:collapse; margin-top:5px;">
            <tr><td>BAYAR</td><td style="text-align:right;">${(transaction.payment_method || 'cash').toUpperCase()}</td></tr>
        </table>
        <hr style="border-top:1px dashed #000; margin:5px 0;">
        <div style="text-align:center; margin-top:15px; margin-bottom:20px; font-size:14px;">Terima Kasih<br>Atas Kunjungan Anda</div>
    `;

    document.body.appendChild(container);

    // =============================================
    // STEP 3: Wait for layout to fully compute, then
    // render to canvas.
    // FIX: Add a 300ms delay after DOM insertion so the
    // browser can finish layout/paint. This prevents
    // the top/bottom cutoff caused by measuring before
    // the content has fully rendered.
    // Also use window.innerHeight large enough to
    // encompass the entire receipt.
    // =============================================
    try {
        // Wait for layout engine to finish computing dimensions
        await new Promise(r => setTimeout(r, 300));

        // Measure the ACTUAL rendered height after layout is done
        const actualHeight = container.scrollHeight;
        const actualWidth = container.offsetWidth || 384;

        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: actualWidth,
            height: actualHeight,
            windowWidth: actualWidth,
            windowHeight: actualHeight + 200, // Extra padding to prevent bottom cutoff
            scrollX: 0,
            scrollY: 0,
            logging: false,
        });
        document.body.removeChild(container);

        // Verify the canvas is not empty/too small
        if (canvas.height < 50) {
            throw new Error('Canvas height too small — rendering may have failed');
        }

        const base64Str = canvas.toDataURL('image/png');
        // Capacitor Filesystem expects raw base64 string without data prefix
        return base64Str.split(',')[1];
    } catch (err) {
        document.body.removeChild(container);
        throw err;
    }
};

// =============================================
// HELPER: Share Receipt as Plain Text (Native Fallback)
// =============================================
const shareReceiptAsText = async (transaction, transactionCode) => {
    const text = generatePlainTextReceipt(transaction, transactionCode);
    await Share.share({
        title: `Struk - ${transactionCode}`,
        text: text,
        dialogTitle: 'Pilih Aplikasi Printer'
    });
};

// =============================================
// HELPER: Generate Plain Text String for Share
// =============================================
const generatePlainTextReceipt = (transaction, transactionCode) => {
    const appName = localStorage.getItem('app_name') || 'Warung Nasi Rames Bu Rofi';
    const kasirData = localStorage.getItem('user_data');
    const kasirName = kasirData ? JSON.parse(kasirData).full_name || JSON.parse(kasirData).username : '-';
    
    const items = (transaction.items || []).filter(i => i && i.item_name);
    const now = new Date();
    const timestamp = now.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    let lines = [];
    
    const centerText = (text) => {
        if (text.length >= 32) return text.substring(0, 32);
        const pad = Math.floor((32 - text.length) / 2);
        return ' '.repeat(pad) + text;
    };

    lines.push(centerText(appName));
    lines.push(STORE_ADDRESS);
    lines.push('--------------------------------');
    lines.push(`Waktu : ${timestamp}`);
    lines.push(`Kasir : ${kasirName}`);
    lines.push(`Trx   : ${transactionCode}`);
    if (transaction.customer_name) lines.push(`Plg   : ${transaction.customer_name}`);
    lines.push('--------------------------------');

    items.forEach(item => {
        const name = item.item_name.substring(0, 32);
        const qty = `${item.quantity}x`;
        const price = Math.round(parseFloat(item.subtotal || 0)).toLocaleString('id-ID');
        lines.push(name);
        if (item.discount_amount > 0) {
            const original = Math.round(parseFloat(item.original_price || 0)).toLocaleString('id-ID');
            const discount = Math.round(parseFloat(item.discount_amount || 0)).toLocaleString('id-ID');
            lines.push(`  Harga Asli : Rp ${original}`);
            lines.push(`  Diskon     :-Rp ${discount}`);
        }
        const spaceLen = 32 - qty.length - price.length;
        const spaces = spaceLen > 0 ? ' '.repeat(spaceLen) : ' ';
        lines.push(`${qty}${spaces}${price}`);
    });

    lines.push('--------------------------------');
    const total = Math.round(parseFloat(transaction.total_amount || 0)).toLocaleString('id-ID');
    const payment = (transaction.payment_method || 'cash').toUpperCase();
    
    lines.push(`TOTAL : Rp ${total}`);
    lines.push(`BAYAR : ${payment}`);
    lines.push('--------------------------------');
    lines.push(centerText('Terima Kasih Atas Kunjungan Anda!'));
    lines.push(' ');
    lines.push(' ');

    return lines.join('\n');
};

// =============================================
// NATIVE PRINT: Print via Custom Dantsu Native Plugin
// =============================================
const printViaCapacitorBluetooth = async (transaction, transactionCode, macAddress) => {
    try {
        const text = generateReceiptText(transaction, transactionCode);
        
        // Get logo for ESC/POS print
        let logoBase64 = '';
        const appLogo = localStorage.getItem('app_logo') || '';
        if (appLogo && appLogo.startsWith('data:')) {
            logoBase64 = appLogo.split(',')[1] || '';
        }
        
        const result = await EscPosPrinterPlugin.printReceipt({
            macAddress: macAddress,
            text: text,
            logoBase64: logoBase64
        });
        
        if (!result.success) {
            throw new Error('Plugin returned unsuccessful print status');
        }
        console.log('Successfully printed natively via Dantsu ESC/POS');
    } catch (error) {
        console.error('Native print error:', error);
        throw error;
    }
};

// =============================================
// METODE 1: WebUSB ESC/POS (Koneksi Langsung)
// =============================================
const printViaWebUSB = async (transaction, transactionCode) => {
    const text = generateReceiptText(transaction, transactionCode);

    // Filter printer POS/Thermal generic
    const device = await navigator.usb.requestDevice({
        filters: [
            { vendorId: 0x04b8 }, // Epson
            { vendorId: 0x0519 }, // Star Micronics
            { vendorId: 0x0fe6 }, // Generic Thermal (e.g. Xprinter)
            { vendorId: 0x0483 }, // Generic
            { vendorId: 0x1fc9 }  // Generic
        ]
    });

    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    await device.claimInterface(0);

    // Cari endpoint OUT
    let outEndpoint;
    const iface = device.configuration.interfaces[0];
    const alt = iface.alternate;
    for (const ep of alt.endpoints) {
        if (ep.direction === 'out') {
            outEndpoint = ep.endpointNumber;
            break;
        }
    }

    if (!outEndpoint) {
        throw new Error('Tidak menemukan endpoint printer');
    }

    const encoder = new TextEncoder();
    await device.transferOut(outEndpoint, encoder.encode(text));
    await device.close();
};

// =============================================
// METODE 2: Fallback HTML 58mm (Browser Print via iFrame)
// FIX: Replaced window.open() with hidden <iframe>.
// window.open() on Android creates a tiny popup that
// Chrome's "Save as PDF" engine clips severely — cutting
// off the logo/header at the top and TOTAL/footer at the
// bottom. An iframe renders in the same page context and
// produces a full, unclipped print output.
// =============================================
const printThermalHTML = async (transaction, transactionCode) => {
    const appName = localStorage.getItem('app_name') || 'Warung Nasi Rames Bu Rofi';
    const appLogo = localStorage.getItem('app_logo') || '';
    const kasirData = localStorage.getItem('user_data');
    const kasirName = kasirData ? JSON.parse(kasirData).full_name || JSON.parse(kasirData).username : '-';

    const now = new Date();
    const timestamp = now.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const items = (transaction.items || []).filter(i => i && i.item_name);
    const total = parseFloat(transaction.total_amount || 0);

    const itemRows = items.map(item => `
        <tr>
            <td colspan="2" style="padding-top:4px; font-weight:bold; color:#000;">${item.item_name}</td>
        </tr>
        ${item.discount_amount > 0 ? `
        <tr>
            <td style="font-size: 11px; color: #000;">Normal: Rp${Math.round(parseFloat(item.original_price || 0)).toLocaleString('id-ID')}</td>
            <td style="text-align:right; font-size: 11px; color: #000;">Disc: -Rp${Math.round(parseFloat(item.discount_amount || 0)).toLocaleString('id-ID')}</td>
        </tr>
        ` : ''}
        <tr>
            <td style="color:#000;">${item.quantity}x @${Math.round(parseFloat(item.unit_price || 0)).toLocaleString('id-ID')}</td>
            <td style="text-align:right; color:#000;">${Math.round(parseFloat(item.subtotal || 0)).toLocaleString('id-ID')}</td>
        </tr>
    `).join('');

    // =============================================
    // Load logo as inline base64 data URL.
    // Using an external URL (/Logo.jpeg) inside an
    // iframe causes a race condition — print() fires
    // before the image finishes loading, resulting
    // in a blank logo. Embedding as data URL ensures
    // the image is instantly available.
    //
    // FIX v2: Use fetch() + FileReader instead of
    // canvas.toDataURL(). The canvas approach fails
    // silently in Capacitor WebView because the
    // asset server doesn't send CORS headers, which
    // taints the canvas and makes toDataURL() throw.
    // fetch() bypasses this entirely.
    // =============================================
    let logoSrc = '';
    if (appLogo) {
        // Already a base64 data URL from localStorage
        logoSrc = appLogo;
    } else {
        // Fetch /Logo.jpeg and convert to base64 data URL
        try {
            const logoUrl = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL)
                ? process.env.PUBLIC_URL + '/Logo.jpeg'
                : '/Logo.jpeg';
            const resp = await fetch(logoUrl);
            if (resp.ok) {
                const blob = await resp.blob();
                logoSrc = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) {
            console.warn('Logo fetch failed:', e);
            logoSrc = '';
        }
    }

    const logoTag = logoSrc
        ? `<div class="text-center" style="margin-bottom:4px;">
            <img src="${logoSrc}" alt="Logo" style="width:70px; height:auto; filter:grayscale(100%);">
           </div>`
        : '';

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Struk - ${transactionCode}</title>
    <style>
        @page {
            size: 58mm auto;
            margin: 2mm;
        }
        @media print {
            html, body {
                width: 58mm;
                margin: 0;
                padding: 0;
            }
        }
        * {
            box-sizing: border-box;
        }
        body {
            font-family: 'Arial', 'Helvetica', 'Segoe UI', monospace;
            background: #ffffff;
            color: #000000;
            margin: 0;
            padding: 4px 6px;
            width: 100%;
            max-width: 58mm;
            font-size: 11px;
            line-height: 1.3;
            font-weight: bold;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        .title { font-size: 14px; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; color: #000; word-wrap: break-word; }
        .address { font-size: 9px; line-height: 1.2; margin-bottom: 4px; color: #000; word-wrap: break-word; }
        table { width: 100%; border-collapse: collapse; }
        td { vertical-align: top; color: #000; }
        .info-table td { padding-bottom: 2px; font-size: 11px; }
        .info-table td:first-child { width: 40px; }
        .trx-code { word-break: break-all; }
        /* Ensure ALL content is visible — no overflow clipping */
        html, body {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
        }
    </style>
</head>
<body>
    ${logoTag}
    <div class="text-center title">${appName}</div>
    <div class="text-center address">${STORE_ADDRESS}</div>
    <div class="divider"></div>
    
    <table class="info-table">
        <tr><td>Waktu</td><td>: ${timestamp}</td></tr>
        <tr><td>Kasir</td><td>: ${kasirName}</td></tr>
        <tr><td>Trx</td><td class="trx-code">: ${transactionCode}</td></tr>
        ${transaction.customer_name ? `<tr><td>Plg</td><td>: ${transaction.customer_name}</td></tr>` : ''}
    </table>

    <div class="divider"></div>
    
    <table>
        ${itemRows}
    </table>

    <div class="divider"></div>

    <table>
        <tr class="bold">
            <td>TOTAL</td>
            <td class="text-right">Rp ${Math.round(total).toLocaleString('id-ID')}</td>
        </tr>
        <tr>
            <td>BAYAR</td>
            <td class="text-right">${(transaction.payment_method || 'cash').toUpperCase()}</td>
        </tr>
    </table>

    <div class="divider"></div>
    
    <div class="text-center" style="margin-top: 10px;">
        Terima Kasih<br>Atas Kunjungan Anda
    </div>
</body>
</html>`;

    // Remove any previous print iframe
    const oldFrame = document.getElementById('pos-print-frame');
    if (oldFrame) oldFrame.remove();

    // Create a hidden iframe for printing.
    // Give it a reasonable initial width (58mm ≈ 220px at 96dpi)
    // and a large initial height so content can fully render.
    // After content loads, we measure the ACTUAL height and resize
    // the iframe to match — this ensures the print engine sees the
    // full receipt regardless of how many items there are.
    const iframe = document.createElement('iframe');
    iframe.id = 'pos-print-frame';
    iframe.style.cssText = 'position:fixed; left:-9999px; top:0; width:220px; height:800px; border:none; visibility:hidden;';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for content (including images) to load, then print
    iframe.contentWindow.addEventListener('load', () => {
        // Delay to ensure all images and layout are fully rendered
        setTimeout(() => {
            try {
                // Measure the ACTUAL content height and resize iframe to fit
                const body = iframeDoc.body;
                const actualHeight = body ? body.scrollHeight : 800;
                const actualWidth = body ? body.scrollWidth : 220;
                iframe.style.width = actualWidth + 'px';
                iframe.style.height = actualHeight + 'px';

                // Small extra delay after resize for the print engine to pick up new dimensions
                setTimeout(() => {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                }, 200);
            } catch (e) {
                console.error('Print failed:', e);
                alert('Gagal membuka dialog cetak. Coba gunakan browser Chrome.');
            }
            // Clean up iframe after print dialog closes
            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 3000);
        }, 500);
    });
};