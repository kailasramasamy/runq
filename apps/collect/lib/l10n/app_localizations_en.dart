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
  String collectReplaceOrCombine(String name) {
    return 'Replace it (correction) or combine as another container for $name?';
  }

  @override
  String collectCombineResult(String total) {
    return 'Combined total: $total';
  }

  @override
  String get collectReplace => 'Replace';

  @override
  String get collectCombine => 'Combine';

  @override
  String get collectAddMoreMilk => 'Add more milk';

  @override
  String get collectCansTotal => 'Total';

  @override
  String collectCanN(int n, String qty) {
    return 'Can $n · $qty';
  }

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
  String collectEntries(int count) {
    return 'Entries ($count)';
  }

  @override
  String get collectSaveAndNext => 'Save & next';

  @override
  String collectCloseShift(String shift) {
    return 'Close $shift collection';
  }

  @override
  String get collectCloseDay => 'Close today\'s collection';

  @override
  String collectClosedBanner(String shift) {
    return '$shift collection is closed — ready to dispatch.';
  }

  @override
  String get collectDayClosedBanner =>
      'Today\'s collection is closed — ready to dispatch.';

  @override
  String get collectClosedAction => 'Collection closed';

  @override
  String get collectReopen => 'Reopen';

  @override
  String get collectDispatchNow => 'Dispatch now';

  @override
  String get collectCloseBlockedPending =>
      'Some pours haven\'t synced yet — wait for sync, then close.';

  @override
  String get dispatchCloseFirst =>
      'Close collection for this shift before dispatching.';

  @override
  String dispatchPendingTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count dispatches pending',
      one: '$count dispatch pending',
    );
    return '$_temp0';
  }

  @override
  String dispatchPendingOldest(String slot, String qty) {
    return 'Oldest: $slot · $qty';
  }

  @override
  String get pendingWorkCloseScreenTitle => 'Collections to close';

  @override
  String get pendingWorkDispatchScreenTitle => 'Dispatches pending';

  @override
  String get pendingWorkEmpty => 'Nothing pending';

  @override
  String get pendingWorkEmptySubtitle => 'All collected milk has moved on';

  @override
  String pendingWorkDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days days ago',
      one: '$days day ago',
    );
    return '$_temp0';
  }

  @override
  String get dispatchUntypedTitle => 'Milk type not recorded';

  @override
  String get dispatchUntypedHint => 'Name the type before sending this on';

  @override
  String get dispatchErrorTypeNotChosen =>
      'Choose the milk type for the untyped leg.';

  @override
  String dispatchPendingCloseTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count collections to close',
      one: '$count collection to close',
    );
    return '$_temp0';
  }

  @override
  String get dispatchCloseFirstDay =>
      'Close today\'s collection before dispatching.';

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
    return '$count farmers · ☾ $pm · ☀️ $am';
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
  String ppHomeTankersToReceive(num count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.compact(
      locale: localeName,
    );
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString tankers to receive',
      one: '1 tanker to receive',
    );
    return '$_temp0';
  }

  @override
  String ccReceivePoolWaitsForMorning(String date) {
    return 'Evening milk leaves with the next morning\'s collection. Close and dispatch this pool on $date.';
  }

  @override
  String get consignmentSlotPooled => 'Pooled';

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
  String get profileDeleteAccount => 'Delete account';

  @override
  String get profileDeleteAccountTitle => 'Delete account?';

  @override
  String get profileDeleteAccountBody =>
      'This permanently deletes your account and personal details. Your milk collection and payment records stay in the dairy\'s books. This can\'t be undone.';

  @override
  String get profileDeleteAccountConfirm => 'Delete account';

  @override
  String get profileDeleteAccountError =>
      'Couldn\'t delete your account. Please try again.';

  @override
  String get homeRecentEntries => 'Recent entries';

  @override
  String get homeFarmers => 'Farmers';

  @override
  String get homeHistory => 'History';

  @override
  String get homeReports => 'Reports';

  @override
  String farmerRateSpeakCoach(Object metric, Object value, Object extra) {
    return 'If your $metric reaches $value, you earn $extra rupees more per litre.';
  }

  @override
  String get helpTitle => 'Help & support';

  @override
  String get helpCallSupport => 'Call support';

  @override
  String get helpEmailSupport => 'Email support';

  @override
  String get helpWhatsApp => 'Chat on WhatsApp';

  @override
  String get helpReplySoon => 'We usually reply within a few hours.';

  @override
  String get helpNoContacts =>
      'Support contacts have not been set up yet — please ask your dairy administrator.';

  @override
  String get helpCouldNotOpen => 'Could not open';

  @override
  String get faqFarmerQ1 => 'Where do I see my milk entries?';

  @override
  String get faqFarmerA1 =>
      'The Collections tab lists every pour with its quantity and quality readings, day by day.';

  @override
  String get faqFarmerQ2 => 'How is my rate decided?';

  @override
  String get faqFarmerA2 =>
      'Open Rate chart from Home — your FAT and SNF (or CLR) readings decide the price per litre.';

  @override
  String get faqFarmerQ3 => 'When will I be paid?';

  @override
  String get faqFarmerA3 =>
      'Payments follow your dairy\'s payout cycle. The Payments tab shows the current cycle and what\'s payable.';

  @override
  String get faqOperatorQ1 => 'How do I record a collection?';

  @override
  String get faqOperatorA1 =>
      'Tap Collect in the bottom bar, pick the farmer, then enter quantity, FAT and SNF.';

  @override
  String get faqOperatorQ2 => 'When are payouts settled?';

  @override
  String get faqOperatorA2 =>
      'Payouts follow your centre\'s cycle. Check the Payments tab for the current cycle window.';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonErrorTitle => 'Couldn\'t load your data';

  @override
  String get commonErrorSubtitle =>
      'Please check your connection and try again.';

  @override
  String get commonOfflineSaved => 'Offline — showing saved data';

  @override
  String get shiftNotRecorded => 'Not recorded';

  @override
  String get syncSyncedLabel => 'Synced';

  @override
  String syncSyncedAgoLabel(Object ago) {
    return 'Synced $ago';
  }

  @override
  String syncToSendLabel(Object count) {
    return '$count to send';
  }

  @override
  String get syncOfflineLabel => 'Offline — saved on device';

  @override
  String get notifScreenTitle => 'Notifications';

  @override
  String get notifPushTitle => 'Push notifications';

  @override
  String get notifPushSubtitle =>
      'Get alerts for collections, dispatch and payouts';

  @override
  String get notifPushFootnote =>
      'When off, this device won\'t receive any push notifications. You can turn it back on anytime.';

  @override
  String farmerRateEffectiveFrom(Object date) {
    return 'From $date';
  }

  @override
  String get errorOffline =>
      'No internet — check your connection and try again.';

  @override
  String get errorTimeout => 'Request timed out — try again.';

  @override
  String get errorGeneric => 'Something went wrong — try again.';

  @override
  String get syncSheetTitle => 'Entries on this device';

  @override
  String syncSheetCounts(Object pending, Object failed) {
    return '$pending waiting · $failed failed';
  }

  @override
  String get syncSheetAllClear => 'Everything is synced.';

  @override
  String get syncRetry => 'Retry';

  @override
  String get syncDelete => 'Delete';

  @override
  String get syncDeleteConfirmTitle => 'Delete this entry?';

  @override
  String get syncDeleteConfirmBody =>
      'This pour was never sent to the server. Deleting it removes it permanently — the farmer will not be paid for it.';

  @override
  String get syncSyncNow => 'Sync now';

  @override
  String get pendingSavingPill => 'Saving…';

  @override
  String get pendingFailedPill => 'Failed';

  @override
  String get collectCorrectionNeedsConnection =>
      'Corrections need a connection — try again when online.';

  @override
  String get profileLogOutConfirmTitle => 'Log out?';

  @override
  String get profileLogOutConfirmBody =>
      'You\'ll need to sign in again with an OTP sent to your phone.';

  @override
  String get collectImplausibleTitle => 'Unusually high values';

  @override
  String collectImplausibleBody(Object values) {
    return '$values — is this correct?';
  }

  @override
  String get collectSaveAnyway => 'Save anyway';

  @override
  String get collectPendingDupTitle => 'Already saved on this device';

  @override
  String collectPendingDupBody(Object name) {
    return '$name already has an entry for this shift waiting to sync. Replace it, or add this as an extra container?';
  }

  @override
  String get collectPendingDupReplace => 'Replace saved entry';

  @override
  String get collectPendingDupExtraLot => 'Add as extra lot';

  @override
  String syncFailedLabel(Object count) {
    return '$count failed — needs attention';
  }

  @override
  String get homeSeeFullHistory => 'See full history';

  @override
  String get homeAmShiftInProgress => 'AM shift · in progress';

  @override
  String get homePmShiftInProgress => 'PM shift · in progress';

  @override
  String get homeJustNow => 'just now';

  @override
  String get homeHeroToday => 'TODAY';

  @override
  String get homeHeroTotalToday => 'Total today';

  @override
  String get homeShiftNotStarted => 'Not started';

  @override
  String get homeShiftCollecting => 'Collection active';

  @override
  String get homeShiftToDispatch => 'To dispatch';

  @override
  String get homeShiftInTransit => 'In transit';

  @override
  String get homeShiftAtCc => 'Received at CC';

  @override
  String homeFarmerCount(Object count) {
    return '$count farmers';
  }

  @override
  String get homeAllDispatched => 'All dispatched';

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
  String get dispatchErrorNoTypeSelected =>
      'Select at least one milk type to dispatch.';

  @override
  String dispatchTankerButtonMulti(int count) {
    return 'Dispatch $count loads';
  }

  @override
  String get dispatchTypeHeldBack => 'Held back for a later dispatch';

  @override
  String get dispatchContainerHint => 'Container No. (optional)';

  @override
  String get dispatchTankerButton => 'Dispatch Tanker';

  @override
  String get dispatchTodaysOutbound => 'Today\'s Outbound';

  @override
  String get dispatchNoDispatchesToday => 'No dispatches today';

  @override
  String dispatchOutboundOn(String date) {
    return 'Outbound · $date';
  }

  @override
  String dispatchNoDispatchesOn(String date) {
    return 'No dispatches on $date';
  }

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
  String get dispatchStatusTransit => 'transit';

  @override
  String get dispatchStatusReceived => 'received';

  @override
  String get dispatchAvailableToDispatch => 'Available to dispatch';

  @override
  String dispatchCollectedDispatched(Object collected, Object dispatched) {
    return 'Collected $collected · Dispatched $dispatched';
  }

  @override
  String get dispatchNoData => 'No data';

  @override
  String get dispatchShiftAm => 'AM';

  @override
  String get dispatchShiftPm => 'PM';

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
  String payoutsLatestCycle(Object period) {
    return 'Latest cycle · $period';
  }

  @override
  String get payoutsLoadError => 'Could not load payouts';

  @override
  String get payoutsCycleHistory => 'Cycle history';

  @override
  String get payoutLineQty => 'Milk supplied';

  @override
  String get payoutLineGross => 'Gross';

  @override
  String get payoutLineBonus => 'Quality bonus';

  @override
  String get payoutLineDeductions => 'Deductions';

  @override
  String get payoutLineOtherDeduction => 'Other deduction';

  @override
  String get payoutLineStatementNo => 'Statement';

  @override
  String payoutLinePaidOn(Object date) {
    return 'Paid on $date';
  }

  @override
  String get payoutLineNotPaid => 'Not paid yet';

  @override
  String get payoutLineMarkPaid => 'Mark as paid';

  @override
  String get payoutLineMarkUnpaid => 'Mark as unpaid';

  @override
  String get payoutsEmptyTitle => 'No payouts yet';

  @override
  String get payoutsEmptySubtitle =>
      'Payouts appear here once a cycle covers this farmer';

  @override
  String payoutsEarnedLabel(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count cycles',
      one: '$count cycle',
    );
    return 'Earned · $_temp0';
  }

  @override
  String payoutsPaidAmount(Object amount) {
    return '$amount paid';
  }

  @override
  String payoutsDueAmount(Object amount) {
    return '$amount due';
  }

  @override
  String get payoutsCycleFallback => 'Cycle';

  @override
  String payoutsGrossLessDeductions(Object gross, Object deductions) {
    return '$gross gross − $deductions deducted';
  }

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
  String get reportsTabQc => 'QC';

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
  String get statementDownloadButton => 'Download cycle statement';

  @override
  String get statementViewerTitle => 'Cycle statement';

  @override
  String get pickerSearchHint => 'Search farmer by name or code';

  @override
  String get pickerLoadError => 'Could not load farmers';

  @override
  String get pickerNoMatch => 'No matching farmers';

  @override
  String get pickerRecorded => 'Recorded';

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

  @override
  String get addFarmerScanAadhaar => 'Scan Aadhaar to auto-fill';

  @override
  String get addFarmerScanning => 'Reading Aadhaar…';

  @override
  String get addFarmerScanFilled => 'Details filled — please review';

  @override
  String get addFarmerScanFailed =>
      'Couldn\'t read the card — try a clearer photo';

  @override
  String get addFarmerScanFront => 'Front side';

  @override
  String get addFarmerScanFrontHint => 'Name, number';

  @override
  String get addFarmerScanBack => 'Back side';

  @override
  String get addFarmerScanBackHint => 'Address';

  @override
  String get photoSourceTitle => 'Add photo';

  @override
  String get farmerPhotoUpdated => 'Profile photo updated';

  @override
  String get farmerPhotoFailed => 'Couldn\'t update photo. Please try again.';

  @override
  String get navCollections => 'Collections';

  @override
  String get navServices => 'Services';

  @override
  String get farmerHomeGoodMorning => 'Good morning';

  @override
  String get farmerHomeGoodAfternoon => 'Good afternoon';

  @override
  String get farmerHomeGoodEvening => 'Good evening';

  @override
  String get farmerHomeNoNotifications => 'No new notifications';

  @override
  String get farmerHomeThisCycle => 'THIS CYCLE';

  @override
  String farmerHomeHeroPours(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count pours',
      one: '$count pour',
    );
    return '$_temp0';
  }

  @override
  String farmerHomeHeroListenSpeak(String litres, String rupees) {
    return 'This cycle, $litres litres, $rupees rupees';
  }

  @override
  String get farmerHomeHeroListenLabel => 'Listen';

  @override
  String farmerHomeProjection(String amount) {
    return 'On track for ~$amount this cycle';
  }

  @override
  String get farmerHomeEmptyTitle => 'No pours yet this cycle';

  @override
  String get farmerHomeEmptySubtitle =>
      'Your collections will appear here once recorded at the centre.';

  @override
  String get farmerHomeRefresh => 'Refresh';

  @override
  String farmerHomeTodayCollected(String litres) {
    return '$litres L collected';
  }

  @override
  String get farmerHomeNudgeImproved =>
      'Great work — keep the feed and routine going.';

  @override
  String get farmerHomeNudgeFatDown =>
      'Often feed quality or late lactation. Check feed and clean water, or ask your vet.';

  @override
  String get farmerHomeNudgeSnfDown =>
      'Often nutrition or water. Check feed and clean water, or ask your vet.';

  @override
  String farmerHomeNudgeTitle(String metric, String direction, String delta) {
    return '$metric $direction $delta this week';
  }

  @override
  String get farmerHomeNudgeUp => 'up';

  @override
  String get farmerHomeNudgeDown => 'down';

  @override
  String farmerHomeStreakTitle(int streak) {
    String _temp0 = intl.Intl.pluralLogic(
      streak,
      locale: localeName,
      other: '$streak-day quality streak',
      one: '$streak-day quality streak',
    );
    return '$_temp0';
  }

  @override
  String get farmerHomeStreakBonusUnlocked => 'Bonus unlocked — keep it going!';

  @override
  String farmerHomeStreakRemaining(int remaining) {
    String _temp0 = intl.Intl.pluralLogic(
      remaining,
      locale: localeName,
      other: '$remaining more Grade-A days to unlock a bonus',
      one: '$remaining more Grade-A day to unlock a bonus',
    );
    return '$_temp0';
  }

  @override
  String get farmerHomeRateChart => 'Rate Chart';

  @override
  String get farmerHomeRewards => 'Rewards';

  @override
  String get farmerHomeQuality => 'Quality';

  @override
  String get farmerQcTitle => 'My quality';

  @override
  String farmerQcHeroLabel(int days) {
    return 'MY QUALITY · LAST $days DAYS';
  }

  @override
  String get farmerQcFooter => 'Averaged by the litres you poured';

  @override
  String get farmerQcEmptySubtitle => 'Pour milk to see your quality trend';

  @override
  String get farmerCollectionsTitle => 'Collections';

  @override
  String farmerCollectionsCyclePours(String scope, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count pours',
      one: '$count pour',
    );
    return '$scope · $_temp0';
  }

  @override
  String get farmerCollectionsDailyVolume => 'Daily volume';

  @override
  String farmerCollectionsAvgPerDay(String litres) {
    return '$litres L/day avg';
  }

  @override
  String get farmerCollectionsThisCycle => 'THIS CYCLE';

  @override
  String get farmerCollectionsPastCycles => 'PAST CYCLES';

  @override
  String get farmerCollectionsEmptyTitle => 'No collections this cycle';

  @override
  String get farmerCollectionsEmptySubtitle =>
      'Your daily pours will appear here once recorded.';

  @override
  String farmerCollectionsPastCycleSummary(String litres, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count pours',
      one: '$count pour',
    );
    return '$litres L · $_temp0';
  }

  @override
  String get farmerCollectionDetailTotal => 'TOTAL';

  @override
  String get farmerCollectionDetailGross => 'GROSS';

  @override
  String get farmerCollectionDetailNoCollection => 'No collection recorded';

  @override
  String get farmerCollectionDetailShift => 'Shift';

  @override
  String farmerCollectionDetailRatePerLitre(String rate) {
    return '@ $rate/L';
  }

  @override
  String get farmerPaymentsTitle => 'Payments';

  @override
  String get farmerPaymentsSubtitle => 'Transparent, every rupee accounted';

  @override
  String farmerPaymentsNetPayable(String cycle) {
    return 'NET PAYABLE · $cycle';
  }

  @override
  String farmerPaymentsListenSpeak(String rupees) {
    return 'Net payable this cycle, $rupees rupees';
  }

  @override
  String farmerPaymentsProjection(String amount) {
    return 'On track for ~$amount this cycle';
  }

  @override
  String get farmerPaymentsGrossMilk => 'Milk value (base)';

  @override
  String get farmerPaymentsEstimatedDeduction => 'Advance recovery (estimated)';

  @override
  String get farmerPaymentsStatusPending => 'PENDING';

  @override
  String get farmerPaymentsStatusProcessing => 'PROCESSING';

  @override
  String get farmerPaymentsQualityBonus => 'Quality bonus';

  @override
  String farmerPaymentsOutstandingAdvance(String amount) {
    return 'Outstanding advance: $amount';
  }

  @override
  String get farmerPaymentsHistoryHeader => 'PAYMENT HISTORY';

  @override
  String get farmerPaymentsPaid => 'PAID';

  @override
  String get farmerPaymentsDeductCattleFeedLoan => 'Cattle-feed loan';

  @override
  String get farmerPaymentsDeductAdvance => 'Advance';

  @override
  String get farmerPaymentsDeductMedicine => 'Medicine';

  @override
  String get farmerPaymentsDeductInsurance => 'Insurance';

  @override
  String farmerPaymentsHistorySummary(String litres, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count pours',
      one: '$count pour',
    );
    return '$litres L · $_temp0';
  }

  @override
  String get farmerRateChartTitle => 'Rate Chart';

  @override
  String get farmerRateShareTooltip => 'Share rate chart';

  @override
  String farmerRateShareError(Object error) {
    return 'Could not share rate chart: $error';
  }

  @override
  String get farmerRateListenSpeak => 'Your milk rate chart';

  @override
  String farmerRateListenSpeakWithRate(String rate) {
    return 'Your rate is $rate rupees per litre';
  }

  @override
  String get farmerRateEmptyTitle => 'No rate chart active';

  @override
  String get farmerRateEmptySubtitle => 'Contact your milk collection centre';

  @override
  String get farmerRateLastPourLabel => 'Your last pour';

  @override
  String get farmerRateMatrixTitle => 'Rate Matrix (₹/L)';

  @override
  String get farmerRateBonusSlabsTitle => 'Bonuses & Slabs';

  @override
  String get farmerRateFlatRateLabel => 'FLAT RATE';

  @override
  String get farmerRateEarnMore => 'Earn more per litre';

  @override
  String farmerRateRaiseSnf(String value) {
    return 'Raise SNF to $value';
  }

  @override
  String farmerRateRaiseFat(String value) {
    return 'Raise FAT to $value';
  }

  @override
  String get farmerRateNoMatrixData => 'No matrix data';

  @override
  String farmerRateRuleGradeBonus(String grade) {
    return 'Grade-$grade bonus';
  }

  @override
  String farmerRateRuleVolumeRange(String min, String max) {
    return 'Volume $min–$max L';
  }

  @override
  String farmerRateRuleVolumeMin(String min) {
    return 'Volume > $min L';
  }

  @override
  String get farmerRewardsTitle => 'Rewards';

  @override
  String get farmerRewardsBadgesSection => 'Badges';

  @override
  String get farmerRewardsQualityStreak => 'Quality Streak';

  @override
  String farmerRewardsStreakDays(int target) {
    return '/ $target days';
  }

  @override
  String get farmerRewardsBonusUnlocked => 'Bonus unlocked — keep it going!';

  @override
  String farmerRewardsStreakRemaining(int remaining) {
    return '$remaining more to unlock a ₹500 bonus';
  }

  @override
  String get farmerRewardsBadgeUnlocked => 'UNLOCKED';

  @override
  String get farmerRewardsBadgeLocked => 'LOCKED';

  @override
  String get farmerRewardsBadgeConsistent => 'Consistent';

  @override
  String get farmerRewardsBadge100Day => '100-Day Club';

  @override
  String get farmerRewardsBadgeTopFat => 'Top FAT';

  @override
  String get farmerRewardsBadgeReferrer => 'Referrer';

  @override
  String get farmerRewardsReferTitle => 'Refer a farmer';

  @override
  String get farmerRewardsReferBody => 'Earn ₹100 for every farmer who joins';

  @override
  String get farmerRewardsShareInvite => 'Share invite';

  @override
  String get farmerRewardsReferralComingSoon => 'Referral invite coming soon!';

  @override
  String get farmerServicesTitle => 'Services';

  @override
  String get farmerServicesSubtitle =>
      'Farmer services are on their way — stay tuned.';

  @override
  String get farmerServicesSoon => 'SOON';

  @override
  String get farmerServicesNotifyMe => 'Notify me when live';

  @override
  String get farmerServicesNotifyToast =>
      'We\'ll notify you when services go live!';

  @override
  String get farmerServicesCattleFeedName => 'Cattle Feed';

  @override
  String get farmerServicesCattleFeedDesc =>
      'Quality fodder & supplements delivered to your farm.';

  @override
  String get farmerServicesVetName => 'Veterinary Care';

  @override
  String get farmerServicesVetDesc =>
      'Doorstep vet visits, health check-ups & vaccinations.';

  @override
  String get farmerServicesInsuranceName => 'Insurance';

  @override
  String get farmerServicesInsuranceDesc =>
      'Cattle insurance to protect your herd & livelihood.';

  @override
  String get farmerServicesLoansName => 'Loans & Advances';

  @override
  String get farmerServicesLoansDesc =>
      'Instant advances against your milk supply earnings.';

  @override
  String get navReceive => 'Receive';

  @override
  String get ccDispatchToPlant => 'Dispatch to Plant';

  @override
  String get ccDispatchSelectDestinationPlant => 'Select destination plant…';

  @override
  String get ccDispatchSearchPlant => 'Search plant';

  @override
  String get ccDispatchNoPlantsFound => 'No plants found';

  @override
  String get ccDispatchErrorNoDestination => 'Select a destination plant';

  @override
  String get ccDispatchErrorInvalidNumbers => 'Enter valid numbers';

  @override
  String get ccDispatchCloseFirstShift =>
      'Close receiving for this shift before dispatching.';

  @override
  String get ccDispatchCloseFirstDay =>
      'Close today\'s receiving before dispatching.';

  @override
  String get ccDispatchCloseFirstPool =>
      'Close the pool (yesterday PM + today AM) before dispatching.';

  @override
  String get ccDispatchCloseReceivingPool => 'Close pool receiving';

  @override
  String ccDispatchCloseReceivingShift(Object slot) {
    return 'Close $slot receiving';
  }

  @override
  String get ccDispatchCloseReceivingToday => 'Close today\'s receiving';

  @override
  String ccDispatchUnlocksFor(Object slot) {
    return 'Unlocks dispatch to the plant for $slot.';
  }

  @override
  String ccDispatchClosedFor(Object slot) {
    return 'Receiving closed for $slot';
  }

  @override
  String get ccDispatchReadyForDispatch => 'Ready for dispatch';

  @override
  String get ccDispatchSlotToday => 'today';

  @override
  String get ccDispatchSlotPool => 'this pool';

  @override
  String get ccDispatchHistoryTitle => 'Dispatch history';

  @override
  String get ccHomeChillingTank => 'Chilling tank';

  @override
  String get ccHomeVmccsPool => 'VMCCs · this pool';

  @override
  String get ccHomeVmccsToday => 'VMCCs · today';

  @override
  String get ccHomeAcrossVmccs => 'ACROSS VMCCs';

  @override
  String get ccHomeInPoolLabel => 'IN POOL · PREV PM + TODAY AM';

  @override
  String get ccHomeCollectedTodayLabel => 'COLLECTED ACROSS VMCCs · TODAY';

  @override
  String ccHomeActiveOfTotal(int active, int total, Object inTransit) {
    return '$active of $total VMCCs · $inTransit in transit';
  }

  @override
  String ccHomeNextPoolNote(Object amount) {
    return '$amount collecting for next dispatch';
  }

  @override
  String get ccHomeReportLink => 'Report';

  @override
  String get ccHomeQcReportLink => 'QC report';

  @override
  String get ccHomeRateChartLink => 'Rate chart';

  @override
  String get ccRateChartsEmptyTitle => 'No active rate charts';

  @override
  String get ccRateChartsEmptySubtitle =>
      'Rate charts set by the dairy will appear here';

  @override
  String get ccInTransitLabel => 'In transit';

  @override
  String get ccHomePlantReadyLabel => 'Plant-ready';

  @override
  String get ccVmccsLoadError => 'Could not load VMCCs';

  @override
  String get ccNoVmccsLinkedTitle => 'No VMCCs linked';

  @override
  String get ccNoVmccsLinkedSubtitle =>
      'Assign VMCCs to this CC in the web admin';

  @override
  String ccHomeFarmersCount(int count) {
    return '$count farmers';
  }

  @override
  String get ccHomeMorning => 'Morning';

  @override
  String get ccHomeEvening => 'Evening';

  @override
  String ccHomeShiftInTransit(Object amount) {
    return '$amount on the way';
  }

  @override
  String ccHomeShiftReceivedCount(int done, int total) {
    return '$done of $total in';
  }

  @override
  String get ccHomeShiftNothingIn => 'Nothing yet';

  @override
  String get ccReceiveTitle => 'Receive';

  @override
  String get ccReceiveLoadError => 'Could not load consignments';

  @override
  String get ccReceiveManualButton => 'Manual receive';

  @override
  String get ccReceiveNothingInTransit => 'Nothing in transit';

  @override
  String get ccReceiveNothingInTransitSubtitle =>
      'Incoming consignments appear here';

  @override
  String get ccReceiveRecentReceives => 'Recent receives';

  @override
  String get historyNotReceivedYet => 'Not received yet';

  @override
  String historyUpstreamPending(Object qty) {
    return '$qty not received yet';
  }

  @override
  String get historyAtSource => 'at source';

  @override
  String get historyNothingToday => 'Nothing received or collected yet today';

  @override
  String get ccReceiveNoReceiptsYet => 'No receipts yet';

  @override
  String get ccReceiveNoReceiptsSubtitle =>
      'Milk you receive from VMCCs shows here';

  @override
  String get ccReceiveHistoryTitle => 'Receive history';

  @override
  String get ccReceivePillInTransit => 'In transit';

  @override
  String get ccReceiveTapToReceive => 'Tap to receive';

  @override
  String ccVarianceSuffix(Object value) {
    return '$value% var';
  }

  @override
  String get ccReceiveEditReceipt => 'Edit receipt';

  @override
  String get ccReceiveDeleteReceipt => 'Delete receipt';

  @override
  String get ccReceiveLockedForDispatch =>
      'Locked — receiving closed for dispatch';

  @override
  String get ccReceiveDeleteConfirmTitle => 'Delete receipt?';

  @override
  String ccReceiveDeleteConfirmBody(Object name, Object qty) {
    return '$name · $qty will be removed.';
  }

  @override
  String get ccReceiveReceiptDeletedToast => 'Receipt deleted';

  @override
  String get ccReceiveNoVmccsLinkedToast => 'No VMCCs linked to this CC';

  @override
  String get ccHistoryNoReceiptsSubtitle =>
      'Milk received from VMCCs over the last 30 days shows here';

  @override
  String ccHistoryVmccCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count VMCCs',
      one: '$count VMCC',
    );
    return '$_temp0';
  }

  @override
  String get ccHistoryDayLoadError => 'Could not load this day';

  @override
  String get ccDayLabel => 'Day';

  @override
  String get ccReportLoadError => 'Could not load the report';

  @override
  String get ccReportNoMilkReceived => 'No milk received on this date';

  @override
  String get ccReportTotalReceived => 'Total received';

  @override
  String ccReportSourcesReceipts(int sources, int receipts) {
    return '$sources VMCCs · $receipts receipts';
  }

  @override
  String get ccReportAvgFat => 'AVG FAT';

  @override
  String get ccReportAvgSnf => 'AVG SNF';

  @override
  String get ccReportAvgWater => 'AVG WATER';

  @override
  String get ccReportSourceVmccs => 'SOURCE VMCCS';

  @override
  String get ccQcLoadError => 'Could not load QC data';

  @override
  String ccQcHeroLabelAll(int days) {
    return 'RECEIVED · LAST $days DAYS';
  }

  @override
  String get ccQcHeroFooterAll =>
      'Qty-weighted quality across all VMCC receipts';

  @override
  String ccQcHeroLabelVmcc(Object name, int days) {
    return '$name · LAST $days DAYS';
  }

  @override
  String get ccQcHeroFooterVmcc =>
      'Qty-weighted quality received from this VMCC';

  @override
  String get ccQcEmptySubtitleVmcc =>
      'No milk received from this VMCC in this window';

  @override
  String get ccQcScopeAll => 'All';

  @override
  String get ccQcScopeByVmcc => 'By VMCC';

  @override
  String get ccQcScopeRanking => 'Ranking';

  @override
  String get ccQcSelectVmccTitle => 'Select VMCC';

  @override
  String get ccQcSelectVmccPlaceholder => 'Select a VMCC';

  @override
  String ccQcRangeDays(int d) {
    return '$d days';
  }

  @override
  String get ccVmccsSearchHint => 'Search VMCCs';

  @override
  String get ccVmccsNoneAssigned => 'No VMCCs assigned';

  @override
  String get ccVmccsNoMatch => 'No matching VMCCs';

  @override
  String get ccManualReceiveTitle => 'Manual receive';

  @override
  String get ccManualReceiveInfoBanner =>
      'Use this only when milk arrived with no dispatch entry in the app.';

  @override
  String get ccManualReceiveReceivingFor => 'RECEIVING FOR';

  @override
  String get ccManualReceiveShiftLabel => 'Shift';

  @override
  String get ccManualReceiveSelectVmcc => 'SELECT VMCC';

  @override
  String get ccManualReceiveNoVmccsLinked => 'No VMCCs linked to this CC.';

  @override
  String ccManualReceiveNoVmccsShift(Object shift) {
    return 'No VMCCs collect in the $shift shift.';
  }

  @override
  String ccManualReceiveReceivedBadge(Object qty) {
    return '$qty received';
  }

  @override
  String get ccManualReceiveCollectionDate => 'Collection date';

  @override
  String ccManualReceiveDeleteConfirmBody(
    Object name,
    Object date,
    Object shift,
  ) {
    return '$name · $date $shift will be removed.';
  }

  @override
  String get ccManualReceiveErrorMissingFields => 'Enter quantity, FAT and SNF';

  @override
  String get ccMeasuredAtCc => 'MEASURED AT CC';

  @override
  String get ccManualReceiveQtyHint => 'Qty (L)';

  @override
  String get ccManualReceiveSaveChanges => 'Save changes';

  @override
  String get ccManualReceiveMarkReceived => 'Mark received';

  @override
  String get ccReceiveConsignmentSourceFallback => 'Source';

  @override
  String get ccReceiveConsignmentReceiptTitle => 'Receipt';

  @override
  String get ccReceiveConsignmentReceiveMilkTitle => 'Receive milk';

  @override
  String get ccReceiveConsignmentQuantityLabel => 'Quantity';

  @override
  String get ccReceiveConsignmentSameAsDispatched => 'Same as dispatched';

  @override
  String get ccReceiveConsignmentReceivedQtyHint => 'Received quantity (L)';

  @override
  String get ccReceiveConsignmentUpdateReceipt => 'Update receipt';

  @override
  String get ccReceiveConsignmentConfirmReceipt => 'Confirm receipt';

  @override
  String get ccReceiveConsignmentErrorQty => 'Enter the received quantity';

  @override
  String get ccReceiveConsignmentEnterQtyForVariance =>
      'Enter received qty to see variance vs dispatch';

  @override
  String get ccReceiveConsignmentVarianceLabel => 'Variance vs dispatch';

  @override
  String get ccReceiveConsignmentDispatchedByVmcc => 'DISPATCHED BY VMCC';

  @override
  String get ccQcReportEmptyTitle => 'No receipts in this window';

  @override
  String get ccQcReportEmptySubtitle =>
      'Receive milk from VMCCs to see the daily QC report';

  @override
  String get ccQcReportTrendsLabel => 'Quality trends';

  @override
  String get ccQcReportDailyQualityLabel => 'Daily quality · qty-weighted';

  @override
  String get ccQcReportDateHeader => 'DATE';

  @override
  String get ccQcReportNoReadings => 'No readings in this window';

  @override
  String ccQcRankingByMetric(Object metric) {
    return 'By $metric';
  }

  @override
  String get ccQcRankingHighToLow => 'high → low';

  @override
  String get ccQcRankingLowToHigh => 'low → high';

  @override
  String ccQcRankingSummary(int active, int total, int days) {
    return '$active of $total VMCCs delivered · last $days days';
  }

  @override
  String get navTankers => 'Tankers';

  @override
  String get ppHomeRawMilkTank => 'Raw-milk tank';

  @override
  String get ppHomeCcsToday => 'CCs · today';

  @override
  String get ppHomeTodayLabel => 'TODAY';

  @override
  String get ppHomeTodayReceivedLabel => 'TODAY RECEIVED';

  @override
  String ppHomeTankersCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count tankers',
      one: '$count tanker',
    );
    return '$_temp0';
  }

  @override
  String ppHomeVarianceVsDispatch(Object value) {
    return '$value% vs disp.';
  }

  @override
  String get ppHomeReceivedLabel => 'Received';

  @override
  String get ppHomeNoCcsTitle => 'No CCs dispatching';

  @override
  String get ppHomeNoCcsSubtitle =>
      'Chilling centres feeding this plant appear here';

  @override
  String ppHomeFlowTransit(Object amount) {
    return '$amount transit';
  }

  @override
  String ppHomeFlowReceived(Object amount) {
    return '$amount received';
  }

  @override
  String get ppReceiveNoReceiptsSubtitle =>
      'Tankers you receive from CCs show here';

  @override
  String get ppReceiveLoadError => 'Could not load tankers';

  @override
  String get ppReceiveNothingInTransitSubtitle =>
      'Inbound tankers appear here once dispatched';

  @override
  String get ppReceiveDispatchedByCc => 'DISPATCHED BY CC';

  @override
  String get ppReceiveMeasuredAtPlant => 'MEASURED AT PLANT';

  @override
  String get ppManualReceiveButton => 'Receive without dispatch';

  @override
  String get ppManualReceiveTitle => 'Receive without dispatch';

  @override
  String get ppManualReceiveInfoBanner =>
      'Use this when milk reached the plant but the CC hasn\'t entered its collections yet. Record it per milk type so manufacturing can plan against it.';

  @override
  String get ppManualReceiveArrivedFrom => 'ARRIVED FROM';

  @override
  String get ppManualReceiveSourceCc => 'Chilling centre';

  @override
  String get ppManualReceivePerTypeLabel => 'Quantity received, per milk type';

  @override
  String get ppManualReceiveNotReceived => 'Not received';

  @override
  String get ppManualReceiveSaveEmpty => 'Enter a quantity';

  @override
  String manualReceiveSaveCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Save $count receipts',
      one: 'Save 1 receipt',
    );
    return '$_temp0';
  }

  @override
  String manualReceivePartialError(int saved, String error) {
    String _temp0 = intl.Intl.pluralLogic(
      saved,
      locale: localeName,
      other: '$saved receipts saved',
      one: '1 receipt saved',
    );
    return '$_temp0, then: $error';
  }

  @override
  String get ppReceiveManualTag => 'MANUAL';

  @override
  String ppReceiveDeleteManualConfirm(String qty, String cc, String date) {
    return 'Delete the manual receipt of $qty from $cc on $date? The raw-milk stock it posted is reversed.';
  }

  @override
  String get ppReceiveManualDuplicateWarning =>
      'A manual receipt for this CC, date and milk type is already in. Receiving this tanker too would count the milk twice — delete one.';

  @override
  String get ppTankersEmptyTitle => 'No tankers today';

  @override
  String get ppTankersEmptySubtitle =>
      'Tankers dispatched to this plant appear here';

  @override
  String get adminSwitchTitlePp => 'Processing plants';

  @override
  String get adminSwitchTitleCc => 'Chilling centres';

  @override
  String get adminSwitchTitleVmcc => 'Village collection centres';

  @override
  String get adminSwitchFarmersNav => 'Farmers';

  @override
  String get adminSwitchDefaultUserName => 'Dhenu User';

  @override
  String get adminSwitchLoadError => 'Could not load today’s collection';

  @override
  String get adminSwitchTodayCollectionLabel => 'TODAY’S COLLECTION';

  @override
  String get adminSwitchByChillingCentre => 'BY CHILLING CENTRE';

  @override
  String get adminSwitchByMilkType => 'BY MILK TYPE';

  @override
  String get adminSwitchNoCollectionTitle => 'No collection yet today';

  @override
  String get adminSwitchNoCollectionSubtitle =>
      'Per-centre and per-milk-type totals will appear here.';

  @override
  String get adminSwitchNoCollectionSuffix => ' · no collection';

  @override
  String get adminSwitchNotLinkedToCc => 'Not linked to a chilling centre';

  @override
  String get adminSwitchCcFallback => 'Chilling centre';

  @override
  String get adminSwitchUnlinkedVmccs => 'Unlinked VMCCs';

  @override
  String adminSwitchVmccsInCc(Object name) {
    return 'VMCCs in $name';
  }

  @override
  String get adminSwitchSheetTitle => 'Switch centre';

  @override
  String get adminSwitchLoadCentresError => 'Could not load centres';

  @override
  String get adminSwitchNoCentresTitle => 'No centres yet';

  @override
  String get adminSwitchNoCentresSubtitle =>
      'Add VMCCs, chilling centres or plants in the web admin first';

  @override
  String get operatorSwitchRolePp => 'Processing plant';

  @override
  String get operatorSwitchRoleCc => 'Chilling centre';

  @override
  String get operatorSwitchRoleVmcc => 'Village collection centre';

  @override
  String get operatorSwitchLoadError => 'Could not load your centres';

  @override
  String get operatorSwitchNoneTitle => 'No centres assigned';

  @override
  String get operatorSwitchNoneSubtitle =>
      'Ask your admin to assign you to a centre.';

  @override
  String get operatorSwitchTodayLoading => 'Today  …';

  @override
  String get operatorSwitchNoCollection => 'No collection yet';

  @override
  String operatorSwitchTodaySummary(Object qty, int count) {
    return 'Today  $qty · $count farmers';
  }

  @override
  String get operatorSwitchButton => 'Switch';

  @override
  String get operatorSelectorGreetingPlain => 'Namaste';

  @override
  String operatorSelectorGreetingNamed(Object name) {
    return 'Namaste, $name';
  }

  @override
  String get operatorSelectorSubtitle => 'Choose a centre to operate';

  @override
  String get operatorNoAccessTitle => 'No Dhenu access yet';

  @override
  String get operatorNoAccessSubtitle =>
      'Ask your dairy administrator to enable milk procurement for your account.';

  @override
  String get operatorNoAccessSignOut => 'Sign out';

  @override
  String get authLoginTagline => 'Milk procurement, made fair';

  @override
  String get authLoginSessionExpired =>
      'Your session expired. Sign in again with your phone number.';

  @override
  String get commonBack => 'Back';

  @override
  String get authOtpPhoneLabel => 'Phone number';

  @override
  String get authOtpPhoneHint => '10-digit mobile';

  @override
  String get authOtpSendButton => 'Send OTP';

  @override
  String get authOtpEnterDigits => 'Enter a 10-digit mobile number';

  @override
  String get authOtpEnterCode => 'Enter the 6-digit code';

  @override
  String authOtpCodeSentTo(Object phone) {
    return 'Enter the code sent to $phone';
  }

  @override
  String get authOtpSignIn => 'Sign in';

  @override
  String get authOtpSmsDelay => 'The SMS can take up to a minute to arrive.';

  @override
  String get authOtpChangeNumber => 'Change number';

  @override
  String authOtpResendIn(int seconds) {
    return 'Resend in ${seconds}s';
  }

  @override
  String get authOtpResendButton => 'Resend OTP';

  @override
  String authOtpNetworkErrorDebug(Object baseUrl) {
    return 'Can\'t reach the server at $baseUrl. Is the API running and the phone on the same network?';
  }

  @override
  String get authOtpNetworkErrorProd =>
      'Can\'t reach the server. Check your connection and try again.';

  @override
  String get aboutScreenTitle => 'About';

  @override
  String get aboutScreenTagline => 'Milk procurement, simplified';

  @override
  String aboutScreenVersion(Object version, Object build) {
    return 'Version $version ($build)';
  }

  @override
  String get aboutScreenPrivacyPolicy => 'Privacy Policy';

  @override
  String get aboutScreenTermsOfService => 'Terms of Service';

  @override
  String get aboutScreenMadeWith => 'Made with care in India 🇮🇳';

  @override
  String get aboutScreenCouldNotOpen => 'Could not open';

  @override
  String get bankPayoutTitle => 'Bank & payout';

  @override
  String get bankPayoutLoadError => 'Could not load payout';

  @override
  String get bankPayoutEmptyTitle => 'No payout terms yet';

  @override
  String get bankPayoutEmptySubtitle =>
      'Your compensation is set up by your admin and will appear here.';

  @override
  String get bankPayoutThisMonth => 'THIS MONTH';

  @override
  String bankPayoutCollectedEstEarning(Object qty) {
    return '$qty collected · est. earning so far';
  }

  @override
  String get bankPayoutMethodLabel => 'Payout method';

  @override
  String get bankPayoutRentLabel => 'Rent';

  @override
  String bankPayoutPerMonth(Object amount) {
    return '$amount / month';
  }

  @override
  String get bankPayoutSinceLabel => 'Since';

  @override
  String get bankPayoutHasAccount =>
      'Payouts go to your registered bank account.';

  @override
  String get bankPayoutNoAccount =>
      'No bank account on file — ask your admin to add one.';

  @override
  String get bankPayoutFixedSalary => 'Fixed salary';

  @override
  String get bankPayoutPerLitreCommission => 'Per-litre commission';

  @override
  String bankPayoutPerLitre(Object rate) {
    return '$rate / litre';
  }

  @override
  String get langPickerTitle => 'Choose language';

  @override
  String get langPickerComingSoon => 'Coming soon';

  @override
  String get dispatchFatHint => 'FAT %';

  @override
  String get dispatchSnfHint => 'SNF %';

  @override
  String get dispatchQtyLabel => 'Qty (L)';

  @override
  String get dispatchWaterLabel => 'Water %';

  @override
  String get dispatchContainerFieldLabel => 'Container';

  @override
  String get dispatchWaterHint => 'Water % (optional)';

  @override
  String get dispatchHistoryTitle => 'Dispatch history';

  @override
  String get dispatchSeeFullHistory => 'See full history';

  @override
  String get dispatchHistoryLoadError => 'Could not load history';

  @override
  String get dispatchHistoryEmptyTitle => 'No dispatches yet';

  @override
  String get dispatchHistoryEmptySubtitle =>
      'Tankers dispatched over the last 30 days show here';

  @override
  String get dispatchHistoryPlantFallback => 'Plant';

  @override
  String get dispatchHistoryCcFallback => 'Chilling centre';

  @override
  String dispatchHistoryCount(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n dispatches',
      one: '$n dispatch',
    );
    return '$_temp0';
  }

  @override
  String dispatchHistoryInTransit(int n) {
    return '$n in transit';
  }

  @override
  String get dispatchHistoryReversed => '⊘ reversed';

  @override
  String farmerPoursGradeLabel(Object letter) {
    return 'Grade $letter';
  }

  @override
  String get collectLowWord => 'Low';

  @override
  String get qcReportLoadError => 'Could not load QC data';

  @override
  String qcReportHeroLabelFarmer(Object name, int days) {
    return '$name · LAST $days DAYS';
  }

  @override
  String qcReportHeroLabelAll(int days) {
    return 'COLLECTED · LAST $days DAYS';
  }

  @override
  String qcReportHeroLabelDays(int days) {
    return 'LAST $days DAYS';
  }

  @override
  String get qcReportFooterFarmer => 'Qty-weighted quality for this farmer';

  @override
  String get qcReportFooterAll => 'Qty-weighted quality across all farmers';

  @override
  String get qcReportEmptyTitle => 'No readings in this window';

  @override
  String get qcReportEmptySubtitle =>
      'Record collections to see the daily QC trend';

  @override
  String get qcReportSelectFarmerTitle => 'Select a farmer';

  @override
  String get qcReportSelectFarmerSubtitle =>
      'Pick a farmer to see their quality trend';

  @override
  String get qcReportScopeAll => 'All farmers';

  @override
  String get qcReportScopePerFarmer => 'Per farmer';

  @override
  String qcReportDaysChip(int d) {
    return '$d days';
  }

  @override
  String get homeCouldNotLoadCentre => 'Could not load your centre';

  @override
  String get updateRequiredTitle => 'Update required';

  @override
  String get updateRequiredButton => 'Update now';

  @override
  String get updateRequiredCouldNotOpenStore => 'Could not open the store';

  @override
  String get nodePickerSearchHint => 'Search…';

  @override
  String get nodePickerNoMatch => 'No match';

  @override
  String get voiceFieldDictateTooltip => 'Dictate';

  @override
  String get voiceFieldReadBackTooltip => 'Read back';

  @override
  String get splashTagline => 'Every drop counts';

  @override
  String get farmerBankAccountHolder => 'Account holder';

  @override
  String get farmerBankAccountNumber => 'Account number';

  @override
  String get farmerBankIfsc => 'IFSC';

  @override
  String get farmerBankName => 'Bank';

  @override
  String get farmerBankUpi => 'UPI ID';

  @override
  String get farmerBankEmpty =>
      'No payout details yet — ask your collection centre operator to add them.';

  @override
  String get farmerBankFootnote =>
      'Your milk payments go to this account. To change it, ask your collection centre operator.';

  @override
  String get farmerReportProblem => 'Report a problem';

  @override
  String farmerReportPrefill(Object date, Object shift, Object qty) {
    return 'Hello, I have a question about my milk entry on $date ($shift, $qty).';
  }

  @override
  String collectAdvanceChip(Object amount) {
    return '$amount advance outstanding';
  }

  @override
  String get collectShareSummary => 'Share summary';

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
    return '$node · $date · $shift\nMilk collected: $qty\nFarmers: $count\nAvg FAT $fat · SNF $snf';
  }

  @override
  String farmerRateNewNotice(Object date) {
    return 'New rate in effect since $date';
  }

  @override
  String homeCloseShiftNudge(Object shift) {
    return '$shift collection is still open — close it when you\'re done.';
  }

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get notificationsMarkAllRead => 'Mark all read';

  @override
  String get notificationsEmptyTitle => 'Nothing yet';

  @override
  String get notificationsEmptySubtitle =>
      'Dispatches and receipts for your centre show up here.';

  @override
  String get notificationsLoadError => 'Couldn\'t load notifications';

  @override
  String get notificationsJustNow => 'just now';

  @override
  String notificationsMinutesAgo(int n) {
    return '$n min ago';
  }

  @override
  String notificationsHoursAgo(int n) {
    return '$n h ago';
  }

  @override
  String notificationsDaysAgo(int n) {
    return '$n d ago';
  }

  @override
  String ppHistoryCcCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count CCs',
      one: '$count CC',
    );
    return '$_temp0';
  }

  @override
  String get ppHistoryNoReceiptsSubtitle =>
      'Tankers received from CCs over the last 30 days show here';

  @override
  String get ppQcScopeByCc => 'By CC';

  @override
  String get ppQcHeroFooterAll => 'Qty-weighted quality across all CC tankers';

  @override
  String ppQcHeroLabelCc(Object name, int days) {
    return '$name · LAST $days DAYS';
  }

  @override
  String get ppQcHeroFooterCc => 'Qty-weighted quality received from this CC';

  @override
  String get ppQcEmptySubtitleCc =>
      'No milk received from this CC in this window';

  @override
  String get ppQcSelectCcTitle => 'Select CC';

  @override
  String get ppQcSelectCcPlaceholder => 'Select a CC';

  @override
  String ppQcRankingSummary(int active, int total, int days) {
    return '$active of $total CCs delivered · last $days days';
  }

  @override
  String fastTrackTitle(String plant) {
    return 'Send to $plant?';
  }

  @override
  String get fastTrackChecking => 'Checking what\'s ready…';

  @override
  String get fastTrackSend => 'Send';

  @override
  String get fastTrackNothingTitle => 'Nothing to send';

  @override
  String get fastTrackNothingSubtitle =>
      'No milk is waiting to go to the plant right now.';

  @override
  String get fastTrackClosesWholeDay =>
      'This closes the whole day\'s collection at this centre — anything poured afterwards needs the slot reopened.';

  @override
  String fastTrackSuccess(String qty, String plant) {
    return '$qty sent to $plant';
  }

  @override
  String fastTrackPartial(String vmcc) {
    return 'Stopped at $vmcc. Everything before it was recorded — finish the rest on the dispatch screen.';
  }

  @override
  String get dispatchDestTitle => 'Where is this going?';

  @override
  String dispatchDestPlant(String plant) {
    return 'Send to $plant';
  }

  @override
  String get dispatchDestPlantSub =>
      'Closes the chilling centre and takes the milk into raw-milk stock — the whole chain, in one step';

  @override
  String dispatchDestCc(String cc) {
    return 'Dispatch to $cc';
  }

  @override
  String get dispatchDestCcSub =>
      'The usual leg — the chilling centre receives and weighs it';

  @override
  String get fastTrackChainSummary =>
      'Closes both centres, records the dispatch and receipt on each leg, and takes the milk into raw-milk stock.';

  @override
  String get ccHomeShiftAwaitingVmcc => 'Yet to receive';

  @override
  String homeDispatchShiftQty(String shift, String qty) {
    return 'Dispatch $shift · $qty';
  }

  @override
  String homeDispatchSlotDated(String shift, String date, String qty) {
    return 'Dispatch $shift · $date · $qty';
  }

  @override
  String homeDispatchBothShifts(String qty) {
    return 'Dispatch AM & PM · $qty';
  }

  @override
  String dispatchDestPlantSubBoth(String qty) {
    return 'Both shifts · $qty';
  }

  @override
  String dispatchDestCcSubOne(String shift) {
    return 'One shift at a time — starts with $shift';
  }

  @override
  String get dispatchDestPlantGeneric => 'Send to the main plant';

  @override
  String get dispatchDestCcGeneric => 'Dispatch to the chilling centre';

  @override
  String get farmerPaymentsSegPayouts => 'Payouts';

  @override
  String get farmerPaymentsSegLedger => 'Advances & loans';

  @override
  String get farmerPaymentsLastPayout => 'Last payout';

  @override
  String get farmerPaymentsNoPayouts => 'No payouts yet';

  @override
  String get farmerPaymentsNoPayoutsSubtitle =>
      'Cycle payouts appear here once a cycle is created';

  @override
  String get farmerPaymentsPayoutsLoadError => 'Could not load payouts';

  @override
  String farmerPaymentsLitresNet(String litres, String amount) {
    return '$litres L · net $amount';
  }

  @override
  String get farmerPaymentsMarkPaid => 'Mark paid';

  @override
  String get farmerPaymentsMarkPaidError => 'Could not update payment status';

  @override
  String get farmerPaymentsUnpaid => 'UNPAID';

  @override
  String farmerPaymentsPaidOn(String date) {
    return 'Paid $date';
  }

  @override
  String get farmerPaymentsBreakdown => 'Breakdown';

  @override
  String get farmerPaymentsGross => 'Gross';

  @override
  String get farmerPaymentsBonus => 'Quality bonus';

  @override
  String get farmerPaymentsNet => 'Net payable';

  @override
  String get farmerPaymentsDeductionAdvance => 'Advance recovery';

  @override
  String get farmerPaymentsDeductionFeedLoan => 'Feed loan recovery';

  @override
  String get farmerPaymentsDeductionOther => 'Other deduction';

  @override
  String get farmerPaymentsPaymentMode => 'Paid by';

  @override
  String get farmerPaymentsStatementNo => 'Statement no.';

  @override
  String farmerPaymentsAdvanceDue(String amount) {
    return 'Advance $amount';
  }

  @override
  String farmerPaymentsFeedLoanDue(String amount) {
    return 'Feed loan $amount';
  }

  @override
  String get farmerPaymentsRecordEntryButton =>
      'Record advance, loan or repayment';

  @override
  String get farmerPaymentsEntrySaved => 'Entry recorded';

  @override
  String get farmerPaymentsEarnings => 'Earnings';

  @override
  String get farmerPaymentsDeductions => 'Deductions';

  @override
  String get farmerPaymentsPaymentSection => 'Payment';

  @override
  String get farmerPaymentsPaidOnLabel => 'Paid on';

  @override
  String get farmerPaymentsReference => 'UTR / Ref';

  @override
  String get farmerPaymentsNotConfirmed => 'Not confirmed yet';

  @override
  String get farmerPaymentsModeBankTransfer => 'Bank transfer';

  @override
  String get farmerPaymentsModeUpi => 'UPI';

  @override
  String get farmerPaymentsModeCash => 'Cash';

  @override
  String get farmerPaymentsModeCheque => 'Cheque';

  @override
  String get farmerPaymentsModeOther => 'Other';

  @override
  String get suppliedRecordedAtCc => 'Recorded at the chilling centre';

  @override
  String suppliedRecordedAtNamedCc(String cc) {
    return 'Recorded at $cc';
  }

  @override
  String get suppliedWholeDay => 'Whole day';

  @override
  String get suppliedNotPriced => 'Rate not set';

  @override
  String historyDaySupplySubtitle(String pm, String am) {
    return '☾ $pm · ☀️ $am';
  }

  @override
  String get dispatchHistoryRecordedOnArrival => 'Recorded on arrival';

  @override
  String get paymentsBillsTitle => 'Settlement bills';

  @override
  String get paymentsBillsSubtitle =>
      'What this centre was paid, cycle by cycle';

  @override
  String get paymentsBillsEmptyTitle => 'No bills yet';

  @override
  String get paymentsBillsEmptySubtitle =>
      'A bill appears here once the chilling centre settles a cycle';

  @override
  String get paymentsBillMilk => 'Milk';

  @override
  String get paymentsBillOperator => 'Operator';

  @override
  String get paymentsBillReversed => 'Reversed';

  @override
  String get paymentsBillStatement => 'Statement';

  @override
  String get paymentsBillsPaidTotal => 'Paid to date';

  @override
  String get paymentsBillsDueTotal => 'Awaiting payment';

  @override
  String get paymentsBillTotal => 'Total';

  @override
  String get paymentsBillStatusPaid => 'Paid';

  @override
  String get paymentsBillStatusDue => 'Due';
}
