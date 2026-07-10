import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import 'runq_snack.dart';

/// Bottom sheet that turns an invoice's UPI payload into a scannable QR so the
/// customer can pay into the business bank account on the spot. Money-in is
/// reconciliation-driven — the payment auto-matches when the statement is
/// imported, so this sheet never records anything itself; it only presents the
/// QR / link. Fetches [InvoicesRepo.upiLink]; an empty payload means the tenant
/// hasn't set a UPI ID yet (see below), which we surface as a setup nudge.
Future<void> showPaymentQrSheet(
  BuildContext context, {
  required String invoiceId,
  required String invoiceNumber,
  required String customerName,
  required double balanceDue,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PaymentQrSheet(
      invoiceId: invoiceId,
      invoiceNumber: invoiceNumber,
      customerName: customerName,
      balanceDue: balanceDue,
    ),
  );
}

class _PaymentQrSheet extends StatefulWidget {
  final String invoiceId, invoiceNumber, customerName;
  final double balanceDue;
  const _PaymentQrSheet({
    required this.invoiceId,
    required this.invoiceNumber,
    required this.customerName,
    required this.balanceDue,
  });

  @override
  State<_PaymentQrSheet> createState() => _PaymentQrSheetState();
}

class _PaymentQrSheetState extends State<_PaymentQrSheet> {
  late Future<UpiLinkData> _future = invoicesRepo.upiLink(widget.invoiceId);

  void _retry() => setState(() {
        _future = invoicesRepo.upiLink(widget.invoiceId);
      });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.sheet,
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text('Collect payment',
                  style: RunqText.h3.copyWith(color: t.ink),
                  textAlign: TextAlign.center),
              const SizedBox(height: 4),
              Text('${widget.customerName} · ${widget.invoiceNumber}',
                  style: RunqText.caption.copyWith(color: t.muted),
                  textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FutureBuilder<UpiLinkData>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  if (snap.hasError) {
                    return _ErrorState(
                      message: snap.error is ApiException
                          ? (snap.error as ApiException).message
                          : 'Could not load the payment QR.',
                      onRetry: _retry,
                    );
                  }
                  final data = snap.data;
                  // Empty payload = tenant has no UPI ID configured. The API
                  // returns `{ data: null }` in that case, which decodes to an
                  // empty deepLink/qrData rather than throwing.
                  if (data == null || data.qrData.isEmpty) {
                    return const _NotConfiguredState();
                  }
                  return _QrContent(
                    data: data,
                    balanceDue: widget.balanceDue,
                    invoiceNumber: widget.invoiceNumber,
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QrContent extends StatelessWidget {
  final UpiLinkData data;
  final double balanceDue;
  final String invoiceNumber;
  const _QrContent({
    required this.data,
    required this.balanceDue,
    required this.invoiceNumber,
  });

  Future<void> _share() =>
      Share.share(data.deepLink, subject: 'Payment for $invoiceNumber');

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: data.deepLink));
    if (context.mounted) {
      showRunqSnack(context, 'UPI link copied', kind: SnackKind.success);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(formatINR(balanceDue),
            style: RunqText.numberLg.copyWith(color: t.ink),
            textAlign: TextAlign.center),
        const SizedBox(height: 16),
        // QR must stay black-on-white for reliable scanning — do NOT theme it.
        // A fixed white card keeps contrast in dark mode too.
        Center(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            child: QrImageView(
              data: data.qrData,
              version: QrVersions.auto,
              size: 220,
              backgroundColor: Colors.white,
              eyeStyle: const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color: Colors.black,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color: Colors.black,
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text('Scan with any UPI app — GPay, PhonePe, Paytm',
            style: RunqText.caption.copyWith(color: t.muted),
            textAlign: TextAlign.center),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _copy(context),
                icon: const Icon(Icons.copy_rounded, size: 18),
                label: const Text('Copy link'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: _share,
                style: FilledButton.styleFrom(
                    backgroundColor: RunqColors.greenInk),
                icon: const Icon(Icons.ios_share_rounded, size: 18),
                label: const Text('Share'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Text(
          'The payment lands in your bank account and matches this invoice '
          'automatically when you import your statement.',
          style: RunqText.micro.copyWith(color: t.muted2),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _NotConfiguredState extends StatelessWidget {
  const _NotConfiguredState();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Icon(Icons.qr_code_2_rounded, size: 40, color: t.muted2),
          const SizedBox(height: 12),
          Text('UPI not set up yet',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 6),
          Text(
            'Add your business UPI ID in Settings → Company on the web app to '
            'accept payments by QR.',
            style: RunqText.caption.copyWith(color: t.muted),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Icon(Icons.cloud_off_rounded, size: 40, color: t.muted2),
          const SizedBox(height: 12),
          Text(message,
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.center),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Try again'),
          ),
        ],
      ),
    );
  }
}
