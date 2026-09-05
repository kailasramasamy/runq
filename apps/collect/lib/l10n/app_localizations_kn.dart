// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Kannada (`kn`).
class AppLocalizationsKn extends AppLocalizations {
  AppLocalizationsKn([String locale = 'kn']) : super(locale);

  @override
  String get navHome => 'ಮುಖಪುಟ';

  @override
  String get navCollect => 'ಸಂಗ್ರಹ';

  @override
  String get navDispatch => 'ರವಾನೆ';

  @override
  String get navPayments => 'ಪಾವತಿ';

  @override
  String get navProfile => 'ಪ್ರೊಫೈಲ್';

  @override
  String get commonLitres => 'ಲೀಟರ್';

  @override
  String get commonSelectFarmer => 'ರೈತರನ್ನು ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get commonMilkType => 'ಹಾಲಿನ ಪ್ರಕಾರ';

  @override
  String get commonCancel => 'ರದ್ದುಮಾಡಿ';

  @override
  String get commonNext => 'ಮುಂದೆ';

  @override
  String get commonToday => 'ಇಂದು';

  @override
  String get milkTypeCowA1 => 'ಹಸು A1 (ಸಾಮಾನ್ಯ)';

  @override
  String get milkTypeCowA2 => 'ಹಸು A2 (ದೇಸಿ)';

  @override
  String get milkTypeBuffalo => 'ಎಮ್ಮೆ';

  @override
  String get milkTypeMixed => 'ಮಿಶ್ರ';

  @override
  String get milkTypeCowLegacy => 'ಹಸು (ಹಳೆಯದು)';

  @override
  String get recordCollectionTitle => 'ಸಂಗ್ರಹ ದಾಖಲಿಸಿ';

  @override
  String get editCollectionTitle => 'ಸಂಗ್ರಹ ಸಂಪಾದಿಸಿ';

  @override
  String collectAlreadyRecorded(String shift) {
    return 'ಈ $shift ಶಿಫ್ಟ್‌ನಲ್ಲಿ ಈಗಾಗಲೇ ದಾಖಲಿಸಲಾಗಿದೆ';
  }

  @override
  String collectReplaceOrCombine(String name) {
    return '$name ಗಾಗಿ ಅದನ್ನು ಬದಲಾಯಿಸುವುದೇ (ತಿದ್ದುಪಡಿ) ಅಥವಾ ಇನ್ನೊಂದು ಕ್ಯಾನ್ ಆಗಿ ಒಗ್ಗೂಡಿಸುವುದೇ?';
  }

  @override
  String collectCombineResult(String total) {
    return 'ಒಟ್ಟು ಸಂಯೋಜಿತ: $total';
  }

  @override
  String get collectReplace => 'ಬದಲಾಯಿಸಿ';

  @override
  String get collectCombine => 'ಒಗ್ಗೂಡಿಸಿ';

  @override
  String get collectAddMoreMilk => 'ಇನ್ನಷ್ಟು ಹಾಲು ಸೇರಿಸಿ';

  @override
  String get collectCansTotal => 'ಒಟ್ಟು';

  @override
  String collectCanN(int n, String qty) {
    return 'ಕ್ಯಾನ್ $n · $qty';
  }

  @override
  String get collectSavedOnDevice => 'ಸಾಧನದಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ · ಸಿಂಕ್ ಆಗುತ್ತದೆ';

  @override
  String get collectComputingRate => 'ದರ ಲೆಕ್ಕ ಹಾಕಲಾಗುತ್ತಿದೆ…';

  @override
  String get collectEnterClrPreview => 'ದರ ನೋಡಲು CLR ನಮೂದಿಸಿ';

  @override
  String get collectEnterFatSnfPreview => 'ದರ ನೋಡಲು FAT & SNF ನಮೂದಿಸಿ';

  @override
  String get collectRateOnSync => 'ಸಿಂಕ್ ಆದಾಗ ದರ ಲೆಕ್ಕ ಹಾಕಲಾಗುತ್ತದೆ';

  @override
  String collectTodaysEntries(int count) {
    return 'ಇಂದಿನ ನಮೂದುಗಳು ($count)';
  }

  @override
  String collectEntries(int count) {
    return 'ನಮೂದುಗಳು ($count)';
  }

  @override
  String get collectSaveAndNext => 'ಉಳಿಸಿ & ಮುಂದೆ';

  @override
  String collectCloseShift(String shift) {
    return '$shift ಸಂಗ್ರಹ ಮುಚ್ಚಿ';
  }

  @override
  String get collectCloseDay => 'ಇಂದಿನ ಸಂಗ್ರಹ ಮುಚ್ಚಿ';

  @override
  String collectClosedBanner(String shift) {
    return '$shift ಸಂಗ್ರಹ ಮುಚ್ಚಲಾಗಿದೆ — ರವಾನೆಗೆ ಸಿದ್ಧ.';
  }

  @override
  String get collectDayClosedBanner =>
      'ಇಂದಿನ ಸಂಗ್ರಹ ಮುಚ್ಚಲಾಗಿದೆ — ರವಾನೆಗೆ ಸಿದ್ಧ.';

  @override
  String get collectClosedAction => 'ಸಂಗ್ರಹ ಮುಚ್ಚಲಾಗಿದೆ';

  @override
  String get collectReopen => 'ಮರು ತೆರೆಯಿರಿ';

  @override
  String get collectDispatchNow => 'ಈಗ ರವಾನಿಸಿ';

  @override
  String get collectCloseBlockedPending =>
      'ಕೆಲವು ಸುರಿತಗಳು ಇನ್ನೂ ಸಿಂಕ್ ಆಗಿಲ್ಲ — ಸಿಂಕ್ ನಂತರ ಮುಚ್ಚಿ.';

  @override
  String get dispatchCloseFirst => 'ರವಾನಿಸುವ ಮೊದಲು ಈ ಪಾಳಿಯ ಸಂಗ್ರಹ ಮುಚ್ಚಿ.';

