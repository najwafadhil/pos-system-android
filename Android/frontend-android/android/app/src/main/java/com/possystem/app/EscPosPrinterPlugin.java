package com.possystem.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.content.pm.PackageManager;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.os.Build;
import android.util.Base64;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.ActivityCompat;

import com.dantsu.escposprinter.EscPosPrinter;
import com.dantsu.escposprinter.connection.bluetooth.BluetoothConnection;
import com.dantsu.escposprinter.connection.bluetooth.BluetoothPrintersConnections;
import com.dantsu.escposprinter.exceptions.EscPosBarcodeException;
import com.dantsu.escposprinter.exceptions.EscPosConnectionException;
import com.dantsu.escposprinter.exceptions.EscPosEncodingException;
import com.dantsu.escposprinter.exceptions.EscPosParserException;
import com.dantsu.escposprinter.textparser.PrinterTextParserImg;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "EscPosPrinter", permissions = {
    @Permission(alias = "bluetooth", strings = {
        Manifest.permission.BLUETOOTH,
        Manifest.permission.BLUETOOTH_ADMIN,
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_SCAN
    })
})
public class EscPosPrinterPlugin extends Plugin {

    private static final String TAG = "EscPosPrinter";

    // =============================================
    // Printer paper width presets
    // =============================================
    // 58mm paper: printWidth=48mm, charsPerLine=32
    // 80mm paper: printWidth=72mm, charsPerLine=48
    private static final int DPI = 203;

    private static final float DEFAULT_PRINT_WIDTH_MM = 48f;
    private static final int DEFAULT_CHARS_PER_LINE = 32;

    /**
     * Map paper width parameter to actual printable width and characters per line.
     * paperWidth refers to the total paper roll width (58 or 80).
     */
    private float getPrintWidthMm(int paperWidth) {
        if (paperWidth == 80) return 72f;
        return DEFAULT_PRINT_WIDTH_MM; // 58mm paper → 48mm printable
    }

    private int getCharsPerLine(int paperWidth) {
        if (paperWidth == 80) return 48;
        return DEFAULT_CHARS_PER_LINE; // 58mm paper → 32 chars
    }

