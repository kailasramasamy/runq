import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import '../api/mp_models.dart';

/// Localized milk-type label for operator-facing screens. Mirrors the English
/// [milkTypeLabel] but reads from the active locale's strings.
String milkTypeL10n(AppLocalizations l, MilkType m) => switch (m) {
      MilkType.cowA1 => l.milkTypeCowA1,
      MilkType.cowA2 => l.milkTypeCowA2,
      MilkType.buffalo => l.milkTypeBuffalo,
      MilkType.mixed => l.milkTypeMixed,
      MilkType.cow => l.milkTypeCowLegacy,
    };

/// Farmer name for display: the native-script name when the app is in a
/// regional language and a native name exists, else the Latin [MpFarmer.name].
/// The Latin name stays the source of truth (search, receipts, initials).
String farmerName(BuildContext context, MpFarmer f) {
  final native = f.nameNative;
  if (Localizations.localeOf(context).languageCode != 'en'
      && native != null && native.trim().isNotEmpty) {
    return native;
  }
  return f.name;
}

/// Locale-aware short month name ("Jun" / "ಜೂನ್") for the app locale — replaces
/// the hardcoded English month arrays that leaked into kn/ta screens.
String shortMonth(BuildContext context, int month) =>
    DateFormat.MMM(Localizations.localeOf(context).toLanguageTag())
        .format(DateTime(2024, month));