  @override
  String dispatchPendingTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ರವಾನೆಗಳು ಬಾಕಿ',
      one: '$count ರವಾನೆ ಬಾಕಿ',
    );
    return '$_temp0';
  }

  @override
  String dispatchPendingOldest(String slot, String qty) {
    return 'ಅತ್ಯಂತ ಹಳೆಯದು: $slot · $qty';
  }

  @override
  String get pendingWorkCloseScreenTitle => 'ಮುಚ್ಚಬೇಕಾದ ಸಂಗ್ರಹಗಳು';

  @override
  String get pendingWorkDispatchScreenTitle => 'ಬಾಕಿ ಇರುವ ರವಾನೆಗಳು';

  @override
  String get pendingWorkEmpty => 'ಏನೂ ಬಾಕಿ ಇಲ್ಲ';

  @override
  String get pendingWorkEmptySubtitle => 'ಸಂಗ್ರಹಿಸಿದ ಎಲ್ಲಾ ಹಾಲು ಮುಂದೆ ಸಾಗಿದೆ';

  @override
  String pendingWorkDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days ದಿನಗಳ ಹಿಂದೆ',
      one: '$days ದಿನದ ಹಿಂದೆ',
    );
    return '$_temp0';
  }

  @override
  String get dispatchUntypedTitle => 'ಹಾಲಿನ ಪ್ರಕಾರ ದಾಖಲಾಗಿಲ್ಲ';

  @override
  String get dispatchUntypedHint => 'ಕಳುಹಿಸುವ ಮೊದಲು ಪ್ರಕಾರ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get dispatchErrorTypeNotChosen =>
      'ಪ್ರಕಾರವಿಲ್ಲದ ಸಾಗಣೆಗೆ ಹಾಲಿನ ಪ್ರಕಾರ ಆಯ್ಕೆಮಾಡಿ.';

  @override
  String dispatchPendingCloseTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಸಂಗ್ರಹಗಳು ಮುಚ್ಚಬೇಕು',
      one: '$count ಸಂಗ್ರಹ ಮುಚ್ಚಬೇಕು',
    );
    return '$_temp0';
  }

  @override
  String get dispatchCloseFirstDay => 'ರವಾನಿಸುವ ಮೊದಲು ಇಂದಿನ ಸಂಗ್ರಹ ಮುಚ್ಚಿ.';

  @override
  String get historyLoadError => 'ಇತಿಹಾಸ ಲೋಡ್ ಆಗಲಿಲ್ಲ';

  @override
  String get historyByDay => 'ದಿನದಿಂದ';

  @override
  String get historyByFarmer => 'ರೈತರಿಂದ';

  @override
  String get historyAll => 'ಎಲ್ಲಾ';

  @override
  String get historyNoHistory => 'ಸಂಗ್ರಹ ಇತಿಹಾಸ ಇಲ್ಲ';

  @override
  String get historyNoHistorySubtitle =>
      'ಕಳೆದ 30 ದಿನಗಳ ದಾಖಲಿತ ಸಂಗ್ರಹಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String get historyNoFarmersMatch => 'ಯಾವ ರೈತರೂ ಹೊಂದಾಣಿಕೆಯಾಗಲಿಲ್ಲ';

  @override
  String get historyNoFarmersMatchSubtitle => 'ಇನ್ನೊಂದು ಹೆಸರು ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get historySearchFarmer => 'ರೈತರನ್ನು ಹುಡುಕಿ';

  @override
  String get historyFarmerFallback => 'ರೈತ';

  @override
  String historyDaySubtitle(int count, String pm, String am) {
    return '$count ರೈತರು · ☾ $pm · ☀️ $am';
  }

  @override
  String get pourDetailDeleteTitle => 'ನಮೂದು ಅಳಿಸಬೇಕೇ?';

  @override
  String pourDetailDeleteContent(String qty, String name) {
    return '$name ಗೆ $qty ಹಿಂತಿರುಗಿಸಲಾಗುತ್ತದೆ. ಇದನ್ನು ರದ್ದು ಮಾಡಲಾಗುವುದಿಲ್ಲ.';
  }

  @override
  String get pourDetailFarmerFallback => 'ಈ ರೈತ';

  @override
  String get pourDetailDelete => 'ಅಳಿಸಿ';

  @override
  String get pourDetailModify => 'ಬದಲಾಯಿಸಿ';

  @override
  String get pourDetailReversed => 'ಹಿಂತಿರುಗಿಸಲಾಗಿದೆ';

  @override
  String get pourDetailRatePerLitre => 'ದರ / ಲೀಟರ್';

  @override
  String get pourDetailQuantity => 'ಪ್ರಮಾಣ';

  @override
  String get pourDetailMilkType => 'ಹಾಲಿನ ಪ್ರಕಾರ';

  @override
  String get pourDetailShift => 'ಶಿಫ್ಟ್';

  @override
  String get pourDetailDate => 'ದಿನಾಂಕ';

  @override
  String get pourDetailAmount => 'ಮೊತ್ತ';

  @override
  String get shiftAm => 'AM';

  @override
  String get shiftPm => 'PM';

  @override
  String ppHomeTankersToReceive(num count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.compact(
      locale: localeName,
    );
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ಸ್ವೀಕರಿಸಲು $countString ಟ್ಯಾಂಕರ್‌ಗಳು',
      one: 'ಸ್ವೀಕರಿಸಲು 1 ಟ್ಯಾಂಕರ್',
    );
    return '$_temp0';
  }

  @override
  String ccReceivePoolWaitsForMorning(String date) {
    return 'ಸಂಜೆಯ ಹಾಲು ಮರುದಿನ ಬೆಳಗಿನ ಸಂಗ್ರಹದೊಂದಿಗೆ ಹೋಗುತ್ತದೆ. ಈ ಪೂಲ್ ಅನ್ನು $date ರಂದು ಮುಚ್ಚಿ ರವಾನಿಸಿ.';
  }

  @override
  String get consignmentSlotPooled => 'ಸಂಗ್ರಹಿತ';

  @override
  String get shiftMorning => 'ಬೆಳಿಗ್ಗೆ';

  @override
  String get shiftEvening => 'ಸಂಜೆ';

  @override
  String get shiftFarmerFallback => 'ರೈತ';

  @override
  String get profileMemberSince => 'ಸದಸ್ಯತ್ವದಿಂದ';

  @override
  String get profileCollectionCentre => 'ಸಂಗ್ರಹ ಕೇಂದ್ರ';

  @override
  String get profileBankPayout => 'ಬ್ಯಾಂಕ್ & ಪಾವತಿ';

  @override
  String get profileNotifications => 'ಅಧಿಸೂಚನೆಗಳು';

  @override
  String get profileHelpSupport => 'ಸಹಾಯ & ಬೆಂಬಲ';

  @override
  String get profileAbout => 'ಬಗ್ಗೆ';

  @override
  String get profileAppearance => 'ನೋಟ';

  @override
  String get profileThemeSystem => 'ಸಿಸ್ಟಮ್ ಡೀಫಾಲ್ಟ್';

  @override
  String get profileThemeLight => 'ಬೆಳಕು';

  @override
  String get profileThemeDark => 'ಕತ್ತಲು';

  @override
  String get profileLogOut => 'ಲಾಗ್ ಔಟ್';

  @override
  String get profileDeleteAccount => 'ಖಾತೆ ಅಳಿಸಿ';

  @override
  String get profileDeleteAccountTitle => 'ಖಾತೆ ಅಳಿಸುವುದೇ?';

  @override
  String get profileDeleteAccountBody =>
      'ಇದು ನಿಮ್ಮ ಖಾತೆ ಮತ್ತು ವೈಯಕ್ತಿಕ ವಿವರಗಳನ್ನು ಶಾಶ್ವತವಾಗಿ ಅಳಿಸುತ್ತದೆ. ನಿಮ್ಮ ಹಾಲು ಸಂಗ್ರಹ ಮತ್ತು ಪಾವತಿ ದಾಖಲೆಗಳು ಡೈರಿಯ ಲೆಕ್ಕದಲ್ಲಿ ಉಳಿಯುತ್ತವೆ. ಇದನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗದು.';

  @override
  String get profileDeleteAccountConfirm => 'ಖಾತೆ ಅಳಿಸಿ';

  @override
  String get profileDeleteAccountError =>
      'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ಅಳಿಸಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get homeRecentEntries => 'ಇತ್ತೀಚಿನ ನಮೂದುಗಳು';

  @override
  String get homeFarmers => 'ರೈತರು';

  @override
  String get homeHistory => 'ಇತಿಹಾಸ';

  @override
  String get homeReports => 'ವರದಿಗಳು';

  @override
  String farmerRateSpeakCoach(Object metric, Object value, Object extra) {
    return 'ನಿಮ್ಮ $metric $value ತಲುಪಿದರೆ, ಪ್ರತಿ ಲೀಟರ್‌ಗೆ $extra ರೂಪಾಯಿ ಹೆಚ್ಚು ಸಿಗುತ್ತದೆ.';
  }

  @override
  String get helpTitle => 'ಸಹಾಯ ಮತ್ತು ಬೆಂಬಲ';

  @override
  String get helpCallSupport => 'ಬೆಂಬಲಕ್ಕೆ ಕರೆ ಮಾಡಿ';

  @override
  String get helpEmailSupport => 'ಇಮೇಲ್ ಮಾಡಿ';

  @override
  String get helpWhatsApp => 'WhatsApp ನಲ್ಲಿ ಮಾತನಾಡಿ';

  @override
  String get helpReplySoon => 'ಸಾಮಾನ್ಯವಾಗಿ ಕೆಲವೇ ಗಂಟೆಗಳಲ್ಲಿ ಉತ್ತರಿಸುತ್ತೇವೆ.';

  @override
  String get helpNoContacts =>
      'ಬೆಂಬಲ ಸಂಪರ್ಕಗಳನ್ನು ಇನ್ನೂ ಹೊಂದಿಸಿಲ್ಲ — ದಯವಿಟ್ಟು ನಿಮ್ಮ ಡೈರಿ ನಿರ್ವಾಹಕರನ್ನು ಕೇಳಿ.';

  @override
  String get helpCouldNotOpen => 'ತೆರೆಯಲು ಆಗಲಿಲ್ಲ';

  @override
  String get faqFarmerQ1 => 'ನನ್ನ ಹಾಲಿನ ನಮೂದುಗಳನ್ನು ಎಲ್ಲಿ ನೋಡಬಹುದು?';

  @override
  String get faqFarmerA1 =>
      'ಸಂಗ್ರಹಗಳು ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಪ್ರತಿ ದಿನದ ಪ್ರಮಾಣ ಮತ್ತು ಗುಣಮಟ್ಟದೊಂದಿಗೆ ಎಲ್ಲಾ ನಮೂದುಗಳಿವೆ.';

  @override
  String get faqFarmerQ2 => 'ನನ್ನ ದರ ಹೇಗೆ ನಿರ್ಧಾರವಾಗುತ್ತದೆ?';

  @override
  String get faqFarmerA2 =>
      'ಮುಖಪುಟದಿಂದ ದರ ಪಟ್ಟಿ ತೆರೆಯಿರಿ — ನಿಮ್ಮ FAT ಮತ್ತು SNF (ಅಥವಾ CLR) ಪ್ರತಿ ಲೀಟರ್ ಬೆಲೆ ನಿರ್ಧರಿಸುತ್ತದೆ.';

  @override
  String get faqFarmerQ3 => 'ನನಗೆ ಯಾವಾಗ ಪಾವತಿ ಆಗುತ್ತದೆ?';

  @override
  String get faqFarmerA3 =>
      'ಪಾವತಿಗಳು ನಿಮ್ಮ ಡೈರಿಯ ಪಾವತಿ ಚಕ್ರವನ್ನು ಅನುಸರಿಸುತ್ತವೆ. ಪಾವತಿಗಳು ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಈಗಿನ ಚಕ್ರ ಮತ್ತು ಬಾಕಿ ಕಾಣುತ್ತದೆ.';

  @override
  String get faqOperatorQ1 => 'ಸಂಗ್ರಹವನ್ನು ಹೇಗೆ ದಾಖಲಿಸುವುದು?';

  @override
  String get faqOperatorA1 =>
      'ಕೆಳಗಿನ ಪಟ್ಟಿಯಲ್ಲಿ ಸಂಗ್ರಹ ಒತ್ತಿ, ರೈತರನ್ನು ಆರಿಸಿ, ನಂತರ ಪ್ರಮಾಣ, FAT ಮತ್ತು SNF ನಮೂದಿಸಿ.';

  @override
  String get faqOperatorQ2 => 'ಪಾವತಿಗಳು ಯಾವಾಗ ಇತ್ಯರ್ಥವಾಗುತ್ತವೆ?';

  @override
  String get faqOperatorA2 =>
      'ಪಾವತಿಗಳು ನಿಮ್ಮ ಕೇಂದ್ರದ ಚಕ್ರವನ್ನು ಅನುಸರಿಸುತ್ತವೆ. ಈಗಿನ ಚಕ್ರಕ್ಕೆ ಪಾವತಿಗಳು ಟ್ಯಾಬ್ ನೋಡಿ.';

  @override
  String get commonRetry => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get commonErrorTitle => 'ನಿಮ್ಮ ಡೇಟಾ ಲೋಡ್ ಆಗಲಿಲ್ಲ';

  @override
  String get commonErrorSubtitle => 'ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get commonOfflineSaved => 'ಆಫ್‌ಲೈನ್ — ಉಳಿಸಿದ ಡೇಟಾ ತೋರಿಸಲಾಗುತ್ತಿದೆ';

  @override
  String get shiftNotRecorded => 'ದಾಖಲಾಗಿಲ್ಲ';

  @override
  String get syncSyncedLabel => 'ಸಿಂಕ್ ಆಗಿದೆ';

  @override
  String syncSyncedAgoLabel(Object ago) {
    return 'ಸಿಂಕ್ ಆಗಿದೆ $ago';
  }

  @override
  String syncToSendLabel(Object count) {
    return '$count ಕಳುಹಿಸಬೇಕಿದೆ';
  }

  @override
  String get syncOfflineLabel => 'ಆಫ್‌ಲೈನ್ — ಸಾಧನದಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ';

  @override
  String get notifScreenTitle => 'ಅಧಿಸೂಚನೆಗಳು';

  @override
  String get notifPushTitle => 'ಪುಶ್ ಅಧಿಸೂಚನೆಗಳು';

  @override
  String get notifPushSubtitle =>
      'ಸಂಗ್ರಹ, ರವಾನೆ ಮತ್ತು ಪಾವತಿಗಳ ಎಚ್ಚರಿಕೆ ಪಡೆಯಿರಿ';

  @override
  String get notifPushFootnote =>
      'ಆಫ್ ಮಾಡಿದರೆ ಈ ಸಾಧನಕ್ಕೆ ಪುಶ್ ಅಧಿಸೂಚನೆಗಳು ಬರುವುದಿಲ್ಲ. ಯಾವಾಗ ಬೇಕಾದರೂ ಮತ್ತೆ ಆನ್ ಮಾಡಬಹುದು.';

  @override
  String farmerRateEffectiveFrom(Object date) {
    return '$date ರಿಂದ';
  }

  @override
  String get errorOffline =>
      'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ — ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errorTimeout => 'ವಿನಂತಿ ಸಮಯ ಮೀರಿದೆ — ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errorGeneric => 'ಏನೋ ತಪ್ಪಾಗಿದೆ — ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get syncSheetTitle => 'ಈ ಸಾಧನದಲ್ಲಿನ ನಮೂದುಗಳು';

  @override
  String syncSheetCounts(Object pending, Object failed) {
    return '$pending ಕಾಯುತ್ತಿವೆ · $failed ವಿಫಲ';
  }

  @override
  String get syncSheetAllClear => 'ಎಲ್ಲವೂ ಸಿಂಕ್ ಆಗಿದೆ.';

  @override
  String get syncRetry => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get syncDelete => 'ಅಳಿಸಿ';

  @override
  String get syncDeleteConfirmTitle => 'ಈ ನಮೂದನ್ನು ಅಳಿಸಬೇಕೇ?';

  @override
  String get syncDeleteConfirmBody =>
      'ಈ ಹಾಲು ನಮೂದು ಸರ್ವರ್‌ಗೆ ಕಳುಹಿಸಲಾಗಿಲ್ಲ. ಅಳಿಸಿದರೆ ಶಾಶ್ವತವಾಗಿ ಹೋಗುತ್ತದೆ — ರೈತರಿಗೆ ಇದಕ್ಕೆ ಪಾವತಿ ಆಗುವುದಿಲ್ಲ.';

  @override
  String get syncSyncNow => 'ಈಗ ಸಿಂಕ್ ಮಾಡಿ';

  @override
  String get pendingSavingPill => 'ಉಳಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get pendingFailedPill => 'ವಿಫಲ';

  @override
  String get collectCorrectionNeedsConnection =>
      'ತಿದ್ದುಪಡಿಗಳಿಗೆ ಸಂಪರ್ಕ ಬೇಕು — ಆನ್‌ಲೈನ್ ಆದಾಗ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get profileLogOutConfirmTitle => 'ಲಾಗ್ ಔಟ್ ಮಾಡಬೇಕೇ?';

  @override
  String get profileLogOutConfirmBody =>
      'ನಿಮ್ಮ ಫೋನ್‌ಗೆ ಬರುವ OTP ಬಳಸಿ ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಬೇಕಾಗುತ್ತದೆ.';

  @override
  String get collectImplausibleTitle => 'ಅಸಾಮಾನ್ಯವಾಗಿ ಹೆಚ್ಚಿನ ಮೌಲ್ಯಗಳು';

  @override
  String collectImplausibleBody(Object values) {
    return '$values — ಇದು ಸರಿಯೇ?';
  }

  @override
  String get collectSaveAnyway => 'ಆದರೂ ಉಳಿಸಿ';

  @override
  String get collectPendingDupTitle => 'ಈ ಸಾಧನದಲ್ಲಿ ಈಗಾಗಲೇ ಉಳಿಸಲಾಗಿದೆ';

  @override
  String collectPendingDupBody(Object name) {
    return '$name ಅವರಿಗೆ ಈ ಪಾಳಿಗೆ ಸಿಂಕ್ ಆಗಬೇಕಿರುವ ನಮೂದು ಈಗಾಗಲೇ ಇದೆ. ಅದನ್ನು ಬದಲಾಯಿಸಬೇಕೇ, ಅಥವಾ ಇದನ್ನು ಹೆಚ್ಚುವರಿ ಪಾತ್ರೆಯಾಗಿ ಸೇರಿಸಬೇಕೇ?';
  }

  @override
  String get collectPendingDupReplace => 'ಉಳಿಸಿದ ನಮೂದನ್ನು ಬದಲಾಯಿಸಿ';

  @override
  String get collectPendingDupExtraLot => 'ಹೆಚ್ಚುವರಿ ಲಾಟ್ ಆಗಿ ಸೇರಿಸಿ';

  @override
  String syncFailedLabel(Object count) {
    return '$count ವಿಫಲವಾಗಿದೆ — ಗಮನ ಬೇಕು';
  }

  @override
  String get homeSeeFullHistory => 'ಪೂರ್ಣ ಇತಿಹಾಸ ನೋಡಿ';

  @override
  String get homeAmShiftInProgress => 'ಬೆಳಿಗ್ಗೆ ಪಾಳಿ · ಪ್ರಗತಿಯಲ್ಲಿದೆ';

  @override
  String get homePmShiftInProgress => 'ಸಂಜೆ ಪಾಳಿ · ಪ್ರಗತಿಯಲ್ಲಿದೆ';

  @override
  String get homeJustNow => 'ಈಗಷ್ಟೇ';

  @override
  String get homeHeroToday => 'ಇಂದು';

  @override
  String get homeHeroTotalToday => 'ಇಂದಿನ ಒಟ್ಟು';

  @override
  String get homeShiftNotStarted => 'ಇನ್ನೂ ಆರಂಭವಾಗಿಲ್ಲ';

  @override
  String get homeShiftCollecting => 'ಸಂಗ್ರಹಣೆ ನಡೆಯುತ್ತಿದೆ';

  @override
  String get homeShiftToDispatch => 'ರವಾನಿಸಬೇಕಿದೆ';

  @override
  String get homeShiftInTransit => 'ಸಾಗಣೆಯಲ್ಲಿ';

  @override
  String get homeShiftAtCc => 'CC ನಲ್ಲಿ ಸ್ವೀಕೃತ';

  @override
  String homeFarmerCount(Object count) {
    return '$count ರೈತರು';
  }

  @override
  String get homeAllDispatched => 'ಎಲ್ಲವನ್ನೂ ರವಾನಿಸಲಾಗಿದೆ';

  @override
  String get homeLoadError => 'ನಮೂದುಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String get homeNoCollectionToday => 'ಇಂದು ಇನ್ನೂ ಸಂಗ್ರಹವಿಲ್ಲ';

  @override
  String get homeNoCollectionSubtitle =>
      'ಪ್ರಾರಂಭಿಸಲು ಸಂಗ್ರಹ ದಾಖಲಿಸಿ ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get dispatchTitle => 'ರವಾನೆ';

  @override
  String get dispatchAvailability => 'ಲಭ್ಯತೆ';

  @override
  String get dispatchToCollectionCentre => 'ಸಂಗ್ರಹ ಕೇಂದ್ರಕ್ಕೆ ರವಾನಿಸಿ';

  @override
  String get dispatchQtyHint => 'ರವಾನೆ ಪ್ರಮಾಣ (L)';

  @override
  String get dispatchErrorNoTypeSelected =>
      'ರವಾನಿಸಲು ಕನಿಷ್ಠ ಒಂದು ಹಾಲಿನ ಬಗೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ.';

  @override
  String dispatchTankerButtonMulti(int count) {
    return '$count ಲೋಡ್ ರವಾನಿಸಿ';
  }

  @override
  String get dispatchTypeHeldBack => 'ಮುಂದಿನ ರವಾನೆಗೆ ಉಳಿಸಲಾಗಿದೆ';

  @override
  String get dispatchContainerHint => 'ಕಂಟೇನರ್ ಸಂಖ್ಯೆ (ಐಚ್ಛಿಕ)';

  @override
  String get dispatchTankerButton => 'ಟ್ಯಾಂಕರ್ ರವಾನಿಸಿ';

  @override
  String get dispatchTodaysOutbound => 'ಇಂದಿನ ಹೊರಗಡೆ';

  @override
  String get dispatchNoDispatchesToday => 'ಇಂದು ರವಾನೆಗಳಿಲ್ಲ';

  @override
  String dispatchOutboundOn(String date) {
    return 'ಹೊರಗಡೆ · $date';
  }

  @override
  String dispatchNoDispatchesOn(String date) {
    return '$date ರಂದು ರವಾನೆಗಳಿಲ್ಲ';
  }

  @override
  String get dispatchNoDispatchesSubtitle =>
      'ಟ್ಯಾಂಕರ್ ರವಾನಿಸಲು ಮೇಲಿನ ಫಾರ್ಮ್ ಬಳಸಿ';

  @override
  String get dispatchSelectDestination => 'ಗಮ್ಯಸ್ಥಾನ ಕೇಂದ್ರ ಆಯ್ಕೆ ಮಾಡಿ…';

  @override
  String get dispatchSearchCentre => 'ಕೇಂದ್ರ ಹುಡುಕಿ';

  @override
  String get dispatchNoCentresFound => 'ಯಾವುದೇ ಕೇಂದ್ರಗಳು ಕಂಡುಬಂದಿಲ್ಲ';

  @override
  String dispatchSoldBreakdown(
    Object collected,
    Object sold,
    Object available,
  ) {
    return '$collected ಲೀ ಸಂಗ್ರಹ − $sold ಲೀ ಗೇಟಿನಲ್ಲಿ ಮಾರಾಟ = $available ಲೀ';
  }

  @override
  String get dispatchErrorNoDestination => 'ಗಮ್ಯಸ್ಥಾನ ಸಂಗ್ರಹ ಕೇಂದ್ರ ಆಯ್ಕೆ ಮಾಡಿ';

  @override
  String get dispatchErrorInvalidQty => 'ಮಾನ್ಯ ರವಾನೆ ಪ್ರಮಾಣ ನಮೂದಿಸಿ';

  @override
  String dispatchErrorOverQty(Object available) {
    return 'ರವಾನಿಸಲು ಕೇವಲ $available L ಲಭ್ಯವಿದೆ';
  }

  @override
  String dispatchAmountDispatched(Object amount) {
    return '$amount ರವಾನಿಸಲಾಗಿದೆ';
  }

  @override
  String get dispatchNothingLeft => 'ರವಾನಿಸಲು ಇನ್ನೇನೂ ಉಳಿದಿಲ್ಲ.';

  @override
  String get dispatchNothingLeftThisShift =>
      'ಈ ಪಾಳಿಯಲ್ಲಿ ರವಾನಿಸಲು ಇನ್ನೇನೂ ಉಳಿದಿಲ್ಲ.';

  @override
  String dispatchContainerLabel(Object no) {
    return 'ಕಂಟೇನರ್ $no';
  }

  @override
  String get dispatchNoContainerNo => 'ಕಂಟೇನರ್ ಸಂಖ್ಯೆ ಇಲ್ಲ';

  @override
  String get dispatchStatusTransit => 'ಸಾಗಣೆಯಲ್ಲಿ';

  @override
  String get dispatchStatusReceived => 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get dispatchAvailableToDispatch => 'ರವಾನಿಸಲು ಲಭ್ಯ';

  @override
  String dispatchCollectedDispatched(Object collected, Object dispatched) {
    return 'ಸಂಗ್ರಹಿಸಲಾಗಿದೆ $collected · ರವಾನಿಸಲಾಗಿದೆ $dispatched';
  }

  @override
  String get dispatchNoData => 'ಮಾಹಿತಿ ಇಲ್ಲ';

  @override
  String get dispatchShiftAm => 'ಬೆಳಿಗ್ಗೆ';

  @override
  String get dispatchShiftPm => 'ಸಂಜೆ';

  @override
  String get paymentsCouldNotLoadCycles => 'ಚಕ್ರಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get paymentsStartNewCycle => 'ಹೊಸ ಚಕ್ರ ಪ್ರಾರಂಭಿಸಿ';

  @override
  String get paymentsNoCyclesTitle => 'ಇನ್ನೂ ಯಾವುದೇ ಚಕ್ರ ಇಲ್ಲ';

  @override
  String get paymentsNoCyclesSubtitle =>
      'ಒಂದು ಅವಧಿಗೆ ರೈತರಿಗೆ ಪಾವತಿ ಮಾಡಲು ಚಕ್ರ ಪ್ರಾರಂಭಿಸಿ';

  @override
  String get paymentsCyclesDisbursements => 'ಚಕ್ರಗಳು & ರೈತ ವಿತರಣೆಗಳು';

  @override
  String get paymentsCyclesTitle => 'ಚಕ್ರಗಳು';

  @override
  String payoutsLatestCycle(Object period) {
    return 'ಇತ್ತೀಚಿನ ಚಕ್ರ · $period';
  }

  @override
  String get payoutsLoadError => 'ಪಾವತಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get payoutsCycleHistory => 'ಚಕ್ರಗಳ ಇತಿಹಾಸ';

  @override
  String get payoutLineQty => 'ಪೂರೈಸಿದ ಹಾಲು';

  @override
  String get payoutLineGross => 'ಒಟ್ಟು ಮೊತ್ತ';

  @override
  String get payoutLineBonus => 'ಗುಣಮಟ್ಟ ಬೋನಸ್';

  @override
  String get payoutLineDeductions => 'ಕಡಿತಗಳು';

  @override
  String get payoutLineOtherDeduction => 'ಇತರ ಕಡಿತ';

  @override
  String get payoutLineStatementNo => 'ಸ್ಟೇಟ್‌ಮೆಂಟ್';

  @override
  String payoutLinePaidOn(Object date) {
    return '$date ರಂದು ಪಾವತಿಸಲಾಗಿದೆ';
  }

  @override
  String get payoutLineNotPaid => 'ಇನ್ನೂ ಪಾವತಿಸಿಲ್ಲ';

  @override
  String get payoutLineMarkPaid => 'ಪಾವತಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get payoutLineMarkUnpaid => 'ಪಾವತಿಸಿಲ್ಲ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get payoutsEmptyTitle => 'ಇನ್ನೂ ಪಾವತಿಗಳಿಲ್ಲ';

  @override
  String get payoutsEmptySubtitle =>
      'ಈ ರೈತರನ್ನು ಒಳಗೊಂಡ ಚಕ್ರ ಬಂದ ನಂತರ ಪಾವತಿಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String payoutsEarnedLabel(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಚಕ್ರಗಳು',
      one: '$count ಚಕ್ರ',
    );
    return 'ಗಳಿಕೆ · $_temp0';
  }

  @override
  String payoutsPaidAmount(Object amount) {
    return '$amount ಪಾವತಿಸಲಾಗಿದೆ';
  }

  @override
  String payoutsDueAmount(Object amount) {
    return '$amount ಬಾಕಿ';
  }

  @override
  String get payoutsCycleFallback => 'ಚಕ್ರ';

  @override
  String payoutsGrossLessDeductions(Object gross, Object deductions) {
    return '$gross ಒಟ್ಟು − $deductions ಕಡಿತ';
  }

  @override
  String get paymentsPendingToPayLabel => 'ಪಾವತಿ ಬಾಕಿ';

  @override
  String paymentsPendingFarmersSub(Object farmers, Object open) {
    return '$farmers ರೈತರು · $open ತೆರೆದ';
  }

  @override
  String get paymentsPaidLabel => 'ಪಾವತಿಸಲಾಗಿದೆ';

  @override
  String paymentsPaidCyclesSub(Object count) {
    return '$count ಚಕ್ರಗಳಲ್ಲಿ';
  }

  @override
  String get paymentsCycleStatusOpen => 'ತೆರೆದ';

  @override
  String get paymentsCycleStatusLocked => 'ಲಾಕ್ ಆಗಿದೆ';

  @override
  String get paymentsCycleStatusPaid => 'ಪಾವತಿಸಲಾಗಿದೆ';

  @override
  String get paymentsCycleStatusReversed => 'ರದ್ದುಮಾಡಲಾಗಿದೆ';

  @override
  String get paymentsNetLabel => 'ನಿವ್ವಳ';

  @override
  String paymentsFarmerCount(Object count) {
    return '$count ರೈತರು';
  }

  @override
  String paymentsPaidCount(Object paid, Object total) {
    return '$paid/$total ಪಾವತಿಸಲಾಗಿದೆ';
  }

  @override
  String paymentsAmountPending(Object amount) {
    return '$amount ಬಾಕಿ';
  }

  @override
  String get paymentsSelectPeriod => 'ಅವಧಿ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get paymentsCouldNotLoadPeriods => 'ಅವಧಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get paymentsPeriodInProgress => 'ಪ್ರಗತಿಯಲ್ಲಿದೆ';

  @override
  String get paymentsPeriodClosed => 'ಮುಚ್ಚಲಾಗಿದೆ';

  @override
  String get farmersAddFarmer => 'ರೈತರನ್ನು ಸೇರಿಸಿ';

  @override
  String get farmersSearchHint => 'ಹೆಸರು ಅಥವಾ ಕೋಡ್‌ನಿಂದ ಹುಡುಕಿ';

  @override
  String get farmersCouldNotLoad => 'ರೈತರನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get farmersEmptyTitle => 'ಯಾವುದೇ ರೈತರು ನೋಂದಾಯಿಸಲಾಗಿಲ್ಲ';

  @override
  String get farmersNoMatchTitle => 'ಹೊಂದಾಣಿಕೆಯ ರೈತರು ಇಲ್ಲ';

  @override
  String get farmersEmptySubtitle =>
      'ಈ VMCC ನಲ್ಲಿ ನೋಂದಾಯಿತ ರೈತರು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತಾರೆ';

  @override
  String get farmerDetailEditTooltip => 'ರೈತ ಸಂಪಾದಿಸಿ';

  @override
  String get farmerDetailTabDetails => 'ವಿವರಗಳು';

  @override
  String get farmerDetailTabPours => 'ಹಾಲು ನೀಡಿಕೆ';

  @override
  String get farmerDetailTabPayments => 'ಪಾವತಿಗಳು';

  @override
  String get farmerDetailStatusActive => 'ಸಕ್ರಿಯ';

  @override
  String get farmerDetailStatusInactive => 'ನಿಷ್ಕ್ರಿಯ';

  @override
  String get farmerDetailPhone => 'ಫೋನ್';

  @override
  String get farmerDetailContact => 'ಸಂಪರ್ಕ';

  @override
  String get farmerDetailVillage => 'ಗ್ರಾಮ';

  @override
  String get farmerDetailAddress => 'ವಿಳಾಸ';

  @override
  String get farmerDetailGps => 'GPS';

  @override
  String get farmerDetailLocation => 'ಸ್ಥಳ';

  @override
  String get farmerDetailTotalCattle => 'ಒಟ್ಟು ಜಾನುವಾರು';

  @override
  String get farmerDetailCurrentlyMilking => 'ಪ್ರಸ್ತುತ ಹಾಲು ಕರೆಯುತ್ತಿರುವ';

  @override
  String get farmerDetailHerd => 'ಹಿಂಡು';

  @override
  String get farmerDetailAadhaar => 'ಆಧಾರ್';

  @override
  String get farmerDetailIdentity => 'ಗುರುತು';

  @override
  String get farmerDetailBankName => 'ಬ್ಯಾಂಕ್ ಹೆಸರು';

  @override
  String get farmerDetailAccountNumber => 'ಖಾತೆ ಸಂಖ್ಯೆ';

  @override
  String get farmerDetailIfsc => 'IFSC';

  @override
  String get farmerDetailUpiId => 'UPI ID';

  @override
  String get farmerDetailPayment => 'ಪಾವತಿ';

  @override
  String get farmerDetailNotProvided => 'ಒದಗಿಸಲಾಗಿಲ್ಲ';

  @override
  String get farmerPoursLoadError => 'ಹಾಲು ನೀಡಿಕೆ ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String get farmerPoursEmptyTitle => 'ಇತ್ತೀಚಿನ ಹಾಲು ನೀಡಿಕೆ ಇಲ್ಲ';

  @override
  String get farmerPoursEmptySubtitle =>
      'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ ಯಾವುದೇ ಹಾಲು ನೀಡಿಕೆ ಇಲ್ಲ. ಮೇಲಿನ ಹಿಂದಿನ ಚಕ್ರದ ಹೇಳಿಕೆಯನ್ನು ಹಂಚಿಕೊಳ್ಳಿ.';

  @override
  String farmerPoursCount(Object count) {
    return '$count ಹಾಲು ನೀಡಿಕೆ';
  }

  @override
  String get farmerPours30DayTotal => '30 ದಿನದ ಒಟ್ಟು';

  @override
  String get farmerPaymentsAddEntry => 'ನಮೂದು ಸೇರಿಸಿ';

  @override
  String get farmerPaymentsAmountHint => 'ಮೊತ್ತ (₹)';

  @override
  String get farmerPaymentsRecordEntry => 'ನಮೂದು ದಾಖಲಿಸಿ';

  @override
  String get farmerPaymentsHistory => 'ಇತಿಹಾಸ';

  @override
  String get farmerPaymentsLoadError => 'ಲೆಡ್ಜರ್ ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String get farmerPaymentsOutstanding => 'ಬಾಕಿ';

  @override
  String get farmerPaymentsInvalidAmount => 'ಮಾನ್ಯ ಮೊತ್ತವನ್ನು ನಮೂದಿಸಿ';

  @override
  String get farmerPaymentsNoEntries => 'ಇನ್ನೂ ಯಾವುದೇ ನಮೂದುಗಳಿಲ್ಲ';

  @override
  String get farmerPaymentsTypeAdvance => 'ಮುಂಗಡ';

  @override
  String get farmerPaymentsFeedLoan => 'ಮೇವಿನ ಸಾಲ';

  @override
  String get farmerPaymentsRepayment => 'ಮರುಪಾವತಿ';

  @override
  String get farmerPaymentsAgainstAdvance => 'ಮುಂಗಡ ಮರುಪಾವತಿ';

  @override
  String get farmerPaymentsAgainstFeedLoan => 'ಮೇವಿನ ಸಾಲ ಮರುಪಾವತಿ';

  @override
  String get farmerPaymentsAdvanceGiven => 'ಮುಂಗಡ ನೀಡಲಾಗಿದೆ';

  @override
  String get farmerPaymentsFeedLoanGiven => 'ಮೇವಿನ ಸಾಲ ನೀಡಲಾಗಿದೆ';

  @override
  String get farmerPaymentsRepaymentLabel => 'ಮರುಪಾವತಿ';

  @override
  String get farmerPaymentsAdjustment => 'ಸರಿಹೊಂದಿಸುವಿಕೆ';

  @override
  String get addFarmerAddTitle => 'ರೈತರನ್ನು ಸೇರಿಸಿ';

  @override
  String get addFarmerEditTitle => 'ರೈತರ ವಿವರ ತಿದ್ದು';

  @override
  String get addFarmerCamera => 'ಕ್ಯಾಮೆರಾ';

  @override
  String get addFarmerGallery => 'ಗ್ಯಾಲರಿ';

  @override
  String get addFarmerNameRequired => 'ಹೆಸರು ಅಗತ್ಯವಿದೆ';

  @override
  String get addFarmerAadhaarLength =>
      'ಆಧಾರ್ ಸಂಖ್ಯೆ ನಿಖರವಾಗಿ 12 ಅಂಕಿಗಳಾಗಿರಬೇಕು';

  @override
  String get addFarmerLocationPermissionDenied => 'ಸ್ಥಳ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ';

  @override
  String addFarmerRegisteredToast(Object name) {
    return '$name ನೋಂದಾಯಿಸಲಾಗಿದೆ';
  }

  @override
  String addFarmerUpdatedToast(Object name) {
    return '$name ನವೀಕರಿಸಲಾಗಿದೆ';
  }

  @override
  String get addFarmerSaveChanges => 'ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ';

  @override
  String get addFarmerRegisterFarmer => 'ರೈತರನ್ನು ನೋಂದಾಯಿಸಿ';

  @override
  String get addFarmerSectionBasics => 'ಮೂಲ ವಿವರ';

  @override
  String get addFarmerFieldFullName => 'ಪೂರ್ಣ ಹೆಸರು *';

  @override
  String get addFarmerFieldPhoneNumber => 'ಫೋನ್ ನಂಬರ್';

  @override
  String get addFarmerFieldDobHint =>
      'ಹುಟ್ಟಿದ ದಿನ (ಐಚ್ಛಿಕ — ಆ್ಯಪ್ ಲಾಗಿನ್ ಸಕ್ರಿಯಗೊಳಿಸುತ್ತದೆ)';

  @override
  String get addFarmerSectionLocation => 'ಸ್ಥಳ';

  @override
  String get addFarmerFieldVillage => 'ಗ್ರಾಮ';

  @override
  String get addFarmerFieldAddress => 'ವಿಳಾಸ';

  @override
  String get addFarmerGettingLocation => 'ಸ್ಥಳ ಪಡೆಯಲಾಗುತ್ತಿದೆ…';

  @override
  String get addFarmerCaptureGps => 'GPS ಸ್ಥಳ ದಾಖಲಿಸಿ';

  @override
  String get addFarmerSectionIdentity => 'ಗುರುತು';

  @override
  String get addFarmerPhotoAdded => 'ಪ್ರೊಫೈಲ್ ಫೋಟೋ ಸೇರಿಸಲಾಗಿದೆ';

  @override
  String get addFarmerPhotoAdd => 'ಪ್ರೊಫೈಲ್ ಫೋಟೋ ಸೇರಿಸಿ';

  @override
  String get addFarmerPhotoTapToChange => 'ಬದಲಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get addFarmerPhotoHint => 'ಫೋಟೋ ತೆಗೆಯಿರಿ ಅಥವಾ ಗ್ಯಾಲರಿಯಿಂದ ಆಯ್ಕೆ ಮಾಡಿ';

  @override
  String get addFarmerFieldAadhaar => 'ಆಧಾರ್ ಸಂಖ್ಯೆ';

  @override
  String get addFarmerFieldKyc => 'KYC ದಾಖಲೆ';

  @override
  String get addFarmerFieldKycAdded => 'KYC ದಾಖಲೆ ಸೇರಿಸಲಾಗಿದೆ';

  @override
  String get addFarmerSectionPayment => 'ಪಾವತಿ';

  @override
  String get addFarmerFieldBankName => 'ಬ್ಯಾಂಕ್ ಹೆಸರು';

  @override
  String get addFarmerFieldAccountHolderName => 'ಖಾತೆದಾರ ಹೆಸರು';

  @override
  String get addFarmerFieldAccountNumber => 'ಖಾತೆ ಸಂಖ್ಯೆ';

  @override
  String get addFarmerFieldIfscCode => 'IFSC ಕೋಡ್';

  @override
  String get addFarmerFieldUpiId => 'UPI ID';

  @override
  String get herdSectionTitle => 'ಹಿಂಡು';

  @override
  String herdTotalHead(Object count) {
    return '$count ತಲೆ';
  }

  @override
  String get herdMilkType => 'ಹಾಲಿನ ವಿಧ';

  @override
  String get herdCattleBreeds => 'ಜಾನುವಾರು ತಳಿಗಳು';

  @override
  String get herdNoBreedsYet => 'ಇನ್ನೂ ತಳಿಗಳು ಸೇರಿಸಿಲ್ಲ.';

  @override
  String get herdAddBreed => 'ತಳಿ ಸೇರಿಸಿ';

  @override
  String get herdInMilkCount => 'ಪ್ರಸ್ತುತ ಹಾಲು ಕರೆಯುವ ಸಂಖ್ಯೆ';

  @override
  String get herdBreedLabel => 'ತಳಿ';

  @override
  String get herdQtyHint => 'ಪ್ರಮಾಣ';

  @override
  String get herdBreedDesiNatti => 'ದೇಸಿ / ನಾಟಿ';

  @override
  String get herdBreedCrossbred => 'ಮಿಶ್ರ ತಳಿ';

  @override
  String get herdBreedJersey => 'ಜರ್ಸಿ';

  @override
  String get herdBreedHf => 'HF';

  @override
  String get herdBreedGir => 'ಗಿರ್';

  @override
  String get herdBreedSahiwal => 'ಸಾಹಿವಾಲ್';

  @override
  String get herdBreedMurrah => 'ಮುರ್ರಾ';

  @override
  String get herdBreedOther => 'ಇತರ';

  @override
  String get reportsTabQc => 'ಗುಣಮಟ್ಟ';

  @override
  String get cycleCycle => 'ಚಕ್ರ';

  @override
  String get cycleCouldNotLoad => 'ಚಕ್ರ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get cycleNotFound => 'ಚಕ್ರ ಕಂಡುಬಂದಿಲ್ಲ';

  @override
  String get cycleNoLines => 'ಈ ಚಕ್ರದಲ್ಲಿ ಯಾವುದೇ ಸಾಲುಗಳಿಲ್ಲ';

  @override
  String get cycleNoFarmersMatch => 'ಯಾವ ರೈತರೂ ಹೊಂದಿಕೆಯಾಗುವುದಿಲ್ಲ';

  @override
  String get cycleNetPayable => 'ನಿವ್ವಳ ಪಾವತಿಸಬೇಕಾದ ಮೊತ್ತ';

  @override
  String cyclePaidLegend(Object amount, Object paid, Object total) {
    return '$amount ಪಾವತಿಸಲಾಗಿದೆ · $paid/$total';
  }

  @override
  String get cycleMarkAllPaid => 'ಎಲ್ಲರನ್ನೂ ಪಾವತಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get cycleMarkAllUnpaid => 'ಎಲ್ಲರನ್ನೂ ಪಾವತಿಸಲಾಗಿಲ್ಲ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get cycleFilterAll => 'ಎಲ್ಲಾ';

  @override
  String get cycleFilterUnpaid => 'ಪಾವತಿಸಲಾಗಿಲ್ಲ';

  @override
  String get cycleFilterPaid => 'ಪಾವತಿಸಲಾಗಿದೆ';

  @override
  String get cycleLockTitle => 'ಚಕ್ರ ಲಾಕ್ ಮಾಡುವುದೇ?';

  @override
  String get cycleLockContent =>
      'ಲಾಕ್ ಮಾಡುವುದರಿಂದ ಮೊತ್ತಗಳು ಸ್ಥಿರವಾಗುತ್ತವೆ ಮತ್ತು ಸಾಲ ಮರುಪಾವತಿ ದಾಖಲಾಗುತ್ತದೆ. ನಂತರ ಪಾವತಿಸಬಹುದು.';

  @override
  String get cyclePayTitle => 'ಚಕ್ರ ಪಾವತಿ ಮಾಡುವುದೇ?';

  @override
  String get cyclePayContent =>
      'ಇದು ಪ್ರತಿ ರೈತರಿಗೆ ಪಾವತಿ ದಾಖಲಿಸುತ್ತದೆ ಮತ್ತು ರದ್ದು ಮಾಡಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get cycleLockAction => 'ಲಾಕ್';

  @override
  String get cyclePayAction => 'ಪಾವತಿ';

  @override
  String get cycleLockCycle => 'ಚಕ್ರ ಲಾಕ್ ಮಾಡಿ';

  @override
  String get cyclePayCycle => 'ಚಕ್ರ ಪಾವತಿ ಮಾಡಿ';

  @override
  String get farmerHistoryNoPoursSubtitle =>
      'ಈ ರೈತರು ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ ಯಾವುದೇ ಸುರಿತ ದಾಖಲಿಸಿಲ್ಲ';

  @override
  String get ledgerEditDetails => 'ವಿವರಗಳನ್ನು ಸಂಪಾದಿಸಿ';

  @override
  String get ledgerAddEntry => 'ನಮೂದು ಸೇರಿಸಿ';

  @override
  String get ledgerAmountHint => 'ಮೊತ್ತ (₹)';

  @override
  String get ledgerInvalidAmount => 'ಸರಿಯಾದ ಮೊತ್ತವನ್ನು ನಮೂದಿಸಿ';

  @override
  String get ledgerRecordEntry => 'ನಮೂದು ದಾಖಲಿಸಿ';

  @override
  String get ledgerHistory => 'ಇತಿಹಾಸ';

  @override
  String get ledgerLoadError => 'ಲೆಡ್ಜರ್ ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String get ledgerOutstanding => 'ಬಾಕಿ';

  @override
  String get ledgerNoEntries => 'ಇನ್ನೂ ಯಾವುದೇ ನಮೂದುಗಳಿಲ್ಲ';

  @override
  String get ledgerEntryAdvance => 'ಮುಂಗಡ';

  @override
  String get ledgerEntryFeedLoan => 'ಮೇವು ಸಾಲ';

  @override
  String get ledgerEntryRepayment => 'ಮರುಪಾವತಿ';

  @override
  String get ledgerAgainstAdvance => 'ಮುಂಗಡದ ವಿರುದ್ಧ';

  @override
  String get ledgerAgainstFeedLoan => 'ಮೇವು ಸಾಲದ ವಿರುದ್ಧ';

  @override
  String get ledgerHistoryAdvanceGiven => 'ಮುಂಗಡ ನೀಡಲಾಗಿದೆ';

  @override
  String get ledgerHistoryFeedLoanGiven => 'ಮೇವು ಸಾಲ ನೀಡಲಾಗಿದೆ';

  @override
  String get ledgerHistoryRepayment => 'ಮರುಪಾವತಿ';

  @override
  String get ledgerHistoryAdjustment => 'ಹೊಂದಾಣಿಕೆ';

  @override
  String get statementNoCycles => 'ಯಾವುದೇ ಚಕ್ರಗಳು ಲಭ್ಯವಿಲ್ಲ';

  @override
  String get statementSelectCycle => 'ಚಕ್ರ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String statementGenerateError(Object error) {
    return 'ಹೇಳಿಕೆ ರಚಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ: $error';
  }

  @override
  String get statementPreparing => 'ತಯಾರಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get statementShareButton => 'ಚಕ್ರ ವಿವರಣೆ ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get statementDownloadButton => 'ಸೈಕಲ್ ಸ್ಟೇಟ್‌ಮೆಂಟ್ ಡೌನ್‌ಲೋಡ್';

  @override
  String get statementViewerTitle => 'ಸೈಕಲ್ ಸ್ಟೇಟ್‌ಮೆಂಟ್';

  @override
  String get pickerSearchHint => 'ಹೆಸರು ಅಥವಾ ಕೋಡ್‌ನಿಂದ ರೈತರನ್ನು ಹುಡುಕಿ';

  @override
  String get pickerLoadError => 'ರೈತರನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String get pickerNoMatch => 'ಹೊಂದಾಣಿಕೆಯ ರೈತರು ಇಲ್ಲ';

  @override
  String get pickerRecorded => 'ದಾಖಲಾಗಿದೆ';

  @override
  String get addFarmerNativeNameLabel => 'ಹೆಸರು (ಪ್ರಾದೇಶಿಕ ಲಿಪಿ)';

  @override
  String get addFarmerNativeNameHint =>
      'ಮೇಲಿನ ಹೆಸರಿನಿಂದ ಸ್ವಯಂ ತುಂಬಲಾಗಿದೆ — ಅಗತ್ಯವಿದ್ದರೆ ಸಂಪಾದಿಸಿ';

  @override
  String get voiceMicNeededTitle => 'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ';

  @override
  String get voiceMicNeededBody =>
      'ಧ್ವನಿಯ ಮೂಲಕ ಹೇಳಲು, ಈ ಆ್ಯಪ್‌ಗೆ ಮೈಕ್ರೊಫೋನ್ ಮತ್ತು ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆಯನ್ನು ಅನುಮತಿಸಿ, ನಂತರ ಹಿಂತಿರುಗಿ ಮತ್ತೆ ಮೈಕ್ ಟ್ಯಾಪ್ ಮಾಡಿ.';

  @override
  String get voiceOpenSettings => 'ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ತೆರೆಯಿರಿ';

  @override
  String get voiceSpeakNow => 'ಈಗ ಮಾತನಾಡಿ';

  @override
  String get voiceListening => 'ಆಲಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get voiceTapToSpeak => 'ಮೈಕ್ ಟ್ಯಾಪ್ ಮಾಡಿ ಮಾತನಾಡಿ';

  @override
  String get voiceNoSpeech => 'ಕೇಳಿಸಲಿಲ್ಲ — ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಲು ಮೈಕ್ ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get voiceDone => 'ಮುಗಿದಿದೆ';

  @override
  String get addFarmerScanAadhaar =>
      'ವಿವರಗಳನ್ನು ಸ್ವಯಂ ತುಂಬಲು ಆಧಾರ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ';

  @override
  String get addFarmerScanning => 'ಆಧಾರ್ ಓದಲಾಗುತ್ತಿದೆ…';

  @override
  String get addFarmerScanFilled => 'ವಿವರಗಳನ್ನು ತುಂಬಲಾಗಿದೆ — ಪರಿಶೀಲಿಸಿ';

  @override
  String get addFarmerScanFailed =>
      'ಕಾರ್ಡ್ ಓದಲಾಗಲಿಲ್ಲ — ಸ್ಪಷ್ಟವಾದ ಫೋಟೋ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get addFarmerScanFront => 'ಮುಂಭಾಗ';

  @override
  String get addFarmerScanFrontHint => 'ಹೆಸರು, ಸಂಖ್ಯೆ';

  @override
  String get addFarmerScanBack => 'ಹಿಂಭಾಗ';

  @override
  String get addFarmerScanBackHint => 'ವಿಳಾಸ';

  @override
  String get photoSourceTitle => 'ಫೋಟೋ ಸೇರಿಸಿ';

  @override
  String get farmerPhotoUpdated => 'ಪ್ರೊಫೈಲ್ ಫೋಟೋ ನವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get farmerPhotoFailed =>
      'ಫೋಟೋ ನವೀಕರಿಸಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get navCollections => 'ಸಂಗ್ರಹಗಳು';

  @override
  String get navServices => 'ಸೇವೆಗಳು';

  @override
  String get farmerHomeGoodMorning => 'ಶುಭ ಬೆಳಗು';

  @override
  String get farmerHomeGoodAfternoon => 'ಶುಭ ಮಧ್ಯಾಹ್ನ';

  @override
  String get farmerHomeGoodEvening => 'ಶುಭ ಸಂಜೆ';

  @override
  String get farmerHomeNoNotifications => 'ಹೊಸ ಅಧಿಸೂಚನೆಗಳಿಲ್ಲ';

  @override
  String get farmerHomeThisCycle => 'ಈ ಚಕ್ರ';

  @override
  String farmerHomeHeroPours(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಸುರಿತಗಳು',
      one: '$count ಸುರಿತ',
    );
    return '$_temp0';
  }

  @override
  String farmerHomeHeroListenSpeak(String litres, String rupees) {
    return 'ಈ ಚಕ್ರ, $litres ಲೀಟರ್, $rupees ರೂಪಾಯಿ';
  }

  @override
  String get farmerHomeHeroListenLabel => 'ಕೇಳಿ';

  @override
  String farmerHomeProjection(String amount) {
    return 'ಈ ಚಕ್ರಕ್ಕೆ ~$amount ನಿರೀಕ್ಷಿಸಲಾಗುತ್ತಿದೆ';
  }

  @override
  String get farmerHomeEmptyTitle => 'ಈ ಚಕ್ರದಲ್ಲಿ ಇನ್ನೂ ಸುರಿತಗಳಿಲ್ಲ';

  @override
  String get farmerHomeEmptySubtitle =>
      'ಕೇಂದ್ರದಲ್ಲಿ ದಾಖಲಾದ ನಂತರ ನಿಮ್ಮ ಸಂಗ್ರಹಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get farmerHomeRefresh => 'ರಿಫ್ರೆಶ್ ಮಾಡಿ';

  @override
  String farmerHomeTodayCollected(String litres) {
    return '$litres L ಸಂಗ್ರಹಿಸಲಾಗಿದೆ';
  }

  @override
  String get farmerHomeNudgeImproved =>
      'ಒಳ್ಳೆಯ ಕೆಲಸ — ಆಹಾರ ಮತ್ತು ದಿನಚರಿ ಮುಂದುವರಿಸಿ.';

  @override
  String get farmerHomeNudgeFatDown =>
      'ಸಾಮಾನ್ಯವಾಗಿ ಆಹಾರ ಗುಣಮಟ್ಟ ಅಥವಾ ತಡ ಹಾಲು ಕರೆಯುವಿಕೆ. ಆಹಾರ ಮತ್ತು ಸ್ವಚ್ಛ ನೀರು ಪರಿಶೀಲಿಸಿ, ಅಥವಾ ನಿಮ್ಮ ಪಶು ವೈದ್ಯರನ್ನು ಕೇಳಿ.';

  @override
  String get farmerHomeNudgeSnfDown =>
      'ಸಾಮಾನ್ಯವಾಗಿ ಪೋಷಣೆ ಅಥವಾ ನೀರು. ಆಹಾರ ಮತ್ತು ಸ್ವಚ್ಛ ನೀರು ಪರಿಶೀಲಿಸಿ, ಅಥವಾ ನಿಮ್ಮ ಪಶು ವೈದ್ಯರನ್ನು ಕೇಳಿ.';

  @override
  String farmerHomeNudgeTitle(String metric, String direction, String delta) {
    return '$metric ಈ ವಾರ $delta $direction';
  }

  @override
  String get farmerHomeNudgeUp => 'ಹೆಚ್ಚಿದೆ';

  @override
  String get farmerHomeNudgeDown => 'ಕಡಿಮೆಯಾಗಿದೆ';

  @override
  String farmerHomeStreakTitle(int streak) {
    String _temp0 = intl.Intl.pluralLogic(
      streak,
      locale: localeName,
      other: '$streak ದಿನ ಗುಣಮಟ್ಟ ಸ್ಟ್ರೀಕ್',
      one: '$streak ದಿನ ಗುಣಮಟ್ಟ ಸ್ಟ್ರೀಕ್',
    );
    return '$_temp0';
  }

  @override
  String get farmerHomeStreakBonusUnlocked =>
      'ಬೋನಸ್ ಅನ್‌ಲಾಕ್ ಆಗಿದೆ — ಮುಂದುವರಿಸಿ!';

  @override
  String farmerHomeStreakRemaining(int remaining) {
    String _temp0 = intl.Intl.pluralLogic(
      remaining,
      locale: localeName,
      other: '$remaining Grade-A ದಿನಗಳು ಬೋನಸ್ ಅನ್‌ಲಾಕ್ ಮಾಡಲು',
      one: '$remaining Grade-A ದಿನ ಬೋನಸ್ ಅನ್‌ಲಾಕ್ ಮಾಡಲು',
    );
    return '$_temp0';
  }

  @override
  String get farmerHomeRateChart => 'ದರ ಚಾರ್ಟ್';

  @override
  String get farmerHomeRewards => 'ಬಹುಮಾನಗಳು';

  @override
  String get farmerHomeQuality => 'ಗುಣಮಟ್ಟ';

  @override
  String get farmerQcTitle => 'ನನ್ನ ಗುಣಮಟ್ಟ';

  @override
  String farmerQcHeroLabel(int days) {
    return 'ನನ್ನ ಗುಣಮಟ್ಟ · ಕಳೆದ $days ದಿನಗಳು';
  }

  @override
  String get farmerQcFooter => 'ನೀವು ಹಾಕಿದ ಲೀಟರ್ ಆಧಾರದ ಮೇಲೆ ಸರಾಸರಿ';

  @override
  String get farmerQcEmptySubtitle =>
      'ನಿಮ್ಮ ಗುಣಮಟ್ಟದ ಪ್ರವೃತ್ತಿ ನೋಡಲು ಹಾಲು ಹಾಕಿ';

  @override
  String get farmerCollectionsTitle => 'ಸಂಗ್ರಹಗಳು';

  @override
  String farmerCollectionsCyclePours(String scope, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಸುರಿತಗಳು',
      one: '$count ಸುರಿತ',
    );
    return '$scope · $_temp0';
  }

  @override
  String get farmerCollectionsDailyVolume => 'ದೈನಂದಿನ ಪ್ರಮಾಣ';

  @override
  String farmerCollectionsAvgPerDay(String litres) {
    return '$litres L/ದಿನ ಸರಾಸರಿ';
  }

  @override
  String get farmerCollectionsThisCycle => 'ಈ ಚಕ್ರ';

  @override
  String get farmerCollectionsPastCycles => 'ಹಿಂದಿನ ಚಕ್ರಗಳು';

  @override
  String get farmerCollectionsEmptyTitle => 'ಈ ಚಕ್ರದಲ್ಲಿ ಸಂಗ್ರಹಗಳಿಲ್ಲ';

  @override
  String get farmerCollectionsEmptySubtitle =>
      'ದಾಖಲಾದ ನಂತರ ನಿಮ್ಮ ದೈನಂದಿನ ಸುರಿತಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String farmerCollectionsPastCycleSummary(String litres, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಸುರಿತಗಳು',
      one: '$count ಸುರಿತ',
    );
    return '$litres L · $_temp0';
  }

  @override
  String get farmerCollectionDetailTotal => 'ಒಟ್ಟು';

  @override
  String get farmerCollectionDetailGross => 'ಒಟ್ಟು ಮೊತ್ತ';

  @override
  String get farmerCollectionDetailNoCollection => 'ಯಾವುದೇ ಸಂಗ್ರಹ ದಾಖಲಾಗಿಲ್ಲ';

  @override
  String get farmerCollectionDetailShift => 'ಶಿಫ್ಟ್';

  @override
  String farmerCollectionDetailRatePerLitre(String rate) {
    return '@ $rate/L';
  }

  @override
  String get farmerPaymentsTitle => 'ಪಾವತಿಗಳು';

  @override
  String get farmerPaymentsSubtitle => 'ಪಾರದರ್ಶಕ, ಪ್ರತಿ ರೂಪಾಯಿ ಲೆಕ್ಕ ಸೇರಿದೆ';

  @override
  String farmerPaymentsNetPayable(String cycle) {
    return 'ನಿವ್ವಳ ಪಾವತಿ · $cycle';
  }

  @override
  String farmerPaymentsListenSpeak(String rupees) {
    return 'ಈ ಚಕ್ರ ನಿವ್ವಳ ಪಾವತಿ, $rupees ರೂಪಾಯಿ';
  }

  @override
  String farmerPaymentsProjection(String amount) {
    return 'ಈ ಚಕ್ರಕ್ಕೆ ~$amount ನಿರೀಕ್ಷಿಸಲಾಗುತ್ತಿದೆ';
  }

  @override
  String get farmerPaymentsGrossMilk => 'ಹಾಲಿನ ಮೌಲ್ಯ (ಮೂಲ)';

  @override
  String get farmerPaymentsEstimatedDeduction => 'ಮುಂಗಡ ವಸೂಲಿ';

  @override
  String get farmerPaymentsStatusPending => 'ಬಾಕಿ ಇದೆ';

  @override
  String get farmerPaymentsStatusProcessing => 'ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿದೆ';

  @override
  String get farmerPaymentsQualityBonus => 'ಗುಣಮಟ್ಟ ಬೋನಸ್';

  @override
  String farmerPaymentsOutstandingAdvance(String amount) {
    return 'ಬಾಕಿ ಮುಂಗಡ: $amount';
  }

  @override
  String get farmerPaymentsHistoryHeader => 'ಪಾವತಿ ಇತಿಹಾಸ';

  @override
  String get farmerPaymentsPaid => 'ಪಾವತಿಸಲಾಗಿದೆ';

  @override
  String get farmerPaymentsDeductCattleFeedLoan => 'ದನದ ಮೇವಿನ ಸಾಲ';

  @override
  String get farmerPaymentsDeductAdvance => 'ಮುಂಗಡ';

  @override
  String get farmerPaymentsDeductMedicine => 'ಔಷಧ';

  @override
  String get farmerPaymentsDeductInsurance => 'ವಿಮೆ';

  @override
  String farmerPaymentsHistorySummary(String litres, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಸುರಿತಗಳು',
      one: '$count ಸುರಿತ',
    );
    return '$litres L · $_temp0';
  }

  @override
  String get farmerRateChartTitle => 'ದರ ಚಾರ್ಟ್';

  @override
  String get farmerRateShareTooltip => 'ದರ ಚಾರ್ಟ್ ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String farmerRateShareError(Object error) {
    return 'ದರ ಚಾರ್ಟ್ ಹಂಚಿಕೊಳ್ಳಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ: $error';
  }

  @override
  String get farmerRateListenSpeak => 'ನಿಮ್ಮ ಹಾಲಿನ ದರ ಚಾರ್ಟ್';

  @override
  String farmerRateListenSpeakWithRate(String rate) {
    return 'ನಿಮ್ಮ ದರ ಲೀಟರ್‌ಗೆ $rate ರೂಪಾಯಿ';
  }

  @override
  String get farmerRateEmptyTitle => 'ಯಾವುದೇ ದರ ಚಾರ್ಟ್ ಸಕ್ರಿಯವಾಗಿಲ್ಲ';

  @override
  String get farmerRateEmptySubtitle =>
      'ನಿಮ್ಮ ಹಾಲು ಸಂಗ್ರಹ ಕೇಂದ್ರವನ್ನು ಸಂಪರ್ಕಿಸಿ';

  @override
  String get farmerRateLastPourLabel => 'ನಿಮ್ಮ ಕೊನೆಯ ಸುರಿತ';

  @override
  String get farmerRateMatrixTitle => 'ದರ ಮ್ಯಾಟ್ರಿಕ್ಸ್ (₹/L)';

  @override
  String get farmerRateBonusSlabsTitle => 'ಬೋನಸ್ & ಸ್ಲ್ಯಾಬ್‌ಗಳು';

  @override
  String get farmerRateFlatRateLabel => 'ಫ್ಲಾಟ್ ರೇಟ್';

  @override
  String get farmerRateEarnMore => 'ಲೀಟರ್‌ಗೆ ಹೆಚ್ಚು ಗಳಿಸಿ';

  @override
  String farmerRateRaiseSnf(String value) {
    return 'SNF ಅನ್ನು $value ಕ್ಕೆ ಹೆಚ್ಚಿಸಿ';
  }

  @override
  String farmerRateRaiseFat(String value) {
    return 'FAT ಅನ್ನು $value ಕ್ಕೆ ಹೆಚ್ಚಿಸಿ';
  }

  @override
  String get farmerRateNoMatrixData => 'ಮ್ಯಾಟ್ರಿಕ್ಸ್ ಮಾಹಿತಿ ಇಲ್ಲ';

  @override
  String farmerRateRuleGradeBonus(String grade) {
    return 'Grade-$grade ಬೋನಸ್';
  }

  @override
  String farmerRateRuleVolumeRange(String min, String max) {
    return 'ಪ್ರಮಾಣ $min–$max L';
  }

  @override
  String farmerRateRuleVolumeMin(String min) {
    return 'ಪ್ರಮಾಣ > $min L';
  }

  @override
  String get farmerRewardsTitle => 'ಬಹುಮಾನಗಳು';

  @override
  String get farmerRewardsBadgesSection => 'ಬ್ಯಾಡ್ಜ್‌ಗಳು';

  @override
  String get farmerRewardsQualityStreak => 'ಗುಣಮಟ್ಟ ಸ್ಟ್ರೀಕ್';

  @override
  String farmerRewardsStreakDays(int target) {
    return '/ $target ದಿನಗಳು';
  }

  @override
  String get farmerRewardsBonusUnlocked => 'ಬೋನಸ್ ಅನ್‌ಲಾಕ್ ಆಗಿದೆ — ಮುಂದುವರಿಸಿ!';

  @override
  String farmerRewardsStreakRemaining(int remaining) {
    return '₹500 ಬೋನಸ್ ಅನ್‌ಲಾಕ್ ಮಾಡಲು $remaining ದಿನಗಳು ಬಾಕಿ';
  }

  @override
  String get farmerRewardsBadgeUnlocked => 'ಅನ್‌ಲಾಕ್ ಆಗಿದೆ';

  @override
  String get farmerRewardsBadgeLocked => 'ಲಾಕ್ ಆಗಿದೆ';

  @override
  String get farmerRewardsBadgeConsistent => 'ಸ್ಥಿರ';

  @override
  String get farmerRewardsBadge100Day => '100 ದಿನ ಕ್ಲಬ್';

  @override
  String get farmerRewardsBadgeTopFat => 'ಅತ್ಯುತ್ತಮ FAT';

  @override
  String get farmerRewardsBadgeReferrer => 'ರೆಫರ್ ಮಾಡಿದವರು';

  @override
  String get farmerRewardsReferTitle => 'ರೈತರನ್ನು ರೆಫರ್ ಮಾಡಿ';

  @override
  String get farmerRewardsReferBody => 'ಪ್ರತಿ ಸೇರ್ಪಡೆ ರೈತರಿಗೆ ₹100 ಗಳಿಸಿ';

  @override
  String get farmerRewardsShareInvite => 'ಆಮಂತ್ರಣ ಹಂಚಿ';

  @override
  String get farmerRewardsReferralComingSoon =>
      'ರೆಫರಲ್ ಆಮಂತ್ರಣ ಶೀಘ್ರದಲ್ಲಿ ಬರಲಿದೆ!';

  @override
  String get farmerServicesTitle => 'ಸೇವೆಗಳು';

  @override
  String get farmerServicesSubtitle => 'ರೈತ ಸೇವೆಗಳು ಬರಲಿವೆ — ಕಾಯಿರಿ.';

  @override
  String get farmerServicesSoon => 'ಶೀಘ್ರದಲ್ಲಿ';

  @override
  String get farmerServicesNotifyMe => 'ಲೈವ್ ಆದಾಗ ತಿಳಿಸಿ';

  @override
  String get farmerServicesNotifyToast =>
      'ಸೇವೆಗಳು ಲೈವ್ ಆದಾಗ ನಿಮಗೆ ತಿಳಿಸುತ್ತೇವೆ!';

  @override
  String get farmerServicesCattleFeedName => 'ದನದ ಮೇವು';

  @override
  String get farmerServicesCattleFeedDesc =>
      'ಗುಣಮಟ್ಟದ ಮೇವು & ಪೂರಕಗಳು ನಿಮ್ಮ ಫಾರ್ಮ್‌ಗೆ ತಲುಪಿಸಲಾಗುತ್ತದೆ.';

  @override
  String get farmerServicesVetName => 'ಪಶು ವೈದ್ಯಕೀಯ ಸೇವೆ';

  @override
  String get farmerServicesVetDesc =>
      'ಮನೆ ಬಾಗಿಲಿಗೆ ಪಶು ವೈದ್ಯ ಭೇಟಿ, ಆರೋಗ್ಯ ತಪಾಸಣೆ & ಲಸಿಕೆ.';

  @override
  String get farmerServicesInsuranceName => 'ವಿಮೆ';

  @override
  String get farmerServicesInsuranceDesc =>
      'ನಿಮ್ಮ ಹಿಂಡು & ಜೀವನೋಪಾಯ ರಕ್ಷಿಸಲು ಜಾನುವಾರು ವಿಮೆ.';

  @override
  String get farmerServicesLoansName => 'ಸಾಲ & ಮುಂಗಡ';

  @override
  String get farmerServicesLoansDesc => 'ನಿಮ್ಮ ಹಾಲು ಆದಾಯದ ವಿರುದ್ಧ ತಕ್ಷಣ ಮುಂಗಡ.';

  @override
  String get navReceive => 'ಸ್ವೀಕರಿಸಿ';

  @override
  String get ccDispatchToPlant => 'ಪ್ಲಾಂಟ್‌ಗೆ ರವಾನಿಸಿ';

  @override
  String get ccDispatchSelectDestinationPlant => 'ಗಮ್ಯ ಪ್ಲಾಂಟ್ ಆಯ್ಕೆಮಾಡಿ…';

  @override
  String get ccDispatchSearchPlant => 'ಪ್ಲಾಂಟ್ ಹುಡುಕಿ';

  @override
  String get ccDispatchNoPlantsFound => 'ಯಾವುದೇ ಪ್ಲಾಂಟ್ ಕಂಡುಬಂದಿಲ್ಲ';

  @override
  String get ccDispatchErrorNoDestination => 'ಗಮ್ಯ ಪ್ಲಾಂಟ್ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get ccDispatchErrorInvalidNumbers => 'ಸರಿಯಾದ ಸಂಖ್ಯೆಗಳನ್ನು ನಮೂದಿಸಿ';

  @override
  String get ccDispatchCloseFirstShift =>
      'ರವಾನಿಸುವ ಮೊದಲು ಈ ಪಾಳಿಯ ಸ್ವೀಕೃತಿಯನ್ನು ಮುಚ್ಚಿ.';

  @override
  String get ccDispatchCloseFirstDay =>
      'ರವಾನಿಸುವ ಮೊದಲು ಇಂದಿನ ಸ್ವೀಕೃತಿಯನ್ನು ಮುಚ್ಚಿ.';

  @override
  String get ccDispatchCloseFirstPool =>
      'ರವಾನಿಸುವ ಮೊದಲು ಪೂಲ್ ಮುಚ್ಚಿ (ನಿನ್ನೆ ಸಂಜೆ + ಇಂದಿನ ಬೆಳಿಗ್ಗೆ).';

  @override
  String get ccDispatchCloseReceivingPool => 'ಪೂಲ್ ಸ್ವೀಕೃತಿ ಮುಚ್ಚಿ';

  @override
  String ccDispatchCloseReceivingShift(Object slot) {
    return '$slot ಸ್ವೀಕೃತಿ ಮುಚ್ಚಿ';
  }

  @override
  String get ccDispatchCloseReceivingToday => 'ಇಂದಿನ ಸ್ವೀಕೃತಿ ಮುಚ್ಚಿ';

  @override
  String ccDispatchUnlocksFor(Object slot) {
    return '$slotಕ್ಕೆ ಪ್ಲಾಂಟ್‌ಗೆ ರವಾನೆ ತೆರೆಯುತ್ತದೆ.';
  }

  @override
  String ccDispatchClosedFor(Object slot) {
    return '$slotಗೆ ಸ್ವೀಕೃತಿ ಮುಚ್ಚಲಾಗಿದೆ';
  }

  @override
  String get ccDispatchReadyForDispatch => 'ರವಾನೆಗೆ ಸಿದ್ಧ';

  @override
  String get ccDispatchSlotToday => 'ಇಂದು';

  @override
  String get ccDispatchSlotPool => 'ಈ ಪೂಲ್';

  @override
  String get ccDispatchHistoryTitle => 'ರವಾನೆ ಇತಿಹಾಸ';

  @override
  String get ccHomeChillingTank => 'ಚಿಲ್ಲಿಂಗ್ ಟ್ಯಾಂಕ್';

  @override
  String get ccHomeVmccsPool => 'VMCC ಗಳು · ಈ ಪೂಲ್';

  @override
  String get ccHomeVmccsToday => 'VMCC ಗಳು · ಇಂದು';

  @override
  String get ccHomeAcrossVmccs => 'ಎಲ್ಲಾ VMCCಗಳಲ್ಲಿ';

  @override
  String get ccHomeInPoolLabel => 'ಪೂಲ್‌ನಲ್ಲಿ · ಹಿಂದಿನ ಸಂಜೆ + ಇಂದಿನ ಬೆಳಿಗ್ಗೆ';

  @override
  String get ccHomeCollectedTodayLabel => 'ಎಲ್ಲಾ VMCCಗಳಿಂದ ಸಂಗ್ರಹ · ಇಂದು';

  @override
  String ccHomeActiveOfTotal(int active, int total, Object inTransit) {
    return '$total ರಲ್ಲಿ $active VMCC · $inTransit ಸಾಗಣೆಯಲ್ಲಿ';
  }

  @override
  String ccHomeNextPoolNote(Object amount) {
    return 'ಮುಂದಿನ ರವಾನೆಗಾಗಿ $amount ಸಂಗ್ರಹವಾಗುತ್ತಿದೆ';
  }

  @override
  String get ccHomeReportLink => 'ವರದಿ';

  @override
  String get ccHomeQcReportLink => 'QC ವರದಿ';

  @override
  String get ccHomeRateChartLink => 'ದರ ಚಾರ್ಟ್';

  @override
  String get ccRateChartsEmptyTitle => 'ಸಕ್ರಿಯ ದರ ಚಾರ್ಟ್‌ಗಳಿಲ್ಲ';

  @override
  String get ccRateChartsEmptySubtitle =>
      'ಡೈರಿ ನಿಗದಿಪಡಿಸಿದ ದರ ಚಾರ್ಟ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String get ccInTransitLabel => 'ಸಾಗಣೆಯಲ್ಲಿ';

  @override
  String get ccHomePlantReadyLabel => 'ಪ್ಲಾಂಟ್‌ಗೆ ಸಿದ್ಧ';

  @override
  String get ccVmccsLoadError => 'VMCCಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get ccNoVmccsLinkedTitle => 'ಯಾವುದೇ VMCC ಜೋಡಿಸಿಲ್ಲ';

  @override
  String get ccNoVmccsLinkedSubtitle =>
      'ಈ CCಗೆ VMCCಗಳನ್ನು ವೆಬ್ ಅಡ್ಮಿನ್‌ನಲ್ಲಿ ನಿಯೋಜಿಸಿ';

  @override
  String ccHomeFarmersCount(int count) {
    return '$count ರೈತರು';
  }

  @override
  String get ccHomeMorning => 'ಬೆಳಿಗ್ಗೆ';

  @override
  String get ccHomeEvening => 'ಸಂಜೆ';

  @override
  String ccHomeShiftInTransit(Object amount) {
    return '$amount ದಾರಿಯಲ್ಲಿದೆ';
  }

  @override
  String ccHomeShiftReceivedCount(int done, int total) {
    return '$total ರಲ್ಲಿ $done ಬಂದಿದೆ';
  }

  @override
  String get ccHomeShiftNothingIn => 'ಇನ್ನೂ ಏನೂ ಇಲ್ಲ';

  @override
  String get ccReceiveTitle => 'ಸ್ವೀಕರಿಸಿ';

  @override
  String get ccReceiveLoadError => 'ಕನ್ಸೈನ್‌ಮೆಂಟ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get ccReceiveManualButton => 'ಕೈಯಾರೆ ಸ್ವೀಕರಿಸಿ';

  @override
  String get ccReceiveNothingInTransit => 'ಸಾಗಣೆಯಲ್ಲಿ ಏನೂ ಇಲ್ಲ';

  @override
  String get ccReceiveNothingInTransitSubtitle =>
      'ಬರುತ್ತಿರುವ ಕನ್ಸೈನ್‌ಮೆಂಟ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ';

  @override
  String get ccReceiveRecentReceives => 'ಇತ್ತೀಚಿನ ಸ್ವೀಕೃತಿಗಳು';

  @override
  String get historyNotReceivedYet => 'ಇನ್ನೂ ಸ್ವೀಕರಿಸಿಲ್ಲ';

  @override
  String historyUpstreamPending(Object qty) {
    return '$qty ಇನ್ನೂ ಸ್ವೀಕರಿಸಿಲ್ಲ';
  }

  @override
  String get historyAtSource => 'ಮೂಲದಲ್ಲಿ';

  @override
  String get historyNothingToday =>
      'ಇಂದು ಇನ್ನೂ ಏನೂ ಸ್ವೀಕೃತಿ ಅಥವಾ ಸಂಗ್ರಹ ಆಗಿಲ್ಲ';

  @override
  String get ccReceiveNoReceiptsYet => 'ಇನ್ನೂ ಸ್ವೀಕೃತಿಗಳಿಲ್ಲ';

  @override
  String get ccReceiveNoReceiptsSubtitle =>
      'VMCCಗಳಿಂದ ನೀವು ಸ್ವೀಕರಿಸುವ ಹಾಲು ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ';

  @override
  String get ccReceiveHistoryTitle => 'ಸ್ವೀಕೃತಿ ಇತಿಹಾಸ';

  @override
  String get ccReceivePillInTransit => 'ಸಾಗಣೆಯಲ್ಲಿ';

  @override
  String get ccReceiveTapToReceive => 'ಸ್ವೀಕರಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String ccVarianceSuffix(Object value) {
    return '$value% ವ್ಯತ್ಯಾಸ';
  }

  @override
  String get ccReceiveEditReceipt => 'ಸ್ವೀಕೃತಿ ಸಂಪಾದಿಸಿ';

  @override
  String get ccReceiveDeleteReceipt => 'ಸ್ವೀಕೃತಿ ಅಳಿಸಿ';

  @override
  String get ccReceiveLockedForDispatch =>
      'ಲಾಕ್ ಆಗಿದೆ — ರವಾನೆಗಾಗಿ ಸ್ವೀಕೃತಿ ಮುಚ್ಚಲಾಗಿದೆ';

  @override
  String get ccReceiveDeleteConfirmTitle => 'ಸ್ವೀಕೃತಿ ಅಳಿಸುವುದೇ?';

  @override
  String ccReceiveDeleteConfirmBody(Object name, Object qty) {
    return '$name · $qty ತೆಗೆದುಹಾಕಲಾಗುತ್ತದೆ.';
  }

  @override
  String get ccReceiveReceiptDeletedToast => 'ಸ್ವೀಕೃತಿ ಅಳಿಸಲಾಗಿದೆ';

  @override
  String get ccReceiveNoVmccsLinkedToast => 'ಈ CCಗೆ ಯಾವುದೇ VMCC ಜೋಡಿಸಿಲ್ಲ';

  @override
  String get ccHistoryNoReceiptsSubtitle =>
      'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ VMCCಗಳಿಂದ ಸ್ವೀಕರಿಸಿದ ಹಾಲು ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ';

  @override
  String ccHistoryVmccCount(int count) {
    return '$count VMCC';
  }

  @override
  String get ccHistoryDayLoadError => 'ಈ ದಿನವನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get ccDayLabel => 'ದಿನ';

  @override
  String get ccReportLoadError => 'ವರದಿ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get ccReportNoMilkReceived => 'ಈ ದಿನಾಂಕದಲ್ಲಿ ಹಾಲು ಸ್ವೀಕರಿಸಿಲ್ಲ';

  @override
  String get ccReportTotalReceived => 'ಒಟ್ಟು ಸ್ವೀಕರಿಸಿದ್ದು';

  @override
  String ccReportSourcesReceipts(int sources, int receipts) {
    return '$sources VMCC · $receipts ಸ್ವೀಕೃತಿಗಳು';
  }

  @override
  String get ccReportAvgFat => 'ಸರಾಸರಿ FAT';

  @override
  String get ccReportAvgSnf => 'ಸರಾಸರಿ SNF';

  @override
  String get ccReportAvgWater => 'ಸರಾಸರಿ ನೀರು';

  @override
  String get ccReportSourceVmccs => 'ಮೂಲ VMCCಗಳು';

  @override
  String get ccQcLoadError => 'QC ಡೇಟಾ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String ccQcHeroLabelAll(int days) {
    return 'ಸ್ವೀಕರಿಸಿದ್ದು · ಕೊನೆಯ $days ದಿನಗಳು';
  }

  @override
  String get ccQcHeroFooterAll => 'ಎಲ್ಲಾ VMCC ಸ್ವೀಕೃತಿಗಳ ಪ್ರಮಾಣ-ತೂಕದ ಗುಣಮಟ್ಟ';

  @override
  String ccQcHeroLabelVmcc(Object name, int days) {
    return '$name · ಕೊನೆಯ $days ದಿನಗಳು';
  }

  @override
  String get ccQcHeroFooterVmcc => 'ಈ VMCCಯಿಂದ ಸ್ವೀಕರಿಸಿದ ಪ್ರಮಾಣ-ತೂಕದ ಗುಣಮಟ್ಟ';

  @override
  String get ccQcEmptySubtitleVmcc =>
      'ಈ ಅವಧಿಯಲ್ಲಿ ಈ VMCCಯಿಂದ ಹಾಲು ಸ್ವೀಕರಿಸಿಲ್ಲ';

  @override
  String get ccQcScopeAll => 'ಎಲ್ಲಾ';

  @override
  String get ccQcScopeByVmcc => 'VMCC ಮೂಲಕ';

  @override
  String get ccQcScopeRanking => 'ಶ್ರೇಣಿ';

  @override
  String get ccQcSelectVmccTitle => 'VMCC ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get ccQcSelectVmccPlaceholder => 'ಒಂದು VMCC ಆಯ್ಕೆಮಾಡಿ';

  @override
  String ccQcRangeDays(int d) {
    return '$d ದಿನಗಳು';
  }

  @override
  String get ccVmccsSearchHint => 'VMCCಗಳನ್ನು ಹುಡುಕಿ';

  @override
  String get ccVmccsNoneAssigned => 'ಯಾವುದೇ VMCC ನಿಯೋಜಿಸಿಲ್ಲ';

  @override
  String get ccVmccsNoMatch => 'ಹೊಂದಾಣಿಕೆಯ VMCC ಇಲ್ಲ';

  @override
  String get ccManualReceiveTitle => 'ಕೈಯಾರೆ ಸ್ವೀಕರಿಸಿ';

  @override
  String get ccManualReceiveInfoBanner =>
      'ಆ್ಯಪ್‌ನಲ್ಲಿ ರವಾನೆ ನಮೂದು ಇಲ್ಲದೆ ಹಾಲು ಬಂದಾಗ ಮಾತ್ರ ಇದನ್ನು ಬಳಸಿ.';

  @override
  String get ccManualReceiveReceivingFor => 'ಇದಕ್ಕಾಗಿ ಸ್ವೀಕರಿಸುತ್ತಿದೆ';

  @override
  String get ccManualReceiveShiftLabel => 'ಪಾಳಿ';

  @override
  String get ccManualReceiveSelectVmcc => 'VMCC ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get ccManualReceiveNoVmccsLinked => 'ಈ CCಗೆ ಯಾವುದೇ VMCC ಜೋಡಿಸಿಲ್ಲ.';

  @override
  String ccManualReceiveNoVmccsShift(Object shift) {
    return '$shift ಪಾಳಿಯಲ್ಲಿ ಯಾವುದೇ VMCC ಸಂಗ್ರಹಿಸುವುದಿಲ್ಲ.';
  }

  @override
  String ccManualReceiveReceivedBadge(Object qty) {
    return '$qty ಸ್ವೀಕರಿಸಲಾಗಿದೆ';
  }

  @override
  String get ccManualReceiveCollectionDate => 'ಸಂಗ್ರಹ ದಿನಾಂಕ';

  @override
  String ccManualReceiveDeleteConfirmBody(
    Object name,
    Object date,
    Object shift,
  ) {
    return '$name · $date $shift ತೆಗೆದುಹಾಕಲಾಗುತ್ತದೆ.';
  }

  @override
  String get ccManualReceiveErrorMissingFields =>
      'ಪ್ರಮಾಣ, FAT ಮತ್ತು SNF ನಮೂದಿಸಿ';

  @override
  String get ccMeasuredAtCc => 'CCಯಲ್ಲಿ ಅಳೆಯಲಾಗಿದೆ';

  @override
  String get ccManualReceiveQtyHint => 'ಪ್ರಮಾಣ (L)';

  @override
  String get ccManualReceiveSaveChanges => 'ಬದಲಾವಣೆ ಉಳಿಸಿ';

  @override
  String get ccManualReceiveMarkReceived => 'ಸ್ವೀಕರಿಸಿದ್ದೆಂದು ಗುರುತಿಸಿ';

  @override
  String get ccReceiveConsignmentSourceFallback => 'ಮೂಲ';

  @override
  String get ccReceiveConsignmentReceiptTitle => 'ಸ್ವೀಕೃತಿ';

  @override
  String get ccReceiveConsignmentReceiveMilkTitle => 'ಹಾಲು ಸ್ವೀಕರಿಸಿ';

  @override
  String get ccReceiveConsignmentQuantityLabel => 'ಪ್ರಮಾಣ';

  @override
  String get ccReceiveConsignmentSameAsDispatched => 'ರವಾನಿಸಿದಂತೆಯೇ';

  @override
  String get ccReceiveConsignmentReceivedQtyHint => 'ಸ್ವೀಕರಿಸಿದ ಪ್ರಮಾಣ (L)';

  @override
  String get ccReceiveConsignmentUpdateReceipt => 'ಸ್ವೀಕೃತಿ ನವೀಕರಿಸಿ';

  @override
  String get ccReceiveConsignmentConfirmReceipt => 'ಸ್ವೀಕೃತಿ ದೃಢೀಕರಿಸಿ';

  @override
  String get ccReceiveConsignmentErrorQty => 'ಸ್ವೀಕರಿಸಿದ ಪ್ರಮಾಣ ನಮೂದಿಸಿ';

  @override
  String get ccReceiveConsignmentEnterQtyForVariance =>
      'ರವಾನೆಗೆ ಹೋಲಿಸಿದ ವ್ಯತ್ಯಾಸ ನೋಡಲು ಸ್ವೀಕರಿಸಿದ ಪ್ರಮಾಣ ನಮೂದಿಸಿ';

  @override
  String get ccReceiveConsignmentVarianceLabel => 'ರವಾನೆಗೆ ಹೋಲಿಸಿದ ವ್ಯತ್ಯಾಸ';

  @override
  String get ccReceiveConsignmentDispatchedByVmcc => 'VMCC ಯಿಂದ ರವಾನಿಸಲಾಗಿದೆ';

  @override
  String get ccQcReportEmptyTitle => 'ಈ ಅವಧಿಯಲ್ಲಿ ಯಾವುದೇ ಸ್ವೀಕೃತಿಗಳಿಲ್ಲ';

  @override
  String get ccQcReportEmptySubtitle =>
      'ದೈನಂದಿನ QC ವರದಿ ನೋಡಲು VMCCಗಳಿಂದ ಹಾಲು ಸ್ವೀಕರಿಸಿ';

  @override
  String get ccQcReportTrendsLabel => 'ಗುಣಮಟ್ಟದ ಪ್ರವೃತ್ತಿಗಳು';

  @override
  String get ccQcReportDailyQualityLabel => 'ದೈನಂದಿನ ಗುಣಮಟ್ಟ · ಪ್ರಮಾಣ-ತೂಕ';

  @override
  String get ccQcReportDateHeader => 'ದಿನಾಂಕ';

  @override
  String get ccQcReportNoReadings => 'ಈ ಅವಧಿಯಲ್ಲಿ ಯಾವುದೇ ವಾಚನಗಳಿಲ್ಲ';

  @override
  String ccQcRankingByMetric(Object metric) {
    return '$metric ಮೂಲಕ';
  }

  @override
  String get ccQcRankingHighToLow => 'ಹೆಚ್ಚು → ಕಡಿಮೆ';

  @override
  String get ccQcRankingLowToHigh => 'ಕಡಿಮೆ → ಹೆಚ್ಚು';

  @override
  String ccQcRankingSummary(int active, int total, int days) {
    return '$total ರಲ್ಲಿ $active VMCC ವಿತರಿಸಿದೆ · ಕೊನೆಯ $days ದಿನಗಳು';
  }

  @override
  String get navTankers => 'ಟ್ಯಾಂಕರ್‌ಗಳು';

  @override
  String get ppHomeRawMilkTank => 'ಕಚ್ಚಾ ಹಾಲಿನ ಟ್ಯಾಂಕ್';

  @override
  String get ppHomeCcsToday => 'CCಗಳು · ಇಂದು';

  @override
  String get ppHomeTodayLabel => 'ಇಂದು';

  @override
  String get ppHomeTodayReceivedLabel => 'ಇಂದು ಸ್ವೀಕರಿಸಿದ್ದು';

  @override
  String ppHomeTankersCount(int count) {
    return '$count ಟ್ಯಾಂಕರ್';
  }

  @override
  String ppHomeVarianceVsDispatch(Object value) {
    return '$value% ರವಾನೆಗೆ ಹೋಲಿಸಿ';
  }

  @override
  String get ppHomeReceivedLabel => 'ಸ್ವೀಕರಿಸಿದ್ದು';

  @override
  String get ppHomeNoCcsTitle => 'ರವಾನಿಸುತ್ತಿರುವ CCಗಳಿಲ್ಲ';

  @override
  String get ppHomeNoCcsSubtitle =>
      'ಈ ಪ್ಲಾಂಟ್‌ಗೆ ಪೂರೈಸುವ ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String ppHomeFlowTransit(Object amount) {
    return '$amount ಸಾಗಣೆಯಲ್ಲಿ';
  }

  @override
  String ppHomeFlowReceived(Object amount) {
    return '$amount ಸ್ವೀಕರಿಸಿದ್ದು';
  }

  @override
  String get ppReceiveNoReceiptsSubtitle =>
      'CCಗಳಿಂದ ನೀವು ಸ್ವೀಕರಿಸುವ ಟ್ಯಾಂಕರ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String get ppReceiveLoadError => 'ಟ್ಯಾಂಕರ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ';

  @override
  String get ppReceiveNothingInTransitSubtitle =>
      'ರವಾನಿಸಿದ ನಂತರ ಒಳಬರುವ ಟ್ಯಾಂಕರ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String get ppReceiveDispatchedByCc => 'CC ಯಿಂದ ರವಾನಿಸಲಾಗಿದೆ';

  @override
  String get ppReceiveMeasuredAtPlant => 'ಪ್ಲಾಂಟ್‌ನಲ್ಲಿ ಅಳೆಯಲಾಗಿದೆ';

  @override
  String get ppManualReceiveButton => 'ರವಾನೆ ಇಲ್ಲದೆ ಸ್ವೀಕರಿಸಿ';

  @override
  String get ppManualReceiveTitle => 'ರವಾನೆ ಇಲ್ಲದೆ ಸ್ವೀಕರಿಸಿ';

  @override
  String get ppManualReceiveInfoBanner =>
      'ಹಾಲು ಪ್ಲಾಂಟ್‌ಗೆ ತಲುಪಿದೆ ಆದರೆ CC ಇನ್ನೂ ತನ್ನ ಸಂಗ್ರಹವನ್ನು ನಮೂದಿಸಿಲ್ಲ ಎಂದಾದಾಗ ಇದನ್ನು ಬಳಸಿ. ಉತ್ಪಾದನೆಗೆ ಯೋಜಿಸಲು ಪ್ರತಿ ಹಾಲಿನ ಪ್ರಕಾರಕ್ಕೂ ಪ್ರತ್ಯೇಕವಾಗಿ ದಾಖಲಿಸಿ.';

  @override
  String get ppManualReceiveArrivedFrom => 'ಎಲ್ಲಿಂದ ಬಂದಿದೆ';

  @override
  String get ppManualReceiveSourceCc => 'ಶೀತಲೀಕರಣ ಕೇಂದ್ರ';

  @override
  String get ppManualReceivePerTypeLabel =>
      'ಸ್ವೀಕರಿಸಿದ ಪ್ರಮಾಣ, ಪ್ರತಿ ಹಾಲಿನ ಪ್ರಕಾರಕ್ಕೆ';

  @override
  String get ppManualReceiveNotReceived => 'ಸ್ವೀಕರಿಸಿಲ್ಲ';

  @override
  String get ppManualReceiveSaveEmpty => 'ಪ್ರಮಾಣವನ್ನು ನಮೂದಿಸಿ';

  @override
  String manualReceiveSaveCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ರಸೀದಿಗಳನ್ನು ಉಳಿಸಿ',
      one: '1 ರಸೀದಿ ಉಳಿಸಿ',
    );
    return '$_temp0';
  }

  @override
  String manualReceivePartialError(int saved, String error) {
    String _temp0 = intl.Intl.pluralLogic(
      saved,
      locale: localeName,
      other: '$saved ರಸೀದಿಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ',
      one: '1 ರಸೀದಿ ಉಳಿಸಲಾಗಿದೆ',
    );
    return '$_temp0, ನಂತರ: $error';
  }

  @override
  String get ppReceiveManualTag => 'ಕೈಬರಹ';

  @override
  String ppReceiveDeleteManualConfirm(String qty, String cc, String date) {
    return '$date ರಂದು $cc ಯಿಂದ ಬಂದ $qty ಕೈಬರಹದ ರಸೀದಿಯನ್ನು ಅಳಿಸಬೇಕೇ? ಅದು ದಾಖಲಿಸಿದ ಕಚ್ಚಾ ಹಾಲಿನ ದಾಸ್ತಾನು ಹಿಂಪಡೆಯಲಾಗುತ್ತದೆ.';
  }

  @override
  String get ppReceiveManualDuplicateWarning =>
      'ಈ CC, ದಿನಾಂಕ ಮತ್ತು ಹಾಲಿನ ಪ್ರಕಾರಕ್ಕೆ ಈಗಾಗಲೇ ಕೈಬರಹದ ರಸೀದಿ ಇದೆ. ಈ ಟ್ಯಾಂಕರ್ ಅನ್ನೂ ಸ್ವೀಕರಿಸಿದರೆ ಹಾಲು ಎರಡು ಬಾರಿ ಎಣಿಕೆಯಾಗುತ್ತದೆ — ಒಂದನ್ನು ಅಳಿಸಿ.';

  @override
  String get ppTankersEmptyTitle => 'ಇಂದು ಯಾವುದೇ ಟ್ಯಾಂಕರ್ ಇಲ್ಲ';

  @override
  String get ppTankersEmptySubtitle =>
      'ಈ ಪ್ಲಾಂಟ್‌ಗೆ ರವಾನಿಸಿದ ಟ್ಯಾಂಕರ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String get adminSwitchTitlePp => 'ಸಂಸ್ಕರಣಾ ಘಟಕಗಳು';

  @override
  String get adminSwitchTitleCc => 'ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರಗಳು';

  @override
  String get adminSwitchTitleVmcc => 'ಗ್ರಾಮ ಸಂಗ್ರಹ ಕೇಂದ್ರಗಳು';

  @override
  String get adminSwitchFarmersNav => 'ರೈತರು';

  @override
  String get adminSwitchDefaultUserName => 'Dhenu ಬಳಕೆದಾರ';

  @override
  String get adminSwitchLoadError => 'ಇಂದಿನ ಸಂಗ್ರಹವನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ';

  @override
  String get adminSwitchTodayCollectionLabel => 'ಇಂದಿನ ಸಂಗ್ರಹ';

  @override
  String get adminSwitchByChillingCentre => 'ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರದ ಪ್ರಕಾರ';

  @override
  String get adminSwitchByMilkType => 'ಹಾಲಿನ ಪ್ರಕಾರದ ಪ್ರಕಾರ';

  @override
  String get adminSwitchNoCollectionTitle => 'ಇಂದು ಇನ್ನೂ ಸಂಗ್ರಹವಾಗಿಲ್ಲ';

  @override
  String get adminSwitchNoCollectionSubtitle =>
      'ಪ್ರತಿ ಕೇಂದ್ರ ಮತ್ತು ಪ್ರತಿ ಹಾಲಿನ ಪ್ರಕಾರದ ಒಟ್ಟು ಮೊತ್ತ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get adminSwitchNoCollectionSuffix => ' · ಸಂಗ್ರಹವಿಲ್ಲ';

  @override
  String get adminSwitchNotLinkedToCc => 'ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರಕ್ಕೆ ಲಿಂಕ್ ಆಗಿಲ್ಲ';

  @override
  String get adminSwitchCcFallback => 'ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರ';

  @override
  String get adminSwitchUnlinkedVmccs => 'ಲಿಂಕ್ ಆಗದ VMCCಗಳು';

  @override
  String adminSwitchVmccsInCc(Object name) {
    return '$name ನಲ್ಲಿನ VMCCಗಳು';
  }

  @override
  String get adminSwitchSheetTitle => 'ಕೇಂದ್ರ ಬದಲಿಸಿ';

  @override
  String get adminSwitchLoadCentresError => 'ಕೇಂದ್ರಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ';

  @override
  String get adminSwitchNoCentresTitle => 'ಇನ್ನೂ ಯಾವುದೇ ಕೇಂದ್ರಗಳಿಲ್ಲ';

  @override
  String get adminSwitchNoCentresSubtitle =>
      'ವೆಬ್ ಅಡ್ಮಿನ್‌ನಲ್ಲಿ ಮೊದಲು VMCCಗಳು, ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರಗಳು ಅಥವಾ ಘಟಕಗಳನ್ನು ಸೇರಿಸಿ';

  @override
  String get operatorSwitchRolePp => 'ಸಂಸ್ಕರಣಾ ಘಟಕ';

  @override
  String get operatorSwitchRoleCc => 'ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರ';

  @override
  String get operatorSwitchRoleVmcc => 'ಗ್ರಾಮ ಸಂಗ್ರಹ ಕೇಂದ್ರ';

  @override
  String get operatorSwitchLoadError => 'ನಿಮ್ಮ ಕೇಂದ್ರಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ';

  @override
  String get operatorSwitchNoneTitle => 'ಯಾವುದೇ ಕೇಂದ್ರ ನಿಯೋಜಿಸಿಲ್ಲ';

  @override
  String get operatorSwitchNoneSubtitle =>
      'ಕೇಂದ್ರಕ್ಕೆ ನಿಯೋಜಿಸಲು ನಿಮ್ಮ ಅಡ್ಮಿನ್ ಅನ್ನು ಕೇಳಿ.';

  @override
  String get operatorSwitchTodayLoading => 'ಇಂದು  …';

  @override
  String get operatorSwitchNoCollection => 'ಇನ್ನೂ ಸಂಗ್ರಹವಾಗಿಲ್ಲ';

  @override
  String operatorSwitchTodaySummary(Object qty, int count) {
    return 'ಇಂದು  $qty · $count ರೈತರು';
  }

  @override
  String get operatorSwitchButton => 'ಬದಲಿಸಿ';

  @override
  String get operatorSelectorGreetingPlain => 'ನಮಸ್ತೆ';

  @override
  String operatorSelectorGreetingNamed(Object name) {
    return 'ನಮಸ್ತೆ, $name';
  }

  @override
  String get operatorSelectorSubtitle =>
      'ಕಾರ್ಯನಿರ್ವಹಿಸಲು ಒಂದು ಕೇಂದ್ರ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get operatorNoAccessTitle => 'ಇನ್ನೂ Dhenu ಪ್ರವೇಶವಿಲ್ಲ';

  @override
  String get operatorNoAccessSubtitle =>
      'ನಿಮ್ಮ ಖಾತೆಗೆ ಹಾಲು ಸಂಗ್ರಹಣೆಯನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಲು ನಿಮ್ಮ ಡೈರಿ ನಿರ್ವಾಹಕರನ್ನು ಕೇಳಿ.';

  @override
  String get operatorNoAccessSignOut => 'ಸೈನ್ ಔಟ್';

  @override
  String get authLoginTagline => 'ಹಾಲು ಸಂಗ್ರಹಣೆ, ನ್ಯಾಯಯುತವಾಗಿ';

  @override
  String get authLoginSessionExpired =>
      'ನಿಮ್ಮ ಸೆಶನ್ ಮುಗಿದಿದೆ. ನಿಮ್ಮ ಫೋನ್ ಸಂಖ್ಯೆಯೊಂದಿಗೆ ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get commonBack => 'ಹಿಂದೆ';

  @override
  String get authOtpPhoneLabel => 'ಫೋನ್ ಸಂಖ್ಯೆ';

  @override
  String get authOtpPhoneHint => '10-ಅಂಕಿಯ ಮೊಬೈಲ್';

  @override
  String get authOtpSendButton => 'OTP ಕಳುಹಿಸಿ';

  @override
  String get authOtpEnterDigits => '10-ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get authOtpEnterCode => '6-ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String authOtpCodeSentTo(Object phone) {
    return '$phone ಗೆ ಕಳುಹಿಸಿದ ಕೋಡ್ ನಮೂದಿಸಿ';
  }

  @override
  String get authOtpSignIn => 'ಸೈನ್ ಇನ್';

  @override
  String get authOtpSmsDelay =>
      'SMS ಬರಲು ಒಂದು ನಿಮಿಷದವರೆಗೆ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳಬಹುದು.';

  @override
  String get authOtpChangeNumber => 'ಸಂಖ್ಯೆ ಬದಲಾಯಿಸಿ';

  @override
  String authOtpResendIn(int seconds) {
    return '$secondsಸೆ ನಂತರ ಮರುಕಳುಹಿಸಿ';
  }

  @override
  String get authOtpResendButton => 'OTP ಮರುಕಳುಹಿಸಿ';

  @override
  String authOtpNetworkErrorDebug(Object baseUrl) {
    return '$baseUrl ಸರ್ವರ್ ತಲುಪಲಾಗುತ್ತಿಲ್ಲ. API ರನ್ ಆಗುತ್ತಿದೆಯೇ ಮತ್ತು ಫೋನ್ ಅದೇ ನೆಟ್‌ವರ್ಕ್‌ನಲ್ಲಿದೆಯೇ?';
  }

  @override
  String get authOtpNetworkErrorProd =>
      'ಸರ್ವರ್ ತಲುಪಲಾಗುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಸಂಪರ್ಕವನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get aboutScreenTitle => 'ಬಗ್ಗೆ';

  @override
  String get aboutScreenTagline => 'ಹಾಲು ಸಂಗ್ರಹಣೆ, ಸರಳೀಕೃತ';

  @override
  String aboutScreenVersion(Object version, Object build) {
    return 'ಆವೃತ್ತಿ $version ($build)';
  }

  @override
  String get aboutScreenPrivacyPolicy => 'ಗೌಪ್ಯತಾ ನೀತಿ';

  @override
  String get aboutScreenTermsOfService => 'ಸೇವಾ ನಿಯಮಗಳು';

  @override
  String get aboutScreenMadeWith => 'ಭಾರತದಲ್ಲಿ ಕಾಳಜಿಯಿಂದ ತಯಾರಿಸಲಾಗಿದೆ 🇮🇳';

  @override
  String get aboutScreenCouldNotOpen => 'ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String get bankPayoutTitle => 'ಬ್ಯಾಂಕ್ ಮತ್ತು ಪಾವತಿ';

  @override
  String get bankPayoutLoadError => 'ಪಾವತಿ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get bankPayoutEmptyTitle => 'ಇನ್ನೂ ಪಾವತಿ ನಿಯಮಗಳಿಲ್ಲ';

  @override
  String get bankPayoutEmptySubtitle =>
      'ನಿಮ್ಮ ಸಂಭಾವನೆಯನ್ನು ನಿಮ್ಮ ನಿರ್ವಾಹಕರು ಹೊಂದಿಸುತ್ತಾರೆ ಮತ್ತು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get bankPayoutThisMonth => 'ಈ ತಿಂಗಳು';

  @override
  String bankPayoutCollectedEstEarning(Object qty) {
    return '$qty ಸಂಗ್ರಹಿಸಲಾಗಿದೆ · ಇಲ್ಲಿಯವರೆಗಿನ ಅಂದಾಜು ಗಳಿಕೆ';
  }

  @override
  String get bankPayoutMethodLabel => 'ಪಾವತಿ ವಿಧಾನ';

  @override
  String get bankPayoutRentLabel => 'ಬಾಡಿಗೆ';

  @override
  String bankPayoutPerMonth(Object amount) {
    return '$amount / ತಿಂಗಳಿಗೆ';
  }

  @override
  String get bankPayoutSinceLabel => 'ಇಂದಿನಿಂದ';

  @override
  String get bankPayoutHasAccount =>
      'ಪಾವತಿಗಳು ನಿಮ್ಮ ನೋಂದಾಯಿತ ಬ್ಯಾಂಕ್ ಖಾತೆಗೆ ಹೋಗುತ್ತವೆ.';

  @override
  String get bankPayoutNoAccount =>
      'ಫೈಲ್‌ನಲ್ಲಿ ಬ್ಯಾಂಕ್ ಖಾತೆ ಇಲ್ಲ — ಒಂದನ್ನು ಸೇರಿಸಲು ನಿಮ್ಮ ನಿರ್ವಾಹಕರನ್ನು ಕೇಳಿ.';

  @override
  String get bankPayoutFixedSalary => 'ನಿಗದಿತ ಸಂಬಳ';

  @override
  String get bankPayoutPerLitreCommission => 'ಪ್ರತಿ-ಲೀಟರ್ ಕಮಿಷನ್';

  @override
  String bankPayoutPerLitre(Object rate) {
    return '$rate / ಲೀಟರ್';
  }

  @override
  String get langPickerTitle => 'ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get langPickerComingSoon => 'ಶೀಘ್ರದಲ್ಲಿ ಬರುತ್ತಿದೆ';

  @override
  String get dispatchFatHint => 'FAT %';

  @override
  String get dispatchSnfHint => 'SNF %';

  @override
  String get dispatchQtyLabel => 'ಪ್ರಮಾಣ (L)';

  @override
  String get dispatchWaterLabel => 'ನೀರು %';

  @override
  String get dispatchContainerFieldLabel => 'ಕಂಟೇನರ್';

  @override
  String get dispatchWaterHint => 'ನೀರು % (ಐಚ್ಛಿಕ)';

  @override
  String get dispatchHistoryTitle => 'ಡಿಸ್ಪ್ಯಾಚ್ ಇತಿಹಾಸ';

  @override
  String get dispatchSeeFullHistory => 'ಪೂರ್ಣ ಇತಿಹಾಸ ನೋಡಿ';

  @override
  String get dispatchHistoryLoadError => 'ಇತಿಹಾಸ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get dispatchHistoryEmptyTitle => 'ಇನ್ನೂ ಡಿಸ್ಪ್ಯಾಚ್‌ಗಳಿಲ್ಲ';

  @override
  String get dispatchHistoryEmptySubtitle =>
      'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ ಕಳುಹಿಸಿದ ಟ್ಯಾಂಕರ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String get dispatchHistoryPlantFallback => 'ಪ್ಲಾಂಟ್';

  @override
  String get dispatchHistoryCcFallback => 'ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರ';

  @override
  String dispatchHistoryCount(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n ಡಿಸ್ಪ್ಯಾಚ್‌ಗಳು',
      one: '$n ಡಿಸ್ಪ್ಯಾಚ್',
    );
    return '$_temp0';
  }

  @override
  String dispatchHistoryInTransit(int n) {
    return '$n ಸಾಗಣೆಯಲ್ಲಿ';
  }

  @override
  String get dispatchHistoryReversed => '⊘ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ';

  @override
  String farmerPoursGradeLabel(Object letter) {
    return 'ಗ್ರೇಡ್ $letter';
  }

  @override
  String get collectLowWord => 'ಕಡಿಮೆ';

  @override
  String get qcReportLoadError => 'QC ಡೇಟಾ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String qcReportHeroLabelFarmer(Object name, int days) {
    return '$name · ಕೊನೆಯ $days ದಿನಗಳು';
  }

  @override
  String qcReportHeroLabelAll(int days) {
    return 'ಸಂಗ್ರಹಿಸಲಾಗಿದೆ · ಕೊನೆಯ $days ದಿನಗಳು';
  }

  @override
  String qcReportHeroLabelDays(int days) {
    return 'ಕೊನೆಯ $days ದಿನಗಳು';
  }

  @override
  String get qcReportFooterFarmer => 'ಈ ರೈತರಿಗೆ ಪ್ರಮಾಣ-ತೂಕದ ಗುಣಮಟ್ಟ';

  @override
  String get qcReportFooterAll => 'ಎಲ್ಲಾ ರೈತರ ಪ್ರಮಾಣ-ತೂಕದ ಗುಣಮಟ್ಟ';

  @override
  String get qcReportEmptyTitle => 'ಈ ಅವಧಿಯಲ್ಲಿ ಯಾವುದೇ ವಾಚನಗಳಿಲ್ಲ';

  @override
  String get qcReportEmptySubtitle =>
      'ದೈನಂದಿನ QC ಪ್ರವೃತ್ತಿ ನೋಡಲು ಸಂಗ್ರಹಣೆಗಳನ್ನು ದಾಖಲಿಸಿ';

  @override
  String get qcReportSelectFarmerTitle => 'ಒಬ್ಬ ರೈತರನ್ನು ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get qcReportSelectFarmerSubtitle =>
      'ಗುಣಮಟ್ಟದ ಪ್ರವೃತ್ತಿ ನೋಡಲು ರೈತರನ್ನು ಆರಿಸಿ';

  @override
  String get qcReportScopeAll => 'ಎಲ್ಲಾ ರೈತರು';

  @override
  String get qcReportScopePerFarmer => 'ಪ್ರತಿ ರೈತ';

  @override
  String qcReportDaysChip(int d) {
    return '$d ದಿನಗಳು';
  }

  @override
  String get homeCouldNotLoadCentre => 'ನಿಮ್ಮ ಕೇಂದ್ರ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get updateRequiredTitle => 'ಅಪ್‌ಡೇಟ್ ಅಗತ್ಯವಿದೆ';

  @override
  String get updateRequiredButton => 'ಈಗ ಅಪ್‌ಡೇಟ್ ಮಾಡಿ';

  @override
  String get updateRequiredCouldNotOpenStore => 'ಸ್ಟೋರ್ ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String get nodePickerSearchHint => 'ಹುಡುಕಿ…';

  @override
  String get nodePickerNoMatch => 'ಹೊಂದಾಣಿಕೆ ಇಲ್ಲ';

  @override
  String get voiceFieldDictateTooltip => 'ಡಿಕ್ಟೇಟ್ ಮಾಡಿ';

  @override
  String get voiceFieldReadBackTooltip => 'ಮತ್ತೆ ಓದಿ';

  @override
  String get splashTagline => 'ಪ್ರತಿ ಹನಿಯೂ ಮುಖ್ಯ';

  @override
  String get farmerBankAccountHolder => 'ಖಾತೆದಾರರ ಹೆಸರು';

  @override
  String get farmerBankAccountNumber => 'ಖಾತೆ ಸಂಖ್ಯೆ';

  @override
  String get farmerBankIfsc => 'IFSC';

  @override
  String get farmerBankName => 'ಬ್ಯಾಂಕ್';

  @override
  String get farmerBankUpi => 'UPI ID';

  @override
  String get farmerBankEmpty =>
      'ಪಾವತಿ ವಿವರಗಳು ಇನ್ನೂ ಇಲ್ಲ — ನಿಮ್ಮ ಸಂಗ್ರಹ ಕೇಂದ್ರದ ನಿರ್ವಾಹಕರನ್ನು ಕೇಳಿ.';

  @override
  String get farmerBankFootnote =>
      'ನಿಮ್ಮ ಹಾಲಿನ ಪಾವತಿ ಈ ಖಾತೆಗೆ ಹೋಗುತ್ತದೆ. ಬದಲಾಯಿಸಲು ನಿಮ್ಮ ಸಂಗ್ರಹ ಕೇಂದ್ರದ ನಿರ್ವಾಹಕರನ್ನು ಕೇಳಿ.';

  @override
  String get farmerReportProblem => 'ಸಮಸ್ಯೆ ವರದಿ ಮಾಡಿ';

  @override
  String farmerReportPrefill(Object date, Object shift, Object qty) {
    return 'ನಮಸ್ಕಾರ, $date ($shift, $qty) ರ ನನ್ನ ಹಾಲಿನ ನಮೂದಿನ ಬಗ್ಗೆ ಪ್ರಶ್ನೆ ಇದೆ.';
  }

  @override
  String collectAdvanceChip(Object amount) {
    return '$amount ಮುಂಗಡ ಬಾಕಿ';
  }

  @override
  String get collectShareSummary => 'ಸಾರಾಂಶ ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String collectSummaryMessage(
    Object node,
    Object date,
    Object shift,
    Object qty,
    Object count,
    Object fat,
    Object snf,
  ) {
    return '$node · $date · $shift\nಸಂಗ್ರಹಿಸಿದ ಹಾಲು: $qty\nರೈತರು: $count\nಸರಾಸರಿ FAT $fat · SNF $snf';
  }

  @override
  String farmerRateNewNotice(Object date) {
    return '$date ರಿಂದ ಹೊಸ ದರ ಜಾರಿಯಲ್ಲಿದೆ';
  }

  @override
  String homeCloseShiftNudge(Object shift) {
    return '$shift ಸಂಗ್ರಹ ಇನ್ನೂ ತೆರೆದಿದೆ — ಮುಗಿದ ಮೇಲೆ ಮುಚ್ಚಿ.';
  }

  @override
  String get notificationsTitle => 'ಅಧಿಸೂಚನೆಗಳು';

  @override
  String get notificationsMarkAllRead => 'ಎಲ್ಲವನ್ನೂ ಓದಿದೆ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get notificationsEmptyTitle => 'ಇನ್ನೂ ಏನೂ ಇಲ್ಲ';

  @override
  String get notificationsEmptySubtitle =>
      'ನಿಮ್ಮ ಕೇಂದ್ರದ ರವಾನೆ ಮತ್ತು ಸ್ವೀಕೃತಿಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get notificationsLoadError => 'ಅಧಿಸೂಚನೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get notificationsJustNow => 'ಈಗಷ್ಟೇ';

  @override
  String notificationsMinutesAgo(int n) {
    return '$n ನಿಮಿಷಗಳ ಹಿಂದೆ';
  }

  @override
  String notificationsHoursAgo(int n) {
    return '$n ಗಂಟೆಗಳ ಹಿಂದೆ';
  }

  @override
  String notificationsDaysAgo(int n) {
    return '$n ದಿನಗಳ ಹಿಂದೆ';
  }

  @override
  String ppHistoryCcCount(int count) {
    return '$count CC';
  }

  @override
  String get ppHistoryNoReceiptsSubtitle =>
      'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ CCಗಳಿಂದ ಸ್ವೀಕರಿಸಿದ ಟ್ಯಾಂಕರ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String get ppQcScopeByCc => 'CC ಪ್ರಕಾರ';

  @override
  String get ppQcHeroFooterAll => 'ಎಲ್ಲಾ CC ಟ್ಯಾಂಕರ್‌ಗಳ ಪ್ರಮಾಣ-ತೂಕದ ಗುಣಮಟ್ಟ';

  @override
  String ppQcHeroLabelCc(Object name, int days) {
    return '$name · ಕೊನೆಯ $days ದಿನಗಳು';
  }

  @override
  String get ppQcHeroFooterCc => 'ಈ CCಯಿಂದ ಸ್ವೀಕರಿಸಿದ ಪ್ರಮಾಣ-ತೂಕದ ಗುಣಮಟ್ಟ';

  @override
  String get ppQcEmptySubtitleCc => 'ಈ ಅವಧಿಯಲ್ಲಿ ಈ CCಯಿಂದ ಹಾಲು ಸ್ವೀಕರಿಸಿಲ್ಲ';

  @override
  String get ppQcSelectCcTitle => 'CC ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get ppQcSelectCcPlaceholder => 'ಒಂದು CC ಆಯ್ಕೆಮಾಡಿ';

  @override
  String ppQcRankingSummary(int active, int total, int days) {
    return '$total ರಲ್ಲಿ $active CC ವಿತರಿಸಿದೆ · ಕೊನೆಯ $days ದಿನಗಳು';
  }

  @override
  String fastTrackTitle(String plant) {
    return '$plant ಗೆ ಕಳುಹಿಸಬೇಕೇ?';
  }

  @override
  String get fastTrackChecking => 'ಸಿದ್ಧವಿರುವುದನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get fastTrackSend => 'ಕಳುಹಿಸಿ';

  @override
  String get fastTrackNothingTitle => 'ಕಳುಹಿಸಲು ಏನೂ ಇಲ್ಲ';

  @override
  String get fastTrackNothingSubtitle =>
      'ಸದ್ಯಕ್ಕೆ ಪ್ಲಾಂಟ್‌ಗೆ ಹೋಗಲು ಹಾಲು ಕಾಯುತ್ತಿಲ್ಲ.';

  @override
  String get fastTrackClosesWholeDay =>
      'ಇದು ಈ ಕೇಂದ್ರದ ಇಡೀ ದಿನದ ಸಂಗ್ರಹಣೆಯನ್ನು ಮುಚ್ಚುತ್ತದೆ — ನಂತರ ಸುರಿದ ಹಾಲಿಗೆ ಸ್ಲಾಟ್ ಮತ್ತೆ ತೆರೆಯಬೇಕು.';

  @override
  String fastTrackSuccess(String qty, String plant) {
    return '$qty $plant ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ';
  }

  @override
  String fastTrackPartial(String vmcc) {
    return '$vmcc ನಲ್ಲಿ ನಿಂತಿದೆ. ಅದಕ್ಕೂ ಮೊದಲಿನದೆಲ್ಲ ದಾಖಲಾಗಿದೆ — ಉಳಿದದ್ದನ್ನು ರವಾನೆ ಪರದೆಯಲ್ಲಿ ಮುಗಿಸಿ.';
  }

  @override
  String get dispatchDestTitle => 'ಇದು ಎಲ್ಲಿಗೆ ಹೋಗುತ್ತದೆ?';

  @override
  String dispatchDestPlant(String plant) {
    return '$plant ಗೆ ಕಳುಹಿಸಿ';
  }

  @override
  String get dispatchDestPlantSub =>
      'ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರವನ್ನು ಮುಚ್ಚಿ ಹಾಲನ್ನು ಕಚ್ಚಾ ದಾಸ್ತಾನಿಗೆ ಸೇರಿಸುತ್ತದೆ — ಇಡೀ ಸರಪಳಿ, ಒಂದೇ ಹಂತದಲ್ಲಿ';

  @override
  String dispatchDestCc(String cc) {
    return '$cc ಗೆ ರವಾನಿಸಿ';
  }

  @override
  String get dispatchDestCcSub =>
      'ಸಾಮಾನ್ಯ ಹಂತ — ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರ ಸ್ವೀಕರಿಸಿ ತೂಕ ಮಾಡುತ್ತದೆ';

  @override
  String get fastTrackChainSummary =>
      'ಎರಡೂ ಕೇಂದ್ರಗಳನ್ನು ಮುಚ್ಚಿ, ಪ್ರತಿ ಹಂತದ ರವಾನೆ ಮತ್ತು ಸ್ವೀಕೃತಿಯನ್ನು ದಾಖಲಿಸಿ, ಹಾಲನ್ನು ಕಚ್ಚಾ ದಾಸ್ತಾನಿಗೆ ಸೇರಿಸುತ್ತದೆ.';

  @override
  String get ccHomeShiftAwaitingVmcc => 'ಇನ್ನೂ ಸ್ವೀಕರಿಸಿಲ್ಲ';

  @override
  String homeDispatchShiftQty(String shift, String qty) {
    return '$shift ರವಾನಿಸಿ · $qty';
  }

  @override
  String homeDispatchSlotDated(String shift, String date, String qty) {
    return '$shift · $date · $qty ರವಾನಿಸಿ';
  }

  @override
  String homeDispatchBothShifts(String qty) {
    return 'AM ಮತ್ತು PM ರವಾನಿಸಿ · $qty';
  }

  @override
  String dispatchDestPlantSubBoth(String qty) {
    return 'ಎರಡೂ ಪಾಳಿಗಳು · $qty';
  }

  @override
  String dispatchDestCcSubOne(String shift) {
    return 'ಒಂದೊಂದೇ ಪಾಳಿ — $shift ನಿಂದ ಆರಂಭ';
  }

  @override
  String get dispatchDestPlantGeneric => 'ಮುಖ್ಯ ಪ್ಲಾಂಟ್‌ಗೆ ಕಳುಹಿಸಿ';

  @override
  String get dispatchDestCcGeneric => 'ಚಿಲ್ಲಿಂಗ್ ಕೇಂದ್ರಕ್ಕೆ ರವಾನಿಸಿ';

  @override
  String get farmerPaymentsSegPayouts => 'ಪಾವತಿಗಳು';

  @override
  String get farmerPaymentsSegLedger => 'ಮುಂಗಡ';

  @override
  String get farmerPaymentsLastPayout => 'ಕೊನೆಯ ಪಾವತಿ';

  @override
  String get farmerPaymentsNoPayouts => 'ಇನ್ನೂ ಪಾವತಿಗಳಿಲ್ಲ';

  @override
  String get farmerPaymentsNoPayoutsSubtitle =>
      'ಚಕ್ರ ರಚಿಸಿದ ನಂತರ ಚಕ್ರ ಪಾವತಿಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ';

  @override
  String get farmerPaymentsPayoutsLoadError => 'ಪಾವತಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String farmerPaymentsLitresNet(String litres, String amount) {
    return '$litres ಲೀ · ನಿವ್ವಳ $amount';
  }

  @override
  String get farmerPaymentsMarkPaid => 'ಪಾವತಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get farmerPaymentsMarkPaidError => 'ಪಾವತಿ ಸ್ಥಿತಿಯನ್ನು ನವೀಕರಿಸಲಾಗಲಿಲ್ಲ';

  @override
  String get farmerPaymentsUnpaid => 'ಪಾವತಿಸಿಲ್ಲ';

  @override
  String farmerPaymentsPaidOn(String date) {
    return '$date ರಂದು ಪಾವತಿಸಲಾಗಿದೆ';
  }

  @override
  String get farmerPaymentsBreakdown => 'ವಿವರ';

  @override
  String get farmerPaymentsGross => 'ಒಟ್ಟು';

  @override
  String get farmerPaymentsBonus => 'ಗುಣಮಟ್ಟ ಬೋನಸ್';

  @override
  String get farmerPaymentsNet => 'ನಿವ್ವಳ ಪಾವತಿ';

  @override
  String get farmerPaymentsDeductionAdvance => 'ಮುಂಗಡ ವಸೂಲಿ';

  @override
  String get farmerPaymentsDeductionFeedLoan => 'ಮೇವು ಸಾಲ ವಸೂಲಿ';

  @override
  String get farmerPaymentsDeductionOther => 'ಇತರೆ ಕಡಿತ';

  @override
  String get farmerPaymentsPaymentMode => 'ಪಾವತಿ ವಿಧಾನ';

  @override
  String get farmerPaymentsStatementNo => 'ಹೇಳಿಕೆ ಸಂ.';

  @override
  String farmerPaymentsAdvanceDue(String amount) {
    return 'ಮುಂಗಡ $amount';
  }

  @override
  String farmerPaymentsFeedLoanDue(String amount) {
    return 'ಮೇವು ಸಾಲ $amount';
  }

  @override
  String get farmerPaymentsRecordEntryButton =>
      'ಮುಂಗಡ, ಸಾಲ ಅಥವಾ ಮರುಪಾವತಿ ದಾಖಲಿಸಿ';

  @override
  String get farmerPaymentsEntrySaved => 'ನಮೂದು ದಾಖಲಾಗಿದೆ';

  @override
  String get farmerPaymentsEarnings => 'ಗಳಿಕೆ';

  @override
  String get farmerPaymentsDeductions => 'ಕಡಿತಗಳು';

  @override
  String get farmerPaymentsPaymentSection => 'ಪಾವತಿ';

  @override
  String get farmerPaymentsPaidOnLabel => 'ಪಾವತಿಸಿದ ದಿನಾಂಕ';

  @override
  String get farmerPaymentsReference => 'UTR / ಉಲ್ಲೇಖ';

  @override
  String get farmerPaymentsNotConfirmed => 'ಇನ್ನೂ ದೃಢೀಕರಿಸಿಲ್ಲ';

  @override
  String get farmerPaymentsModeBankTransfer => 'ಬ್ಯಾಂಕ್ ವರ್ಗಾವಣೆ';

  @override
  String get farmerPaymentsModeUpi => 'UPI';

  @override
  String get farmerPaymentsModeCash => 'ನಗದು';

  @override
  String get farmerPaymentsModeCheque => 'ಚೆಕ್';

  @override
  String get farmerPaymentsModeOther => 'ಇತರೆ';

  @override
  String get suppliedRecordedAtCc => 'ಶೀತಲೀಕರಣ ಕೇಂದ್ರದಲ್ಲಿ ದಾಖಲಾಗಿದೆ';

  @override
  String suppliedRecordedAtNamedCc(String cc) {
    return '$cc ನಲ್ಲಿ ದಾಖಲಾಗಿದೆ';
  }

  @override
  String get suppliedWholeDay => 'ಇಡೀ ದಿನ';

  @override
  String get suppliedNotPriced => 'ದರ ನಿಗದಿಯಾಗಿಲ್ಲ';

  @override
  String historyDaySupplySubtitle(String pm, String am) {
    return '☾ $pm · ☀️ $am';
  }

  @override
  String get dispatchHistoryRecordedOnArrival => 'ಬಂದಾಗ ದಾಖಲಾಗಿದೆ';

  @override
  String get paymentsBillsTitle => 'ಪಾವತಿ ಬಿಲ್‌ಗಳು';

  @override
  String get paymentsBillsSubtitle =>
      'ಈ ಕೇಂದ್ರಕ್ಕೆ ಪ್ರತಿ ಚಕ್ರದಲ್ಲಿ ಪಾವತಿಸಿದ ಮೊತ್ತ';

  @override
  String get paymentsBillsEmptyTitle => 'ಇನ್ನೂ ಬಿಲ್‌ಗಳಿಲ್ಲ';

  @override
  String get paymentsBillsEmptySubtitle =>
      'ಶೀತಲೀಕರಣ ಕೇಂದ್ರವು ಚಕ್ರವನ್ನು ಇತ್ಯರ್ಥಗೊಳಿಸಿದ ನಂತರ ಬಿಲ್ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ';

  @override
  String get paymentsBillMilk => 'ಹಾಲು';

  @override
  String get paymentsBillOperator => 'ನಿರ್ವಾಹಕ';

  @override
  String get paymentsBillReversed => 'ಹಿಂಪಡೆಯಲಾಗಿದೆ';

  @override
  String get paymentsBillStatement => 'ವಿವರ ಪಟ್ಟಿ';

  @override
  String get paymentsBillsPaidTotal => 'ಇಲ್ಲಿಯವರೆಗೆ ಪಾವತಿಸಿದ್ದು';

  @override
  String get paymentsBillsDueTotal => 'ಪಾವತಿ ಬಾಕಿ';

  @override
  String get paymentsBillTotal => 'ಒಟ್ಟು';

  @override
  String get paymentsBillStatusPaid => 'ಪಾವತಿಸಲಾಗಿದೆ';

  @override
  String get paymentsBillStatusDue => 'ಬಾಕಿ';

  @override
  String get farmerSaleTitle => 'ರೈತರಿಗೆ ಮಾರಾಟ';

  @override
  String get farmerSaleRecord => 'ಮಾರಾಟ ದಾಖಲಿಸಿ';

  @override
  String get farmerSaleQtyHint => 'ಪ್ರಮಾಣ';

  @override
  String get farmerSaleRateHint => 'ದರ / ಲೀ';

  @override
  String get farmerSaleInvalidEntry => 'ಲೀಟರ್ ಮತ್ತು ದರವನ್ನು ನಮೂದಿಸಿ';

  @override
  String get farmerSalePickMilkType => 'ಮಾರುತ್ತಿರುವ ಹಾಲಿನ ಬಗೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get farmerSaleSaved => 'ಮಾರಾಟ ದಾಖಲಾಗಿದೆ';

  @override
  String farmerSaleAmountNote(String amount) {
    return '$amount — ಮುಂದಿನ ಪಾವತಿಯಿಂದ ಕಡಿತವಾಗುತ್ತದೆ';
  }

  @override
  String get farmerPaymentsSold => 'ರೈತರಿಗೆ ಮಾರಾಟ';

  @override
  String farmerPaymentsSaleDue(String amount) {
    return 'ಖರೀದಿಗಳು $amount';
  }

  @override
  String get farmerPaymentsBought => 'ನಮ್ಮಿಂದ ಖರೀದಿಸಿದ್ದು';

  @override
  String get farmerPaymentsEarlierPurchases => 'ಹಿಂದಿನ ಖರೀದಿಗಳು';

  @override
  String get farmerPaymentsSegSold => 'ಮಾರಾಟ';

  @override
  String get farmerSaleNoneYet => 'ಈ ರೈತರಿಗೆ ಇನ್ನೂ ಏನೂ ಮಾರಿಲ್ಲ';

  @override
  String get farmerSaleKindMilk => 'ಹಾಲು';

  @override
  String get farmerSaleKindProduct => 'ಉತ್ಪನ್ನ';

  @override
  String get farmerSaleProductHint => 'ಉತ್ಪನ್ನ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get farmerSaleNoProducts => 'ಮಾರಾಟಕ್ಕೆ ಉತ್ಪನ್ನಗಳಿಲ್ಲ';

  @override
  String get productPickerLoadError => 'ಉತ್ಪನ್ನಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get productPickerNoMatch => 'ಹೊಂದುವ ಉತ್ಪನ್ನಗಳಿಲ್ಲ';

  @override
  String get commonSave => 'ಉಳಿಸಿ';

  @override
  String get farmerSaleEditTitle => 'ಮಾರಾಟ ತಿದ್ದಿ';

  @override
  String get farmerSaleUpdated => 'ಮಾರಾಟ ನವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get farmerSaleEdit => 'ತಿದ್ದಿ';

  @override
  String get farmerSaleDelete => 'ಅಳಿಸಿ';

  @override
  String get farmerSaleDeleteConfirm =>
      'ಈ ಮಾರಾಟವನ್ನು ಅಳಿಸಬೇಕೆ? ಇದು ಇನ್ನು ಕಡಿತವಾಗುವುದಿಲ್ಲ.';

  @override
  String get farmerSaleDeleted => 'ಮಾರಾಟ ಅಳಿಸಲಾಗಿದೆ';

  @override
  String farmerPaymentsStillOwed(String amount) {
    return 'ಈ ಪಾವತಿಯ ನಂತರವೂ $amount ಬಾಕಿ';
  }

  @override
  String get runningCycleTitle => 'ಈ ಚಕ್ರ';

  @override
  String get runningCycleNetPayable => 'ಈಗ ಪಾವತಿಸಬೇಕಾದ ನಿವ್ವಳ';

  @override
  String get runningCycleGross => 'ಹಾಲಿನ ಮೌಲ್ಯ';

  @override
  String get runningCycleNoCadence => 'ಚಕ್ರದ ಅವಧಿ ಹೊಂದಿಸಿಲ್ಲ';

  @override
  String get runningCycleNoCadenceHint =>
      'ಚಾಲ್ತಿ ಬಾಕಿ ನೋಡಲು ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಸಂಗ್ರಹ ಚಕ್ರವನ್ನು ಹೊಂದಿಸಿ';

  @override
  String get runningCycleNoPours => 'ಈ ಚಕ್ರದಲ್ಲಿ ಇನ್ನೂ ಸಂಗ್ರಹವಿಲ್ಲ';

  @override
  String get runningCycleLoadError => 'ಈ ಚಕ್ರವನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get runningCycleFrozen => 'ಲಾಕ್ ಆಗಿದೆ — ಅಂತಿಮ';

  @override
  String get runningCycleLive => 'ಚಾಲ್ತಿ ಮೊತ್ತ';

  @override
  String get runningCycleFullyRecovered => 'ಬಾಕಿಗೆ ಪೂರ್ಣ ವಸೂಲಿ';

  @override
  String runningCycleVmccCount(int count) {
    return '$count ಕೇಂದ್ರಗಳು';
  }

  @override
  String runningCycleFarmerCount(int count) {
    return '$count ರೈತರು';
  }

  @override
  String get ccCycleBalanceTitle => 'ಚಕ್ರದ ಬಾಕಿ';

  @override
  String get ccCycleBalanceLink => 'ಚಕ್ರದ ಬಾಕಿ';

  @override
  String get ccCycleBalanceEmpty =>
      'ಈ ಚಕ್ರದಲ್ಲಿ ಯಾವ ಕೇಂದ್ರವೂ ಇನ್ನೂ ಸಂಗ್ರಹಿಸಿಲ್ಲ';

  @override
  String ccCycleBalanceMilk(String amount) {
    return 'ಹಾಲು $amount';
  }

  @override
  String ccCycleBalanceComp(String amount) {
    return 'ಸಂಭಾವನೆ $amount';
  }

  @override
  String runningCycleDeducted(String amount) {
    return 'ಬಾಕಿ ಕಳೆದು $amount';
  }

  @override
  String runningCycleComp(String amount) {
    return 'ಜೊತೆಗೆ ಸಂಭಾವನೆ $amount';
  }

  @override
  String get ccPaymentsCentresTitle => 'ಕೇಂದ್ರಗಳು';

  @override
  String paymentsCentreCount(Object count) {
    return '$count ಕೇಂದ್ರಗಳು';
  }

  @override
  String paymentsPendingCentresSub(Object centres, Object open) {
    return '$centres ಕೇಂದ್ರಗಳು · $open ತೆರೆದಿದೆ';
  }

  @override
  String get cycleCentreBreakup => 'ಕೇಂದ್ರವಾರು';

  @override
  String get cycleNoBills => 'ಈ ಚಕ್ರದಲ್ಲಿ ಕೇಂದ್ರ ಬಿಲ್‌ಗಳಿಲ್ಲ';

  @override
  String get cycleBillDue => 'ಬಾಕಿ';

  @override
  String get cancelDispatchAction => 'ರವಾನೆ ರದ್ದುಗೊಳಿಸಿ';

  @override
  String get cancelDispatchTitle => 'ಈ ರವಾನೆಯನ್ನು ರದ್ದುಗೊಳಿಸಬೇಕೆ?';

  @override
  String cancelDispatchBody(Object qty, Object name) {
    return '$name ಗೆ ಕಳುಹಿಸಿದ $qty ರದ್ದಾಗುತ್ತದೆ. ಹಾಲು ಈ ಕೇಂದ್ರದ ಲಭ್ಯ ದಾಸ್ತಾನಿಗೆ ಮರಳುತ್ತದೆ.';
  }

  @override
  String get cancelReceiptAction => 'ಸ್ವೀಕೃತಿ ರದ್ದುಗೊಳಿಸಿ';

  @override
  String get cancelReceiptTitle => 'ಈ ಸ್ವೀಕೃತಿಯನ್ನು ರದ್ದುಗೊಳಿಸಬೇಕೆ?';

  @override
  String cancelReceiptBody(Object qty, Object name) {
    return '$name ಇಂದ ಸ್ವೀಕರಿಸಿದ $qty ಮತ್ತೆ ಸಾಗಣೆಯಲ್ಲಿ ಎಂದು ಗುರುತಾಗುತ್ತದೆ. ನಂತರ ಕಳುಹಿಸಿದವರು ರವಾನೆಯನ್ನು ರದ್ದುಗೊಳಿಸಬಹುದು.';
  }

  @override
  String cancelDispatchReceivedHint(Object name) {
    return '$name ನಲ್ಲಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ. ಮೊದಲು ಅಲ್ಲಿ ಸ್ವೀಕೃತಿಯನ್ನು ರದ್ದುಗೊಳಿಸಿ, ನಂತರ ಈ ರವಾನೆಯನ್ನು ರದ್ದುಗೊಳಿಸಬಹುದು.';
  }

  @override
  String get dispatchSentTitle => 'ಈಗಾಗಲೇ ರವಾನಿಸಲಾಗಿದೆ';

  @override
  String get rejectAction => 'ಹಾಲು ತಿರಸ್ಕರಿಸಿ';

  @override
  String get rejectTitle => 'ಹಾಲು ತಿರಸ್ಕರಿಸಿ';

  @override
  String get rejectQtyLabel => 'ತಿರಸ್ಕರಿಸಿದ ಲೀಟರ್';

  @override
  String get rejectReasonLabel => 'ಕಾರಣ?';

  @override
  String get rejectNotesLabel => 'ಏನು ತೊಂದರೆ?';

  @override
  String get rejectDispositionLabel => 'ಹಾಲು ಎಲ್ಲಿ ಹೋಯಿತು?';

  @override
  String get rejectReturned => 'ಹಿಂತಿರುಗಿಸಲಾಗಿದೆ';

  @override
  String get rejectDestroyed => 'ನಾಶಪಡಿಸಲಾಗಿದೆ';

  @override
  String get rejectReasonSour => 'ಹುಳಿ';

  @override
  String get rejectReasonTemperature => 'ಹೆಚ್ಚು ಬಿಸಿ';

  @override
  String get rejectReasonAdulterated => 'ಕಲಬೆರಕೆ';

  @override
  String get rejectReasonCob => 'COB ಪಾಸಿಟಿವ್';

  @override
  String get rejectReasonAntibiotic => 'ಔಷಧ ಅಂಶ';

  @override
  String get rejectReasonForeign => 'ಹೊರಗಿನ ವಸ್ತು';

  @override
  String get rejectReasonOther => 'ಇತರೆ';

  @override
  String get rejectSubmit => 'ತಿರಸ್ಕಾರ ದಾಖಲಿಸಿ';

  @override
  String rejectDoneToast(Object qty) {
    return '$qty ತಿರಸ್ಕೃತ ಎಂದು ದಾಖಲಾಗಿದೆ';
  }

  @override
  String rejectMaxHint(Object qty) {
    return '$qty ವರೆಗೆ ಸ್ವೀಕರಿಸಲಾಗಿದೆ';
  }

  @override
  String get rejectNeedsReason => 'ಹಾಲಿನಲ್ಲಿ ಏನು ತೊಂದರೆ ಎಂದು ಬರೆಯಿರಿ';

  @override
  String get rejectNotAccepted => 'ಸ್ವೀಕರಿಸಿಲ್ಲ';

  @override
  String rejectedChip(Object qty) {
    return '$qty ತಿರಸ್ಕೃತ';
  }

  @override
  String get rejectUndo => 'ತಿರಸ್ಕಾರ ರದ್ದುಗೊಳಿಸಿ';

  @override
  String rejectUndoConfirm(Object qty) {
    return 'ತಿರಸ್ಕರಿಸಿದ $qty ಈ ಸಾಗಣೆಗೆ ಮರಳುತ್ತದೆ, ಮತ್ತು ಕಡಿತ ರದ್ದಾಗುತ್ತದೆ.';
  }

  @override
  String get rejectNoneTitle => 'ಯಾವುದೇ ಹಾಲು ತಿರಸ್ಕರಿಸಿಲ್ಲ';

  @override
  String rejectNoneSubtitle(Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ ಏನೂ ತಿರಸ್ಕೃತವಾಗಿಲ್ಲ';
  }

  @override
  String get rejectBySourceTitle => 'ಮೂಲದ ಪ್ರಕಾರ ತಿರಸ್ಕಾರ ಪ್ರಮಾಣ';

  @override
  String get rejectByReasonTitle => 'ಹಾಲು ಏಕೆ ತಿರಸ್ಕರಿಸಲಾಯಿತು';

  @override
  String rejectEventsLine(num count, Object qty) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ತಿರಸ್ಕಾರಗಳು',
      one: '$count ತಿರಸ್ಕಾರ',
    );
    return '$_temp0 · $qty';
  }

  @override
  String get rejectScope => 'ತಿರಸ್ಕಾರ';
}
