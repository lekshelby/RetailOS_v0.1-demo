package com.example.retailos_print

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothSocket
import android.content.pm.PackageManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Android ESC/POS printer bridge. It deliberately uses only Android's platform
 * Bluetooth APIs, so paired SPP thermal printers do not depend on another app.
 */
class MainActivity : FlutterActivity() {
    private val channelName = "com.retailos/print"
    private val serialPortUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val worker = Executors.newSingleThreadExecutor()
    private var connectedSocket: BluetoothSocket? = null
    private var connectedAddress: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "supportedTransports" -> result.success(listOf("bluetoothClassic"))
                "discover" -> discover(call, result)
                "connect" -> connect(call, result)
                "print" -> print(call, result)
                else -> result.notImplemented()
            }
        }
    }

    private fun discover(call: MethodCall, result: MethodChannel.Result) {
        if (call.argument<String>("transport") != "bluetoothClassic") {
            result.success(emptyList<Map<String, Any?>>())
            return
        }
        if (!canUseBluetooth()) {
            requestBluetoothPermission()
            result.error("permission_required", "Allow Nearby devices / Bluetooth access, then tap Find and connect printer again.", null)
            return
        }
        val adapter = BluetoothAdapter.getDefaultAdapter()
        if (adapter == null || !adapter.isEnabled) {
            result.error("bluetooth_unavailable", "Turn on Bluetooth, then try again.", null)
            return
        }
        worker.execute {
            try {
                val printers = adapter.bondedDevices.map { device ->
                    mapOf("id" to device.address, "name" to (device.name ?: "Bluetooth printer"), "transport" to "bluetoothClassic", "paperWidthMm" to 80, "address" to device.address, "isConnected" to (device.address == connectedAddress))
                }.sortedBy { it["name"] as String }
                runOnUiThread { result.success(printers) }
            } catch (error: SecurityException) {
                runOnUiThread { result.error("permission_required", "Allow Nearby devices / Bluetooth access, then try again.", null) }
            }
        }
    }

    private fun connect(call: MethodCall, result: MethodChannel.Result) {
        val printer = call.arguments as? Map<*, *> ?: run {
            result.error("invalid_printer", "Printer details are missing.", null); return
        }
        val address = printer["address"] as? String ?: run {
            result.error("invalid_printer", "The selected printer has no Bluetooth address.", null); return
        }
        if (!canUseBluetooth()) {
            requestBluetoothPermission()
            result.error("permission_required", "Allow Nearby devices / Bluetooth access, then connect again.", null)
            return
        }
        worker.execute {
            try {
                val adapter = BluetoothAdapter.getDefaultAdapter() ?: throw IllegalStateException("Bluetooth is not available on this device.")
                adapter.cancelDiscovery()
                connectedSocket?.close()
                val socket = adapter.getRemoteDevice(address).createRfcommSocketToServiceRecord(serialPortUuid)
                socket.connect()
                connectedSocket = socket
                connectedAddress = address
                val updated = printer.toMutableMap().apply { put("isConnected", true) }
                runOnUiThread { result.success(updated) }
            } catch (error: Exception) {
                connectedSocket = null
                connectedAddress = null
                runOnUiThread { result.error("connection_failed", error.message ?: "Could not connect to this printer.", null) }
            }
        }
    }

    private fun print(call: MethodCall, result: MethodChannel.Result) {
        val job = call.argument<Map<*, *>>("job") ?: run {
            result.error("invalid_job", "Receipt details are missing.", null); return
        }
        worker.execute {
            try {
                val socket = connectedSocket ?: throw IllegalStateException("Connect a printer before printing.")
                val receiptNo = job["receiptNo"] as? String ?: "TEST"
                val plainText = (job["html"] as? String ?: "").replace(Regex("<[^>]*>"), "\n").replace("&nbsp;", " ").trim()
                val content = buildString {
                    append("\u001B@") // ESC @ reset
                    append("\u001Ba\u0001") // centre
                    append("RetailOS Print\n")
                    append("Receipt: $receiptNo\n")
                    append("\u001Ba\u0000") // left
                    append("--------------------------------\n")
                    append(plainText).append("\n")
                    append("--------------------------------\n\n\n")
                }
                socket.outputStream.write(content.toByteArray(StandardCharsets.UTF_8))
                socket.outputStream.flush()
                runOnUiThread { result.success(null) }
            } catch (error: Exception) {
                runOnUiThread { result.error("print_failed", error.message ?: "Could not send the receipt to the printer.", null) }
            }
        }
    }

    private fun canUseBluetooth(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    private fun requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT), 431)
        }
    }

    override fun onDestroy() {
        connectedSocket?.close()
        worker.shutdownNow()
        super.onDestroy()
    }
}
