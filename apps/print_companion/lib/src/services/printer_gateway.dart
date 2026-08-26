import '../models/printer.dart';

abstract class PrinterGateway {
  Future<Set<PrinterTransport>> supportedTransports();
  Future<List<PrinterProfile>> discover(PrinterTransport transport);
  Future<PrinterProfile> connect(PrinterProfile printer);
  Future<void> print(ReceiptPrintJob job, PrinterProfile printer);
}
