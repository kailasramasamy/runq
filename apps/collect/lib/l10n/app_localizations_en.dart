// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get navHome => 'Home';

  @override
  String get navCollect => 'Collect';

  @override
  String get navDispatch => 'Dispatch';

  @override
  String get navPayments => 'Payments';

  @override
  String get navProfile => 'Profile';

  @override
  String get commonLitres => 'Litres';

  @override
  String get commonSelectFarmer => 'Select farmer';

  @override
  String get commonMilkType => 'Milk type';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonNext => 'Next';

  @override
  String get commonToday => 'Today';

  @override
  String get milkTypeCowA1 => 'Cow A1 (regular)';

  @override
  String get milkTypeCowA2 => 'Cow A2 (desi)';

  @override
  String get milkTypeBuffalo => 'Buffalo';

  @override
  String get milkTypeMixed => 'Mixed';

  @override
  String get milkTypeCowLegacy => 'Cow (legacy)';

  @override
  String get recordCollectionTitle => 'Record Collection';

  @override
  String get editCollectionTitle => 'Edit Collection';

  @override
  String collectAlreadyRecorded(String shift) {
    return 'Already recorded this $shift shift';
  }

  @override
  String collectReplaceOrAdd(String name) {
    return 'Replace it (correction) or add another lot for $name?';
  }

  @override
  String get collectReplace => 'Replace';

  @override
  String get collectAddLot => 'Add lot';

  @override
  String get collectSavedOnDevice => 'Saved on device · will sync';

  @override
  String get collectComputingRate => 'Computing rate…';

  @override
  String get collectEnterClrPreview => 'Enter CLR to preview the rate';

  @override
  String get collectEnterFatSnfPreview => 'Enter FAT & SNF to preview the rate';

  @override
  String get collectRateOnSync => 'Rate computed on sync';

  @override
  String collectTodaysEntries(int count) {
    return 'Today\'s entries ($count)';
  }

  @override
  String get collectSaveAndNext => 'Save & next';

  @override
  String get historyLoadError => 'Could not load history';

  @override
  String get historyByDay => 'By day';

  @override
  String get historyByFarmer => 'By farmer';

  @override
  String get historyAll => 'All';

  @override
  String get historyNoHistory => 'No collection history';

  @override
  String get historyNoHistorySubtitle =>
      'Recorded collections from the last 30 days appear here';

  @override
  String get historyNoFarmersMatch => 'No farmers match';

  @override
  String get historyNoFarmersMatchSubtitle => 'Try another name';

  @override
  String get historySearchFarmer => 'Search farmer';

  @override
  String get historyFarmerFallback => 'Farmer';

  @override
  String historyDaySubtitle(int count, String pm, String am) {
    return '$count farmers · 🌙 $pm · ☀️ $am';
  }

  @override
  String get pourDetailDeleteTitle => 'Delete entry?';

  @override
  String pourDetailDeleteContent(String qty, String name) {
    return 'Reverses $qty for $name. This cannot be undone.';
  }

  @override
  String get pourDetailFarmerFallback => 'this farmer';

  @override
  String get pourDetailDelete => 'Delete';

  @override
  String get pourDetailModify => 'Modify';

  @override
  String get pourDetailReversed => 'Reversed';

  @override
  String get pourDetailRatePerLitre => 'Rate / litre';

  @override
  String get pourDetailQuantity => 'Quantity';

  @override
  String get pourDetailMilkType => 'Milk type';

  @override
  String get pourDetailShift => 'Shift';

  @override
  String get pourDetailDate => 'Date';

  @override
  String get pourDetailAmount => 'Amount';

  @override
  String get shiftAm => 'AM';

  @override
  String get shiftPm => 'PM';

  @override
  String get shiftMorning => 'Morning';

  @override
  String get shiftEvening => 'Evening';

  @override
  String get shiftFarmerFallback => 'Farmer';

  @override
  String get profileMemberSince => 'Member since';

  @override
  String get profileCollectionCentre => 'Collection centre';

  @override
  String get profileBankPayout => 'Bank & payout';

  @override
  String get profileNotifications => 'Notifications';

  @override
  String get profileHelpSupport => 'Help & support';

  @override
  String get profileAbout => 'About';

  @override
  String get profileAppearance => 'APPEARANCE';

  @override
  String get profileThemeSystem => 'System default';

  @override
  String get profileThemeLight => 'Light';

  @override
  String get profileThemeDark => 'Dark';

  @override
  String get profileLogOut => 'Log out';

  @override
  String get homeRecentEntries => 'Recent entries';

  @override
  String get homeFarmers => 'Farmers';

  @override
  String get homeHistory => 'History';

  @override
  String get homeReports => 'Reports';

  @override
  String get homeAmShiftInProgress => '☀️ AM shift · in progress';

  @override
  String get homePmShiftInProgress => '🌙 PM shift · in progress';

  @override
  String get homeJustNow => 'just now';

  @override
  String get homeHeroToday => 'TODAY';

  @override
  String get homeHeroTodayAm => 'TODAY ☀️ AM';

  @override
  String get homeHeroTodayPm => 'TODAY 🌙 PM';

  @override
  String homeFarmerCount(Object count) {
    return '$count farmers';
  }

  @override
  String get homeToDispatch => 'To dispatch';

  @override
  String get homeAllDispatched => 'All dispatched';

  @override
  String get homeNothingYet => 'Nothing yet';

  @override
  String get homeCollected => 'Collected';

  @override
  String get homeBmcTank => 'BMC tank';

  @override
  String get homeLoadError => 'Could not load entries';

  @override
  String get homeNoCollectionToday => 'No collection yet today';

  @override
  String get homeNoCollectionSubtitle => 'Tap Record Collection to start';

  @override
  String get dispatchTitle => 'Dispatch';

  @override
  String get dispatchAvailability => 'Availability';

  @override
  String get dispatchToCollectionCentre => 'Dispatch to Collection Centre';

  @override
  String get dispatchQtyHint => 'Dispatch Qty (L)';

  @override
  String get dispatchContainerHint => 'Container No. (optional)';

  @override
  String get dispatchTankerButton => 'Dispatch Tanker';

  @override
  String get dispatchTodaysOutbound => 'Today\'s Outbound';

  @override
  String get dispatchNoDispatchesToday => 'No dispatches today';

  @override
  String get dispatchNoDispatchesSubtitle =>
      'Use the form above to dispatch a tanker';

  @override
  String get dispatchSelectDestination => 'Select destination centre…';

  @override
  String get dispatchSearchCentre => 'Search centre';

  @override
  String get dispatchNoCentresFound => 'No centres found';

  @override
  String get dispatchErrorNoDestination =>
      'Select a destination collection centre';

  @override
  String get dispatchErrorInvalidQty => 'Enter a valid dispatch quantity';

  @override
  String dispatchErrorOverQty(Object available) {
    return 'Only $available L available to dispatch';
  }

  @override
  String dispatchAmountDispatched(Object amount) {
    return '$amount dispatched';
  }

  @override
  String get dispatchNothingLeft => 'Nothing left to dispatch.';

  @override
  String get dispatchNothingLeftThisShift =>
      'Nothing left to dispatch this shift.';

  @override
  String dispatchContainerLabel(Object no) {
    return 'Container $no';
  }

  @override
  String get dispatchNoContainerNo => 'No container no.';

  @override
  String get dispatchStatusTransit => '⏳ transit';

  @override
  String get dispatchStatusReceived => '✓ received';

  @override
  String get dispatchAvailableToDispatch => 'Available to dispatch';

  @override
  String dispatchCollectedDispatched(Object collected, Object dispatched) {
    return 'Collected $collected · Dispatched $dispatched';
  }

  @override
  String get dispatchNoData => 'No data';

  @override
  String get dispatchShiftAm => '☀️ AM';

  @override
  String get dispatchShiftPm => '🌙 PM';

  @override
  String get paymentsCouldNotLoadCycles => 'Could not load cycles';

  @override
  String get paymentsStartNewCycle => 'Start new cycle';

  @override
  String get paymentsNoCyclesTitle => 'No cycles yet';

  @override
  String get paymentsNoCyclesSubtitle =>
      'Start a cycle to pay farmers for a period';

  @override
  String get paymentsCyclesDisbursements => 'Cycles & farmer disbursements';

  @override
  String get paymentsCyclesTitle => 'Cycles';

  @override
  String get paymentsPendingToPayLabel => 'Pending to pay';

  @override
  String paymentsPendingFarmersSub(Object farmers, Object open) {
    return '$farmers farmers · $open open';
  }

  @override
  String get paymentsPaidLabel => 'Paid';

  @override
  String paymentsPaidCyclesSub(Object count) {
    return 'across $count cycles';
  }

  @override
  String get paymentsCycleStatusOpen => 'Open';

  @override
  String get paymentsCycleStatusLocked => 'Locked';

  @override
  String get paymentsCycleStatusPaid => 'Paid';

  @override
  String get paymentsCycleStatusReversed => 'Reversed';

  @override
  String get paymentsNetLabel => 'net';

  @override
  String paymentsFarmerCount(Object count) {
    return '$count farmers';
  }

  @override
  String paymentsPaidCount(Object paid, Object total) {
    return '$paid/$total paid';
  }

  @override
  String paymentsAmountPending(Object amount) {
    return '$amount pending';
  }

  @override
  String get paymentsSelectPeriod => 'Select period';

  @override
  String get paymentsCouldNotLoadPeriods => 'Could not load periods';

  @override
  String get paymentsPeriodInProgress => 'in progress';

  @override
  String get paymentsPeriodClosed => 'closed';

  @override
  String get farmersAddFarmer => 'Add Farmer';

  @override
  String get farmersSearchHint => 'Search by name or code';

  @override
  String get farmersCouldNotLoad => 'Could not load farmers';

  @override
  String get farmersEmptyTitle => 'No farmers registered';

  @override
  String get farmersNoMatchTitle => 'No matching farmers';

  @override
  String get farmersEmptySubtitle =>
      'Farmers registered at this VMCC appear here';

  @override
  String get farmerDetailEditTooltip => 'Edit farmer';

  @override
  String get farmerDetailTabDetails => 'Details';

  @override
  String get farmerDetailTabPours => 'Pours';

  @override
  String get farmerDetailTabPayments => 'Payments';

  @override
  String get farmerDetailStatusActive => 'Active';

  @override
  String get farmerDetailStatusInactive => 'Inactive';

  @override
  String get farmerDetailPhone => 'Phone';

  @override
  String get farmerDetailContact => 'Contact';

  @override
  String get farmerDetailVillage => 'Village';

  @override
  String get farmerDetailAddress => 'Address';

  @override
  String get farmerDetailGps => 'GPS';

  @override
  String get farmerDetailLocation => 'Location';

  @override
  String get farmerDetailTotalCattle => 'Total cattle';

  @override
  String get farmerDetailCurrentlyMilking => 'Currently milking';

  @override
  String get farmerDetailHerd => 'Herd';

  @override
  String get farmerDetailAadhaar => 'Aadhaar';

  @override
  String get farmerDetailIdentity => 'Identity';

  @override
  String get farmerDetailBankName => 'Bank name';

  @override
  String get farmerDetailAccountNumber => 'Account number';

  @override
  String get farmerDetailIfsc => 'IFSC';

  @override
  String get farmerDetailUpiId => 'UPI ID';

  @override
  String get farmerDetailPayment => 'Payment';

  @override
  String get farmerDetailNotProvided => 'Not provided';

  @override
  String get farmerPoursLoadError => 'Could not load pours';

  @override
  String get farmerPoursEmptyTitle => 'No recent pours';

  @override
  String get farmerPoursEmptySubtitle =>
      'No pours in the last 30 days. Share a past cycle statement above.';

  @override
  String farmerPoursCount(Object count) {
    return '$count pours';
  }

  @override
  String get farmerPours30DayTotal => '30-day total';

  @override
  String get farmerPaymentsAddEntry => 'Add entry';

  @override
  String get farmerPaymentsAmountHint => 'Amount (₹)';

  @override
  String get farmerPaymentsRecordEntry => 'Record entry';

  @override
  String get farmerPaymentsHistory => 'History';

  @override
  String get farmerPaymentsLoadError => 'Could not load ledger';

  @override
  String get farmerPaymentsOutstanding => 'Outstanding';

  @override
  String get farmerPaymentsInvalidAmount => 'Enter a valid amount';

  @override
  String get farmerPaymentsNoEntries => 'No entries yet';

  @override
  String get farmerPaymentsTypeAdvance => 'Advance';

  @override
  String get farmerPaymentsFeedLoan => 'Feed loan';

  @override
  String get farmerPaymentsRepayment => 'Repayment';

  @override
  String get farmerPaymentsAgainstAdvance => 'Against advance';

  @override
  String get farmerPaymentsAgainstFeedLoan => 'Against feed loan';

  @override
  String get farmerPaymentsAdvanceGiven => 'Advance given';

  @override
  String get farmerPaymentsFeedLoanGiven => 'Feed loan given';

  @override
  String get farmerPaymentsRepaymentLabel => 'Repayment';

  @override
  String get farmerPaymentsAdjustment => 'Adjustment';

  @override
  String get addFarmerAddTitle => 'Add Farmer';

  @override
  String get addFarmerEditTitle => 'Edit Farmer';

  @override
  String get addFarmerCamera => 'Camera';

  @override
  String get addFarmerGallery => 'Gallery';

  @override
  String get addFarmerNameRequired => 'Name is required';

  @override
  String get addFarmerAadhaarLength => 'Aadhaar must be exactly 12 digits';

  @override
  String get addFarmerLocationPermissionDenied => 'Location permission denied';

  @override
  String addFarmerRegisteredToast(Object name) {
    return '$name registered';
  }

  @override
  String addFarmerUpdatedToast(Object name) {
    return '$name updated';
  }

  @override
  String get addFarmerSaveChanges => 'Save Changes';

  @override
  String get addFarmerRegisterFarmer => 'Register Farmer';

  @override
  String get addFarmerSectionBasics => 'Basics';

  @override
  String get addFarmerFieldFullName => 'Full Name *';

  @override
  String get addFarmerFieldPhoneNumber => 'Phone Number';

  @override
  String get addFarmerFieldDobHint =>
      'Date of Birth (optional — enables app login)';

  @override
  String get addFarmerSectionLocation => 'Location';

  @override
  String get addFarmerFieldVillage => 'Village';

  @override
  String get addFarmerFieldAddress => 'Address';

  @override
  String get addFarmerGettingLocation => 'Getting location…';

  @override
  String get addFarmerCaptureGps => 'Capture GPS location';

  @override
  String get addFarmerSectionIdentity => 'Identity';

  @override
  String get addFarmerPhotoAdded => 'Profile photo added';

  @override
  String get addFarmerPhotoAdd => 'Add profile photo';

  @override
  String get addFarmerPhotoTapToChange => 'Tap to change';

  @override
  String get addFarmerPhotoHint => 'Take a photo or pick from gallery';

  @override
  String get addFarmerFieldAadhaar => 'Aadhaar Number';

  @override
  String get addFarmerFieldKyc => 'KYC Document';

  @override
  String get addFarmerFieldKycAdded => 'KYC Document added';

  @override
  String get addFarmerSectionPayment => 'Payment';

  @override
  String get addFarmerFieldBankName => 'Bank Name';

  @override
  String get addFarmerFieldAccountHolderName => 'Account Holder Name';

  @override
  String get addFarmerFieldAccountNumber => 'Account Number';

  @override
  String get addFarmerFieldIfscCode => 'IFSC Code';

  @override
  String get addFarmerFieldUpiId => 'UPI ID';

  @override
  String get herdSectionTitle => 'Herd';

  @override
  String herdTotalHead(Object count) {
    return '$count head';
  }

  @override
  String get herdMilkType => 'Milk type';

  @override
  String get herdCattleBreeds => 'Cattle breeds';

  @override
  String get herdNoBreedsYet => 'No breeds added yet.';

  @override
  String get herdAddBreed => 'Add breed';

  @override
  String get herdInMilkCount => 'Currently milking count';

  @override
  String get herdBreedLabel => 'Breed';

  @override
  String get herdQtyHint => 'Qty';

  @override
  String get herdBreedDesiNatti => 'Desi / Natti';

  @override
  String get herdBreedCrossbred => 'Crossbred';

  @override
  String get herdBreedJersey => 'Jersey';

  @override
  String get herdBreedHf => 'HF';

  @override
  String get herdBreedGir => 'Gir';

  @override
  String get herdBreedSahiwal => 'Sahiwal';

  @override
  String get herdBreedMurrah => 'Murrah';

  @override
  String get herdBreedOther => 'Other';

  @override
  String get reportsTodaysCollection => 'Today\'s Collection';

  @override
  String get reportsCouldNotLoadSummary => 'Could not load summary';

  @override
  String get reportsNoCollectionToday => 'No collection today';

  @override
  String get reportsTotalCollected => 'Total collected';

  @override
  String reportsFarmersPoursStat(Object farmerCount, Object pourCount) {
    return '$farmerCount farmers · $pourCount pours';
  }

  @override
  String get reportsStatAmLabel => '☀️ AM';

  @override
  String get reportsStatPmLabel => '🌙 PM';

  @override
  String get reportsStatAvgFat => 'Avg FAT';

  @override
  String get reportsStatAvgSnf => 'Avg SNF';

  @override
  String get reportsStatFarmers => 'Farmers';

  @override
  String get reportsStatGross => 'Gross';

  @override
  String get cycleCycle => 'Cycle';

  @override
  String get cycleCouldNotLoad => 'Could not load cycle';

  @override
  String get cycleNotFound => 'Cycle not found';

  @override
  String get cycleNoLines => 'No lines in this cycle';

  @override
  String get cycleNoFarmersMatch => 'No farmers match';

  @override
  String get cycleNetPayable => 'NET PAYABLE';

  @override
  String cyclePaidLegend(Object amount, Object paid, Object total) {
    return '$amount paid · $paid/$total';
  }

  @override
  String get cycleMarkAllPaid => 'Mark all paid';

  @override
  String get cycleMarkAllUnpaid => 'Mark all unpaid';

  @override
  String get cycleFilterAll => 'All';

  @override
  String get cycleFilterUnpaid => 'Unpaid';

  @override
  String get cycleFilterPaid => 'Paid';

  @override
  String get cycleLockTitle => 'Lock cycle?';

  @override
  String get cycleLockContent =>
      'Locking freezes totals and posts loan repayments. You can pay after.';

  @override
  String get cyclePayTitle => 'Pay cycle?';

  @override
  String get cyclePayContent =>
      'This posts payments for every farmer and cannot be undone.';

  @override
  String get cycleLockAction => 'Lock';

  @override
  String get cyclePayAction => 'Pay';

  @override
  String get cycleLockCycle => 'Lock cycle';

  @override
  String get cyclePayCycle => 'Pay cycle';

  @override
  String get farmerHistoryNoPoursSubtitle =>
      'This farmer has no recorded pours in the last 30 days';

  @override
  String get ledgerEditDetails => 'Edit details';

  @override
  String get ledgerAddEntry => 'Add entry';

  @override
  String get ledgerAmountHint => 'Amount (₹)';

  @override
  String get ledgerInvalidAmount => 'Enter a valid amount';

  @override
  String get ledgerRecordEntry => 'Record entry';

  @override
  String get ledgerHistory => 'History';

  @override
  String get ledgerLoadError => 'Could not load ledger';

  @override
  String get ledgerOutstanding => 'Outstanding';

  @override
  String get ledgerNoEntries => 'No entries yet';

  @override
  String get ledgerEntryAdvance => 'Advance';

  @override
  String get ledgerEntryFeedLoan => 'Feed loan';

  @override
  String get ledgerEntryRepayment => 'Repayment';

  @override
  String get ledgerAgainstAdvance => 'Against advance';

  @override
  String get ledgerAgainstFeedLoan => 'Against feed loan';

  @override
  String get ledgerHistoryAdvanceGiven => 'Advance given';

  @override
  String get ledgerHistoryFeedLoanGiven => 'Feed loan given';

  @override
  String get ledgerHistoryRepayment => 'Repayment';

  @override
  String get ledgerHistoryAdjustment => 'Adjustment';

  @override
  String get statementNoCycles => 'No cycles available';

  @override
  String get statementSelectCycle => 'Select cycle';

  @override
  String statementGenerateError(Object error) {
    return 'Could not generate statement: $error';
  }

  @override
  String get statementPreparing => 'Preparing…';

  @override
  String get statementShareButton => 'Share cycle statement';

  @override
  String get pickerSearchHint => 'Search farmer by name or code';

  @override
  String get pickerLoadError => 'Could not load farmers';

  @override
  String get pickerNoMatch => 'No matching farmers';

  @override
  String get addFarmerNativeNameLabel => 'Name (regional script)';

  @override
  String get addFarmerNativeNameHint =>
      'Auto-filled from the name above — edit if needed';

  @override
  String get voiceMicNeededTitle => 'Microphone access needed';

  @override
  String get voiceMicNeededBody =>
      'To dictate by voice, allow Microphone and Speech Recognition for this app, then come back and tap the mic again.';

  @override
  String get voiceOpenSettings => 'Open Settings';

  @override
  String get voiceSpeakNow => 'Speak now';

  @override
  String get voiceListening => 'Listening…';

  @override
  String get voiceTapToSpeak => 'Tap the mic and speak';

  @override
  String get voiceNoSpeech => 'Didn\'t catch that — tap the mic to try again';

  @override
  String get voiceDone => 'Done';
}
