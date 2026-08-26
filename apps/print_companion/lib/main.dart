import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'src/models/printer.dart';
import 'src/services/native_printer_gateway.dart';
import 'src/services/printer_gateway.dart';

void main() => runApp(const RetailOsPrintApp());

class RetailOsPrintApp extends StatelessWidget {
  const RetailOsPrintApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'RetailOS Print', debugShowCheckedModeBanner: false,
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff17613f)), useMaterial3: true),
        home: const PrinterHomePage(),
      );
}

class PrinterHomePage extends StatefulWidget {
  const PrinterHomePage({super.key});
  @override State<PrinterHomePage> createState() => _PrinterHomePageState();
}

class _PrinterHomePageState extends State<PrinterHomePage> {
  final PrinterGateway _gateway = NativePrinterGateway();
  PrinterProfile? _printer;
  List<PrinterProfile> _availablePrinters = const [];
  String _status = 'No printer connected';
  bool _busy = false;

  Future<void> _findPrinter() async {
    setState(() { _busy = true; _status = 'Looking for printers…'; });
    try {
      final transports = await _gateway.supportedTransports();
      if (transports.isEmpty) throw Exception('This device has no configured printer connection method.');
      final preferred = transports.contains(PrinterTransport.bluetoothClassic) ? PrinterTransport.bluetoothClassic
          : transports.contains(PrinterTransport.tcp) ? PrinterTransport.tcp : transports.first;
      final printers = await _gateway.discover(preferred);
      if (printers.isEmpty) throw Exception('No compatible printer found.');
      _availablePrinters = printers;
      _status = 'Select your printer below.';
    } on PlatformException catch (error) {
      _status = error.message ?? 'Printer connection needs to be enabled in this device build.';
    } catch (error) { _status = error.toString().replaceFirst('Exception: ', ''); }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _connect(PrinterProfile printer) async {
    setState(() { _busy = true; _status = 'Connecting to ${printer.name}…'; });
    try {
      _printer = await _gateway.connect(printer);
      _availablePrinters = const [];
      _status = 'Connected to ${_printer!.name}';
    } on PlatformException catch (error) {
      _status = error.message ?? 'Printer connection failed.';
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _testPrint() async {
    if (_printer == null) return;
    setState(() { _busy = true; _status = 'Sending test receipt…'; });
    try {
      await _gateway.print(ReceiptPrintJob(id: 'test-${DateTime.now().millisecondsSinceEpoch}', receiptNo: 'TEST', html: '<h1>RetailOS Print</h1><p>Printer test successful.</p>', createdAt: DateTime.now()), _printer!);
      _status = 'Test receipt sent to ${_printer!.name}';
    } on PlatformException catch (error) { _status = error.message ?? 'Printing failed.'; }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('RetailOS Print')), body: SafeArea(child: Padding(
      padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Receipt printer', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8), Text(_status), const SizedBox(height: 20),
        FilledButton.icon(onPressed: _busy ? null : _findPrinter, icon: const Icon(Icons.print), label: const Text('Find and connect printer')),
        if (_availablePrinters.isNotEmpty) ...[
          const SizedBox(height: 14),
          const Text('Paired printers', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          ..._availablePrinters.map((printer) => Card(child: ListTile(
            leading: const Icon(Icons.print), title: Text(printer.name), subtitle: Text(printer.address ?? 'Bluetooth printer'),
            trailing: FilledButton(onPressed: _busy ? null : () => _connect(printer), child: const Text('Connect')),
          ))),
        ],
        const SizedBox(height: 10), OutlinedButton.icon(onPressed: _busy || _printer == null ? null : _testPrint, icon: const Icon(Icons.receipt_long), label: const Text('Print test receipt')),
        const Spacer(), const Text('Current build: paired Android Bluetooth ESC/POS printers.\nMore connection types will be added without changing this app.', textAlign: TextAlign.center),
      ]),
    )),
  );
}
