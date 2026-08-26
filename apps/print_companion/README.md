# RetailOS Print

One shared companion app for Android phones/tablets and iPhone/iPad. It receives a RetailOS receipt, renders the same receipt design, and sends it to a configured printer.

## First release support boundary

- Android: paired Bluetooth Classic ESC/POS (including Technova MP-80M) is implemented first.
- Android USB OTG and TCP/Wi-Fi ESC/POS, plus iPhone/iPad TCP/Wi-Fi, AirPrint, and verified BLE profiles, are the next adapters behind the same interface.
- Paper widths: 58 mm and 80 mm; default 80 mm.

No app can reliably support every proprietary printer. The companion uses standard ESC/POS first and exposes a printer-profile layer for verified exceptions.

## Build foundation

This workspace does not yet have Flutter or the Android/iOS SDKs installed. Once installed, generate the native shells without replacing the shared source:

```text
flutter create --platforms=android,ios .
flutter pub get
flutter test
```

The `com.retailos/print` native channel is deliberately isolated. Android supplies the Bluetooth Classic/USB implementation; iOS supplies Wi-Fi/AirPrint/BLE support. Both share this app UI and print-job contract.
