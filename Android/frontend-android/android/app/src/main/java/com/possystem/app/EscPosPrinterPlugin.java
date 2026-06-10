package com.possystem.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import com.dantsu.escposprinter.EscPosPrinter;
import com.dantsu.escposprinter.connection.bluetooth.BluetoothPrintersConnections;
import com.dantsu.escposprinter.connection.bluetooth.BluetoothConnection;
import com.dantsu.escposprinter.exceptions.EscPosBarcodeException;
import com.dantsu.escposprinter.exceptions.EscPosConnectionException;
import com.dantsu.escposprinter.exceptions.EscPosEncodingException;
import com.dantsu.escposprinter.exceptions.EscPosParserException;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.util.Base64;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.ImageView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import android.graphics.BitmapFactory;
import android.os.Build;

@CapacitorPlugin(name = "EscPosPrinter", permissions = {
    @Permission(alias = "bluetooth", strings = {
        Manifest.permission.BLUETOOTH,
        Manifest.permission.BLUETOOTH_ADMIN,
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_SCAN
    })
})
public class EscPosPrinterPlugin extends Plugin {

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void printReceipt(PluginCall call) {
        String macAddress = call.getString("macAddress");
        String text = call.getString("text");

        if (macAddress == null || text == null) {
            call.reject("macAddress and text are required");
            return;
        }

        // Run in background thread to prevent ANR
        new Thread(() -> {
            BluetoothConnection connection = null;
            try {
                // Check permissions
                if (!hasBluetoothPermissions()) {
                    call.reject("Missing Bluetooth permissions");
                    return;
                }

                // Find the device by MAC Address
                BluetoothConnection[] bluetoothDevicesList = (new BluetoothPrintersConnections()).getList();
                
                if (bluetoothDevicesList != null) {
                    for (BluetoothConnection device : bluetoothDevicesList) {
                        if (device.getDevice().getAddress().equals(macAddress)) {
                            connection = device;
                            break;
                        }
                    }
                }

                if (connection == null) {
                    call.reject("Printer with MAC " + macAddress + " not found or not paired.");
                    return;
                }

                connection.connect();

                // Initialize printer: 203 DPI, 48mm print width, 32 characters per line (EP58M Spec)
                EscPosPrinter printer = new EscPosPrinter(connection, 203, 48f, 32);
                
                // Print the formatted text
                printer.printFormattedText(text);
                
                // Disconnect after printing
                printer.disconnectPrinter();

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);

            } catch (EscPosConnectionException e) {
                e.printStackTrace();
                call.reject("Connection failed: " + e.getMessage());
            } catch (EscPosEncodingException e) {
                e.printStackTrace();
                call.reject("Encoding failed: " + e.getMessage());
            } catch (EscPosBarcodeException e) {
                e.printStackTrace();
                call.reject("Barcode failed: " + e.getMessage());
            } catch (EscPosParserException e) {
                e.printStackTrace();
                call.reject("Parser failed: " + e.getMessage());
            } catch (Exception e) {
                e.printStackTrace();
                call.reject("Unknown error: " + e.getMessage());
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }).start();
    }

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

                // Handle logo
                String logoBase64 = data.optString("logoBase64", "");
                ImageView logoImage = receiptView.findViewById(R.id.logoImage);
                if (!logoBase64.isEmpty()) {
                    try {
                        byte[] logoBytes = Base64.decode(logoBase64, Base64.DEFAULT);
                        Bitmap logoBitmap = BitmapFactory.decodeByteArray(logoBytes, 0, logoBytes.length);
                        if (logoBitmap != null) {
                            logoImage.setImageBitmap(logoBitmap);
                            logoImage.setVisibility(View.VISIBLE);
                        } else {
                            logoImage.setVisibility(View.GONE);
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                        logoImage.setVisibility(View.GONE);
                    }
                } else {
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
                e.printStackTrace();
                call.reject("Error generating image: " + e.getMessage());
            }
        });
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
                e.printStackTrace();
                call.reject("Error scanning Bluetooth: " + e.getMessage());
            }
        }).start();
    }
}
