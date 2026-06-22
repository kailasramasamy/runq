import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_kn.dart';
import 'app_localizations_ta.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('kn'),
    Locale('ta'),
  ];

  /// VMCC bottom-nav: home tab
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navCollect.
  ///
  /// In en, this message translates to:
  /// **'Collect'**
  String get navCollect;

  /// No description provided for @navDispatch.
  ///
  /// In en, this message translates to:
  /// **'Dispatch'**
  String get navDispatch;

  /// No description provided for @navPayments.
  ///
  /// In en, this message translates to:
  /// **'Payments'**
  String get navPayments;

  /// No description provided for @navProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get navProfile;

  /// No description provided for @commonLitres.
  ///
  /// In en, this message translates to:
  /// **'Litres'**
  String get commonLitres;

  /// No description provided for @commonSelectFarmer.
  ///
  /// In en, this message translates to:
  /// **'Select farmer'**
  String get commonSelectFarmer;

  /// No description provided for @commonMilkType.
  ///
  /// In en, this message translates to:
  /// **'Milk type'**
  String get commonMilkType;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get commonNext;

  /// No description provided for @commonToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get commonToday;

  /// No description provided for @milkTypeCowA1.
  ///
  /// In en, this message translates to:
  /// **'Cow A1 (regular)'**
  String get milkTypeCowA1;

  /// No description provided for @milkTypeCowA2.
  ///
  /// In en, this message translates to:
  /// **'Cow A2 (desi)'**
  String get milkTypeCowA2;

  /// No description provided for @milkTypeBuffalo.
  ///
  /// In en, this message translates to:
  /// **'Buffalo'**
  String get milkTypeBuffalo;

  /// No description provided for @milkTypeMixed.
  ///
  /// In en, this message translates to:
  /// **'Mixed'**
  String get milkTypeMixed;

  /// No description provided for @milkTypeCowLegacy.
  ///
  /// In en, this message translates to:
  /// **'Cow (legacy)'**
  String get milkTypeCowLegacy;

  /// No description provided for @recordCollectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Record Collection'**
  String get recordCollectionTitle;

  /// No description provided for @editCollectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit Collection'**
  String get editCollectionTitle;

  /// No description provided for @collectAlreadyRecorded.
  ///
  /// In en, this message translates to:
  /// **'Already recorded this {shift} shift'**
  String collectAlreadyRecorded(String shift);

  /// No description provided for @collectReplaceOrAdd.
  ///
  /// In en, this message translates to:
  /// **'Replace it (correction) or add another lot for {name}?'**
  String collectReplaceOrAdd(String name);

  /// No description provided for @collectReplace.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get collectReplace;

  /// No description provided for @collectAddLot.
  ///
  /// In en, this message translates to:
  /// **'Add lot'**
  String get collectAddLot;

  /// No description provided for @collectSavedOnDevice.
  ///
  /// In en, this message translates to:
  /// **'Saved on device · will sync'**
  String get collectSavedOnDevice;

  /// No description provided for @collectComputingRate.
  ///
  /// In en, this message translates to:
  /// **'Computing rate…'**
  String get collectComputingRate;

  /// No description provided for @collectEnterClrPreview.
  ///
  /// In en, this message translates to:
  /// **'Enter CLR to preview the rate'**
  String get collectEnterClrPreview;

  /// No description provided for @collectEnterFatSnfPreview.
  ///
  /// In en, this message translates to:
  /// **'Enter FAT & SNF to preview the rate'**
  String get collectEnterFatSnfPreview;

  /// No description provided for @collectRateOnSync.
  ///
  /// In en, this message translates to:
  /// **'Rate computed on sync'**
  String get collectRateOnSync;

  /// No description provided for @collectTodaysEntries.
  ///
  /// In en, this message translates to:
  /// **'Today\'s entries ({count})'**
  String collectTodaysEntries(int count);

  /// No description provided for @collectSaveAndNext.
  ///
  /// In en, this message translates to:
  /// **'Save & next'**
  String get collectSaveAndNext;

  /// No description provided for @collectCloseShift.
  ///
  /// In en, this message translates to:
  /// **'Close {shift} collection'**
  String collectCloseShift(String shift);

  /// No description provided for @collectCloseDay.
  ///
  /// In en, this message translates to:
  /// **'Close today\'s collection'**
  String get collectCloseDay;

  /// No description provided for @collectClosedBanner.
  ///
  /// In en, this message translates to:
  /// **'{shift} collection is closed — ready to dispatch.'**
  String collectClosedBanner(String shift);

  /// No description provided for @collectDayClosedBanner.
  ///
  /// In en, this message translates to:
  /// **'Today\'s collection is closed — ready to dispatch.'**
  String get collectDayClosedBanner;

  /// No description provided for @collectReopen.
  ///
  /// In en, this message translates to:
  /// **'Reopen'**
  String get collectReopen;

  /// No description provided for @collectCloseBlockedPending.
  ///
  /// In en, this message translates to:
  /// **'Some pours haven\'t synced yet — wait for sync, then close.'**
  String get collectCloseBlockedPending;

  /// No description provided for @dispatchCloseFirst.
  ///
  /// In en, this message translates to:
  /// **'Close collection for this shift before dispatching.'**
  String get dispatchCloseFirst;

  /// No description provided for @dispatchCloseFirstDay.
  ///
  /// In en, this message translates to:
  /// **'Close today\'s collection before dispatching.'**
  String get dispatchCloseFirstDay;

  /// No description provided for @historyLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load history'**
  String get historyLoadError;

  /// No description provided for @historyByDay.
  ///
  /// In en, this message translates to:
  /// **'By day'**
  String get historyByDay;

  /// No description provided for @historyByFarmer.
  ///
  /// In en, this message translates to:
  /// **'By farmer'**
  String get historyByFarmer;

  /// No description provided for @historyAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get historyAll;

  /// No description provided for @historyNoHistory.
  ///
  /// In en, this message translates to:
  /// **'No collection history'**
  String get historyNoHistory;

  /// No description provided for @historyNoHistorySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Recorded collections from the last 30 days appear here'**
  String get historyNoHistorySubtitle;

  /// No description provided for @historyNoFarmersMatch.
  ///
  /// In en, this message translates to:
  /// **'No farmers match'**
  String get historyNoFarmersMatch;

  /// No description provided for @historyNoFarmersMatchSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Try another name'**
  String get historyNoFarmersMatchSubtitle;

  /// No description provided for @historySearchFarmer.
  ///
  /// In en, this message translates to:
  /// **'Search farmer'**
  String get historySearchFarmer;

  /// No description provided for @historyFarmerFallback.
  ///
  /// In en, this message translates to:
  /// **'Farmer'**
  String get historyFarmerFallback;

  /// No description provided for @historyDaySubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count} farmers · 🌙 {pm} · ☀️ {am}'**
  String historyDaySubtitle(int count, String pm, String am);

  /// No description provided for @pourDetailDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete entry?'**
  String get pourDetailDeleteTitle;

  /// No description provided for @pourDetailDeleteContent.
  ///
  /// In en, this message translates to:
  /// **'Reverses {qty} for {name}. This cannot be undone.'**
  String pourDetailDeleteContent(String qty, String name);

  /// No description provided for @pourDetailFarmerFallback.
  ///
  /// In en, this message translates to:
  /// **'this farmer'**
  String get pourDetailFarmerFallback;

  /// No description provided for @pourDetailDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get pourDetailDelete;

  /// No description provided for @pourDetailModify.
  ///
  /// In en, this message translates to:
  /// **'Modify'**
  String get pourDetailModify;

  /// No description provided for @pourDetailReversed.
  ///
  /// In en, this message translates to:
  /// **'Reversed'**
  String get pourDetailReversed;

  /// No description provided for @pourDetailRatePerLitre.
  ///
  /// In en, this message translates to:
  /// **'Rate / litre'**
  String get pourDetailRatePerLitre;

  /// No description provided for @pourDetailQuantity.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get pourDetailQuantity;

  /// No description provided for @pourDetailMilkType.
  ///
  /// In en, this message translates to:
  /// **'Milk type'**
  String get pourDetailMilkType;

  /// No description provided for @pourDetailShift.
  ///
  /// In en, this message translates to:
  /// **'Shift'**
  String get pourDetailShift;

  /// No description provided for @pourDetailDate.
  ///
  /// In en, this message translates to:
  /// **'Date'**
  String get pourDetailDate;

  /// No description provided for @pourDetailAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get pourDetailAmount;

  /// No description provided for @shiftAm.
  ///
  /// In en, this message translates to:
  /// **'AM'**
  String get shiftAm;

  /// No description provided for @shiftPm.
  ///
  /// In en, this message translates to:
  /// **'PM'**
  String get shiftPm;

  /// No description provided for @shiftMorning.
  ///
  /// In en, this message translates to:
  /// **'Morning'**
  String get shiftMorning;

  /// No description provided for @shiftEvening.
  ///
  /// In en, this message translates to:
  /// **'Evening'**
  String get shiftEvening;

  /// No description provided for @shiftFarmerFallback.
  ///
  /// In en, this message translates to:
  /// **'Farmer'**
  String get shiftFarmerFallback;

  /// No description provided for @profileMemberSince.
  ///
  /// In en, this message translates to:
  /// **'Member since'**
  String get profileMemberSince;

  /// No description provided for @profileCollectionCentre.
  ///
  /// In en, this message translates to:
  /// **'Collection centre'**
  String get profileCollectionCentre;

  /// No description provided for @profileBankPayout.
  ///
  /// In en, this message translates to:
  /// **'Bank & payout'**
  String get profileBankPayout;

  /// No description provided for @profileNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get profileNotifications;

  /// No description provided for @profileHelpSupport.
  ///
  /// In en, this message translates to:
  /// **'Help & support'**
  String get profileHelpSupport;

  /// No description provided for @profileAbout.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get profileAbout;

  /// No description provided for @profileAppearance.
  ///
  /// In en, this message translates to:
  /// **'APPEARANCE'**
  String get profileAppearance;

  /// No description provided for @profileThemeSystem.
  ///
  /// In en, this message translates to:
  /// **'System default'**
  String get profileThemeSystem;

  /// No description provided for @profileThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get profileThemeLight;

  /// No description provided for @profileThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get profileThemeDark;

  /// No description provided for @profileLogOut.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get profileLogOut;

  /// No description provided for @homeRecentEntries.
  ///
  /// In en, this message translates to:
  /// **'Recent entries'**
  String get homeRecentEntries;

  /// No description provided for @homeFarmers.
  ///
  /// In en, this message translates to:
  /// **'Farmers'**
  String get homeFarmers;

  /// No description provided for @homeHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get homeHistory;

  /// No description provided for @homeReports.
  ///
  /// In en, this message translates to:
  /// **'Reports'**
  String get homeReports;

  /// No description provided for @homeAmShiftInProgress.
  ///
  /// In en, this message translates to:
  /// **'☀️ AM shift · in progress'**
  String get homeAmShiftInProgress;

  /// No description provided for @homePmShiftInProgress.
  ///
  /// In en, this message translates to:
  /// **'🌙 PM shift · in progress'**
  String get homePmShiftInProgress;

  /// No description provided for @homeJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get homeJustNow;

  /// No description provided for @homeHeroToday.
  ///
  /// In en, this message translates to:
  /// **'TODAY'**
  String get homeHeroToday;

  /// No description provided for @homeHeroTodayAm.
  ///
  /// In en, this message translates to:
  /// **'TODAY ☀️ AM'**
  String get homeHeroTodayAm;

  /// No description provided for @homeHeroTodayPm.
  ///
  /// In en, this message translates to:
  /// **'TODAY 🌙 PM'**
  String get homeHeroTodayPm;

  /// No description provided for @homeFarmerCount.
  ///
  /// In en, this message translates to:
  /// **'{count} farmers'**
  String homeFarmerCount(Object count);

  /// No description provided for @homeToDispatch.
  ///
  /// In en, this message translates to:
  /// **'To dispatch'**
  String get homeToDispatch;

  /// No description provided for @homeAllDispatched.
  ///
  /// In en, this message translates to:
  /// **'All dispatched'**
  String get homeAllDispatched;

  /// No description provided for @homeNothingYet.
  ///
  /// In en, this message translates to:
  /// **'Nothing yet'**
  String get homeNothingYet;

  /// No description provided for @homeCollected.
  ///
  /// In en, this message translates to:
  /// **'Collected'**
  String get homeCollected;

  /// No description provided for @homeBmcTank.
  ///
  /// In en, this message translates to:
  /// **'BMC tank'**
  String get homeBmcTank;

  /// No description provided for @homeLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load entries'**
  String get homeLoadError;

  /// No description provided for @homeNoCollectionToday.
  ///
  /// In en, this message translates to:
  /// **'No collection yet today'**
  String get homeNoCollectionToday;

  /// No description provided for @homeNoCollectionSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Tap Record Collection to start'**
  String get homeNoCollectionSubtitle;

  /// No description provided for @dispatchTitle.
  ///
  /// In en, this message translates to:
  /// **'Dispatch'**
  String get dispatchTitle;

  /// No description provided for @dispatchAvailability.
  ///
  /// In en, this message translates to:
  /// **'Availability'**
  String get dispatchAvailability;

  /// No description provided for @dispatchToCollectionCentre.
  ///
  /// In en, this message translates to:
  /// **'Dispatch to Collection Centre'**
  String get dispatchToCollectionCentre;

  /// No description provided for @dispatchQtyHint.
  ///
  /// In en, this message translates to:
  /// **'Dispatch Qty (L)'**
  String get dispatchQtyHint;

  /// No description provided for @dispatchContainerHint.
  ///
  /// In en, this message translates to:
  /// **'Container No. (optional)'**
  String get dispatchContainerHint;

  /// No description provided for @dispatchTankerButton.
  ///
  /// In en, this message translates to:
  /// **'Dispatch Tanker'**
  String get dispatchTankerButton;

  /// No description provided for @dispatchTodaysOutbound.
  ///
  /// In en, this message translates to:
  /// **'Today\'s Outbound'**
  String get dispatchTodaysOutbound;

  /// No description provided for @dispatchNoDispatchesToday.
  ///
  /// In en, this message translates to:
  /// **'No dispatches today'**
  String get dispatchNoDispatchesToday;

  /// No description provided for @dispatchNoDispatchesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Use the form above to dispatch a tanker'**
  String get dispatchNoDispatchesSubtitle;

  /// No description provided for @dispatchSelectDestination.
  ///
  /// In en, this message translates to:
  /// **'Select destination centre…'**
  String get dispatchSelectDestination;

  /// No description provided for @dispatchSearchCentre.
  ///
  /// In en, this message translates to:
  /// **'Search centre'**
  String get dispatchSearchCentre;

  /// No description provided for @dispatchNoCentresFound.
  ///
  /// In en, this message translates to:
  /// **'No centres found'**
  String get dispatchNoCentresFound;

  /// No description provided for @dispatchErrorNoDestination.
  ///
  /// In en, this message translates to:
  /// **'Select a destination collection centre'**
  String get dispatchErrorNoDestination;

  /// No description provided for @dispatchErrorInvalidQty.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid dispatch quantity'**
  String get dispatchErrorInvalidQty;

  /// No description provided for @dispatchErrorOverQty.
  ///
  /// In en, this message translates to:
  /// **'Only {available} L available to dispatch'**
  String dispatchErrorOverQty(Object available);

  /// No description provided for @dispatchAmountDispatched.
  ///
  /// In en, this message translates to:
  /// **'{amount} dispatched'**
  String dispatchAmountDispatched(Object amount);

  /// No description provided for @dispatchNothingLeft.
  ///
  /// In en, this message translates to:
  /// **'Nothing left to dispatch.'**
  String get dispatchNothingLeft;

  /// No description provided for @dispatchNothingLeftThisShift.
  ///
  /// In en, this message translates to:
  /// **'Nothing left to dispatch this shift.'**
  String get dispatchNothingLeftThisShift;

  /// No description provided for @dispatchContainerLabel.
  ///
  /// In en, this message translates to:
  /// **'Container {no}'**
  String dispatchContainerLabel(Object no);

  /// No description provided for @dispatchNoContainerNo.
  ///
  /// In en, this message translates to:
  /// **'No container no.'**
  String get dispatchNoContainerNo;

  /// No description provided for @dispatchStatusTransit.
  ///
  /// In en, this message translates to:
  /// **'⏳ transit'**
  String get dispatchStatusTransit;

  /// No description provided for @dispatchStatusReceived.
  ///
  /// In en, this message translates to:
  /// **'✓ received'**
  String get dispatchStatusReceived;

  /// No description provided for @dispatchAvailableToDispatch.
  ///
  /// In en, this message translates to:
  /// **'Available to dispatch'**
  String get dispatchAvailableToDispatch;

  /// No description provided for @dispatchCollectedDispatched.
  ///
  /// In en, this message translates to:
  /// **'Collected {collected} · Dispatched {dispatched}'**
  String dispatchCollectedDispatched(Object collected, Object dispatched);

  /// No description provided for @dispatchNoData.
  ///
  /// In en, this message translates to:
  /// **'No data'**
  String get dispatchNoData;

  /// No description provided for @dispatchShiftAm.
  ///
  /// In en, this message translates to:
  /// **'☀️ AM'**
  String get dispatchShiftAm;

  /// No description provided for @dispatchShiftPm.
  ///
  /// In en, this message translates to:
  /// **'🌙 PM'**
  String get dispatchShiftPm;

  /// No description provided for @paymentsCouldNotLoadCycles.
  ///
  /// In en, this message translates to:
  /// **'Could not load cycles'**
  String get paymentsCouldNotLoadCycles;

  /// No description provided for @paymentsStartNewCycle.
  ///
  /// In en, this message translates to:
  /// **'Start new cycle'**
  String get paymentsStartNewCycle;

  /// No description provided for @paymentsNoCyclesTitle.
  ///
  /// In en, this message translates to:
  /// **'No cycles yet'**
  String get paymentsNoCyclesTitle;

  /// No description provided for @paymentsNoCyclesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Start a cycle to pay farmers for a period'**
  String get paymentsNoCyclesSubtitle;

  /// No description provided for @paymentsCyclesDisbursements.
  ///
  /// In en, this message translates to:
  /// **'Cycles & farmer disbursements'**
  String get paymentsCyclesDisbursements;

  /// No description provided for @paymentsCyclesTitle.
  ///
  /// In en, this message translates to:
  /// **'Cycles'**
  String get paymentsCyclesTitle;

  /// No description provided for @paymentsPendingToPayLabel.
  ///
  /// In en, this message translates to:
  /// **'Pending to pay'**
  String get paymentsPendingToPayLabel;

  /// No description provided for @paymentsPendingFarmersSub.
  ///
  /// In en, this message translates to:
  /// **'{farmers} farmers · {open} open'**
  String paymentsPendingFarmersSub(Object farmers, Object open);

  /// No description provided for @paymentsPaidLabel.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get paymentsPaidLabel;

  /// No description provided for @paymentsPaidCyclesSub.
  ///
  /// In en, this message translates to:
  /// **'across {count} cycles'**
  String paymentsPaidCyclesSub(Object count);

  /// No description provided for @paymentsCycleStatusOpen.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get paymentsCycleStatusOpen;

  /// No description provided for @paymentsCycleStatusLocked.
  ///
  /// In en, this message translates to:
  /// **'Locked'**
  String get paymentsCycleStatusLocked;

  /// No description provided for @paymentsCycleStatusPaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get paymentsCycleStatusPaid;

  /// No description provided for @paymentsCycleStatusReversed.
  ///
  /// In en, this message translates to:
  /// **'Reversed'**
  String get paymentsCycleStatusReversed;

  /// No description provided for @paymentsNetLabel.
  ///
  /// In en, this message translates to:
  /// **'net'**
  String get paymentsNetLabel;

  /// No description provided for @paymentsFarmerCount.
  ///
  /// In en, this message translates to:
  /// **'{count} farmers'**
  String paymentsFarmerCount(Object count);

  /// No description provided for @paymentsPaidCount.
  ///
  /// In en, this message translates to:
  /// **'{paid}/{total} paid'**
  String paymentsPaidCount(Object paid, Object total);

  /// No description provided for @paymentsAmountPending.
  ///
  /// In en, this message translates to:
  /// **'{amount} pending'**
  String paymentsAmountPending(Object amount);

  /// No description provided for @paymentsSelectPeriod.
  ///
  /// In en, this message translates to:
  /// **'Select period'**
  String get paymentsSelectPeriod;

  /// No description provided for @paymentsCouldNotLoadPeriods.
  ///
  /// In en, this message translates to:
  /// **'Could not load periods'**
  String get paymentsCouldNotLoadPeriods;

  /// No description provided for @paymentsPeriodInProgress.
  ///
  /// In en, this message translates to:
  /// **'in progress'**
  String get paymentsPeriodInProgress;

  /// No description provided for @paymentsPeriodClosed.
  ///
  /// In en, this message translates to:
  /// **'closed'**
  String get paymentsPeriodClosed;

  /// No description provided for @farmersAddFarmer.
  ///
  /// In en, this message translates to:
  /// **'Add Farmer'**
  String get farmersAddFarmer;

  /// No description provided for @farmersSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search by name or code'**
  String get farmersSearchHint;

  /// No description provided for @farmersCouldNotLoad.
  ///
  /// In en, this message translates to:
  /// **'Could not load farmers'**
  String get farmersCouldNotLoad;

  /// No description provided for @farmersEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No farmers registered'**
  String get farmersEmptyTitle;

  /// No description provided for @farmersNoMatchTitle.
  ///
  /// In en, this message translates to:
  /// **'No matching farmers'**
  String get farmersNoMatchTitle;

  /// No description provided for @farmersEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Farmers registered at this VMCC appear here'**
  String get farmersEmptySubtitle;

  /// No description provided for @farmerDetailEditTooltip.
  ///
  /// In en, this message translates to:
  /// **'Edit farmer'**
  String get farmerDetailEditTooltip;

  /// No description provided for @farmerDetailTabDetails.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get farmerDetailTabDetails;

  /// No description provided for @farmerDetailTabPours.
  ///
  /// In en, this message translates to:
  /// **'Pours'**
  String get farmerDetailTabPours;

  /// No description provided for @farmerDetailTabPayments.
  ///
  /// In en, this message translates to:
  /// **'Payments'**
  String get farmerDetailTabPayments;

  /// No description provided for @farmerDetailStatusActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get farmerDetailStatusActive;

  /// No description provided for @farmerDetailStatusInactive.
  ///
  /// In en, this message translates to:
  /// **'Inactive'**
  String get farmerDetailStatusInactive;

  /// No description provided for @farmerDetailPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get farmerDetailPhone;

  /// No description provided for @farmerDetailContact.
  ///
  /// In en, this message translates to:
  /// **'Contact'**
  String get farmerDetailContact;

  /// No description provided for @farmerDetailVillage.
  ///
  /// In en, this message translates to:
  /// **'Village'**
  String get farmerDetailVillage;

  /// No description provided for @farmerDetailAddress.
  ///
  /// In en, this message translates to:
  /// **'Address'**
  String get farmerDetailAddress;

  /// No description provided for @farmerDetailGps.
  ///
  /// In en, this message translates to:
  /// **'GPS'**
  String get farmerDetailGps;

  /// No description provided for @farmerDetailLocation.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get farmerDetailLocation;

  /// No description provided for @farmerDetailTotalCattle.
  ///
  /// In en, this message translates to:
  /// **'Total cattle'**
  String get farmerDetailTotalCattle;

  /// No description provided for @farmerDetailCurrentlyMilking.
  ///
  /// In en, this message translates to:
  /// **'Currently milking'**
  String get farmerDetailCurrentlyMilking;

  /// No description provided for @farmerDetailHerd.
  ///
  /// In en, this message translates to:
  /// **'Herd'**
  String get farmerDetailHerd;

  /// No description provided for @farmerDetailAadhaar.
  ///
  /// In en, this message translates to:
  /// **'Aadhaar'**
  String get farmerDetailAadhaar;

  /// No description provided for @farmerDetailIdentity.
  ///
  /// In en, this message translates to:
  /// **'Identity'**
  String get farmerDetailIdentity;

  /// No description provided for @farmerDetailBankName.
  ///
  /// In en, this message translates to:
  /// **'Bank name'**
  String get farmerDetailBankName;

  /// No description provided for @farmerDetailAccountNumber.
  ///
  /// In en, this message translates to:
  /// **'Account number'**
  String get farmerDetailAccountNumber;

  /// No description provided for @farmerDetailIfsc.
  ///
  /// In en, this message translates to:
  /// **'IFSC'**
  String get farmerDetailIfsc;

  /// No description provided for @farmerDetailUpiId.
  ///
  /// In en, this message translates to:
  /// **'UPI ID'**
  String get farmerDetailUpiId;

  /// No description provided for @farmerDetailPayment.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get farmerDetailPayment;

  /// No description provided for @farmerDetailNotProvided.
  ///
  /// In en, this message translates to:
  /// **'Not provided'**
  String get farmerDetailNotProvided;

  /// No description provided for @farmerPoursLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load pours'**
  String get farmerPoursLoadError;

  /// No description provided for @farmerPoursEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No recent pours'**
  String get farmerPoursEmptyTitle;

  /// No description provided for @farmerPoursEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'No pours in the last 30 days. Share a past cycle statement above.'**
  String get farmerPoursEmptySubtitle;

  /// No description provided for @farmerPoursCount.
  ///
  /// In en, this message translates to:
  /// **'{count} pours'**
  String farmerPoursCount(Object count);

  /// No description provided for @farmerPours30DayTotal.
  ///
  /// In en, this message translates to:
  /// **'30-day total'**
  String get farmerPours30DayTotal;

  /// No description provided for @farmerPaymentsAddEntry.
  ///
  /// In en, this message translates to:
  /// **'Add entry'**
  String get farmerPaymentsAddEntry;

  /// No description provided for @farmerPaymentsAmountHint.
  ///
  /// In en, this message translates to:
  /// **'Amount (₹)'**
  String get farmerPaymentsAmountHint;

  /// No description provided for @farmerPaymentsRecordEntry.
  ///
  /// In en, this message translates to:
  /// **'Record entry'**
  String get farmerPaymentsRecordEntry;

  /// No description provided for @farmerPaymentsHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get farmerPaymentsHistory;

  /// No description provided for @farmerPaymentsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load ledger'**
  String get farmerPaymentsLoadError;

  /// No description provided for @farmerPaymentsOutstanding.
  ///
  /// In en, this message translates to:
  /// **'Outstanding'**
  String get farmerPaymentsOutstanding;

  /// No description provided for @farmerPaymentsInvalidAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid amount'**
  String get farmerPaymentsInvalidAmount;

  /// No description provided for @farmerPaymentsNoEntries.
  ///
  /// In en, this message translates to:
  /// **'No entries yet'**
  String get farmerPaymentsNoEntries;

  /// No description provided for @farmerPaymentsTypeAdvance.
  ///
  /// In en, this message translates to:
  /// **'Advance'**
  String get farmerPaymentsTypeAdvance;

  /// No description provided for @farmerPaymentsFeedLoan.
  ///
  /// In en, this message translates to:
  /// **'Feed loan'**
  String get farmerPaymentsFeedLoan;

  /// No description provided for @farmerPaymentsRepayment.
  ///
  /// In en, this message translates to:
  /// **'Repayment'**
  String get farmerPaymentsRepayment;

  /// No description provided for @farmerPaymentsAgainstAdvance.
  ///
  /// In en, this message translates to:
  /// **'Against advance'**
  String get farmerPaymentsAgainstAdvance;

  /// No description provided for @farmerPaymentsAgainstFeedLoan.
  ///
  /// In en, this message translates to:
  /// **'Against feed loan'**
  String get farmerPaymentsAgainstFeedLoan;

  /// No description provided for @farmerPaymentsAdvanceGiven.
  ///
  /// In en, this message translates to:
  /// **'Advance given'**
  String get farmerPaymentsAdvanceGiven;

  /// No description provided for @farmerPaymentsFeedLoanGiven.
  ///
  /// In en, this message translates to:
  /// **'Feed loan given'**
  String get farmerPaymentsFeedLoanGiven;

  /// No description provided for @farmerPaymentsRepaymentLabel.
  ///
  /// In en, this message translates to:
  /// **'Repayment'**
  String get farmerPaymentsRepaymentLabel;

  /// No description provided for @farmerPaymentsAdjustment.
  ///
  /// In en, this message translates to:
  /// **'Adjustment'**
  String get farmerPaymentsAdjustment;

  /// No description provided for @addFarmerAddTitle.
  ///
  /// In en, this message translates to:
  /// **'Add Farmer'**
  String get addFarmerAddTitle;

  /// No description provided for @addFarmerEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit Farmer'**
  String get addFarmerEditTitle;

  /// No description provided for @addFarmerCamera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get addFarmerCamera;

  /// No description provided for @addFarmerGallery.
  ///
  /// In en, this message translates to:
  /// **'Gallery'**
  String get addFarmerGallery;

  /// No description provided for @addFarmerNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Name is required'**
  String get addFarmerNameRequired;

  /// No description provided for @addFarmerAadhaarLength.
  ///
  /// In en, this message translates to:
  /// **'Aadhaar must be exactly 12 digits'**
  String get addFarmerAadhaarLength;

  /// No description provided for @addFarmerLocationPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Location permission denied'**
  String get addFarmerLocationPermissionDenied;

  /// No description provided for @addFarmerRegisteredToast.
  ///
  /// In en, this message translates to:
  /// **'{name} registered'**
  String addFarmerRegisteredToast(Object name);

  /// No description provided for @addFarmerUpdatedToast.
  ///
  /// In en, this message translates to:
  /// **'{name} updated'**
  String addFarmerUpdatedToast(Object name);

  /// No description provided for @addFarmerSaveChanges.
  ///
  /// In en, this message translates to:
  /// **'Save Changes'**
  String get addFarmerSaveChanges;

  /// No description provided for @addFarmerRegisterFarmer.
  ///
  /// In en, this message translates to:
  /// **'Register Farmer'**
  String get addFarmerRegisterFarmer;

  /// No description provided for @addFarmerSectionBasics.
  ///
  /// In en, this message translates to:
  /// **'Basics'**
  String get addFarmerSectionBasics;

  /// No description provided for @addFarmerFieldFullName.
  ///
  /// In en, this message translates to:
  /// **'Full Name *'**
  String get addFarmerFieldFullName;

  /// No description provided for @addFarmerFieldPhoneNumber.
  ///
  /// In en, this message translates to:
  /// **'Phone Number'**
  String get addFarmerFieldPhoneNumber;

  /// No description provided for @addFarmerFieldDobHint.
  ///
  /// In en, this message translates to:
  /// **'Date of Birth (optional — enables app login)'**
  String get addFarmerFieldDobHint;

  /// No description provided for @addFarmerSectionLocation.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get addFarmerSectionLocation;

  /// No description provided for @addFarmerFieldVillage.
  ///
  /// In en, this message translates to:
  /// **'Village'**
  String get addFarmerFieldVillage;

  /// No description provided for @addFarmerFieldAddress.
  ///
  /// In en, this message translates to:
  /// **'Address'**
  String get addFarmerFieldAddress;

  /// No description provided for @addFarmerGettingLocation.
  ///
  /// In en, this message translates to:
  /// **'Getting location…'**
  String get addFarmerGettingLocation;

  /// No description provided for @addFarmerCaptureGps.
  ///
  /// In en, this message translates to:
  /// **'Capture GPS location'**
  String get addFarmerCaptureGps;

  /// No description provided for @addFarmerSectionIdentity.
  ///
  /// In en, this message translates to:
  /// **'Identity'**
  String get addFarmerSectionIdentity;

  /// No description provided for @addFarmerPhotoAdded.
  ///
  /// In en, this message translates to:
  /// **'Profile photo added'**
  String get addFarmerPhotoAdded;

  /// No description provided for @addFarmerPhotoAdd.
  ///
  /// In en, this message translates to:
  /// **'Add profile photo'**
  String get addFarmerPhotoAdd;

  /// No description provided for @addFarmerPhotoTapToChange.
  ///
  /// In en, this message translates to:
  /// **'Tap to change'**
  String get addFarmerPhotoTapToChange;

  /// No description provided for @addFarmerPhotoHint.
  ///
  /// In en, this message translates to:
  /// **'Take a photo or pick from gallery'**
  String get addFarmerPhotoHint;

  /// No description provided for @addFarmerFieldAadhaar.
  ///
  /// In en, this message translates to:
  /// **'Aadhaar Number'**
  String get addFarmerFieldAadhaar;

  /// No description provided for @addFarmerFieldKyc.
  ///
  /// In en, this message translates to:
  /// **'KYC Document'**
  String get addFarmerFieldKyc;

  /// No description provided for @addFarmerFieldKycAdded.
  ///
  /// In en, this message translates to:
  /// **'KYC Document added'**
  String get addFarmerFieldKycAdded;

  /// No description provided for @addFarmerSectionPayment.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get addFarmerSectionPayment;

  /// No description provided for @addFarmerFieldBankName.
  ///
  /// In en, this message translates to:
  /// **'Bank Name'**
  String get addFarmerFieldBankName;

  /// No description provided for @addFarmerFieldAccountHolderName.
  ///
  /// In en, this message translates to:
  /// **'Account Holder Name'**
  String get addFarmerFieldAccountHolderName;

  /// No description provided for @addFarmerFieldAccountNumber.
  ///
  /// In en, this message translates to:
  /// **'Account Number'**
  String get addFarmerFieldAccountNumber;

  /// No description provided for @addFarmerFieldIfscCode.
  ///
  /// In en, this message translates to:
  /// **'IFSC Code'**
  String get addFarmerFieldIfscCode;

  /// No description provided for @addFarmerFieldUpiId.
  ///
  /// In en, this message translates to:
  /// **'UPI ID'**
  String get addFarmerFieldUpiId;

  /// No description provided for @herdSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Herd'**
  String get herdSectionTitle;

  /// No description provided for @herdTotalHead.
  ///
  /// In en, this message translates to:
  /// **'{count} head'**
  String herdTotalHead(Object count);

  /// No description provided for @herdMilkType.
  ///
  /// In en, this message translates to:
  /// **'Milk type'**
  String get herdMilkType;

  /// No description provided for @herdCattleBreeds.
  ///
  /// In en, this message translates to:
  /// **'Cattle breeds'**
  String get herdCattleBreeds;

  /// No description provided for @herdNoBreedsYet.
  ///
  /// In en, this message translates to:
  /// **'No breeds added yet.'**
  String get herdNoBreedsYet;

  /// No description provided for @herdAddBreed.
  ///
  /// In en, this message translates to:
  /// **'Add breed'**
  String get herdAddBreed;

  /// No description provided for @herdInMilkCount.
  ///
  /// In en, this message translates to:
  /// **'Currently milking count'**
  String get herdInMilkCount;

  /// No description provided for @herdBreedLabel.
  ///
  /// In en, this message translates to:
  /// **'Breed'**
  String get herdBreedLabel;

  /// No description provided for @herdQtyHint.
  ///
  /// In en, this message translates to:
  /// **'Qty'**
  String get herdQtyHint;

  /// No description provided for @herdBreedDesiNatti.
  ///
  /// In en, this message translates to:
  /// **'Desi / Natti'**
  String get herdBreedDesiNatti;

  /// No description provided for @herdBreedCrossbred.
  ///
  /// In en, this message translates to:
  /// **'Crossbred'**
  String get herdBreedCrossbred;

  /// No description provided for @herdBreedJersey.
  ///
  /// In en, this message translates to:
  /// **'Jersey'**
  String get herdBreedJersey;

  /// No description provided for @herdBreedHf.
  ///
  /// In en, this message translates to:
  /// **'HF'**
  String get herdBreedHf;

  /// No description provided for @herdBreedGir.
  ///
  /// In en, this message translates to:
  /// **'Gir'**
  String get herdBreedGir;

  /// No description provided for @herdBreedSahiwal.
  ///
  /// In en, this message translates to:
  /// **'Sahiwal'**
  String get herdBreedSahiwal;

  /// No description provided for @herdBreedMurrah.
  ///
  /// In en, this message translates to:
  /// **'Murrah'**
  String get herdBreedMurrah;

  /// No description provided for @herdBreedOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get herdBreedOther;

  /// No description provided for @reportsTodaysCollection.
  ///
  /// In en, this message translates to:
  /// **'Today\'s Collection'**
  String get reportsTodaysCollection;

  /// No description provided for @reportsCouldNotLoadSummary.
  ///
  /// In en, this message translates to:
  /// **'Could not load summary'**
  String get reportsCouldNotLoadSummary;

  /// No description provided for @reportsNoCollectionToday.
  ///
  /// In en, this message translates to:
  /// **'No collection today'**
  String get reportsNoCollectionToday;

  /// No description provided for @reportsTotalCollected.
  ///
  /// In en, this message translates to:
  /// **'Total collected'**
  String get reportsTotalCollected;

  /// No description provided for @reportsFarmersPoursStat.
  ///
  /// In en, this message translates to:
  /// **'{farmerCount} farmers · {pourCount} pours'**
  String reportsFarmersPoursStat(Object farmerCount, Object pourCount);

  /// No description provided for @reportsStatAmLabel.
  ///
  /// In en, this message translates to:
  /// **'☀️ AM'**
  String get reportsStatAmLabel;

  /// No description provided for @reportsStatPmLabel.
  ///
  /// In en, this message translates to:
  /// **'🌙 PM'**
  String get reportsStatPmLabel;

  /// No description provided for @reportsStatAvgFat.
  ///
  /// In en, this message translates to:
  /// **'Avg FAT'**
  String get reportsStatAvgFat;

  /// No description provided for @reportsStatAvgSnf.
  ///
  /// In en, this message translates to:
  /// **'Avg SNF'**
  String get reportsStatAvgSnf;

  /// No description provided for @reportsStatAvgWater.
  ///
  /// In en, this message translates to:
  /// **'Avg Water %'**
  String get reportsStatAvgWater;

  /// No description provided for @reportsStatFarmers.
  ///
  /// In en, this message translates to:
  /// **'Farmers'**
  String get reportsStatFarmers;

  /// No description provided for @reportsStatGross.
  ///
  /// In en, this message translates to:
  /// **'Gross'**
  String get reportsStatGross;

  /// No description provided for @cycleCycle.
  ///
  /// In en, this message translates to:
  /// **'Cycle'**
  String get cycleCycle;

  /// No description provided for @cycleCouldNotLoad.
  ///
  /// In en, this message translates to:
  /// **'Could not load cycle'**
  String get cycleCouldNotLoad;

  /// No description provided for @cycleNotFound.
  ///
  /// In en, this message translates to:
  /// **'Cycle not found'**
  String get cycleNotFound;

  /// No description provided for @cycleNoLines.
  ///
  /// In en, this message translates to:
  /// **'No lines in this cycle'**
  String get cycleNoLines;

  /// No description provided for @cycleNoFarmersMatch.
  ///
  /// In en, this message translates to:
  /// **'No farmers match'**
  String get cycleNoFarmersMatch;

  /// No description provided for @cycleNetPayable.
  ///
  /// In en, this message translates to:
  /// **'NET PAYABLE'**
  String get cycleNetPayable;

  /// No description provided for @cyclePaidLegend.
  ///
  /// In en, this message translates to:
  /// **'{amount} paid · {paid}/{total}'**
  String cyclePaidLegend(Object amount, Object paid, Object total);

  /// No description provided for @cycleMarkAllPaid.
  ///
  /// In en, this message translates to:
  /// **'Mark all paid'**
  String get cycleMarkAllPaid;

  /// No description provided for @cycleMarkAllUnpaid.
  ///
  /// In en, this message translates to:
  /// **'Mark all unpaid'**
  String get cycleMarkAllUnpaid;

  /// No description provided for @cycleFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get cycleFilterAll;

  /// No description provided for @cycleFilterUnpaid.
  ///
  /// In en, this message translates to:
  /// **'Unpaid'**
  String get cycleFilterUnpaid;

  /// No description provided for @cycleFilterPaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get cycleFilterPaid;

  /// No description provided for @cycleLockTitle.
  ///
  /// In en, this message translates to:
  /// **'Lock cycle?'**
  String get cycleLockTitle;

  /// No description provided for @cycleLockContent.
  ///
  /// In en, this message translates to:
  /// **'Locking freezes totals and posts loan repayments. You can pay after.'**
  String get cycleLockContent;

  /// No description provided for @cyclePayTitle.
  ///
  /// In en, this message translates to:
  /// **'Pay cycle?'**
  String get cyclePayTitle;

  /// No description provided for @cyclePayContent.
  ///
  /// In en, this message translates to:
  /// **'This posts payments for every farmer and cannot be undone.'**
  String get cyclePayContent;

  /// No description provided for @cycleLockAction.
  ///
  /// In en, this message translates to:
  /// **'Lock'**
  String get cycleLockAction;

  /// No description provided for @cyclePayAction.
  ///
  /// In en, this message translates to:
  /// **'Pay'**
  String get cyclePayAction;

  /// No description provided for @cycleLockCycle.
  ///
  /// In en, this message translates to:
  /// **'Lock cycle'**
  String get cycleLockCycle;

  /// No description provided for @cyclePayCycle.
  ///
  /// In en, this message translates to:
  /// **'Pay cycle'**
  String get cyclePayCycle;

  /// No description provided for @farmerHistoryNoPoursSubtitle.
  ///
  /// In en, this message translates to:
  /// **'This farmer has no recorded pours in the last 30 days'**
  String get farmerHistoryNoPoursSubtitle;

  /// No description provided for @ledgerEditDetails.
  ///
  /// In en, this message translates to:
  /// **'Edit details'**
  String get ledgerEditDetails;

  /// No description provided for @ledgerAddEntry.
  ///
  /// In en, this message translates to:
  /// **'Add entry'**
  String get ledgerAddEntry;

  /// No description provided for @ledgerAmountHint.
  ///
  /// In en, this message translates to:
  /// **'Amount (₹)'**
  String get ledgerAmountHint;

  /// No description provided for @ledgerInvalidAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid amount'**
  String get ledgerInvalidAmount;

  /// No description provided for @ledgerRecordEntry.
  ///
  /// In en, this message translates to:
  /// **'Record entry'**
  String get ledgerRecordEntry;

  /// No description provided for @ledgerHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get ledgerHistory;

  /// No description provided for @ledgerLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load ledger'**
  String get ledgerLoadError;

  /// No description provided for @ledgerOutstanding.
  ///
  /// In en, this message translates to:
  /// **'Outstanding'**
  String get ledgerOutstanding;

  /// No description provided for @ledgerNoEntries.
  ///
  /// In en, this message translates to:
  /// **'No entries yet'**
  String get ledgerNoEntries;

  /// No description provided for @ledgerEntryAdvance.
  ///
  /// In en, this message translates to:
  /// **'Advance'**
  String get ledgerEntryAdvance;

  /// No description provided for @ledgerEntryFeedLoan.
  ///
  /// In en, this message translates to:
  /// **'Feed loan'**
  String get ledgerEntryFeedLoan;

  /// No description provided for @ledgerEntryRepayment.
  ///
  /// In en, this message translates to:
  /// **'Repayment'**
  String get ledgerEntryRepayment;

  /// No description provided for @ledgerAgainstAdvance.
  ///
  /// In en, this message translates to:
  /// **'Against advance'**
  String get ledgerAgainstAdvance;

  /// No description provided for @ledgerAgainstFeedLoan.
  ///
  /// In en, this message translates to:
  /// **'Against feed loan'**
  String get ledgerAgainstFeedLoan;

  /// No description provided for @ledgerHistoryAdvanceGiven.
  ///
  /// In en, this message translates to:
  /// **'Advance given'**
  String get ledgerHistoryAdvanceGiven;

  /// No description provided for @ledgerHistoryFeedLoanGiven.
  ///
  /// In en, this message translates to:
  /// **'Feed loan given'**
  String get ledgerHistoryFeedLoanGiven;

  /// No description provided for @ledgerHistoryRepayment.
  ///
  /// In en, this message translates to:
  /// **'Repayment'**
  String get ledgerHistoryRepayment;

  /// No description provided for @ledgerHistoryAdjustment.
  ///
  /// In en, this message translates to:
  /// **'Adjustment'**
  String get ledgerHistoryAdjustment;

  /// No description provided for @statementNoCycles.
  ///
  /// In en, this message translates to:
  /// **'No cycles available'**
  String get statementNoCycles;

  /// No description provided for @statementSelectCycle.
  ///
  /// In en, this message translates to:
  /// **'Select cycle'**
  String get statementSelectCycle;

  /// No description provided for @statementGenerateError.
  ///
  /// In en, this message translates to:
  /// **'Could not generate statement: {error}'**
  String statementGenerateError(Object error);

  /// No description provided for @statementPreparing.
  ///
  /// In en, this message translates to:
  /// **'Preparing…'**
  String get statementPreparing;

  /// No description provided for @statementShareButton.
  ///
  /// In en, this message translates to:
  /// **'Share cycle statement'**
  String get statementShareButton;

  /// No description provided for @pickerSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search farmer by name or code'**
  String get pickerSearchHint;

  /// No description provided for @pickerLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load farmers'**
  String get pickerLoadError;

  /// No description provided for @pickerNoMatch.
  ///
  /// In en, this message translates to:
  /// **'No matching farmers'**
  String get pickerNoMatch;

  /// No description provided for @addFarmerNativeNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Name (regional script)'**
  String get addFarmerNativeNameLabel;

  /// No description provided for @addFarmerNativeNameHint.
  ///
  /// In en, this message translates to:
  /// **'Auto-filled from the name above — edit if needed'**
  String get addFarmerNativeNameHint;

  /// No description provided for @voiceMicNeededTitle.
  ///
  /// In en, this message translates to:
  /// **'Microphone access needed'**
  String get voiceMicNeededTitle;

  /// No description provided for @voiceMicNeededBody.
  ///
  /// In en, this message translates to:
  /// **'To dictate by voice, allow Microphone and Speech Recognition for this app, then come back and tap the mic again.'**
  String get voiceMicNeededBody;

  /// No description provided for @voiceOpenSettings.
  ///
  /// In en, this message translates to:
  /// **'Open Settings'**
  String get voiceOpenSettings;

  /// No description provided for @voiceSpeakNow.
  ///
  /// In en, this message translates to:
  /// **'Speak now'**
  String get voiceSpeakNow;

  /// No description provided for @voiceListening.
  ///
  /// In en, this message translates to:
  /// **'Listening…'**
  String get voiceListening;

  /// No description provided for @voiceTapToSpeak.
  ///
  /// In en, this message translates to:
  /// **'Tap the mic and speak'**
  String get voiceTapToSpeak;

  /// No description provided for @voiceNoSpeech.
  ///
  /// In en, this message translates to:
  /// **'Didn\'t catch that — tap the mic to try again'**
  String get voiceNoSpeech;

  /// No description provided for @voiceDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get voiceDone;

  /// No description provided for @addFarmerScanAadhaar.
  ///
  /// In en, this message translates to:
  /// **'Scan Aadhaar to auto-fill'**
  String get addFarmerScanAadhaar;

  /// No description provided for @addFarmerScanning.
  ///
  /// In en, this message translates to:
  /// **'Reading Aadhaar…'**
  String get addFarmerScanning;

  /// No description provided for @addFarmerScanFilled.
  ///
  /// In en, this message translates to:
  /// **'Details filled — please review'**
  String get addFarmerScanFilled;

  /// No description provided for @addFarmerScanFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t read the card — try a clearer photo'**
  String get addFarmerScanFailed;

  /// No description provided for @addFarmerScanFront.
  ///
  /// In en, this message translates to:
  /// **'Front side'**
  String get addFarmerScanFront;

  /// No description provided for @addFarmerScanFrontHint.
  ///
  /// In en, this message translates to:
  /// **'Name, DOB, number'**
  String get addFarmerScanFrontHint;

  /// No description provided for @addFarmerScanBack.
  ///
  /// In en, this message translates to:
  /// **'Back side'**
  String get addFarmerScanBack;

  /// No description provided for @addFarmerScanBackHint.
  ///
  /// In en, this message translates to:
  /// **'Address'**
  String get addFarmerScanBackHint;

  /// No description provided for @photoSourceTitle.
  ///
  /// In en, this message translates to:
  /// **'Add photo'**
  String get photoSourceTitle;

  /// Toast after a farmer sets/changes their own profile photo
  ///
  /// In en, this message translates to:
  /// **'Profile photo updated'**
  String get farmerPhotoUpdated;

  /// Toast when a farmer's profile-photo upload fails
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t update photo. Please try again.'**
  String get farmerPhotoFailed;

  /// Farmer bottom-nav: collections tab
  ///
  /// In en, this message translates to:
  /// **'Collections'**
  String get navCollections;

  /// Farmer bottom-nav: services tab
  ///
  /// In en, this message translates to:
  /// **'Services'**
  String get navServices;

  /// Farmer home greeting for morning hours
  ///
  /// In en, this message translates to:
  /// **'Good morning'**
  String get farmerHomeGoodMorning;

  /// Farmer home greeting for afternoon hours
  ///
  /// In en, this message translates to:
  /// **'Good afternoon'**
  String get farmerHomeGoodAfternoon;

  /// Farmer home greeting for evening hours
  ///
  /// In en, this message translates to:
  /// **'Good evening'**
  String get farmerHomeGoodEvening;

  /// Toast shown when bell icon is tapped with no notifications
  ///
  /// In en, this message translates to:
  /// **'No new notifications'**
  String get farmerHomeNoNotifications;

  /// Farmer home hero card cycle label when no period label
  ///
  /// In en, this message translates to:
  /// **'THIS CYCLE'**
  String get farmerHomeThisCycle;

  /// Farmer home hero card pour count
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} pour} other{{count} pours}}'**
  String farmerHomeHeroPours(int count);

  /// TTS speak string for the cycle hero AudioPlay button
  ///
  /// In en, this message translates to:
  /// **'This cycle, {litres} litres, {rupees} rupees'**
  String farmerHomeHeroListenSpeak(String litres, String rupees);

  /// Accessibility label for the AudioPlay listen button in the hero card
  ///
  /// In en, this message translates to:
  /// **'Listen'**
  String get farmerHomeHeroListenLabel;

  /// Farmer home run-rate projection label
  ///
  /// In en, this message translates to:
  /// **'On track for ~{amount} this cycle'**
  String farmerHomeProjection(String amount);

  /// Farmer home empty state title when no pours this cycle
  ///
  /// In en, this message translates to:
  /// **'No pours yet this cycle'**
  String get farmerHomeEmptyTitle;

  /// Farmer home empty state subtitle
  ///
  /// In en, this message translates to:
  /// **'Your collections will appear here once recorded at the centre.'**
  String get farmerHomeEmptySubtitle;

  /// Refresh button label on farmer home empty and error states
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get farmerHomeRefresh;

  /// Today section subtitle showing total litres collected
  ///
  /// In en, this message translates to:
  /// **'{litres} L collected'**
  String farmerHomeTodayCollected(String litres);

  /// Quality nudge reason text when metric improved
  ///
  /// In en, this message translates to:
  /// **'Great work — keep the feed and routine going.'**
  String get farmerHomeNudgeImproved;

  /// Quality nudge reason text when FAT has dropped
  ///
  /// In en, this message translates to:
  /// **'Often feed quality or late lactation. Check feed and clean water, or ask your vet.'**
  String get farmerHomeNudgeFatDown;

  /// Quality nudge reason text when SNF has dropped
  ///
  /// In en, this message translates to:
  /// **'Often nutrition or water. Check feed and clean water, or ask your vet.'**
  String get farmerHomeNudgeSnfDown;

  /// Quality nudge card title with metric, direction and delta value
  ///
  /// In en, this message translates to:
  /// **'{metric} {direction} {delta} this week'**
  String farmerHomeNudgeTitle(String metric, String direction, String delta);

  /// Direction word for improved metric in quality nudge title
  ///
  /// In en, this message translates to:
  /// **'up'**
  String get farmerHomeNudgeUp;

  /// Direction word for dropped metric in quality nudge title
  ///
  /// In en, this message translates to:
  /// **'down'**
  String get farmerHomeNudgeDown;

  /// Streak nudge card title
  ///
  /// In en, this message translates to:
  /// **'{streak, plural, one{{streak}-day quality streak} other{{streak}-day quality streak}}'**
  String farmerHomeStreakTitle(int streak);

  /// Streak nudge subtitle when bonus is already unlocked
  ///
  /// In en, this message translates to:
  /// **'Bonus unlocked — keep it going!'**
  String get farmerHomeStreakBonusUnlocked;

  /// Streak nudge subtitle showing days remaining to unlock bonus
  ///
  /// In en, this message translates to:
  /// **'{remaining, plural, one{{remaining} more Grade-A day to unlock a bonus} other{{remaining} more Grade-A days to unlock a bonus}}'**
  String farmerHomeStreakRemaining(int remaining);

  /// Quick link label for rate chart
  ///
  /// In en, this message translates to:
  /// **'Rate Chart'**
  String get farmerHomeRateChart;

  /// Quick link label for rewards
  ///
  /// In en, this message translates to:
  /// **'Rewards'**
  String get farmerHomeRewards;

  /// Collections tab sticky header title
  ///
  /// In en, this message translates to:
  /// **'Collections'**
  String get farmerCollectionsTitle;

  /// Collections tab sticky header subtitle with cycle scope and pour count
  ///
  /// In en, this message translates to:
  /// **'{scope} · {count, plural, one{{count} pour} other{{count} pours}}'**
  String farmerCollectionsCyclePours(String scope, int count);

  /// Chart card label for daily volume
  ///
  /// In en, this message translates to:
  /// **'Daily volume'**
  String get farmerCollectionsDailyVolume;

  /// Chart card average per day label
  ///
  /// In en, this message translates to:
  /// **'{litres} L/day avg'**
  String farmerCollectionsAvgPerDay(String litres);

  /// Section label for current cycle collections
  ///
  /// In en, this message translates to:
  /// **'THIS CYCLE'**
  String get farmerCollectionsThisCycle;

  /// Section label for past cycle collections
  ///
  /// In en, this message translates to:
  /// **'PAST CYCLES'**
  String get farmerCollectionsPastCycles;

  /// Empty state title when no collections exist this cycle
  ///
  /// In en, this message translates to:
  /// **'No collections this cycle'**
  String get farmerCollectionsEmptyTitle;

  /// Empty state subtitle for collections tab
  ///
  /// In en, this message translates to:
  /// **'Your daily pours will appear here once recorded.'**
  String get farmerCollectionsEmptySubtitle;

  /// Past cycle summary row subtitle with litres and pour count
  ///
  /// In en, this message translates to:
  /// **'{litres} L · {count, plural, one{{count} pour} other{{count} pours}}'**
  String farmerCollectionsPastCycleSummary(String litres, int count);

  /// Eyebrow label for total litres in collection detail summary card
  ///
  /// In en, this message translates to:
  /// **'TOTAL'**
  String get farmerCollectionDetailTotal;

  /// Eyebrow label for gross amount in collection detail summary card
  ///
  /// In en, this message translates to:
  /// **'GROSS'**
  String get farmerCollectionDetailGross;

  /// Label shown in shift section when no collection was recorded for that shift
  ///
  /// In en, this message translates to:
  /// **'No collection recorded'**
  String get farmerCollectionDetailNoCollection;

  /// Label appended after AM/PM in shift section heading
  ///
  /// In en, this message translates to:
  /// **'Shift'**
  String get farmerCollectionDetailShift;

  /// Rate per litre label in pour row
  ///
  /// In en, this message translates to:
  /// **'@ {rate}/L'**
  String farmerCollectionDetailRatePerLitre(String rate);

  /// Payments tab main title
  ///
  /// In en, this message translates to:
  /// **'Payments'**
  String get farmerPaymentsTitle;

  /// Payments tab subtitle
  ///
  /// In en, this message translates to:
  /// **'Transparent, every rupee accounted'**
  String get farmerPaymentsSubtitle;

  /// Net payable card eyebrow label with cycle name
  ///
  /// In en, this message translates to:
  /// **'NET PAYABLE · {cycle}'**
  String farmerPaymentsNetPayable(String cycle);

  /// TTS speak string for payments AudioPlay button
  ///
  /// In en, this message translates to:
  /// **'Net payable this cycle, {rupees} rupees'**
  String farmerPaymentsListenSpeak(String rupees);

  /// Payments tab run-rate projection label
  ///
  /// In en, this message translates to:
  /// **'On track for ~{amount} this cycle'**
  String farmerPaymentsProjection(String amount);

  /// Payments breakdown row label for gross milk amount
  ///
  /// In en, this message translates to:
  /// **'Gross milk'**
  String get farmerPaymentsGrossMilk;

  /// Payments breakdown row label for quality bonus
  ///
  /// In en, this message translates to:
  /// **'Quality bonus'**
  String get farmerPaymentsQualityBonus;

  /// Outstanding advance chip label
  ///
  /// In en, this message translates to:
  /// **'Outstanding advance: {amount}'**
  String farmerPaymentsOutstandingAdvance(String amount);

  /// Payment history section header label
  ///
  /// In en, this message translates to:
  /// **'PAYMENT HISTORY'**
  String get farmerPaymentsHistoryHeader;

  /// Paid chip label on payment history row
  ///
  /// In en, this message translates to:
  /// **'PAID'**
  String get farmerPaymentsPaid;

  /// Deduction label for cattle feed loan
  ///
  /// In en, this message translates to:
  /// **'Cattle-feed loan'**
  String get farmerPaymentsDeductCattleFeedLoan;

  /// Deduction label for advance
  ///
  /// In en, this message translates to:
  /// **'Advance'**
  String get farmerPaymentsDeductAdvance;

  /// Deduction label for medicine deduction
  ///
  /// In en, this message translates to:
  /// **'Medicine'**
  String get farmerPaymentsDeductMedicine;

  /// Deduction label for insurance deduction
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get farmerPaymentsDeductInsurance;

  /// Payment history row subtitle with litres and pour count
  ///
  /// In en, this message translates to:
  /// **'{litres} L · {count, plural, one{{count} pour} other{{count} pours}}'**
  String farmerPaymentsHistorySummary(String litres, int count);

  /// Rate chart screen app bar title fallback
  ///
  /// In en, this message translates to:
  /// **'Rate Chart'**
  String get farmerRateChartTitle;

  /// TTS speak string for rate chart when no rate is known
  ///
  /// In en, this message translates to:
  /// **'Your milk rate chart'**
  String get farmerRateListenSpeak;

  /// TTS speak string for rate chart when rate is known
  ///
  /// In en, this message translates to:
  /// **'Your rate is {rate} rupees per litre'**
  String farmerRateListenSpeakWithRate(String rate);

  /// Rate chart empty state title
  ///
  /// In en, this message translates to:
  /// **'No rate chart active'**
  String get farmerRateEmptyTitle;

  /// Rate chart empty state subtitle
  ///
  /// In en, this message translates to:
  /// **'Contact your milk collection centre'**
  String get farmerRateEmptySubtitle;

  /// Last pour card label in rate chart
  ///
  /// In en, this message translates to:
  /// **'Your last pour'**
  String get farmerRateLastPourLabel;

  /// Section title above the FAT×SNF rate matrix
  ///
  /// In en, this message translates to:
  /// **'Rate Matrix (₹/L)'**
  String get farmerRateMatrixTitle;

  /// Section title for rate rules/bonus slabs
  ///
  /// In en, this message translates to:
  /// **'Bonuses & Slabs'**
  String get farmerRateBonusSlabsTitle;

  /// Label above flat rate value
  ///
  /// In en, this message translates to:
  /// **'FLAT RATE'**
  String get farmerRateFlatRateLabel;

  /// Coaching strip header in rate chart
  ///
  /// In en, this message translates to:
  /// **'Earn more per litre'**
  String get farmerRateEarnMore;

  /// Coaching line label to raise SNF
  ///
  /// In en, this message translates to:
  /// **'Raise SNF to {value}'**
  String farmerRateRaiseSnf(String value);

  /// Coaching line label to raise FAT
  ///
  /// In en, this message translates to:
  /// **'Raise FAT to {value}'**
  String farmerRateRaiseFat(String value);

  /// Shown in RateMatrix widget when cells list is empty
  ///
  /// In en, this message translates to:
  /// **'No matrix data'**
  String get farmerRateNoMatrixData;

  /// Rate rule tile label for grade bonus rules
  ///
  /// In en, this message translates to:
  /// **'Grade-{grade} bonus'**
  String farmerRateRuleGradeBonus(String grade);

  /// Rate rule tile label for volume range slab
  ///
  /// In en, this message translates to:
  /// **'Volume {min}–{max} L'**
  String farmerRateRuleVolumeRange(String min, String max);

  /// Rate rule tile label for volume minimum slab
  ///
  /// In en, this message translates to:
  /// **'Volume > {min} L'**
  String farmerRateRuleVolumeMin(String min);

  /// Rewards screen app bar title
  ///
  /// In en, this message translates to:
  /// **'Rewards'**
  String get farmerRewardsTitle;

  /// Badges section title in rewards screen
  ///
  /// In en, this message translates to:
  /// **'Badges'**
  String get farmerRewardsBadgesSection;

  /// Streak card heading label in rewards screen
  ///
  /// In en, this message translates to:
  /// **'Quality Streak'**
  String get farmerRewardsQualityStreak;

  /// Streak ring inner days label
  ///
  /// In en, this message translates to:
  /// **'/ {target} days'**
  String farmerRewardsStreakDays(int target);

  /// Streak text when bonus is already unlocked
  ///
  /// In en, this message translates to:
  /// **'Bonus unlocked — keep it going!'**
  String get farmerRewardsBonusUnlocked;

  /// Streak text showing remaining days to unlock bonus
  ///
  /// In en, this message translates to:
  /// **'{remaining} more to unlock a ₹500 bonus'**
  String farmerRewardsStreakRemaining(int remaining);

  /// Badge tile status label when unlocked
  ///
  /// In en, this message translates to:
  /// **'UNLOCKED'**
  String get farmerRewardsBadgeUnlocked;

  /// Badge tile status label when locked
  ///
  /// In en, this message translates to:
  /// **'LOCKED'**
  String get farmerRewardsBadgeLocked;

  /// Badge name for consistent quality badge
  ///
  /// In en, this message translates to:
  /// **'Consistent'**
  String get farmerRewardsBadgeConsistent;

  /// Badge name for 100-day club badge
  ///
  /// In en, this message translates to:
  /// **'100-Day Club'**
  String get farmerRewardsBadge100Day;

  /// Badge name for top FAT badge
  ///
  /// In en, this message translates to:
  /// **'Top FAT'**
  String get farmerRewardsBadgeTopFat;

  /// Badge name for referrer badge
  ///
  /// In en, this message translates to:
  /// **'Referrer'**
  String get farmerRewardsBadgeReferrer;

  /// Referral card title in rewards screen
  ///
  /// In en, this message translates to:
  /// **'Refer a farmer'**
  String get farmerRewardsReferTitle;

  /// Referral card body text
  ///
  /// In en, this message translates to:
  /// **'Earn ₹100 for every farmer who joins'**
  String get farmerRewardsReferBody;

  /// Share invite button label
  ///
  /// In en, this message translates to:
  /// **'Share invite'**
  String get farmerRewardsShareInvite;

  /// Toast shown when share invite is tapped
  ///
  /// In en, this message translates to:
  /// **'Referral invite coming soon!'**
  String get farmerRewardsReferralComingSoon;

  /// Services stub screen title
  ///
  /// In en, this message translates to:
  /// **'Services'**
  String get farmerServicesTitle;

  /// Services stub screen subtitle
  ///
  /// In en, this message translates to:
  /// **'Farmer services are on their way — stay tuned.'**
  String get farmerServicesSubtitle;

  /// Soon chip label on service cards
  ///
  /// In en, this message translates to:
  /// **'SOON'**
  String get farmerServicesSoon;

  /// Notify button label on services stub
  ///
  /// In en, this message translates to:
  /// **'Notify me when live'**
  String get farmerServicesNotifyMe;

  /// Toast shown when notify button is tapped
  ///
  /// In en, this message translates to:
  /// **'We\'ll notify you when services go live!'**
  String get farmerServicesNotifyToast;

  /// Service card name for cattle feed
  ///
  /// In en, this message translates to:
  /// **'Cattle Feed'**
  String get farmerServicesCattleFeedName;

  /// Service card description for cattle feed
  ///
  /// In en, this message translates to:
  /// **'Quality fodder & supplements delivered to your farm.'**
  String get farmerServicesCattleFeedDesc;

  /// Service card name for veterinary care
  ///
  /// In en, this message translates to:
  /// **'Veterinary Care'**
  String get farmerServicesVetName;

  /// Service card description for veterinary care
  ///
  /// In en, this message translates to:
  /// **'Doorstep vet visits, health check-ups & vaccinations.'**
  String get farmerServicesVetDesc;

  /// Service card name for insurance
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get farmerServicesInsuranceName;

  /// Service card description for insurance
  ///
  /// In en, this message translates to:
  /// **'Cattle insurance to protect your herd & livelihood.'**
  String get farmerServicesInsuranceDesc;

  /// Service card name for loans and advances
  ///
  /// In en, this message translates to:
  /// **'Loans & Advances'**
  String get farmerServicesLoansName;

  /// Service card description for loans and advances
  ///
  /// In en, this message translates to:
  /// **'Instant advances against your milk supply earnings.'**
  String get farmerServicesLoansDesc;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'kn', 'ta'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'kn':
      return AppLocalizationsKn();
    case 'ta':
      return AppLocalizationsTa();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
