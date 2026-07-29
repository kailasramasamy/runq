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

/// Distinct milk types in [types], in first-seen order, ignoring nulls.
///
/// Rows for two types are otherwise identical — same litres, same badge shape —
/// at different rates, so where a list mixes types each row has to name its
/// own. Where it doesn't, the label would be noise on every row; hence the
/// count. Takes raw types so pours and consignments share one rule.
List<MilkType> milkTypesIn(Iterable<MilkType?> types) {
  final seen = <MilkType>[];
  for (final m in types) {
    if (m != null && !seen.contains(m)) seen.add(m);
  }
  return seen;
}

/// `true` when [types] mixes milk types, so each row needs labelling.
bool hasMixedMilkTypes(Iterable<MilkType?> types) => milkTypesIn(types).length > 1;

/// Joined milk-type label, e.g. "Cow A1 · Buffalo".
String milkTypesL10n(AppLocalizations l, Iterable<MilkType> types) =>
    types.map((m) => milkTypeL10n(l, m)).join(' · ');

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