    // =============================================
    // MAIN METHOD: Print Receipt via Bluetooth
    // =============================================
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void printReceipt(PluginCall call) {
        String macAddress = call.getString("macAddress");
        String text = call.getString("text");
        Integer paperWidthParam = call.getInt("paperWidth");

        if (text == null || text.isEmpty()) {
            call.reject("Parameter 'text' is required and cannot be empty.");
            return;
        }

        // Dynamic printer width: default to 58mm if not provided
        final int paperWidth = (paperWidthParam != null) ? paperWidthParam : 58;

        // Run on a background thread to prevent ANR (Application Not Responding)
        new Thread(() -> {
            BluetoothConnection connection = null;
            try {
                // ── 1. Check Bluetooth permissions ──────────────────
                if (!hasBluetoothPermissions()) {
                    call.reject("Missing Bluetooth permissions. Please grant Bluetooth permissions in app settings.");
                    return;
                }

                // ── 2. Find Bluetooth printer ──────────────────────
                connection = findPrinterConnection(macAddress);
                if (connection == null) {
                    String msg = (macAddress != null && !macAddress.isEmpty())
                        ? "Printer with MAC address " + macAddress + " not found or not paired."
                        : "No paired Bluetooth printer found. Please pair a printer first.";
                    call.reject(msg);
                    return;
                }

                // ── 3. Connect to the printer ──────────────────────
                connection.connect();
                Log.d(TAG, "Connected to printer: " + connection.getDevice().getName());

                // ── 4. Initialize EscPosPrinter with dynamic width ─
                float printWidthMm = getPrintWidthMm(paperWidth);
                int charsPerLine = getCharsPerLine(paperWidth);
                EscPosPrinter printer = new EscPosPrinter(connection, DPI, printWidthMm, charsPerLine);

                // ── 5. Load logo from native resources ─────────────
                String logoLine = loadNativeLogoForPrinter(printer);

                // ── 6. Build the final print payload ───────────────
                // Logo (if available) + receipt text
                StringBuilder printPayload = new StringBuilder();
                if (logoLine != null && !logoLine.isEmpty()) {
                    printPayload.append(logoLine);
                    printPayload.append("\n");
                }
                printPayload.append(text);

                // ── 7. Print and cut ───────────────────────────────
                printer.printFormattedTextAndCut(printPayload.toString());
                Log.d(TAG, "Receipt printed successfully.");

                // ── 8. Disconnect ──────────────────────────────────
                printer.disconnectPrinter();

                // ── 9. Resolve success to frontend ─────────────────
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);

            } catch (EscPosConnectionException e) {
                Log.e(TAG, "Connection error", e);
                call.reject("Bluetooth connection failed: " + e.getMessage());
            } catch (EscPosEncodingException e) {
                Log.e(TAG, "Encoding error", e);
                call.reject("Text encoding error: " + e.getMessage());
            } catch (EscPosBarcodeException e) {
                Log.e(TAG, "Barcode error", e);
                call.reject("Barcode rendering error: " + e.getMessage());
            } catch (EscPosParserException e) {
                Log.e(TAG, "Parser error", e);
                call.reject("ESC/POS text parsing error: " + e.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "Unexpected error during printing", e);
                call.reject("Print failed: " + e.getMessage());
            } finally {
                // Always disconnect to free the Bluetooth socket
                if (connection != null) {
                    try {
                        connection.disconnect();
                    } catch (Exception ignored) {
                        // Swallow disconnect errors silently
                    }
                }
            }
        }).start();
    }

    // =============================================
    // HELPER: Find printer by MAC or first paired
    // =============================================
    @SuppressLint("MissingPermission")
    private BluetoothConnection findPrinterConnection(String macAddress) {
        BluetoothConnection[] printers = new BluetoothPrintersConnections().getList();
        if (printers == null || printers.length == 0) {
            return null;
        }

        // If a specific MAC address was provided, find that exact printer
        if (macAddress != null && !macAddress.isEmpty()) {
            for (BluetoothConnection printer : printers) {
                if (printer.getDevice().getAddress().equalsIgnoreCase(macAddress)) {
                    return printer;
                }
            }
            return null; // Requested MAC not found
        }

        // No MAC specified → use the first available paired printer
        Log.d(TAG, "No MAC address specified, using first paired printer: " + printers[0].getDevice().getName());
        return printers[0];
    }

    // =============================================
    // HELPER: Load logo from native resources
    // =============================================
    /**
     * Loads logo from R.drawable.logo (primary) or R.mipmap.ic_launcher (fallback).
     * Converts it to a monochrome bitmap suitable for thermal printing.
     *
     * @param printer The EscPosPrinter instance (needed for PrinterTextParserImg)
     * @return A Dantsu-formatted image line like "[C]<img>...</img>" or null if no logo found
     */
    private String loadNativeLogoForPrinter(EscPosPrinter printer) {
        try {
            Resources res = getContext().getResources();
            String packageName = getContext().getPackageName();
            Bitmap logoBitmap = null;

            // Priority 1: Try R.drawable.logo
            int logoResId = res.getIdentifier("logo", "drawable", packageName);
            if (logoResId != 0) {
                logoBitmap = BitmapFactory.decodeResource(res, logoResId);
                Log.d(TAG, "Logo loaded from R.drawable.logo");
            }

            // Priority 2: Fallback to R.mipmap.ic_launcher
            if (logoBitmap == null) {
                int launcherResId = res.getIdentifier("ic_launcher", "mipmap", packageName);
                if (launcherResId != 0) {
                    logoBitmap = BitmapFactory.decodeResource(res, launcherResId);
                    Log.d(TAG, "Logo loaded from R.mipmap.ic_launcher (fallback)");
                }
            }

            if (logoBitmap == null) {
                Log.w(TAG, "No logo resource found. Skipping logo.");
                return null;
            }

            // Convert to monochrome (1-bit black/white) for thermal printing
            Bitmap monochromeBitmap = convertToMonochrome(logoBitmap);

            // Recycle the original color bitmap to free memory
            if (logoBitmap != monochromeBitmap) {
                logoBitmap.recycle();
            }

            // Use Dantsu's PrinterTextParserImg to convert bitmap to ESC/POS image data
            String imageHex = PrinterTextParserImg.bitmapToHexadecimalString(printer, monochromeBitmap);

            // Recycle the monochrome bitmap
            monochromeBitmap.recycle();

            // Return centered image tag for the Dantsu formatter
            return "[C]<img>" + imageHex + "</img>\n";

        } catch (Exception e) {
            Log.e(TAG, "Error loading logo from native resources", e);
            return null; // Skip logo gracefully — don't fail the entire print job
        }
    }

    // =============================================
    // HELPER: Convert Bitmap to monochrome
    // =============================================
    /**
     * Converts a color Bitmap to a monochrome (black and white) Bitmap
     * suitable for ESC/POS thermal printers.
     *
     * Uses a desaturation + threshold approach:
     * 1. Desaturate to grayscale
     * 2. Apply threshold: pixels above 128 brightness → white, below → black
     */
    private Bitmap convertToMonochrome(Bitmap source) {
        int width = source.getWidth();
        int height = source.getHeight();

        // Create a mutable copy in ARGB_8888 format
        Bitmap grayscale = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(grayscale);

        // Apply grayscale color filter
        Paint paint = new Paint();
        ColorMatrix cm = new ColorMatrix();
        cm.setSaturation(0); // Fully desaturate
        paint.setColorFilter(new ColorMatrixColorFilter(cm));
        canvas.drawBitmap(source, 0, 0, paint);

        // Threshold to pure black/white
        Bitmap monochrome = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int pixel = grayscale.getPixel(x, y);
                int alpha = Color.alpha(pixel);
                int r = Color.red(pixel);
                int g = Color.green(pixel);
                int b = Color.blue(pixel);
                // Luminance-weighted grayscale value
                int luminance = (int) (0.299 * r + 0.587 * g + 0.114 * b);
                // If pixel is transparent or bright enough, make it white; otherwise black
                if (alpha < 128 || luminance > 128) {
                    monochrome.setPixel(x, y, Color.WHITE);
                } else {
                    monochrome.setPixel(x, y, Color.BLACK);
                }
            }
        }

        // Recycle intermediate grayscale bitmap
        grayscale.recycle();

        return monochrome;
    }

    // =============================================
    // GENERATE RECEIPT IMAGE (for Share Intent)
    // =============================================
    @PluginMethod
    public void generateReceiptImage(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                JSONObject data = call.getObject("data");
                if (data == null) {
                    call.reject("Data is required");
                    return;
                }

                String appName = data.optString("appName", "");
                String storeAddress = data.optString("storeAddress", "");
                String time = data.optString("timestamp", "");
                String cashier = data.optString("cashierName", "");
                String trx = data.optString("transactionCode", "");
                String customer = data.optString("customerName", "");
                String total = data.optString("total", "");
                String paymentMethod = data.optString("paymentMethod", "CASH");

                LayoutInflater inflater = LayoutInflater.from(getContext());
                View receiptView = inflater.inflate(R.layout.receipt_layout, null);

                TextView appNameText = receiptView.findViewById(R.id.appNameText);
                TextView addressText = receiptView.findViewById(R.id.addressText);
                TextView timeText = receiptView.findViewById(R.id.timeText);
                TextView cashierText = receiptView.findViewById(R.id.cashierText);
                TextView trxText = receiptView.findViewById(R.id.trxText);
                TextView customerText = receiptView.findViewById(R.id.customerText);
                LinearLayout customerLayout = receiptView.findViewById(R.id.customerLayout);
                LinearLayout itemsContainer = receiptView.findViewById(R.id.itemsContainer);
                TextView totalText = receiptView.findViewById(R.id.totalText);
                TextView paymentMethodText = receiptView.findViewById(R.id.paymentMethodText);

                // Handle logo — load from native resources for consistency
                ImageView logoImage = receiptView.findViewById(R.id.logoImage);
                try {
                    Resources res = getContext().getResources();
                    String packageName = getContext().getPackageName();
                    int logoResId = res.getIdentifier("logo", "drawable", packageName);
                    if (logoResId != 0) {
                        logoImage.setImageResource(logoResId);
                        logoImage.setVisibility(View.VISIBLE);
                    } else {
                        // Fallback: use base64 from data if available
                        String logoBase64 = data.optString("logoBase64", "");
                        if (!logoBase64.isEmpty()) {
                            byte[] logoBytes = Base64.decode(logoBase64, Base64.DEFAULT);
                            Bitmap logoBitmap = BitmapFactory.decodeByteArray(logoBytes, 0, logoBytes.length);
                            if (logoBitmap != null) {
                                logoImage.setImageBitmap(logoBitmap);
                                logoImage.setVisibility(View.VISIBLE);
                            } else {
                                logoImage.setVisibility(View.GONE);
                            }
                        } else {
                            logoImage.setVisibility(View.GONE);
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error loading logo for receipt image", e);
                    logoImage.setVisibility(View.GONE);
                }

                appNameText.setText(appName);
                addressText.setText(storeAddress);
                timeText.setText(time);
                cashierText.setText(cashier);
                trxText.setText(trx);
                
                if (customer != null && !customer.isEmpty()) {
                    customerLayout.setVisibility(View.VISIBLE);
                    customerText.setText(customer);
                }

                totalText.setText(total);
                paymentMethodText.setText(paymentMethod.toUpperCase());

                JSONArray items = data.optJSONArray("items");
                if (items != null) {
                    for (int i = 0; i < items.length(); i++) {
                        JSONObject item = items.optJSONObject(i);
                        if (item == null) continue;

                        View itemView = inflater.inflate(R.layout.receipt_item, itemsContainer, false);
                        TextView itemNameText = itemView.findViewById(R.id.itemNameText);
                        TextView qtyPriceText = itemView.findViewById(R.id.qtyPriceText);
                        TextView subtotalText = itemView.findViewById(R.id.subtotalText);
                        LinearLayout discountLayout = itemView.findViewById(R.id.discountLayout);
                        TextView originalPriceText = itemView.findViewById(R.id.originalPriceText);
                        TextView discountText = itemView.findViewById(R.id.discountText);

                        itemNameText.setText(item.optString("name", ""));
                        qtyPriceText.setText(item.optString("qtyPrice", ""));
                        subtotalText.setText(item.optString("subtotal", ""));

                        String originalPrice = item.optString("originalPrice", "");
                        String discount = item.optString("discount", "");
                        if (!discount.isEmpty()) {
                            discountLayout.setVisibility(View.VISIBLE);
                            originalPriceText.setText(originalPrice);
                            discountText.setText(discount);
                        }

                        itemsContainer.addView(itemView);
                    }
                }

                int widthSpec = View.MeasureSpec.makeMeasureSpec(384, View.MeasureSpec.EXACTLY);
                int heightSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);
                receiptView.measure(widthSpec, heightSpec);
                
                int measuredWidth = receiptView.getMeasuredWidth();
                int measuredHeight = receiptView.getMeasuredHeight();
                receiptView.layout(0, 0, measuredWidth, measuredHeight);

                Bitmap bitmap = Bitmap.createBitmap(measuredWidth, measuredHeight, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);
                canvas.drawColor(Color.WHITE);
                receiptView.draw(canvas);

                ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, byteArrayOutputStream);
                byte[] byteArray = byteArrayOutputStream.toByteArray();
                String base64Image = Base64.encodeToString(byteArray, Base64.NO_WRAP);

                JSObject ret = new JSObject();
                ret.put("base64", base64Image);
                call.resolve(ret);

            } catch (Exception e) {
                Log.e(TAG, "Error generating receipt image", e);
                call.reject("Error generating image: " + e.getMessage());
            }
        });
    }

    // =============================================
    // PRINT IMAGE VIA BLUETOOTH
    // =============================================
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void printImage(PluginCall call) {
        String macAddress = call.getString("macAddress");
        String base64Image = call.getString("base64Image");

        if (base64Image == null || base64Image.isEmpty()) {
            call.reject("Parameter 'base64Image' is required.");
            return;
        }

        // Remove prefix if exists (e.g., "data:image/png;base64,")
        if (base64Image.contains(",")) {
            base64Image = base64Image.split(",")[1];
        }

        final String finalBase64 = base64Image;

        new Thread(() -> {
            BluetoothConnection connection = null;
            try {
                if (!hasBluetoothPermissions()) {
                    call.reject("Missing Bluetooth permissions.");
                    return;
                }

                connection = findPrinterConnection(macAddress);
                if (connection == null) {
                    call.reject("Printer not found or not paired.");
                    return;
                }

                connection.connect();
                Log.d(TAG, "Connected to printer for Image Printing.");

                // Decode base64 to bitmap
                byte[] decodedBytes = Base64.decode(finalBase64, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);

                if (bitmap == null) {
                    call.reject("Failed to decode base64 image.");
                    return;
                }

                // Resize bitmap to max 384 pixels width (for 58mm printer)
                Bitmap resizedBitmap = resizeBitmap(bitmap, 384);

                // Convert to ESC/POS Raster byte array
                byte[] rasterData = decodeBitmapToEscPosRaster(resizedBitmap);

                // Initialize printer command arrays
                byte[] initCommand = new byte[]{0x1B, 0x40}; // ESC @ (Initialize)
                byte[] alignCenter = new byte[]{0x1B, 0x61, 0x01}; // ESC a 1 (Center alignment)
                byte[] alignLeft = new byte[]{0x1B, 0x61, 0x00}; // ESC a 0 (Left alignment)
                byte[] cutCommand = new byte[]{0x1D, 0x56, 0x41, 0x10}; // GS V A 16 (Cut paper)

                // Send commands and data
                connection.write(initCommand);
                connection.write(alignCenter);
                connection.write(rasterData);
                
                // Add some blank lines before cutting
                connection.write(new byte[]{0x0A, 0x0A, 0x0A});
                connection.write(alignLeft);
                connection.write(cutCommand);
                
                connection.send(); // Ensure data is flushed to printer

                Log.d(TAG, "Image printed successfully.");

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);

            } catch (Exception e) {
                Log.e(TAG, "Error printing image", e);
                call.reject("Print image failed: " + e.getMessage());
            } finally {
                if (connection != null) {
                    try {
                        connection.disconnect();
                    } catch (Exception ignored) {}
                }
            }
        }).start();
    }

    private Bitmap resizeBitmap(Bitmap original, int maxWidth) {
        int width = original.getWidth();
        int height = original.getHeight();

        if (width <= maxWidth) {
            return original;
        }

        float ratio = (float) width / maxWidth;
        int newHeight = (int) (height / ratio);

        return Bitmap.createScaledBitmap(original, maxWidth, newHeight, true);
    }

    private byte[] decodeBitmapToEscPosRaster(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();

        // Width in bytes (1 byte = 8 pixels). Ceiling division by 8.
        int xL = (width + 7) / 8;
        int xH = xL >> 8;
        int yL = height & 0xFF;
        int yH = height >> 8;

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

        // ESC/POS Command for Raster Bit-Image: GS v 0
        outputStream.write(0x1D); // GS
        outputStream.write(0x76); // v
        outputStream.write(0x30); // 0
        outputStream.write(0x00); // m=0 (Normal mode)

        outputStream.write(xL);
        outputStream.write(xH);
        outputStream.write(yL);
        outputStream.write(yH);

        for (int y = 0; y < height; y++) {
            for (int xByte = 0; xByte < xL; xByte++) {
                byte b = 0;
                for (int bit = 0; bit < 8; bit++) {
                    int x = xByte * 8 + bit;
                    if (x < width) {
                        int pixel = bitmap.getPixel(x, y);
                        int alpha = Color.alpha(pixel);
                        int r = Color.red(pixel);
                        int g = Color.green(pixel);
                        int bColor = Color.blue(pixel);

                        // Treat transparent as white
                        if (alpha < 128) {
                            // bit stays 0 (white)
                        } else {
                            // Calculate luminance to determine black or white
                            int luminance = (int) (0.299 * r + 0.587 * g + 0.114 * bColor);
                            if (luminance < 128) {
                                // Dark pixel -> set bit to 1 (print)
                                b |= (1 << (7 - bit));
                            }
                        }
                    }
                }
                outputStream.write(b);
            }
        }

        return outputStream.toByteArray();
    }

    // =============================================
    // HELPER: Check Bluetooth permissions
    // =============================================
    private boolean hasBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ requires BLUETOOTH_CONNECT and BLUETOOTH_SCAN
            return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
                && ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
        }
        // Android 11 and below
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED
            && ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_ADMIN) == PackageManager.PERMISSION_GRANTED;
    }

    // =============================================
    // CHECK CONNECTION: Probe BT readiness (no print)
    // =============================================
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void checkConnection(PluginCall call) {
        new Thread(() -> {
            try {
                // 1. Check Bluetooth permissions
                if (!hasBluetoothPermissions()) {
                    JSObject ret = new JSObject();
                    ret.put("isConnected", false);
                    ret.put("message", "Izin Bluetooth belum diberikan. Aktifkan di pengaturan aplikasi.");
                    ret.put("printerName", JSObject.NULL);
                    call.resolve(ret);
                    return;
                }

                // 2. Check if Bluetooth adapter is enabled
                BluetoothAdapter bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
                if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
                    JSObject ret = new JSObject();
                    ret.put("isConnected", false);
                    ret.put("message", "Bluetooth tidak aktif. Nyalakan Bluetooth terlebih dahulu.");
                    ret.put("printerName", JSObject.NULL);
                    call.resolve(ret);
                    return;
                }

                // 3. Check for paired printers
                BluetoothConnection[] printers = new BluetoothPrintersConnections().getList();
                if (printers == null || printers.length == 0) {
                    JSObject ret = new JSObject();
                    ret.put("isConnected", false);
                    ret.put("message", "Tidak ada printer Bluetooth yang dipasangkan (paired).");
                    ret.put("printerName", JSObject.NULL);
                    call.resolve(ret);
                    return;
                }

                // 4. Found at least one paired printer — check for specific MAC if saved
                String savedMac = call.getString("macAddress", "");
                BluetoothConnection targetPrinter = null;

                if (savedMac != null && !savedMac.isEmpty()) {
                    for (BluetoothConnection printer : printers) {
                        if (printer.getDevice().getAddress().equalsIgnoreCase(savedMac)) {
                            targetPrinter = printer;
                            break;
                        }
                    }
                }

                // Fallback to first available printer if no MAC match
                if (targetPrinter == null) {
                    targetPrinter = printers[0];
                }

                String printerName = targetPrinter.getDevice().getName();
                if (printerName == null || printerName.isEmpty()) {
                    printerName = "Printer (" + targetPrinter.getDevice().getAddress() + ")";
                }

                JSObject ret = new JSObject();
                ret.put("isConnected", true);
                ret.put("message", "Printer siap digunakan.");
                ret.put("printerName", printerName);
                call.resolve(ret);

            } catch (Exception e) {
                Log.e(TAG, "Error checking Bluetooth connection", e);
                JSObject ret = new JSObject();
                ret.put("isConnected", false);
                ret.put("message", "Gagal mengecek koneksi: " + e.getMessage());
                ret.put("printerName", JSObject.NULL);
                call.resolve(ret);
            }
        }).start();
    }

    // =============================================
    // LIST BLUETOOTH DEVICES (for Settings scan)
    // =============================================
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void listBluetoothDevices(PluginCall call) {
        new Thread(() -> {
            try {
                if (!hasBluetoothPermissions()) {
                    call.reject("Missing Bluetooth permissions. Aktifkan izin Bluetooth di pengaturan aplikasi.");
                    return;
                }

                BluetoothConnection[] devices = new BluetoothPrintersConnections().getList();
                JSONArray deviceList = new JSONArray();

                if (devices != null) {
                    for (BluetoothConnection device : devices) {
                        JSONObject deviceObj = new JSONObject();
                        deviceObj.put("name", device.getDevice().getName() != null ? device.getDevice().getName() : "Unknown Device");
                        deviceObj.put("address", device.getDevice().getAddress());
                        deviceList.put(deviceObj);
                    }
                }

                JSObject ret = new JSObject();
                ret.put("devices", deviceList);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Error scanning Bluetooth devices", e);
                call.reject("Error scanning Bluetooth: " + e.getMessage());
            }
        }).start();
    }
}
