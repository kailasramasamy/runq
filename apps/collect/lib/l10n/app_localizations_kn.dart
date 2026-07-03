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
  String get collectReopen => 'ಮರು ತೆರೆಯಿರಿ';

  @override
  String get collectCloseBlockedPending =>
      'ಕೆಲವು ಸುರಿತಗಳು ಇನ್ನೂ ಸಿಂಕ್ ಆಗಿಲ್ಲ — ಸಿಂಕ್ ನಂತರ ಮುಚ್ಚಿ.';

  @override
  String get dispatchCloseFirst => 'ರವಾನಿಸುವ ಮೊದಲು ಈ ಪಾಳಿಯ ಸಂಗ್ರಹ ಮುಚ್ಚಿ.';

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
  String get homeRecentEntries => 'ಇತ್ತೀಚಿನ ನಮೂದುಗಳು';

  @override
  String get homeFarmers => 'ರೈತರು';

  @override
  String get homeHistory => 'ಇತಿಹಾಸ';

  @override
  String get homeReports => 'ವರದಿಗಳು';

  @override
  String get homeAmShiftInProgress => '☀️ ಬೆಳಿಗ್ಗೆ ಪಾಳಿ · ಪ್ರಗತಿಯಲ್ಲಿದೆ';

  @override
  String get homePmShiftInProgress => '☾ ಸಂಜೆ ಪಾಳಿ · ಪ್ರಗತಿಯಲ್ಲಿದೆ';

  @override
  String get homeJustNow => 'ಈಗಷ್ಟೇ';

  @override
  String get homeHeroToday => 'ಇಂದು';

  @override
  String get homeHeroTodayAm => 'ಇಂದು ☀️ ಬೆಳಿಗ್ಗೆ';

  @override
  String get homeHeroTodayPm => 'ಇಂದು ☾ ಸಂಜೆ';

  @override
  String homeFarmerCount(Object count) {
    return '$count ರೈತರು';
  }

  @override
  String homeShiftDone(Object shift, Object litres) {
    return '$shift ಮುಗಿದಿದೆ · $litres ಸಂಗ್ರಹ';
  }

  @override
  String get homeToDispatch => 'ರವಾನಿಸಬೇಕಾದದ್ದು';

  @override
  String get homeAllDispatched => 'ಎಲ್ಲವನ್ನೂ ರವಾನಿಸಲಾಗಿದೆ';

  @override
  String get homeNothingYet => 'ಇನ್ನೂ ಏನೂ ಇಲ್ಲ';

  @override
  String get homeCollected => 'ಸಂಗ್ರಹಿಸಲಾಗಿದೆ';

  @override
  String get homeBmcTank => 'BMC ತೊಟ್ಟಿ';

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
  String get dispatchContainerHint => 'ಕಂಟೇನರ್ ಸಂಖ್ಯೆ (ಐಚ್ಛಿಕ)';

  @override
  String get dispatchTankerButton => 'ಟ್ಯಾಂಕರ್ ರವಾನಿಸಿ';

  @override
  String get dispatchTodaysOutbound => 'ಇಂದಿನ ಹೊರಗಡೆ';

  @override
  String get dispatchNoDispatchesToday => 'ಇಂದು ರವಾನೆಗಳಿಲ್ಲ';

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
  String get dispatchStatusTransit => '⏳ ಸಾಗಣೆಯಲ್ಲಿ';

  @override
  String get dispatchStatusReceived => '✓ ಸ್ವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get dispatchAvailableToDispatch => 'ರವಾನಿಸಲು ಲಭ್ಯ';

  @override
  String dispatchCollectedDispatched(Object collected, Object dispatched) {
    return 'ಸಂಗ್ರಹಿಸಲಾಗಿದೆ $collected · ರವಾನಿಸಲಾಗಿದೆ $dispatched';
  }

  @override
  String get dispatchNoData => 'ಮಾಹಿತಿ ಇಲ್ಲ';

  @override
  String get dispatchShiftAm => '☀️ ಬೆಳಿಗ್ಗೆ';

  @override
  String get dispatchShiftPm => '☾ ಸಂಜೆ';

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
  String get reportsCouldNotLoadSummary => 'ಸಾರಾಂಶ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get reportsNoCollectionToday => 'ಈ ದಿನಾಂಕದಂದು ಯಾವುದೇ ಸಂಗ್ರಹವಿಲ್ಲ';

  @override
  String get reportsTotalCollected => 'ಒಟ್ಟು ಸಂಗ್ರಹ';

  @override
  String get reportsTabSummary => 'ಸಾರಾಂಶ';

  @override
  String get reportsTabQc => 'ಗುಣಮಟ್ಟ';

  @override
  String reportsFarmersPoursStat(Object farmerCount, Object pourCount) {
    return '$farmerCount ರೈತರು · $pourCount ಸುರಿತಗಳು';
  }

  @override
  String get reportsStatAmLabel => '☀️ AM';

  @override
  String get reportsStatPmLabel => '☾ PM';

  @override
  String get reportsStatAvgFat => 'ಸರಾಸರಿ FAT';

  @override
  String get reportsStatAvgSnf => 'ಸರಾಸರಿ SNF';

  @override
  String get reportsStatAvgWater => 'ಸರಾಸರಿ Water %';

  @override
  String get reportsStatFarmers => 'ರೈತರು';

  @override
  String get reportsStatGross => 'ಒಟ್ಟು';

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
  String get farmerPaymentsGrossMilk => 'ಒಟ್ಟು ಹಾಲು';

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
}
