/**
 * ============================================================
 * ESC/POS Printer Plugin — Frontend Integration Reference
 * ============================================================
 *
 * This file demonstrates how to call the EscPosPrinterPlugin
 * from a React/Capacitor frontend. It is a REFERENCE ONLY —
 * the actual implementation lives in printer.js.
 *
 * The native plugin (EscPosPrinterPlugin.java) handles:
 * - Bluetooth connection to thermal printer
 * - Logo printing from native R.drawable.logo resource
 * - ESC/POS text formatting via Dantsu library
 * - Automatic paper cut after printing
 */

import { registerPlugin } from '@capacitor/core';

// ─── Plugin Type Interface ──────────────────────────────────
interface EscPosPrinterPluginType {
  printReceipt(params: PrintReceiptParams): Promise<PrintResult>;
  listBluetoothDevices(): Promise<ListDevicesResult>;
}

// ─── Plugin Registration ────────────────────────────────────
// The plugin name must match @CapacitorPlugin(name = "EscPosPrinter")
// in EscPosPrinterPlugin.java
const EscPosPrinterPlugin = registerPlugin<EscPosPrinterPluginType>('EscPosPrinter');

// ─── Type Definitions ───────────────────────────────────────

interface PrintReceiptParams {
  /** 
   * MAC address of the Bluetooth printer (e.g., "00:11:22:33:44:55").
   * If null/empty, the plugin connects to the first paired printer.
   */
  macAddress?: string;

  /**
   * ESC/POS formatted receipt text using Dantsu formatting tags.
   * Required parameter — the plugin will reject if empty.
   */
  text: string;

  /**
   * Paper roll width in mm. Determines printable width & chars per line.
   * - 58 → 48mm printable, 32 chars/line (default)
   * - 80 → 72mm printable, 48 chars/line
   */
  paperWidth?: number;
}

interface PrintResult {
  success: boolean;
}

interface BluetoothDevice {
  name: string;
  address: string;
}

interface ListDevicesResult {
  devices: BluetoothDevice[];
}

// ─── Dantsu ESC/POS Formatting Tags Reference ───────────────
//
// ALIGNMENT:
//   [L]   Left align text
//   [C]   Center align text
//   [R]   Right align text
//   [L]text[R]text   Left-right split on same line
//
// TEXT STYLE:
//   <b>text</b>     Bold text
//   <u>text</u>     Underline text
//   <font size='big'>text</font>    Large text
//   <font size='wide'>text</font>   Wide text
//   <font size='tall'>text</font>   Tall text
//
// IMAGES (handled natively — do NOT send from frontend):
//   [C]<img>hexData</img>   Centered image from hex data
//
// BARCODES:
//   [C]<barcode type='ean13'>5901234123457</barcode>
//   [C]<qrcode size='20'>https://example.com</qrcode>

// ─── Example: Print a Receipt ───────────────────────────────

export async function printReceiptExample(): Promise<void> {
  // Build the receipt text using Dantsu formatting tags
  let text = '';
  text += '[C]<b>WARUNG NASI RAMES BU ROFI</b>\n';
  text += '[C]Jl. Contoh Alamat No. 123\n';
  text += '[C]--------------------------------\n';
  text += '[L]Waktu[R]10/06/2026 10:30\n';
  text += '[L]Kasir[R]Admin\n';
  text += '[L]Trx[R]TRX-20260610-001\n';
  text += '[C]--------------------------------\n';
  text += '[L]<b>Nasi Goreng Spesial</b>\n';
  text += '[L]2x @15.000[R]30.000\n';
  text += '[L]<b>Es Teh Manis</b>\n';
  text += '[L]2x @5.000[R]10.000\n';
  text += '[C]--------------------------------\n';
  text += '[L]<b>TOTAL</b>[R]<b>Rp 40.000</b>\n';
  text += '[L]BAYAR[R]CASH\n';
  text += '[C]--------------------------------\n';
  text += '[C]Terima Kasih\n';
  text += '[C]Atas Kunjungan Anda\n\n\n';

  try {
    const result: PrintResult = await EscPosPrinterPlugin.printReceipt({
      macAddress: '00:11:22:33:44:55',  // or omit to use first paired printer
      text: text,
      paperWidth: 58,                    // 58mm (default) or 80mm
    });

    if (result.success) {
      console.log('✅ Receipt printed successfully!');
    }
  } catch (error: any) {
    console.error('❌ Print failed:', error.message);
    // Error messages from the plugin:
    // - "Missing Bluetooth permissions..."
    // - "Printer with MAC address XX:XX not found or not paired."
    // - "No paired Bluetooth printer found..."
    // - "Bluetooth connection failed: ..."
    // - "Text encoding error: ..."
    // - "ESC/POS text parsing error: ..."
  }
}

// ─── Example: List Paired Bluetooth Printers ────────────────

export async function listPrintersExample(): Promise<void> {
  try {
    const result: ListDevicesResult = await EscPosPrinterPlugin.listBluetoothDevices();
    
    console.log('Found printers:');
    result.devices.forEach((device: BluetoothDevice) => {
      console.log(`  ${device.name} — ${device.address}`);
    });
  } catch (error: any) {
    console.error('Scan failed:', error.message);
  }
}
