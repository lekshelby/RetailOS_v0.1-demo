import 'package:flutter_test/flutter_test.dart';
import 'package:retailos_print/main.dart';

void main() {
  testWidgets('shows printer connection actions', (WidgetTester tester) async {
    await tester.pumpWidget(const RetailOsPrintApp());
    expect(find.text('RetailOS Print'), findsOneWidget);
    expect(find.text('Find and connect printer'), findsOneWidget);
    expect(find.text('Print test receipt'), findsOneWidget);
  });
}
