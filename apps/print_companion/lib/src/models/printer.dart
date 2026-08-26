enum PrinterTransport { bluetoothClassic, bluetoothLe, usb, tcp, system }

class PrinterProfile {
  const PrinterProfile({
    required this.id,
    required this.name,
    required this.transport,
    required this.paperWidthMm,
    this.address,
    this.isConnected = false,
  });

  final String id;
  final String name;
  final PrinterTransport transport;
  final int paperWidthMm;
  final String? address;
  final bool isConnected;

  PrinterProfile copyWith({bool? isConnected, int? paperWidthMm}) => PrinterProfile(
        id: id,
        name: name,
        transport: transport,
        paperWidthMm: paperWidthMm ?? this.paperWidthMm,
        address: address,
        isConnected: isConnected ?? this.isConnected,
      );
}

class ReceiptPrintJob {
  const ReceiptPrintJob({
    required this.id,
    required this.receiptNo,
    required this.html,
    required this.createdAt,
  });

  final String id;
  final String receiptNo;
  final String html;
  final DateTime createdAt;
}
