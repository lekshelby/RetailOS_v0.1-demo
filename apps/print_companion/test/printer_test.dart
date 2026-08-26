import 'package:flutter_test/flutter_test.dart';
import 'package:retailos_print/src/models/printer.dart';

void main() {
  test('printer profile preserves paper width while connected', () {
    const printer = PrinterProfile(id: 'mp-80m', name: 'MP-80M', transport: PrinterTransport.bluetoothClassic, paperWidthMm: 80);
    expect(printer.copyWith(isConnected: true).paperWidthMm, 80);
    expect(printer.copyWith(isConnected: true).isConnected, isTrue);
  });
}
