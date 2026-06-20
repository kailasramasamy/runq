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
  String collectReplaceOrAdd(String name) {
    return '$name ಗಾಗಿ ಅದನ್ನು ಬದಲಾಯಿಸುವುದೇ (ತಿದ್ದುಪಡಿ) ಅಥವಾ ಇನ್ನೊಂದು ಲಾಟ್ ಸೇರಿಸುವುದೇ?';
  }

  @override
  String get collectReplace => 'ಬದಲಾಯಿಸಿ';

  @override
  String get collectAddLot => 'ಲಾಟ್ ಸೇರಿಸಿ';

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
  String get collectSaveAndNext => 'ಉಳಿಸಿ & ಮುಂದೆ';

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
    return '$count ರೈತರು · 🌙 $pm · ☀️ $am';
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
  String get homePmShiftInProgress => '🌙 ಸಂಜೆ ಪಾಳಿ · ಪ್ರಗತಿಯಲ್ಲಿದೆ';

  @override
  String get homeJustNow => 'ಈಗಷ್ಟೇ';

  @override
  String get homeHeroToday => 'ಇಂದು';

  @override
  String get homeHeroTodayAm => 'ಇಂದು ☀️ ಬೆಳಿಗ್ಗೆ';

  @override
  String get homeHeroTodayPm => 'ಇಂದು 🌙 ಸಂಜೆ';

  @override
  String homeFarmerCount(Object count) {
    return '$count ರೈತರು';
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
  String get dispatchShiftPm => '🌙 ಸಂಜೆ';

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
  String get reportsTodaysCollection => 'ಇಂದಿನ ಸಂಗ್ರಹ';

  @override
  String get reportsCouldNotLoadSummary => 'ಸಾರಾಂಶ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ';

  @override
  String get reportsNoCollectionToday => 'ಇಂದು ಯಾವುದೇ ಸಂಗ್ರಹವಿಲ್ಲ';

  @override
  String get reportsTotalCollected => 'ಒಟ್ಟು ಸಂಗ್ರಹ';

  @override
  String reportsFarmersPoursStat(Object farmerCount, Object pourCount) {
    return '$farmerCount ರೈತರು · $pourCount ಸುರಿತಗಳು';
  }

  @override
  String get reportsStatAmLabel => '☀️ AM';

  @override
  String get reportsStatPmLabel => '🌙 PM';

  @override
  String get reportsStatAvgFat => 'ಸರಾಸರಿ FAT';

  @override
  String get reportsStatAvgSnf => 'ಸರಾಸರಿ SNF';

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
}
