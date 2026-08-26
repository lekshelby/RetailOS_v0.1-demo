import 'package:flutter/services.dart';

import '../models/printer.dart';
import 'printer_gateway.dart';

/// Shared Flutter boundary. Android and iOS provide their own small native
/// implementations behind this channel; the POS UI and receipt format stay shared.
class NativePrinterGateway implements PrinterGateway {
  static const _channel = MethodChannel('com.retailos/print');

  @override
  Future<Set<PrinterTransport>> supportedTransports() async {
    final values = await _channel.invokeListMethod<String>('supportedTransports') ?? const [];
    return values.map(_transport).toSet();
  }

  @override
  Future<List<PrinterProfile>> discover(PrinterTransport transport) async {
    final values = await _channel.invokeListMethod<Map<Object?, Object?>>('discover', {'transport': transport.name}) ?? const [];
    return values.map(_printer).toList();
  }

  @override
  Future<PrinterProfile> connect(PrinterProfile printer) async {
    final value = await _channel.invokeMapMethod<Object?, Object?>('connect', _printerMap(printer));
    if (value == null) throw PlatformException(code: 'connection_failed', message: 'Printer did not confirm a connection.');
    return _printer(value);
  }

  @override
  Future<void> print(ReceiptPrintJob job, PrinterProfile printer) => _channel.invokeMethod<void>('print', {
        'printer': _printerMap(printer),
        'job': {'id': job.id, 'receiptNo': job.receiptNo, 'html': job.html, 'createdAt': job.createdAt.toIso8601String()},
      });

  PrinterTransport _transport(String value) => PrinterTransport.values.firstWhere((item) => item.name == value);
  PrinterProfile _printer(Map<Object?, Object?> value) => PrinterProfile(
        id: value['id']! as String,
        name: value['name']! as String,
        transport: _transport(value['transport']! as String),
        paperWidthMm: value['paperWidthMm']! as int,
        address: value['address'] as String?,
        isConnected: value['isConnected'] as bool? ?? false,
      );
  Map<String, Object?> _printerMap(PrinterProfile printer) => {
        'id': printer.id, 'name': printer.name, 'transport': printer.transport.name,
        'paperWidthMm': printer.paperWidthMm, 'address': printer.address, 'isConnected': printer.isConnected,
      };
}
