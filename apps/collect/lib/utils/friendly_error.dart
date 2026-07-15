import 'package:flutter/widgets.dart';
import '../api/api_client.dart';
import '../l10n/app_localizations.dart';

/// One line for every catch-and-show site: localized message for transport
/// failures, the server's own message for HTTP errors, generic otherwise.
/// Never lets a raw `SocketException (…errno = 61)` reach an operator.
String friendlyError(BuildContext context, Object e) {
  final l = AppLocalizations.of(context);
  if (e is NetworkException) return e.isTimeout ? l.errorTimeout : l.errorOffline;
  if (e is ApiException) return e.message; // server-provided, already human
  return l.errorGeneric;
}
