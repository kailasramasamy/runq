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

  /// No description provided for @collectReplaceOrCombine.
  ///
  /// In en, this message translates to:
  /// **'Replace it (correction) or combine as another container for {name}?'**
  String collectReplaceOrCombine(String name);

  /// No description provided for @collectCombineResult.
  ///
  /// In en, this message translates to:
  /// **'Combined total: {total}'**
  String collectCombineResult(String total);

  /// No description provided for @collectReplace.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get collectReplace;

  /// No description provided for @collectCombine.
  ///
  /// In en, this message translates to:
  /// **'Combine'**
  String get collectCombine;

  /// No description provided for @collectAddMoreMilk.
  ///
  /// In en, this message translates to:
  /// **'Add more milk'**
  String get collectAddMoreMilk;

  /// No description provided for @collectCansTotal.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get collectCansTotal;

  /// No description provided for @collectCanN.
  ///
  /// In en, this message translates to:
  /// **'Can {n} · {qty}'**
  String collectCanN(int n, String qty);

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

  /// No description provided for @collectEntries.
  ///
  /// In en, this message translates to:
  /// **'Entries ({count})'**
  String collectEntries(int count);

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

  /// No description provided for @collectClosedAction.
  ///
  /// In en, this message translates to:
  /// **'Collection closed'**
  String get collectClosedAction;

  /// No description provided for @collectReopen.
  ///
  /// In en, this message translates to:
  /// **'Reopen'**
  String get collectReopen;

  /// CTA on Record Collection once the slot is closed — jumps straight to Dispatch for that slot.
  ///
  /// In en, this message translates to:
  /// **'Dispatch now'**
  String get collectDispatchNow;

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

  /// Home alert + dispatch badge — slots holding milk that was never sent onward
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} dispatch pending} other{{count} dispatches pending}}'**
  String dispatchPendingTitle(int count);

  /// Subtitle naming the oldest undispatched slot, e.g. 'Oldest: PM · 4 Aug · 320.0 L'
  ///
  /// In en, this message translates to:
  /// **'Oldest: {slot} · {qty}'**
  String dispatchPendingOldest(String slot, String qty);

  /// Title of the list screen showing every past slot whose collection was never closed
  ///
  /// In en, this message translates to:
  /// **'Collections to close'**
  String get pendingWorkCloseScreenTitle;

  /// Title of the list screen showing every closed slot whose milk was never sent onward
  ///
  /// In en, this message translates to:
  /// **'Dispatches pending'**
  String get pendingWorkDispatchScreenTitle;

  /// Empty state on the pending-work list once every slot is cleared
  ///
  /// In en, this message translates to:
  /// **'Nothing pending'**
  String get pendingWorkEmpty;

  /// Empty-state subtitle on the pending-work list
  ///
  /// In en, this message translates to:
  /// **'All collected milk has moved on'**
  String get pendingWorkEmptySubtitle;

  /// How stale a pending slot is, shown on each row
  ///
  /// In en, this message translates to:
  /// **'{days, plural, one{{days} day ago} other{{days} days ago}}'**
  String pendingWorkDaysAgo(int days);

  /// Heading on a dispatch leg for legacy milk received before the per-type split
  ///
  /// In en, this message translates to:
  /// **'Milk type not recorded'**
  String get dispatchUntypedTitle;

  /// Hint under the untyped dispatch leg's milk-type picker
  ///
  /// In en, this message translates to:
  /// **'Name the type before sending this on'**
  String get dispatchUntypedHint;

  /// Error when dispatch is attempted with an untyped leg whose type was never picked
  ///
  /// In en, this message translates to:
  /// **'Choose the milk type for the untyped leg.'**
  String get dispatchErrorTypeNotChosen;

  /// Home alert — past slots still holding milk whose collection was never closed, so dispatch is still gated
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} collection to close} other{{count} collections to close}}'**
  String dispatchPendingCloseTitle(int count);

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
  /// **'{count} farmers · ☾ {pm} · ☀️ {am}'**
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

  /// PP home banner — consignments in transit awaiting receipt
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 tanker to receive} other{{count} tankers to receive}}'**
  String ppHomeTankersToReceive(num count);

  /// Shown on the PM half of an overnight pool — close/dispatch belong to the anchor (AM) day
  ///
  /// In en, this message translates to:
  /// **'Evening milk leaves with the next morning\'s collection. Close and dispatch this pool on {date}.'**
  String ccReceivePoolWaitsForMorning(String date);

  /// Whole-day pooled tanker — a consignment with no single shift
  ///
  /// In en, this message translates to:
  /// **'Pooled'**
  String get consignmentSlotPooled;

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

  /// No description provided for @profileDeleteAccount.
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get profileDeleteAccount;

  /// No description provided for @profileDeleteAccountTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete account?'**
  String get profileDeleteAccountTitle;

  /// No description provided for @profileDeleteAccountBody.
  ///
  /// In en, this message translates to:
  /// **'This permanently deletes your account and personal details. Your milk collection and payment records stay in the dairy\'s books. This can\'t be undone.'**
  String get profileDeleteAccountBody;

  /// No description provided for @profileDeleteAccountConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get profileDeleteAccountConfirm;

  /// No description provided for @profileDeleteAccountError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t delete your account. Please try again.'**
  String get profileDeleteAccountError;

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

  /// No description provided for @farmerRateSpeakCoach.
  ///
  /// In en, this message translates to:
  /// **'If your {metric} reaches {value}, you earn {extra} rupees more per litre.'**
  String farmerRateSpeakCoach(Object metric, Object value, Object extra);

  /// No description provided for @helpTitle.
  ///
  /// In en, this message translates to:
  /// **'Help & support'**
  String get helpTitle;

  /// No description provided for @helpCallSupport.
  ///
  /// In en, this message translates to:
  /// **'Call support'**
  String get helpCallSupport;

  /// No description provided for @helpEmailSupport.
  ///
  /// In en, this message translates to:
  /// **'Email support'**
  String get helpEmailSupport;

  /// No description provided for @helpWhatsApp.
  ///
  /// In en, this message translates to:
  /// **'Chat on WhatsApp'**
  String get helpWhatsApp;

  /// No description provided for @helpReplySoon.
  ///
  /// In en, this message translates to:
  /// **'We usually reply within a few hours.'**
  String get helpReplySoon;

  /// No description provided for @helpNoContacts.
  ///
  /// In en, this message translates to:
  /// **'Support contacts have not been set up yet — please ask your dairy administrator.'**
  String get helpNoContacts;

  /// No description provided for @helpCouldNotOpen.
  ///
  /// In en, this message translates to:
  /// **'Could not open'**
  String get helpCouldNotOpen;

  /// No description provided for @faqFarmerQ1.
  ///
  /// In en, this message translates to:
  /// **'Where do I see my milk entries?'**
  String get faqFarmerQ1;

  /// No description provided for @faqFarmerA1.
  ///
  /// In en, this message translates to:
  /// **'The Collections tab lists every pour with its quantity and quality readings, day by day.'**
  String get faqFarmerA1;

  /// No description provided for @faqFarmerQ2.
  ///
  /// In en, this message translates to:
  /// **'How is my rate decided?'**
  String get faqFarmerQ2;

  /// No description provided for @faqFarmerA2.
  ///
  /// In en, this message translates to:
  /// **'Open Rate chart from Home — your FAT and SNF (or CLR) readings decide the price per litre.'**
  String get faqFarmerA2;

  /// No description provided for @faqFarmerQ3.
  ///
  /// In en, this message translates to:
  /// **'When will I be paid?'**
  String get faqFarmerQ3;

  /// No description provided for @faqFarmerA3.
  ///
  /// In en, this message translates to:
  /// **'Payments follow your dairy\'s payout cycle. The Payments tab shows the current cycle and what\'s payable.'**
  String get faqFarmerA3;

  /// No description provided for @faqOperatorQ1.
  ///
  /// In en, this message translates to:
  /// **'How do I record a collection?'**
  String get faqOperatorQ1;

  /// No description provided for @faqOperatorA1.
  ///
  /// In en, this message translates to:
  /// **'Tap Collect in the bottom bar, pick the farmer, then enter quantity, FAT and SNF.'**
  String get faqOperatorA1;

  /// No description provided for @faqOperatorQ2.
  ///
  /// In en, this message translates to:
  /// **'When are payouts settled?'**
  String get faqOperatorQ2;

  /// No description provided for @faqOperatorA2.
  ///
  /// In en, this message translates to:
  /// **'Payouts follow your centre\'s cycle. Check the Payments tab for the current cycle window.'**
  String get faqOperatorA2;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;

  /// No description provided for @commonErrorTitle.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load your data'**
  String get commonErrorTitle;

  /// No description provided for @commonErrorSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Please check your connection and try again.'**
  String get commonErrorSubtitle;

  /// No description provided for @commonOfflineSaved.
  ///
  /// In en, this message translates to:
  /// **'Offline — showing saved data'**
  String get commonOfflineSaved;

  /// No description provided for @shiftNotRecorded.
  ///
  /// In en, this message translates to:
  /// **'Not recorded'**
  String get shiftNotRecorded;

  /// No description provided for @syncSyncedLabel.
  ///
  /// In en, this message translates to:
  /// **'Synced'**
  String get syncSyncedLabel;

  /// No description provided for @syncSyncedAgoLabel.
  ///
  /// In en, this message translates to:
  /// **'Synced {ago}'**
  String syncSyncedAgoLabel(Object ago);

  /// No description provided for @syncToSendLabel.
  ///
  /// In en, this message translates to:
  /// **'{count} to send'**
  String syncToSendLabel(Object count);

  /// No description provided for @syncOfflineLabel.
  ///
  /// In en, this message translates to:
  /// **'Offline — saved on device'**
  String get syncOfflineLabel;

  /// No description provided for @notifScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notifScreenTitle;

  /// No description provided for @notifPushTitle.
  ///
  /// In en, this message translates to:
  /// **'Push notifications'**
  String get notifPushTitle;

  /// No description provided for @notifPushSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Get alerts for collections, dispatch and payouts'**
  String get notifPushSubtitle;

  /// No description provided for @notifPushFootnote.
  ///
  /// In en, this message translates to:
  /// **'When off, this device won\'t receive any push notifications. You can turn it back on anytime.'**
  String get notifPushFootnote;

  /// No description provided for @farmerRateEffectiveFrom.
  ///
  /// In en, this message translates to:
  /// **'From {date}'**
  String farmerRateEffectiveFrom(Object date);

  /// No description provided for @errorOffline.
  ///
  /// In en, this message translates to:
  /// **'No internet — check your connection and try again.'**
  String get errorOffline;

  /// No description provided for @errorTimeout.
  ///
  /// In en, this message translates to:
  /// **'Request timed out — try again.'**
  String get errorTimeout;

  /// No description provided for @errorGeneric.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong — try again.'**
  String get errorGeneric;

  /// No description provided for @syncSheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Entries on this device'**
  String get syncSheetTitle;

  /// No description provided for @syncSheetCounts.
  ///
  /// In en, this message translates to:
  /// **'{pending} waiting · {failed} failed'**
  String syncSheetCounts(Object pending, Object failed);

  /// No description provided for @syncSheetAllClear.
  ///
  /// In en, this message translates to:
  /// **'Everything is synced.'**
  String get syncSheetAllClear;

  /// No description provided for @syncRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get syncRetry;

  /// No description provided for @syncDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get syncDelete;

  /// No description provided for @syncDeleteConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete this entry?'**
  String get syncDeleteConfirmTitle;

  /// No description provided for @syncDeleteConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'This pour was never sent to the server. Deleting it removes it permanently — the farmer will not be paid for it.'**
  String get syncDeleteConfirmBody;

  /// No description provided for @syncSyncNow.
  ///
  /// In en, this message translates to:
  /// **'Sync now'**
  String get syncSyncNow;

  /// No description provided for @pendingSavingPill.
  ///
  /// In en, this message translates to:
  /// **'Saving…'**
  String get pendingSavingPill;

  /// No description provided for @pendingFailedPill.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get pendingFailedPill;

  /// No description provided for @collectCorrectionNeedsConnection.
  ///
  /// In en, this message translates to:
  /// **'Corrections need a connection — try again when online.'**
  String get collectCorrectionNeedsConnection;

  /// No description provided for @profileLogOutConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Log out?'**
  String get profileLogOutConfirmTitle;

  /// No description provided for @profileLogOutConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'You\'ll need to sign in again with an OTP sent to your phone.'**
  String get profileLogOutConfirmBody;

  /// No description provided for @collectImplausibleTitle.
  ///
  /// In en, this message translates to:
  /// **'Unusually high values'**
  String get collectImplausibleTitle;

  /// No description provided for @collectImplausibleBody.
  ///
  /// In en, this message translates to:
  /// **'{values} — is this correct?'**
  String collectImplausibleBody(Object values);

  /// No description provided for @collectSaveAnyway.
  ///
  /// In en, this message translates to:
  /// **'Save anyway'**
  String get collectSaveAnyway;

  /// No description provided for @collectPendingDupTitle.
  ///
  /// In en, this message translates to:
  /// **'Already saved on this device'**
  String get collectPendingDupTitle;

  /// No description provided for @collectPendingDupBody.
  ///
  /// In en, this message translates to:
  /// **'{name} already has an entry for this shift waiting to sync. Replace it, or add this as an extra container?'**
  String collectPendingDupBody(Object name);

  /// No description provided for @collectPendingDupReplace.
  ///
  /// In en, this message translates to:
  /// **'Replace saved entry'**
  String get collectPendingDupReplace;

  /// No description provided for @collectPendingDupExtraLot.
  ///
  /// In en, this message translates to:
  /// **'Add as extra lot'**
  String get collectPendingDupExtraLot;

  /// No description provided for @syncFailedLabel.
  ///
  /// In en, this message translates to:
  /// **'{count} failed — needs attention'**
  String syncFailedLabel(Object count);

  /// No description provided for @homeSeeFullHistory.
  ///
  /// In en, this message translates to:
  /// **'See full history'**
  String get homeSeeFullHistory;

  /// No description provided for @homeAmShiftInProgress.
  ///
  /// In en, this message translates to:
  /// **'AM shift · in progress'**
  String get homeAmShiftInProgress;

  /// No description provided for @homePmShiftInProgress.
  ///
  /// In en, this message translates to:
  /// **'PM shift · in progress'**
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

  /// No description provided for @homeHeroTotalToday.
  ///
  /// In en, this message translates to:
  /// **'Total today'**
  String get homeHeroTotalToday;

  /// No description provided for @homeShiftNotStarted.
  ///
  /// In en, this message translates to:
  /// **'Not started'**
  String get homeShiftNotStarted;

  /// No description provided for @homeShiftCollecting.
  ///
  /// In en, this message translates to:
  /// **'Collection active'**
  String get homeShiftCollecting;

  /// No description provided for @homeShiftToDispatch.
  ///
  /// In en, this message translates to:
  /// **'To dispatch'**
  String get homeShiftToDispatch;

  /// No description provided for @homeShiftInTransit.
  ///
  /// In en, this message translates to:
  /// **'In transit'**
  String get homeShiftInTransit;

  /// No description provided for @homeShiftAtCc.
  ///
  /// In en, this message translates to:
  /// **'Received at CC'**
  String get homeShiftAtCc;

  /// No description provided for @homeFarmerCount.
  ///
  /// In en, this message translates to:
  /// **'{count} farmers'**
  String homeFarmerCount(Object count);

  /// No description provided for @homeAllDispatched.
  ///
  /// In en, this message translates to:
  /// **'All dispatched'**
  String get homeAllDispatched;

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

  /// No description provided for @dispatchErrorNoTypeSelected.
  ///
  /// In en, this message translates to:
  /// **'Select at least one milk type to dispatch.'**
  String get dispatchErrorNoTypeSelected;

  /// Dispatch button when more than one milk type is on hand; count is the number ticked.
  ///
  /// In en, this message translates to:
  /// **'Dispatch {count} loads'**
  String dispatchTankerButtonMulti(int count);

  /// Shown on an unticked milk type in the dispatch form.
  ///
  /// In en, this message translates to:
  /// **'Held back for a later dispatch'**
  String get dispatchTypeHeldBack;

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

  /// No description provided for @dispatchOutboundOn.
  ///
  /// In en, this message translates to:
  /// **'Outbound · {date}'**
  String dispatchOutboundOn(String date);

  /// No description provided for @dispatchNoDispatchesOn.
  ///
  /// In en, this message translates to:
  /// **'No dispatches on {date}'**
  String dispatchNoDispatchesOn(String date);

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
  /// **'transit'**
  String get dispatchStatusTransit;

  /// No description provided for @dispatchStatusReceived.
  ///
  /// In en, this message translates to:
  /// **'received'**
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
  /// **'AM'**
  String get dispatchShiftAm;

  /// No description provided for @dispatchShiftPm.
  ///
  /// In en, this message translates to:
  /// **'PM'**
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

  /// No description provided for @payoutsLatestCycle.
  ///
  /// In en, this message translates to:
  /// **'Latest cycle · {period}'**
  String payoutsLatestCycle(Object period);

  /// No description provided for @payoutsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load payouts'**
  String get payoutsLoadError;

  /// No description provided for @payoutsCycleHistory.
  ///
  /// In en, this message translates to:
  /// **'Cycle history'**
  String get payoutsCycleHistory;

  /// No description provided for @payoutLineQty.
  ///
  /// In en, this message translates to:
  /// **'Milk supplied'**
  String get payoutLineQty;

  /// No description provided for @payoutLineGross.
  ///
  /// In en, this message translates to:
  /// **'Gross'**
  String get payoutLineGross;

  /// No description provided for @payoutLineBonus.
  ///
  /// In en, this message translates to:
  /// **'Quality bonus'**
  String get payoutLineBonus;

  /// No description provided for @payoutLineDeductions.
  ///
  /// In en, this message translates to:
  /// **'Deductions'**
  String get payoutLineDeductions;

  /// No description provided for @payoutLineOtherDeduction.
  ///
  /// In en, this message translates to:
  /// **'Other deduction'**
  String get payoutLineOtherDeduction;

  /// No description provided for @payoutLineStatementNo.
  ///
  /// In en, this message translates to:
  /// **'Statement'**
  String get payoutLineStatementNo;

  /// No description provided for @payoutLinePaidOn.
  ///
  /// In en, this message translates to:
  /// **'Paid on {date}'**
  String payoutLinePaidOn(Object date);

  /// No description provided for @payoutLineNotPaid.
  ///
  /// In en, this message translates to:
  /// **'Not paid yet'**
  String get payoutLineNotPaid;

  /// No description provided for @payoutLineMarkPaid.
  ///
  /// In en, this message translates to:
  /// **'Mark as paid'**
  String get payoutLineMarkPaid;

  /// No description provided for @payoutLineMarkUnpaid.
  ///
  /// In en, this message translates to:
  /// **'Mark as unpaid'**
  String get payoutLineMarkUnpaid;

  /// No description provided for @payoutsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No payouts yet'**
  String get payoutsEmptyTitle;

  /// No description provided for @payoutsEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Payouts appear here once a cycle covers this farmer'**
  String get payoutsEmptySubtitle;

  /// No description provided for @payoutsEarnedLabel.
  ///
  /// In en, this message translates to:
  /// **'Earned · {count, plural, one{{count} cycle} other{{count} cycles}}'**
  String payoutsEarnedLabel(num count);

  /// No description provided for @payoutsPaidAmount.
  ///
  /// In en, this message translates to:
  /// **'{amount} paid'**
  String payoutsPaidAmount(Object amount);

  /// No description provided for @payoutsDueAmount.
  ///
  /// In en, this message translates to:
  /// **'{amount} due'**
  String payoutsDueAmount(Object amount);

  /// No description provided for @payoutsCycleFallback.
  ///
  /// In en, this message translates to:
  /// **'Cycle'**
  String get payoutsCycleFallback;

  /// No description provided for @payoutsGrossLessDeductions.
  ///
  /// In en, this message translates to:
  /// **'{gross} gross − {deductions} deducted'**
  String payoutsGrossLessDeductions(Object gross, Object deductions);

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

  /// No description provided for @reportsTabQc.
  ///
  /// In en, this message translates to:
  /// **'QC'**
  String get reportsTabQc;

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

  /// No description provided for @statementDownloadButton.
  ///
  /// In en, this message translates to:
  /// **'Download cycle statement'**
  String get statementDownloadButton;

  /// No description provided for @statementViewerTitle.
  ///
  /// In en, this message translates to:
  /// **'Cycle statement'**
  String get statementViewerTitle;

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

  /// No description provided for @pickerRecorded.
  ///
  /// In en, this message translates to:
  /// **'Recorded'**
  String get pickerRecorded;

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
  /// **'Name, number'**
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

  /// No description provided for @farmerHomeQuality.
  ///
  /// In en, this message translates to:
  /// **'Quality'**
  String get farmerHomeQuality;

  /// No description provided for @farmerQcTitle.
  ///
  /// In en, this message translates to:
  /// **'My quality'**
  String get farmerQcTitle;

  /// No description provided for @farmerQcHeroLabel.
  ///
  /// In en, this message translates to:
  /// **'MY QUALITY · LAST {days} DAYS'**
  String farmerQcHeroLabel(int days);

  /// No description provided for @farmerQcFooter.
  ///
  /// In en, this message translates to:
  /// **'Averaged by the litres you poured'**
  String get farmerQcFooter;

  /// No description provided for @farmerQcEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Pour milk to see your quality trend'**
  String get farmerQcEmptySubtitle;

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
  /// **'Milk value (base)'**
  String get farmerPaymentsGrossMilk;

  /// No description provided for @farmerPaymentsEstimatedDeduction.
  ///
  /// In en, this message translates to:
  /// **'Advance recovery'**
  String get farmerPaymentsEstimatedDeduction;

  /// No description provided for @farmerPaymentsStatusPending.
  ///
  /// In en, this message translates to:
  /// **'PENDING'**
  String get farmerPaymentsStatusPending;

  /// No description provided for @farmerPaymentsStatusProcessing.
  ///
  /// In en, this message translates to:
  /// **'PROCESSING'**
  String get farmerPaymentsStatusProcessing;

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

  /// Tooltip for the share-PDF action on the rate chart screen
  ///
  /// In en, this message translates to:
  /// **'Share rate chart'**
  String get farmerRateShareTooltip;

  /// Error toast when the rate chart PDF share fails
  ///
  /// In en, this message translates to:
  /// **'Could not share rate chart: {error}'**
  String farmerRateShareError(Object error);

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

  /// CC bottom-nav: receive tab
  ///
  /// In en, this message translates to:
  /// **'Receive'**
  String get navReceive;

  /// No description provided for @ccDispatchToPlant.
  ///
  /// In en, this message translates to:
  /// **'Dispatch to Plant'**
  String get ccDispatchToPlant;

  /// No description provided for @ccDispatchSelectDestinationPlant.
  ///
  /// In en, this message translates to:
  /// **'Select destination plant…'**
  String get ccDispatchSelectDestinationPlant;

  /// No description provided for @ccDispatchSearchPlant.
  ///
  /// In en, this message translates to:
  /// **'Search plant'**
  String get ccDispatchSearchPlant;

  /// No description provided for @ccDispatchNoPlantsFound.
  ///
  /// In en, this message translates to:
  /// **'No plants found'**
  String get ccDispatchNoPlantsFound;

  /// No description provided for @ccDispatchErrorNoDestination.
  ///
  /// In en, this message translates to:
  /// **'Select a destination plant'**
  String get ccDispatchErrorNoDestination;

  /// No description provided for @ccDispatchErrorInvalidNumbers.
  ///
  /// In en, this message translates to:
  /// **'Enter valid numbers'**
  String get ccDispatchErrorInvalidNumbers;

  /// No description provided for @ccDispatchCloseFirstShift.
  ///
  /// In en, this message translates to:
  /// **'Close receiving for this shift before dispatching.'**
  String get ccDispatchCloseFirstShift;

  /// No description provided for @ccDispatchCloseFirstDay.
  ///
  /// In en, this message translates to:
  /// **'Close today\'s receiving before dispatching.'**
  String get ccDispatchCloseFirstDay;

  /// No description provided for @ccDispatchCloseFirstPool.
  ///
  /// In en, this message translates to:
  /// **'Close the pool (yesterday PM + today AM) before dispatching.'**
  String get ccDispatchCloseFirstPool;

  /// No description provided for @ccDispatchCloseReceivingPool.
  ///
  /// In en, this message translates to:
  /// **'Close pool receiving'**
  String get ccDispatchCloseReceivingPool;

  /// Close-receiving button for a shift slot
  ///
  /// In en, this message translates to:
  /// **'Close {slot} receiving'**
  String ccDispatchCloseReceivingShift(Object slot);

  /// No description provided for @ccDispatchCloseReceivingToday.
  ///
  /// In en, this message translates to:
  /// **'Close today\'s receiving'**
  String get ccDispatchCloseReceivingToday;

  /// Helper text under the close-receiving button
  ///
  /// In en, this message translates to:
  /// **'Unlocks dispatch to the plant for {slot}.'**
  String ccDispatchUnlocksFor(Object slot);

  /// Banner shown once receiving is closed
  ///
  /// In en, this message translates to:
  /// **'Receiving closed for {slot}'**
  String ccDispatchClosedFor(Object slot);

  /// Caption under the receiving-closed banner
  ///
  /// In en, this message translates to:
  /// **'Ready for dispatch'**
  String get ccDispatchReadyForDispatch;

  /// No description provided for @ccDispatchSlotToday.
  ///
  /// In en, this message translates to:
  /// **'today'**
  String get ccDispatchSlotToday;

  /// No description provided for @ccDispatchSlotPool.
  ///
  /// In en, this message translates to:
  /// **'this pool'**
  String get ccDispatchSlotPool;

  /// No description provided for @ccDispatchHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Dispatch history'**
  String get ccDispatchHistoryTitle;

  /// No description provided for @ccHomeChillingTank.
  ///
  /// In en, this message translates to:
  /// **'Chilling tank'**
  String get ccHomeChillingTank;

  /// No description provided for @ccHomeVmccsPool.
  ///
  /// In en, this message translates to:
  /// **'VMCCs · this pool'**
  String get ccHomeVmccsPool;

  /// No description provided for @ccHomeVmccsToday.
  ///
  /// In en, this message translates to:
  /// **'VMCCs · today'**
  String get ccHomeVmccsToday;

  /// No description provided for @ccHomeAcrossVmccs.
  ///
  /// In en, this message translates to:
  /// **'ACROSS VMCCs'**
  String get ccHomeAcrossVmccs;

  /// No description provided for @ccHomeInPoolLabel.
  ///
  /// In en, this message translates to:
  /// **'IN POOL · PREV PM + TODAY AM'**
  String get ccHomeInPoolLabel;

  /// No description provided for @ccHomeCollectedTodayLabel.
  ///
  /// In en, this message translates to:
  /// **'COLLECTED ACROSS VMCCs · TODAY'**
  String get ccHomeCollectedTodayLabel;

  /// CC home hero footer: active VMCCs and litres in transit
  ///
  /// In en, this message translates to:
  /// **'{active} of {total} VMCCs · {inTransit} in transit'**
  String ccHomeActiveOfTotal(int active, int total, Object inTransit);

  /// Overnight CC: next pool note
  ///
  /// In en, this message translates to:
  /// **'{amount} collecting for next dispatch'**
  String ccHomeNextPoolNote(Object amount);

  /// No description provided for @ccHomeReportLink.
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get ccHomeReportLink;

  /// No description provided for @ccHomeQcReportLink.
  ///
  /// In en, this message translates to:
  /// **'QC report'**
  String get ccHomeQcReportLink;

  /// CC home quick-link to the VMCC rate charts screen
  ///
  /// In en, this message translates to:
  /// **'Rate chart'**
  String get ccHomeRateChartLink;

  /// Empty state title on the CC rate charts screen
  ///
  /// In en, this message translates to:
  /// **'No active rate charts'**
  String get ccRateChartsEmptyTitle;

  /// Empty state subtitle on the CC rate charts screen
  ///
  /// In en, this message translates to:
  /// **'Rate charts set by the dairy will appear here'**
  String get ccRateChartsEmptySubtitle;

  /// No description provided for @ccInTransitLabel.
  ///
  /// In en, this message translates to:
  /// **'In transit'**
  String get ccInTransitLabel;

  /// No description provided for @ccHomePlantReadyLabel.
  ///
  /// In en, this message translates to:
  /// **'Plant-ready'**
  String get ccHomePlantReadyLabel;

  /// No description provided for @ccVmccsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load VMCCs'**
  String get ccVmccsLoadError;

  /// No description provided for @ccNoVmccsLinkedTitle.
  ///
  /// In en, this message translates to:
  /// **'No VMCCs linked'**
  String get ccNoVmccsLinkedTitle;

  /// No description provided for @ccNoVmccsLinkedSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Assign VMCCs to this CC in the web admin'**
  String get ccNoVmccsLinkedSubtitle;

  /// Farmer count under a VMCC row
  ///
  /// In en, this message translates to:
  /// **'{count} farmers'**
  String ccHomeFarmersCount(int count);

  /// No description provided for @ccHomeMorning.
  ///
  /// In en, this message translates to:
  /// **'Morning'**
  String get ccHomeMorning;

  /// No description provided for @ccHomeEvening.
  ///
  /// In en, this message translates to:
  /// **'Evening'**
  String get ccHomeEvening;

  /// CC hero shift pill: litres still in transit for that shift
  ///
  /// In en, this message translates to:
  /// **'{amount} on the way'**
  String ccHomeShiftInTransit(Object amount);

  /// CC hero shift pill: VMCCs received of those with milk this shift
  ///
  /// In en, this message translates to:
  /// **'{done} of {total} in'**
  String ccHomeShiftReceivedCount(int done, int total);

  /// CC hero shift pill when the shift has no milk at all
  ///
  /// In en, this message translates to:
  /// **'Nothing yet'**
  String get ccHomeShiftNothingIn;

  /// No description provided for @ccReceiveTitle.
  ///
  /// In en, this message translates to:
  /// **'Receive'**
  String get ccReceiveTitle;

  /// No description provided for @ccReceiveLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load consignments'**
  String get ccReceiveLoadError;

  /// No description provided for @ccReceiveManualButton.
  ///
  /// In en, this message translates to:
  /// **'Manual receive'**
  String get ccReceiveManualButton;

  /// No description provided for @ccReceiveNothingInTransit.
  ///
  /// In en, this message translates to:
  /// **'Nothing in transit'**
  String get ccReceiveNothingInTransit;

  /// No description provided for @ccReceiveNothingInTransitSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Incoming consignments appear here'**
  String get ccReceiveNothingInTransitSubtitle;

  /// No description provided for @ccReceiveRecentReceives.
  ///
  /// In en, this message translates to:
  /// **'Recent receives'**
  String get ccReceiveRecentReceives;

  /// Receive history, today card: heading over source nodes whose milk has not arrived
  ///
  /// In en, this message translates to:
  /// **'Not received yet'**
  String get historyNotReceivedYet;

  /// Receive history, today card collapsed: litres still upstream
  ///
  /// In en, this message translates to:
  /// **'{qty} not received yet'**
  String historyUpstreamPending(Object qty);

  /// No description provided for @historyAtSource.
  ///
  /// In en, this message translates to:
  /// **'at source'**
  String get historyAtSource;

  /// No description provided for @historyNothingToday.
  ///
  /// In en, this message translates to:
  /// **'Nothing received or collected yet today'**
  String get historyNothingToday;

  /// No description provided for @ccReceiveNoReceiptsYet.
  ///
  /// In en, this message translates to:
  /// **'No receipts yet'**
  String get ccReceiveNoReceiptsYet;

  /// No description provided for @ccReceiveNoReceiptsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Milk you receive from VMCCs shows here'**
  String get ccReceiveNoReceiptsSubtitle;

  /// No description provided for @ccReceiveHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Receive history'**
  String get ccReceiveHistoryTitle;

  /// No description provided for @ccReceivePillInTransit.
  ///
  /// In en, this message translates to:
  /// **'In transit'**
  String get ccReceivePillInTransit;

  /// No description provided for @ccReceiveTapToReceive.
  ///
  /// In en, this message translates to:
  /// **'Tap to receive'**
  String get ccReceiveTapToReceive;

  /// Variance percentage suffix, value already signed
  ///
  /// In en, this message translates to:
  /// **'{value}% var'**
  String ccVarianceSuffix(Object value);

  /// No description provided for @ccReceiveEditReceipt.
  ///
  /// In en, this message translates to:
  /// **'Edit receipt'**
  String get ccReceiveEditReceipt;

  /// No description provided for @ccReceiveDeleteReceipt.
  ///
  /// In en, this message translates to:
  /// **'Delete receipt'**
  String get ccReceiveDeleteReceipt;

  /// No description provided for @ccReceiveLockedForDispatch.
  ///
  /// In en, this message translates to:
  /// **'Locked — receiving closed for dispatch'**
  String get ccReceiveLockedForDispatch;

  /// No description provided for @ccReceiveDeleteConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete receipt?'**
  String get ccReceiveDeleteConfirmTitle;

  /// Delete-receipt confirm dialog body
  ///
  /// In en, this message translates to:
  /// **'{name} · {qty} will be removed.'**
  String ccReceiveDeleteConfirmBody(Object name, Object qty);

  /// No description provided for @ccReceiveReceiptDeletedToast.
  ///
  /// In en, this message translates to:
  /// **'Receipt deleted'**
  String get ccReceiveReceiptDeletedToast;

  /// No description provided for @ccReceiveNoVmccsLinkedToast.
  ///
  /// In en, this message translates to:
  /// **'No VMCCs linked to this CC'**
  String get ccReceiveNoVmccsLinkedToast;

  /// No description provided for @ccHistoryNoReceiptsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Milk received from VMCCs over the last 30 days shows here'**
  String get ccHistoryNoReceiptsSubtitle;

  /// VMCC count on a collapsed history day row
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} VMCC} other{{count} VMCCs}}'**
  String ccHistoryVmccCount(int count);

  /// No description provided for @ccHistoryDayLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load this day'**
  String get ccHistoryDayLoadError;

  /// No description provided for @ccDayLabel.
  ///
  /// In en, this message translates to:
  /// **'Day'**
  String get ccDayLabel;

  /// No description provided for @ccReportLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load the report'**
  String get ccReportLoadError;

  /// No description provided for @ccReportNoMilkReceived.
  ///
  /// In en, this message translates to:
  /// **'No milk received on this date'**
  String get ccReportNoMilkReceived;

  /// No description provided for @ccReportTotalReceived.
  ///
  /// In en, this message translates to:
  /// **'Total received'**
  String get ccReportTotalReceived;

  /// Report footer: source VMCC and receipt counts
  ///
  /// In en, this message translates to:
  /// **'{sources} VMCCs · {receipts} receipts'**
  String ccReportSourcesReceipts(int sources, int receipts);

  /// No description provided for @ccReportAvgFat.
  ///
  /// In en, this message translates to:
  /// **'AVG FAT'**
  String get ccReportAvgFat;

  /// No description provided for @ccReportAvgSnf.
  ///
  /// In en, this message translates to:
  /// **'AVG SNF'**
  String get ccReportAvgSnf;

  /// No description provided for @ccReportAvgWater.
  ///
  /// In en, this message translates to:
  /// **'AVG WATER'**
  String get ccReportAvgWater;

  /// No description provided for @ccReportSourceVmccs.
  ///
  /// In en, this message translates to:
  /// **'SOURCE VMCCS'**
  String get ccReportSourceVmccs;

  /// No description provided for @ccQcLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load QC data'**
  String get ccQcLoadError;

  /// QC report hero label, all VMCCs
  ///
  /// In en, this message translates to:
  /// **'RECEIVED · LAST {days} DAYS'**
  String ccQcHeroLabelAll(int days);

  /// No description provided for @ccQcHeroFooterAll.
  ///
  /// In en, this message translates to:
  /// **'Qty-weighted quality across all VMCC receipts'**
  String get ccQcHeroFooterAll;

  /// QC report hero label, single VMCC
  ///
  /// In en, this message translates to:
  /// **'{name} · LAST {days} DAYS'**
  String ccQcHeroLabelVmcc(Object name, int days);

  /// No description provided for @ccQcHeroFooterVmcc.
  ///
  /// In en, this message translates to:
  /// **'Qty-weighted quality received from this VMCC'**
  String get ccQcHeroFooterVmcc;

  /// No description provided for @ccQcEmptySubtitleVmcc.
  ///
  /// In en, this message translates to:
  /// **'No milk received from this VMCC in this window'**
  String get ccQcEmptySubtitleVmcc;

  /// No description provided for @ccQcScopeAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get ccQcScopeAll;

  /// No description provided for @ccQcScopeByVmcc.
  ///
  /// In en, this message translates to:
  /// **'By VMCC'**
  String get ccQcScopeByVmcc;

  /// No description provided for @ccQcScopeRanking.
  ///
  /// In en, this message translates to:
  /// **'Ranking'**
  String get ccQcScopeRanking;

  /// No description provided for @ccQcSelectVmccTitle.
  ///
  /// In en, this message translates to:
  /// **'Select VMCC'**
  String get ccQcSelectVmccTitle;

  /// No description provided for @ccQcSelectVmccPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Select a VMCC'**
  String get ccQcSelectVmccPlaceholder;

  /// QC report range chip
  ///
  /// In en, this message translates to:
  /// **'{d} days'**
  String ccQcRangeDays(int d);

  /// No description provided for @ccVmccsSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search VMCCs'**
  String get ccVmccsSearchHint;

  /// No description provided for @ccVmccsNoneAssigned.
  ///
  /// In en, this message translates to:
  /// **'No VMCCs assigned'**
  String get ccVmccsNoneAssigned;

  /// No description provided for @ccVmccsNoMatch.
  ///
  /// In en, this message translates to:
  /// **'No matching VMCCs'**
  String get ccVmccsNoMatch;

  /// No description provided for @ccManualReceiveTitle.
  ///
  /// In en, this message translates to:
  /// **'Manual receive'**
  String get ccManualReceiveTitle;

  /// No description provided for @ccManualReceiveInfoBanner.
  ///
  /// In en, this message translates to:
  /// **'Use this only when milk arrived with no dispatch entry in the app.'**
  String get ccManualReceiveInfoBanner;

  /// No description provided for @ccManualReceiveReceivingFor.
  ///
  /// In en, this message translates to:
  /// **'RECEIVING FOR'**
  String get ccManualReceiveReceivingFor;

  /// No description provided for @ccManualReceiveShiftLabel.
  ///
  /// In en, this message translates to:
  /// **'Shift'**
  String get ccManualReceiveShiftLabel;

  /// No description provided for @ccManualReceiveSelectVmcc.
  ///
  /// In en, this message translates to:
  /// **'SELECT VMCC'**
  String get ccManualReceiveSelectVmcc;

  /// No description provided for @ccManualReceiveNoVmccsLinked.
  ///
  /// In en, this message translates to:
  /// **'No VMCCs linked to this CC.'**
  String get ccManualReceiveNoVmccsLinked;

  /// No VMCCs collecting in the selected shift
  ///
  /// In en, this message translates to:
  /// **'No VMCCs collect in the {shift} shift.'**
  String ccManualReceiveNoVmccsShift(Object shift);

  /// Badge on an already-received VMCC tile
  ///
  /// In en, this message translates to:
  /// **'{qty} received'**
  String ccManualReceiveReceivedBadge(Object qty);

  /// No description provided for @ccManualReceiveCollectionDate.
  ///
  /// In en, this message translates to:
  /// **'Collection date'**
  String get ccManualReceiveCollectionDate;

  /// Delete confirm dialog body for a manual receipt
  ///
  /// In en, this message translates to:
  /// **'{name} · {date} {shift} will be removed.'**
  String ccManualReceiveDeleteConfirmBody(
    Object name,
    Object date,
    Object shift,
  );

  /// No description provided for @ccManualReceiveErrorMissingFields.
  ///
  /// In en, this message translates to:
  /// **'Enter quantity, FAT and SNF'**
  String get ccManualReceiveErrorMissingFields;

  /// No description provided for @ccMeasuredAtCc.
  ///
  /// In en, this message translates to:
  /// **'MEASURED AT CC'**
  String get ccMeasuredAtCc;

  /// No description provided for @ccManualReceiveQtyHint.
  ///
  /// In en, this message translates to:
  /// **'Qty (L)'**
  String get ccManualReceiveQtyHint;

  /// No description provided for @ccManualReceiveSaveChanges.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get ccManualReceiveSaveChanges;

  /// No description provided for @ccManualReceiveMarkReceived.
  ///
  /// In en, this message translates to:
  /// **'Mark received'**
  String get ccManualReceiveMarkReceived;

  /// No description provided for @ccReceiveConsignmentSourceFallback.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get ccReceiveConsignmentSourceFallback;

  /// No description provided for @ccReceiveConsignmentReceiptTitle.
  ///
  /// In en, this message translates to:
  /// **'Receipt'**
  String get ccReceiveConsignmentReceiptTitle;

  /// No description provided for @ccReceiveConsignmentReceiveMilkTitle.
  ///
  /// In en, this message translates to:
  /// **'Receive milk'**
  String get ccReceiveConsignmentReceiveMilkTitle;

  /// No description provided for @ccReceiveConsignmentQuantityLabel.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get ccReceiveConsignmentQuantityLabel;

  /// No description provided for @ccReceiveConsignmentSameAsDispatched.
  ///
  /// In en, this message translates to:
  /// **'Same as dispatched'**
  String get ccReceiveConsignmentSameAsDispatched;

  /// No description provided for @ccReceiveConsignmentReceivedQtyHint.
  ///
  /// In en, this message translates to:
  /// **'Received quantity (L)'**
  String get ccReceiveConsignmentReceivedQtyHint;

  /// No description provided for @ccReceiveConsignmentUpdateReceipt.
  ///
  /// In en, this message translates to:
  /// **'Update receipt'**
  String get ccReceiveConsignmentUpdateReceipt;

  /// No description provided for @ccReceiveConsignmentConfirmReceipt.
  ///
  /// In en, this message translates to:
  /// **'Confirm receipt'**
  String get ccReceiveConsignmentConfirmReceipt;

  /// No description provided for @ccReceiveConsignmentErrorQty.
  ///
  /// In en, this message translates to:
  /// **'Enter the received quantity'**
  String get ccReceiveConsignmentErrorQty;

  /// No description provided for @ccReceiveConsignmentEnterQtyForVariance.
  ///
  /// In en, this message translates to:
  /// **'Enter received qty to see variance vs dispatch'**
  String get ccReceiveConsignmentEnterQtyForVariance;

  /// No description provided for @ccReceiveConsignmentVarianceLabel.
  ///
  /// In en, this message translates to:
  /// **'Variance vs dispatch'**
  String get ccReceiveConsignmentVarianceLabel;

  /// No description provided for @ccReceiveConsignmentDispatchedByVmcc.
  ///
  /// In en, this message translates to:
  /// **'DISPATCHED BY VMCC'**
  String get ccReceiveConsignmentDispatchedByVmcc;

  /// No description provided for @ccQcReportEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No receipts in this window'**
  String get ccQcReportEmptyTitle;

  /// No description provided for @ccQcReportEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Receive milk from VMCCs to see the daily QC report'**
  String get ccQcReportEmptySubtitle;

  /// No description provided for @ccQcReportTrendsLabel.
  ///
  /// In en, this message translates to:
  /// **'Quality trends'**
  String get ccQcReportTrendsLabel;

  /// No description provided for @ccQcReportDailyQualityLabel.
  ///
  /// In en, this message translates to:
  /// **'Daily quality · qty-weighted'**
  String get ccQcReportDailyQualityLabel;

  /// No description provided for @ccQcReportDateHeader.
  ///
  /// In en, this message translates to:
  /// **'DATE'**
  String get ccQcReportDateHeader;

  /// No description provided for @ccQcReportNoReadings.
  ///
  /// In en, this message translates to:
  /// **'No readings in this window'**
  String get ccQcReportNoReadings;

  /// Ranking section title, metric name is untranslated (FAT/SNF/Water)
  ///
  /// In en, this message translates to:
  /// **'By {metric}'**
  String ccQcRankingByMetric(Object metric);

  /// No description provided for @ccQcRankingHighToLow.
  ///
  /// In en, this message translates to:
  /// **'high → low'**
  String get ccQcRankingHighToLow;

  /// No description provided for @ccQcRankingLowToHigh.
  ///
  /// In en, this message translates to:
  /// **'low → high'**
  String get ccQcRankingLowToHigh;

  /// QC ranking summary card
  ///
  /// In en, this message translates to:
  /// **'{active} of {total} VMCCs delivered · last {days} days'**
  String ccQcRankingSummary(int active, int total, int days);

  /// No description provided for @navTankers.
  ///
  /// In en, this message translates to:
  /// **'Tankers'**
  String get navTankers;

  /// No description provided for @ppHomeRawMilkTank.
  ///
  /// In en, this message translates to:
  /// **'Raw-milk tank'**
  String get ppHomeRawMilkTank;

  /// No description provided for @ppHomeCcsToday.
  ///
  /// In en, this message translates to:
  /// **'CCs · today'**
  String get ppHomeCcsToday;

  /// No description provided for @ppHomeTodayLabel.
  ///
  /// In en, this message translates to:
  /// **'TODAY'**
  String get ppHomeTodayLabel;

  /// No description provided for @ppHomeTodayReceivedLabel.
  ///
  /// In en, this message translates to:
  /// **'TODAY RECEIVED'**
  String get ppHomeTodayReceivedLabel;

  /// Tanker count shown against a CC's flow row on the PP home
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} tanker} other{{count} tankers}}'**
  String ppHomeTankersCount(int count);

  /// Hero footer delta; value already carries its +/- sign
  ///
  /// In en, this message translates to:
  /// **'{value}% vs disp.'**
  String ppHomeVarianceVsDispatch(Object value);

  /// No description provided for @ppHomeReceivedLabel.
  ///
  /// In en, this message translates to:
  /// **'Received'**
  String get ppHomeReceivedLabel;

  /// No description provided for @ppHomeNoCcsTitle.
  ///
  /// In en, this message translates to:
  /// **'No CCs dispatching'**
  String get ppHomeNoCcsTitle;

  /// No description provided for @ppHomeNoCcsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Chilling centres feeding this plant appear here'**
  String get ppHomeNoCcsSubtitle;

  /// In-transit flow chip on the PP home CC list
  ///
  /// In en, this message translates to:
  /// **'{amount} transit'**
  String ppHomeFlowTransit(Object amount);

  /// Received flow chip on the PP home CC list
  ///
  /// In en, this message translates to:
  /// **'{amount} received'**
  String ppHomeFlowReceived(Object amount);

  /// No description provided for @ppReceiveNoReceiptsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Tankers you receive from CCs show here'**
  String get ppReceiveNoReceiptsSubtitle;

  /// No description provided for @ppReceiveLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load tankers'**
  String get ppReceiveLoadError;

  /// No description provided for @ppReceiveNothingInTransitSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Inbound tankers appear here once dispatched'**
  String get ppReceiveNothingInTransitSubtitle;

  /// No description provided for @ppReceiveDispatchedByCc.
  ///
  /// In en, this message translates to:
  /// **'DISPATCHED BY CC'**
  String get ppReceiveDispatchedByCc;

  /// No description provided for @ppReceiveMeasuredAtPlant.
  ///
  /// In en, this message translates to:
  /// **'MEASURED AT PLANT'**
  String get ppReceiveMeasuredAtPlant;

  /// No description provided for @ppManualReceiveButton.
  ///
  /// In en, this message translates to:
  /// **'Receive without dispatch'**
  String get ppManualReceiveButton;

  /// No description provided for @ppManualReceiveTitle.
  ///
  /// In en, this message translates to:
  /// **'Receive without dispatch'**
  String get ppManualReceiveTitle;

  /// No description provided for @ppManualReceiveInfoBanner.
  ///
  /// In en, this message translates to:
  /// **'Use this when milk reached the plant but the CC hasn\'t entered its collections yet. Record it per milk type so manufacturing can plan against it.'**
  String get ppManualReceiveInfoBanner;

  /// No description provided for @ppManualReceiveArrivedFrom.
  ///
  /// In en, this message translates to:
  /// **'ARRIVED FROM'**
  String get ppManualReceiveArrivedFrom;

  /// No description provided for @ppManualReceiveSourceCc.
  ///
  /// In en, this message translates to:
  /// **'Chilling centre'**
  String get ppManualReceiveSourceCc;

  /// No description provided for @ppManualReceivePerTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Quantity received, per milk type'**
  String get ppManualReceivePerTypeLabel;

  /// No description provided for @ppManualReceiveNotReceived.
  ///
  /// In en, this message translates to:
  /// **'Not received'**
  String get ppManualReceiveNotReceived;

  /// No description provided for @ppManualReceiveSaveEmpty.
  ///
  /// In en, this message translates to:
  /// **'Enter a quantity'**
  String get ppManualReceiveSaveEmpty;

  /// Primary action on PP manual receive; one receipt is saved per milk type filled in
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Save 1 receipt} other{Save {count} receipts}}'**
  String manualReceiveSaveCount(int count);

  /// Shown when saving several per-type receipts fails partway, so the operator knows what already went through
  ///
  /// In en, this message translates to:
  /// **'{saved, plural, =1{1 receipt saved} other{{saved} receipts saved}}, then: {error}'**
  String manualReceivePartialError(int saved, String error);

  /// No description provided for @ppReceiveManualTag.
  ///
  /// In en, this message translates to:
  /// **'MANUAL'**
  String get ppReceiveManualTag;

  /// Confirm withdrawing a PP manual receipt, usually because the CC's own dispatch has now arrived
  ///
  /// In en, this message translates to:
  /// **'Delete the manual receipt of {qty} from {cc} on {date}? The raw-milk stock it posted is reversed.'**
  String ppReceiveDeleteManualConfirm(String qty, String cc, String date);

  /// No description provided for @ppReceiveManualDuplicateWarning.
  ///
  /// In en, this message translates to:
  /// **'A manual receipt for this CC, date and milk type is already in. Receiving this tanker too would count the milk twice — delete one.'**
  String get ppReceiveManualDuplicateWarning;

  /// No description provided for @ppTankersEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No tankers today'**
  String get ppTankersEmptyTitle;

  /// No description provided for @ppTankersEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Tankers dispatched to this plant appear here'**
  String get ppTankersEmptySubtitle;

  /// No description provided for @adminSwitchTitlePp.
  ///
  /// In en, this message translates to:
  /// **'Processing plants'**
  String get adminSwitchTitlePp;

  /// No description provided for @adminSwitchTitleCc.
  ///
  /// In en, this message translates to:
  /// **'Chilling centres'**
  String get adminSwitchTitleCc;

  /// No description provided for @adminSwitchTitleVmcc.
  ///
  /// In en, this message translates to:
  /// **'Village collection centres'**
  String get adminSwitchTitleVmcc;

  /// No description provided for @adminSwitchFarmersNav.
  ///
  /// In en, this message translates to:
  /// **'Farmers'**
  String get adminSwitchFarmersNav;

  /// No description provided for @adminSwitchDefaultUserName.
  ///
  /// In en, this message translates to:
  /// **'Dhenu User'**
  String get adminSwitchDefaultUserName;

  /// No description provided for @adminSwitchLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load today’s collection'**
  String get adminSwitchLoadError;

  /// No description provided for @adminSwitchTodayCollectionLabel.
  ///
  /// In en, this message translates to:
  /// **'TODAY’S COLLECTION'**
  String get adminSwitchTodayCollectionLabel;

  /// No description provided for @adminSwitchByChillingCentre.
  ///
  /// In en, this message translates to:
  /// **'BY CHILLING CENTRE'**
  String get adminSwitchByChillingCentre;

  /// No description provided for @adminSwitchByMilkType.
  ///
  /// In en, this message translates to:
  /// **'BY MILK TYPE'**
  String get adminSwitchByMilkType;

  /// No description provided for @adminSwitchNoCollectionTitle.
  ///
  /// In en, this message translates to:
  /// **'No collection yet today'**
  String get adminSwitchNoCollectionTitle;

  /// No description provided for @adminSwitchNoCollectionSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Per-centre and per-milk-type totals will appear here.'**
  String get adminSwitchNoCollectionSubtitle;

  /// No description provided for @adminSwitchNoCollectionSuffix.
  ///
  /// In en, this message translates to:
  /// **' · no collection'**
  String get adminSwitchNoCollectionSuffix;

  /// No description provided for @adminSwitchNotLinkedToCc.
  ///
  /// In en, this message translates to:
  /// **'Not linked to a chilling centre'**
  String get adminSwitchNotLinkedToCc;

  /// No description provided for @adminSwitchCcFallback.
  ///
  /// In en, this message translates to:
  /// **'Chilling centre'**
  String get adminSwitchCcFallback;

  /// No description provided for @adminSwitchUnlinkedVmccs.
  ///
  /// In en, this message translates to:
  /// **'Unlinked VMCCs'**
  String get adminSwitchUnlinkedVmccs;

  /// Section header for VMCCs under a chilling centre in the admin drill sheet
  ///
  /// In en, this message translates to:
  /// **'VMCCs in {name}'**
  String adminSwitchVmccsInCc(Object name);

  /// No description provided for @adminSwitchSheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Switch centre'**
  String get adminSwitchSheetTitle;

  /// No description provided for @adminSwitchLoadCentresError.
  ///
  /// In en, this message translates to:
  /// **'Could not load centres'**
  String get adminSwitchLoadCentresError;

  /// No description provided for @adminSwitchNoCentresTitle.
  ///
  /// In en, this message translates to:
  /// **'No centres yet'**
  String get adminSwitchNoCentresTitle;

  /// No description provided for @adminSwitchNoCentresSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Add VMCCs, chilling centres or plants in the web admin first'**
  String get adminSwitchNoCentresSubtitle;

  /// No description provided for @operatorSwitchRolePp.
  ///
  /// In en, this message translates to:
  /// **'Processing plant'**
  String get operatorSwitchRolePp;

  /// No description provided for @operatorSwitchRoleCc.
  ///
  /// In en, this message translates to:
  /// **'Chilling centre'**
  String get operatorSwitchRoleCc;

  /// No description provided for @operatorSwitchRoleVmcc.
  ///
  /// In en, this message translates to:
  /// **'Village collection centre'**
  String get operatorSwitchRoleVmcc;

  /// No description provided for @operatorSwitchLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your centres'**
  String get operatorSwitchLoadError;

  /// No description provided for @operatorSwitchNoneTitle.
  ///
  /// In en, this message translates to:
  /// **'No centres assigned'**
  String get operatorSwitchNoneTitle;

  /// No description provided for @operatorSwitchNoneSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Ask your admin to assign you to a centre.'**
  String get operatorSwitchNoneSubtitle;

  /// No description provided for @operatorSwitchTodayLoading.
  ///
  /// In en, this message translates to:
  /// **'Today  …'**
  String get operatorSwitchTodayLoading;

  /// No description provided for @operatorSwitchNoCollection.
  ///
  /// In en, this message translates to:
  /// **'No collection yet'**
  String get operatorSwitchNoCollection;

  /// VMCC card subtitle on the operator switcher/selector — today's collected litres and farmer count
  ///
  /// In en, this message translates to:
  /// **'Today  {qty} · {count} farmers'**
  String operatorSwitchTodaySummary(Object qty, int count);

  /// No description provided for @operatorSwitchButton.
  ///
  /// In en, this message translates to:
  /// **'Switch'**
  String get operatorSwitchButton;

  /// No description provided for @operatorSelectorGreetingPlain.
  ///
  /// In en, this message translates to:
  /// **'Namaste'**
  String get operatorSelectorGreetingPlain;

  /// Named greeting on the multi-node operator's landing screen
  ///
  /// In en, this message translates to:
  /// **'Namaste, {name}'**
  String operatorSelectorGreetingNamed(Object name);

  /// No description provided for @operatorSelectorSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose a centre to operate'**
  String get operatorSelectorSubtitle;

  /// No description provided for @operatorNoAccessTitle.
  ///
  /// In en, this message translates to:
  /// **'No Dhenu access yet'**
  String get operatorNoAccessTitle;

  /// No description provided for @operatorNoAccessSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Ask your dairy administrator to enable milk procurement for your account.'**
  String get operatorNoAccessSubtitle;

  /// No description provided for @operatorNoAccessSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get operatorNoAccessSignOut;

  /// No description provided for @authLoginTagline.
  ///
  /// In en, this message translates to:
  /// **'Milk procurement, made fair'**
  String get authLoginTagline;

  /// No description provided for @authLoginSessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Your session expired. Sign in again with your phone number.'**
  String get authLoginSessionExpired;

  /// No description provided for @commonBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get commonBack;

  /// No description provided for @authOtpPhoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get authOtpPhoneLabel;

  /// No description provided for @authOtpPhoneHint.
  ///
  /// In en, this message translates to:
  /// **'10-digit mobile'**
  String get authOtpPhoneHint;

  /// No description provided for @authOtpSendButton.
  ///
  /// In en, this message translates to:
  /// **'Send OTP'**
  String get authOtpSendButton;

  /// No description provided for @authOtpEnterDigits.
  ///
  /// In en, this message translates to:
  /// **'Enter a 10-digit mobile number'**
  String get authOtpEnterDigits;

  /// No description provided for @authOtpEnterCode.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code'**
  String get authOtpEnterCode;

  /// OTP step subtitle — phone is the full number with country code, e.g. +91 98765 43210
  ///
  /// In en, this message translates to:
  /// **'Enter the code sent to {phone}'**
  String authOtpCodeSentTo(Object phone);

  /// No description provided for @authOtpSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get authOtpSignIn;

  /// No description provided for @authOtpSmsDelay.
  ///
  /// In en, this message translates to:
  /// **'The SMS can take up to a minute to arrive.'**
  String get authOtpSmsDelay;

  /// No description provided for @authOtpChangeNumber.
  ///
  /// In en, this message translates to:
  /// **'Change number'**
  String get authOtpChangeNumber;

  /// Resend-OTP cooldown countdown
  ///
  /// In en, this message translates to:
  /// **'Resend in {seconds}s'**
  String authOtpResendIn(int seconds);

  /// No description provided for @authOtpResendButton.
  ///
  /// In en, this message translates to:
  /// **'Resend OTP'**
  String get authOtpResendButton;

  /// Debug-build network error, shown when the API host is unreachable
  ///
  /// In en, this message translates to:
  /// **'Can\'t reach the server at {baseUrl}. Is the API running and the phone on the same network?'**
  String authOtpNetworkErrorDebug(Object baseUrl);

  /// No description provided for @authOtpNetworkErrorProd.
  ///
  /// In en, this message translates to:
  /// **'Can\'t reach the server. Check your connection and try again.'**
  String get authOtpNetworkErrorProd;

  /// No description provided for @aboutScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get aboutScreenTitle;

  /// No description provided for @aboutScreenTagline.
  ///
  /// In en, this message translates to:
  /// **'Milk procurement, simplified'**
  String get aboutScreenTagline;

  /// App version line on the About screen
  ///
  /// In en, this message translates to:
  /// **'Version {version} ({build})'**
  String aboutScreenVersion(Object version, Object build);

  /// No description provided for @aboutScreenPrivacyPolicy.
  ///
  /// In en, this message translates to:
  /// **'Privacy Policy'**
  String get aboutScreenPrivacyPolicy;

  /// No description provided for @aboutScreenTermsOfService.
  ///
  /// In en, this message translates to:
  /// **'Terms of Service'**
  String get aboutScreenTermsOfService;

  /// No description provided for @aboutScreenMadeWith.
  ///
  /// In en, this message translates to:
  /// **'Made with care in India 🇮🇳'**
  String get aboutScreenMadeWith;

  /// No description provided for @aboutScreenCouldNotOpen.
  ///
  /// In en, this message translates to:
  /// **'Could not open'**
  String get aboutScreenCouldNotOpen;

  /// No description provided for @bankPayoutTitle.
  ///
  /// In en, this message translates to:
  /// **'Bank & payout'**
  String get bankPayoutTitle;

  /// No description provided for @bankPayoutLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load payout'**
  String get bankPayoutLoadError;

  /// No description provided for @bankPayoutEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No payout terms yet'**
  String get bankPayoutEmptyTitle;

  /// No description provided for @bankPayoutEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your compensation is set up by your admin and will appear here.'**
  String get bankPayoutEmptySubtitle;

  /// No description provided for @bankPayoutThisMonth.
  ///
  /// In en, this message translates to:
  /// **'THIS MONTH'**
  String get bankPayoutThisMonth;

  /// Bank & payout hero card footer — qty is a formatted litres string
  ///
  /// In en, this message translates to:
  /// **'{qty} collected · est. earning so far'**
  String bankPayoutCollectedEstEarning(Object qty);

  /// No description provided for @bankPayoutMethodLabel.
  ///
  /// In en, this message translates to:
  /// **'Payout method'**
  String get bankPayoutMethodLabel;

  /// No description provided for @bankPayoutRentLabel.
  ///
  /// In en, this message translates to:
  /// **'Rent'**
  String get bankPayoutRentLabel;

  /// Recurring monthly amount — amount is a formatted rupee string
  ///
  /// In en, this message translates to:
  /// **'{amount} / month'**
  String bankPayoutPerMonth(Object amount);

  /// No description provided for @bankPayoutSinceLabel.
  ///
  /// In en, this message translates to:
  /// **'Since'**
  String get bankPayoutSinceLabel;

  /// No description provided for @bankPayoutHasAccount.
  ///
  /// In en, this message translates to:
  /// **'Payouts go to your registered bank account.'**
  String get bankPayoutHasAccount;

  /// No description provided for @bankPayoutNoAccount.
  ///
  /// In en, this message translates to:
  /// **'No bank account on file — ask your admin to add one.'**
  String get bankPayoutNoAccount;

  /// No description provided for @bankPayoutFixedSalary.
  ///
  /// In en, this message translates to:
  /// **'Fixed salary'**
  String get bankPayoutFixedSalary;

  /// No description provided for @bankPayoutPerLitreCommission.
  ///
  /// In en, this message translates to:
  /// **'Per-litre commission'**
  String get bankPayoutPerLitreCommission;

  /// Per-litre payout rate — rate is a formatted rupee string
  ///
  /// In en, this message translates to:
  /// **'{rate} / litre'**
  String bankPayoutPerLitre(Object rate);

  /// No description provided for @langPickerTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose language'**
  String get langPickerTitle;

  /// No description provided for @langPickerComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming soon'**
  String get langPickerComingSoon;

  /// No description provided for @dispatchFatHint.
  ///
  /// In en, this message translates to:
  /// **'FAT %'**
  String get dispatchFatHint;

  /// No description provided for @dispatchSnfHint.
  ///
  /// In en, this message translates to:
  /// **'SNF %'**
  String get dispatchSnfHint;

  /// No description provided for @dispatchQtyLabel.
  ///
  /// In en, this message translates to:
  /// **'Qty (L)'**
  String get dispatchQtyLabel;

  /// No description provided for @dispatchWaterLabel.
  ///
  /// In en, this message translates to:
  /// **'Water %'**
  String get dispatchWaterLabel;

  /// No description provided for @dispatchContainerFieldLabel.
  ///
  /// In en, this message translates to:
  /// **'Container'**
  String get dispatchContainerFieldLabel;

  /// No description provided for @dispatchWaterHint.
  ///
  /// In en, this message translates to:
  /// **'Water % (optional)'**
  String get dispatchWaterHint;

  /// No description provided for @dispatchHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Dispatch history'**
  String get dispatchHistoryTitle;

  /// No description provided for @dispatchSeeFullHistory.
  ///
  /// In en, this message translates to:
  /// **'See full history'**
  String get dispatchSeeFullHistory;

  /// No description provided for @dispatchHistoryLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load history'**
  String get dispatchHistoryLoadError;

  /// No description provided for @dispatchHistoryEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No dispatches yet'**
  String get dispatchHistoryEmptyTitle;

  /// No description provided for @dispatchHistoryEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Tankers dispatched over the last 30 days show here'**
  String get dispatchHistoryEmptySubtitle;

  /// No description provided for @dispatchHistoryPlantFallback.
  ///
  /// In en, this message translates to:
  /// **'Plant'**
  String get dispatchHistoryPlantFallback;

  /// No description provided for @dispatchHistoryCcFallback.
  ///
  /// In en, this message translates to:
  /// **'Chilling centre'**
  String get dispatchHistoryCcFallback;

  /// Collapsed dispatch-history day row — count of dispatch legs
  ///
  /// In en, this message translates to:
  /// **'{n, plural, one{{n} dispatch} other{{n} dispatches}}'**
  String dispatchHistoryCount(int n);

  /// Collapsed dispatch-history day row — count still in transit
  ///
  /// In en, this message translates to:
  /// **'{n} in transit'**
  String dispatchHistoryInTransit(int n);

  /// No description provided for @dispatchHistoryReversed.
  ///
  /// In en, this message translates to:
  /// **'⊘ reversed'**
  String get dispatchHistoryReversed;

  /// Grade pill on a pour card — letter is A/B/C
  ///
  /// In en, this message translates to:
  /// **'Grade {letter}'**
  String farmerPoursGradeLabel(Object letter);

  /// No description provided for @collectLowWord.
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get collectLowWord;

  /// No description provided for @qcReportLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load QC data'**
  String get qcReportLoadError;

  /// QC report hero label scoped to one farmer — name is already uppercased
  ///
  /// In en, this message translates to:
  /// **'{name} · LAST {days} DAYS'**
  String qcReportHeroLabelFarmer(Object name, int days);

  /// QC report hero label pooled across all farmers
  ///
  /// In en, this message translates to:
  /// **'COLLECTED · LAST {days} DAYS'**
  String qcReportHeroLabelAll(int days);

  /// QC report hero label on the single-farmer QC tab (no name prefix)
  ///
  /// In en, this message translates to:
  /// **'LAST {days} DAYS'**
  String qcReportHeroLabelDays(int days);

  /// No description provided for @qcReportFooterFarmer.
  ///
  /// In en, this message translates to:
  /// **'Qty-weighted quality for this farmer'**
  String get qcReportFooterFarmer;

  /// No description provided for @qcReportFooterAll.
  ///
  /// In en, this message translates to:
  /// **'Qty-weighted quality across all farmers'**
  String get qcReportFooterAll;

  /// No description provided for @qcReportEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No readings in this window'**
  String get qcReportEmptyTitle;

  /// No description provided for @qcReportEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Record collections to see the daily QC trend'**
  String get qcReportEmptySubtitle;

  /// No description provided for @qcReportSelectFarmerTitle.
  ///
  /// In en, this message translates to:
  /// **'Select a farmer'**
  String get qcReportSelectFarmerTitle;

  /// No description provided for @qcReportSelectFarmerSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Pick a farmer to see their quality trend'**
  String get qcReportSelectFarmerSubtitle;

  /// No description provided for @qcReportScopeAll.
  ///
  /// In en, this message translates to:
  /// **'All farmers'**
  String get qcReportScopeAll;

  /// No description provided for @qcReportScopePerFarmer.
  ///
  /// In en, this message translates to:
  /// **'Per farmer'**
  String get qcReportScopePerFarmer;

  /// QC report range-selector chip
  ///
  /// In en, this message translates to:
  /// **'{d} days'**
  String qcReportDaysChip(int d);

  /// No description provided for @homeCouldNotLoadCentre.
  ///
  /// In en, this message translates to:
  /// **'Could not load your centre'**
  String get homeCouldNotLoadCentre;

  /// No description provided for @updateRequiredTitle.
  ///
  /// In en, this message translates to:
  /// **'Update required'**
  String get updateRequiredTitle;

  /// No description provided for @updateRequiredButton.
  ///
  /// In en, this message translates to:
  /// **'Update now'**
  String get updateRequiredButton;

  /// No description provided for @updateRequiredCouldNotOpenStore.
  ///
  /// In en, this message translates to:
  /// **'Could not open the store'**
  String get updateRequiredCouldNotOpenStore;

  /// No description provided for @nodePickerSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search…'**
  String get nodePickerSearchHint;

  /// No description provided for @nodePickerNoMatch.
  ///
  /// In en, this message translates to:
  /// **'No match'**
  String get nodePickerNoMatch;

  /// No description provided for @voiceFieldDictateTooltip.
  ///
  /// In en, this message translates to:
  /// **'Dictate'**
  String get voiceFieldDictateTooltip;

  /// No description provided for @voiceFieldReadBackTooltip.
  ///
  /// In en, this message translates to:
  /// **'Read back'**
  String get voiceFieldReadBackTooltip;

  /// No description provided for @splashTagline.
  ///
  /// In en, this message translates to:
  /// **'Every drop counts'**
  String get splashTagline;

  /// No description provided for @farmerBankAccountHolder.
  ///
  /// In en, this message translates to:
  /// **'Account holder'**
  String get farmerBankAccountHolder;

  /// No description provided for @farmerBankAccountNumber.
  ///
  /// In en, this message translates to:
  /// **'Account number'**
  String get farmerBankAccountNumber;

  /// No description provided for @farmerBankIfsc.
  ///
  /// In en, this message translates to:
  /// **'IFSC'**
  String get farmerBankIfsc;

  /// No description provided for @farmerBankName.
  ///
  /// In en, this message translates to:
  /// **'Bank'**
  String get farmerBankName;

  /// No description provided for @farmerBankUpi.
  ///
  /// In en, this message translates to:
  /// **'UPI ID'**
  String get farmerBankUpi;

  /// No description provided for @farmerBankEmpty.
  ///
  /// In en, this message translates to:
  /// **'No payout details yet — ask your collection centre operator to add them.'**
  String get farmerBankEmpty;

  /// No description provided for @farmerBankFootnote.
  ///
  /// In en, this message translates to:
  /// **'Your milk payments go to this account. To change it, ask your collection centre operator.'**
  String get farmerBankFootnote;

  /// No description provided for @farmerReportProblem.
  ///
  /// In en, this message translates to:
  /// **'Report a problem'**
  String get farmerReportProblem;

  /// No description provided for @farmerReportPrefill.
  ///
  /// In en, this message translates to:
  /// **'Hello, I have a question about my milk entry on {date} ({shift}, {qty}).'**
  String farmerReportPrefill(Object date, Object shift, Object qty);

  /// No description provided for @collectAdvanceChip.
  ///
  /// In en, this message translates to:
  /// **'{amount} advance outstanding'**
  String collectAdvanceChip(Object amount);

  /// No description provided for @collectShareSummary.
  ///
  /// In en, this message translates to:
  /// **'Share summary'**
  String get collectShareSummary;

  /// No description provided for @collectSummaryMessage.
  ///
  /// In en, this message translates to:
  /// **'{node} · {date} · {shift}\nMilk collected: {qty}\nFarmers: {count}\nAvg FAT {fat} · SNF {snf}'**
  String collectSummaryMessage(
    Object node,
    Object date,
    Object shift,
    Object qty,
    Object count,
    Object fat,
    Object snf,
  );

  /// No description provided for @farmerRateNewNotice.
  ///
  /// In en, this message translates to:
  /// **'New rate in effect since {date}'**
  String farmerRateNewNotice(Object date);

  /// No description provided for @homeCloseShiftNudge.
  ///
  /// In en, this message translates to:
  /// **'{shift} collection is still open — close it when you\'re done.'**
  String homeCloseShiftNudge(Object shift);

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @notificationsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all read'**
  String get notificationsMarkAllRead;

  /// No description provided for @notificationsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Nothing yet'**
  String get notificationsEmptyTitle;

  /// No description provided for @notificationsEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Dispatches and receipts for your centre show up here.'**
  String get notificationsEmptySubtitle;

  /// No description provided for @notificationsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load notifications'**
  String get notificationsLoadError;

  /// No description provided for @notificationsJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get notificationsJustNow;

  /// Relative time in the inbox
  ///
  /// In en, this message translates to:
  /// **'{n} min ago'**
  String notificationsMinutesAgo(int n);

  /// Relative time in the inbox
  ///
  /// In en, this message translates to:
  /// **'{n} h ago'**
  String notificationsHoursAgo(int n);

  /// Relative time in the inbox
  ///
  /// In en, this message translates to:
  /// **'{n} d ago'**
  String notificationsDaysAgo(int n);

  /// Source CC count on a collapsed PP history day row
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} CC} other{{count} CCs}}'**
  String ppHistoryCcCount(int count);

  /// No description provided for @ppHistoryNoReceiptsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Tankers received from CCs over the last 30 days show here'**
  String get ppHistoryNoReceiptsSubtitle;

  /// No description provided for @ppQcScopeByCc.
  ///
  /// In en, this message translates to:
  /// **'By CC'**
  String get ppQcScopeByCc;

  /// No description provided for @ppQcHeroFooterAll.
  ///
  /// In en, this message translates to:
  /// **'Qty-weighted quality across all CC tankers'**
  String get ppQcHeroFooterAll;

  /// PP QC report hero label, single CC
  ///
  /// In en, this message translates to:
  /// **'{name} · LAST {days} DAYS'**
  String ppQcHeroLabelCc(Object name, int days);

  /// No description provided for @ppQcHeroFooterCc.
  ///
  /// In en, this message translates to:
  /// **'Qty-weighted quality received from this CC'**
  String get ppQcHeroFooterCc;

  /// No description provided for @ppQcEmptySubtitleCc.
  ///
  /// In en, this message translates to:
  /// **'No milk received from this CC in this window'**
  String get ppQcEmptySubtitleCc;

  /// No description provided for @ppQcSelectCcTitle.
  ///
  /// In en, this message translates to:
  /// **'Select CC'**
  String get ppQcSelectCcTitle;

  /// No description provided for @ppQcSelectCcPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Select a CC'**
  String get ppQcSelectCcPlaceholder;

  /// PP QC ranking summary card
  ///
  /// In en, this message translates to:
  /// **'{active} of {total} CCs delivered · last {days} days'**
  String ppQcRankingSummary(int active, int total, int days);

  /// Confirm sheet title
  ///
  /// In en, this message translates to:
  /// **'Send to {plant}?'**
  String fastTrackTitle(String plant);

  /// Loading state while the plan is fetched
  ///
  /// In en, this message translates to:
  /// **'Checking what\'s ready…'**
  String get fastTrackChecking;

  /// Confirm button on the fast-track sheet
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get fastTrackSend;

  /// Empty plan title
  ///
  /// In en, this message translates to:
  /// **'Nothing to send'**
  String get fastTrackNothingTitle;

  /// Empty plan subtitle
  ///
  /// In en, this message translates to:
  /// **'No milk is waiting to go to the plant right now.'**
  String get fastTrackNothingSubtitle;

  /// Warning shown when a pooled node's close covers both shifts
  ///
  /// In en, this message translates to:
  /// **'This closes the whole day\'s collection at this centre — anything poured afterwards needs the slot reopened.'**
  String get fastTrackClosesWholeDay;

  /// Toast after a full run
  ///
  /// In en, this message translates to:
  /// **'{qty} sent to {plant}'**
  String fastTrackSuccess(String qty, String plant);

  /// Toast when the chain failed part-way
  ///
  /// In en, this message translates to:
  /// **'Stopped at {vmcc}. Everything before it was recorded — finish the rest on the dispatch screen.'**
  String fastTrackPartial(String vmcc);

  /// Title of the dispatch destination chooser on a single-site VMCC
  ///
  /// In en, this message translates to:
  /// **'Where is this going?'**
  String get dispatchDestTitle;

  /// Chooser option: run the whole chain to the plant
  ///
  /// In en, this message translates to:
  /// **'Send to {plant}'**
  String dispatchDestPlant(String plant);

  /// Subtitle for the plant option
  ///
  /// In en, this message translates to:
  /// **'Closes the chilling centre and takes the milk into raw-milk stock — the whole chain, in one step'**
  String get dispatchDestPlantSub;

  /// Chooser option: the ordinary VMCC to CC leg
  ///
  /// In en, this message translates to:
  /// **'Dispatch to {cc}'**
  String dispatchDestCc(String cc);

  /// Subtitle for the CC option
  ///
  /// In en, this message translates to:
  /// **'The usual leg — the chilling centre receives and weighs it'**
  String get dispatchDestCcSub;

  /// One-line explanation of what the whole chain does, under the route
  ///
  /// In en, this message translates to:
  /// **'Closes both centres, records the dispatch and receipt on each leg, and takes the milk into raw-milk stock.'**
  String get fastTrackChainSummary;

  /// Pill on the CC hero when a shift's milk is still at the VMCC — collected there, not dispatched
  ///
  /// In en, this message translates to:
  /// **'Yet to receive'**
  String get ccHomeShiftAwaitingVmcc;

  /// Primary action naming the exact slot that will be dispatched, e.g. 'Dispatch PM · 197.5 L'
  ///
  /// In en, this message translates to:
  /// **'Dispatch {shift} · {qty}'**
  String homeDispatchShiftQty(String shift, String qty);

  /// Primary action when the waiting slot is from an earlier day — the date is named so it can't read as today's shift
  ///
  /// In en, this message translates to:
  /// **'Dispatch {shift} · {date} · {qty}'**
  String homeDispatchSlotDated(String shift, String date, String qty);

  /// Primary action when both of today's shifts are closed and waiting
  ///
  /// In en, this message translates to:
  /// **'Dispatch AM & PM · {qty}'**
  String homeDispatchBothShifts(String qty);

  /// Plant option subtitle when the chain will send AM and PM together
  ///
  /// In en, this message translates to:
  /// **'Both shifts · {qty}'**
  String dispatchDestPlantSubBoth(String qty);

  /// CC option subtitle when two shifts are waiting but the dispatch screen takes one
  ///
  /// In en, this message translates to:
  /// **'One shift at a time — starts with {shift}'**
  String dispatchDestCcSubOne(String shift);

  /// Plant option title while the plant's name is still loading, or if it can't be resolved
  ///
  /// In en, this message translates to:
  /// **'Send to the main plant'**
  String get dispatchDestPlantGeneric;

  /// CC option title while the centre's name is still loading
  ///
  /// In en, this message translates to:
  /// **'Dispatch to the chilling centre'**
  String get dispatchDestCcGeneric;

  /// No description provided for @farmerPaymentsSegPayouts.
  ///
  /// In en, this message translates to:
  /// **'Payouts'**
  String get farmerPaymentsSegPayouts;

  /// No description provided for @farmerPaymentsSegLedger.
  ///
  /// In en, this message translates to:
  /// **'Advances'**
  String get farmerPaymentsSegLedger;

  /// No description provided for @farmerPaymentsLastPayout.
  ///
  /// In en, this message translates to:
  /// **'Last payout'**
  String get farmerPaymentsLastPayout;

  /// No description provided for @farmerPaymentsNoPayouts.
  ///
  /// In en, this message translates to:
  /// **'No payouts yet'**
  String get farmerPaymentsNoPayouts;

  /// No description provided for @farmerPaymentsNoPayoutsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Cycle payouts appear here once a cycle is created'**
  String get farmerPaymentsNoPayoutsSubtitle;

  /// No description provided for @farmerPaymentsPayoutsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load payouts'**
  String get farmerPaymentsPayoutsLoadError;

  /// Farmer Payments hub
  ///
  /// In en, this message translates to:
  /// **'{litres} L · net {amount}'**
  String farmerPaymentsLitresNet(String litres, String amount);

  /// No description provided for @farmerPaymentsMarkPaid.
  ///
  /// In en, this message translates to:
  /// **'Mark paid'**
  String get farmerPaymentsMarkPaid;

  /// No description provided for @farmerPaymentsMarkPaidError.
  ///
  /// In en, this message translates to:
  /// **'Could not update payment status'**
  String get farmerPaymentsMarkPaidError;

  /// No description provided for @farmerPaymentsUnpaid.
  ///
  /// In en, this message translates to:
  /// **'UNPAID'**
  String get farmerPaymentsUnpaid;

  /// Farmer Payments hub
  ///
  /// In en, this message translates to:
  /// **'Paid {date}'**
  String farmerPaymentsPaidOn(String date);

  /// No description provided for @farmerPaymentsBreakdown.
  ///
  /// In en, this message translates to:
  /// **'Breakdown'**
  String get farmerPaymentsBreakdown;

  /// No description provided for @farmerPaymentsGross.
  ///
  /// In en, this message translates to:
  /// **'Gross'**
  String get farmerPaymentsGross;

  /// No description provided for @farmerPaymentsBonus.
  ///
  /// In en, this message translates to:
  /// **'Quality bonus'**
  String get farmerPaymentsBonus;

  /// No description provided for @farmerPaymentsNet.
  ///
  /// In en, this message translates to:
  /// **'Net payable'**
  String get farmerPaymentsNet;

  /// No description provided for @farmerPaymentsDeductionAdvance.
  ///
  /// In en, this message translates to:
  /// **'Advance recovery'**
  String get farmerPaymentsDeductionAdvance;

  /// No description provided for @farmerPaymentsDeductionFeedLoan.
  ///
  /// In en, this message translates to:
  /// **'Feed loan recovery'**
  String get farmerPaymentsDeductionFeedLoan;

  /// No description provided for @farmerPaymentsDeductionOther.
  ///
  /// In en, this message translates to:
  /// **'Other deduction'**
  String get farmerPaymentsDeductionOther;

  /// No description provided for @farmerPaymentsPaymentMode.
  ///
  /// In en, this message translates to:
  /// **'Paid by'**
  String get farmerPaymentsPaymentMode;

  /// No description provided for @farmerPaymentsStatementNo.
  ///
  /// In en, this message translates to:
  /// **'Statement no.'**
  String get farmerPaymentsStatementNo;

  /// Farmer Payments hub
  ///
  /// In en, this message translates to:
  /// **'Advance {amount}'**
  String farmerPaymentsAdvanceDue(String amount);

  /// Farmer Payments hub
  ///
  /// In en, this message translates to:
  /// **'Feed loan {amount}'**
  String farmerPaymentsFeedLoanDue(String amount);

  /// No description provided for @farmerPaymentsRecordEntryButton.
  ///
  /// In en, this message translates to:
  /// **'Record advance, loan or repayment'**
  String get farmerPaymentsRecordEntryButton;

  /// No description provided for @farmerPaymentsEntrySaved.
  ///
  /// In en, this message translates to:
  /// **'Entry recorded'**
  String get farmerPaymentsEntrySaved;

  /// No description provided for @farmerPaymentsEarnings.
  ///
  /// In en, this message translates to:
  /// **'Earnings'**
  String get farmerPaymentsEarnings;

  /// No description provided for @farmerPaymentsDeductions.
  ///
  /// In en, this message translates to:
  /// **'Deductions'**
  String get farmerPaymentsDeductions;

  /// No description provided for @farmerPaymentsPaymentSection.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get farmerPaymentsPaymentSection;

  /// No description provided for @farmerPaymentsPaidOnLabel.
  ///
  /// In en, this message translates to:
  /// **'Paid on'**
  String get farmerPaymentsPaidOnLabel;

  /// No description provided for @farmerPaymentsReference.
  ///
  /// In en, this message translates to:
  /// **'UTR / Ref'**
  String get farmerPaymentsReference;

  /// No description provided for @farmerPaymentsNotConfirmed.
  ///
  /// In en, this message translates to:
  /// **'Not confirmed yet'**
  String get farmerPaymentsNotConfirmed;

  /// No description provided for @farmerPaymentsModeBankTransfer.
  ///
  /// In en, this message translates to:
  /// **'Bank transfer'**
  String get farmerPaymentsModeBankTransfer;

  /// No description provided for @farmerPaymentsModeUpi.
  ///
  /// In en, this message translates to:
  /// **'UPI'**
  String get farmerPaymentsModeUpi;

  /// No description provided for @farmerPaymentsModeCash.
  ///
  /// In en, this message translates to:
  /// **'Cash'**
  String get farmerPaymentsModeCash;

  /// No description provided for @farmerPaymentsModeCheque.
  ///
  /// In en, this message translates to:
  /// **'Cheque'**
  String get farmerPaymentsModeCheque;

  /// No description provided for @farmerPaymentsModeOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get farmerPaymentsModeOther;

  /// No description provided for @suppliedRecordedAtCc.
  ///
  /// In en, this message translates to:
  /// **'Recorded at the chilling centre'**
  String get suppliedRecordedAtCc;

  /// No description provided for @suppliedRecordedAtNamedCc.
  ///
  /// In en, this message translates to:
  /// **'Recorded at {cc}'**
  String suppliedRecordedAtNamedCc(String cc);

  /// No description provided for @suppliedWholeDay.
  ///
  /// In en, this message translates to:
  /// **'Whole day'**
  String get suppliedWholeDay;

  /// No description provided for @suppliedNotPriced.
  ///
  /// In en, this message translates to:
  /// **'Rate not set'**
  String get suppliedNotPriced;

  /// No description provided for @historyDaySupplySubtitle.
  ///
  /// In en, this message translates to:
  /// **'☾ {pm} · ☀️ {am}'**
  String historyDaySupplySubtitle(String pm, String am);

  /// No description provided for @dispatchHistoryRecordedOnArrival.
  ///
  /// In en, this message translates to:
  /// **'Recorded on arrival'**
  String get dispatchHistoryRecordedOnArrival;

  /// No description provided for @paymentsBillsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settlement bills'**
  String get paymentsBillsTitle;

  /// No description provided for @paymentsBillsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'What this centre was paid, cycle by cycle'**
  String get paymentsBillsSubtitle;

  /// No description provided for @paymentsBillsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No bills yet'**
  String get paymentsBillsEmptyTitle;

  /// No description provided for @paymentsBillsEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'A bill appears here once the chilling centre settles a cycle'**
  String get paymentsBillsEmptySubtitle;

  /// No description provided for @paymentsBillMilk.
  ///
  /// In en, this message translates to:
  /// **'Milk'**
  String get paymentsBillMilk;

  /// No description provided for @paymentsBillOperator.
  ///
  /// In en, this message translates to:
  /// **'Operator'**
  String get paymentsBillOperator;

  /// No description provided for @paymentsBillReversed.
  ///
  /// In en, this message translates to:
  /// **'Reversed'**
  String get paymentsBillReversed;

  /// No description provided for @paymentsBillStatement.
  ///
  /// In en, this message translates to:
  /// **'Statement'**
  String get paymentsBillStatement;

  /// No description provided for @paymentsBillsPaidTotal.
  ///
  /// In en, this message translates to:
  /// **'Paid to date'**
  String get paymentsBillsPaidTotal;

  /// No description provided for @paymentsBillsDueTotal.
  ///
  /// In en, this message translates to:
  /// **'Awaiting payment'**
  String get paymentsBillsDueTotal;

  /// No description provided for @paymentsBillTotal.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get paymentsBillTotal;

  /// No description provided for @paymentsBillStatusPaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get paymentsBillStatusPaid;

  /// No description provided for @paymentsBillStatusDue.
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get paymentsBillStatusDue;

  /// No description provided for @farmerSaleTitle.
  ///
  /// In en, this message translates to:
  /// **'Sell to farmer'**
  String get farmerSaleTitle;

  /// No description provided for @farmerSaleRecord.
  ///
  /// In en, this message translates to:
  /// **'Record sale'**
  String get farmerSaleRecord;

  /// No description provided for @farmerSaleQtyHint.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get farmerSaleQtyHint;

  /// No description provided for @farmerSaleRateHint.
  ///
  /// In en, this message translates to:
  /// **'Rate / L'**
  String get farmerSaleRateHint;

  /// No description provided for @farmerSaleInvalidEntry.
  ///
  /// In en, this message translates to:
  /// **'Enter the litres and the rate'**
  String get farmerSaleInvalidEntry;

  /// No description provided for @farmerSaleSaved.
  ///
  /// In en, this message translates to:
  /// **'Sale recorded'**
  String get farmerSaleSaved;

  /// Milk-sale sheet
  ///
  /// In en, this message translates to:
  /// **'{amount} — recovered from the next payment'**
  String farmerSaleAmountNote(String amount);

  /// No description provided for @farmerPaymentsSold.
  ///
  /// In en, this message translates to:
  /// **'Sold to farmer'**
  String get farmerPaymentsSold;

  /// Farmer Payments hub
  ///
  /// In en, this message translates to:
  /// **'Purchases {amount}'**
  String farmerPaymentsSaleDue(String amount);

  /// No description provided for @farmerPaymentsBought.
  ///
  /// In en, this message translates to:
  /// **'Bought from us'**
  String get farmerPaymentsBought;

  /// No description provided for @farmerPaymentsEarlierPurchases.
  ///
  /// In en, this message translates to:
  /// **'Earlier purchases'**
  String get farmerPaymentsEarlierPurchases;

  /// No description provided for @farmerPaymentsSegSold.
  ///
  /// In en, this message translates to:
  /// **'Sold'**
  String get farmerPaymentsSegSold;

  /// No description provided for @farmerSaleNoneYet.
  ///
  /// In en, this message translates to:
  /// **'Nothing sold to this farmer yet'**
  String get farmerSaleNoneYet;

  /// No description provided for @farmerSaleKindMilk.
  ///
  /// In en, this message translates to:
  /// **'Bulk milk'**
  String get farmerSaleKindMilk;

  /// No description provided for @farmerSaleKindProduct.
  ///
  /// In en, this message translates to:
  /// **'Product'**
  String get farmerSaleKindProduct;

  /// No description provided for @farmerSaleProductHint.
  ///
  /// In en, this message translates to:
  /// **'Choose a product'**
  String get farmerSaleProductHint;

  /// No description provided for @farmerSaleNoProducts.
  ///
  /// In en, this message translates to:
  /// **'No products set up to sell'**
  String get farmerSaleNoProducts;

  /// No description provided for @productPickerLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load products'**
  String get productPickerLoadError;

  /// No description provided for @productPickerNoMatch.
  ///
  /// In en, this message translates to:
  /// **'No matching products'**
  String get productPickerNoMatch;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @farmerSaleEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit sale'**
  String get farmerSaleEditTitle;

  /// No description provided for @farmerSaleUpdated.
  ///
  /// In en, this message translates to:
  /// **'Sale updated'**
  String get farmerSaleUpdated;

  /// No description provided for @farmerSaleEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get farmerSaleEdit;

  /// No description provided for @farmerSaleDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get farmerSaleDelete;

  /// No description provided for @farmerSaleDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this sale? It will no longer be deducted.'**
  String get farmerSaleDeleteConfirm;

  /// No description provided for @farmerSaleDeleted.
  ///
  /// In en, this message translates to:
  /// **'Sale deleted'**
  String get farmerSaleDeleted;

  /// Farmer payments card
  ///
  /// In en, this message translates to:
  /// **'{amount} still owed after this payment'**
  String farmerPaymentsStillOwed(String amount);

  /// Running cycle card heading
  ///
  /// In en, this message translates to:
  /// **'This cycle'**
  String get runningCycleTitle;

  /// Running cycle card
  ///
  /// In en, this message translates to:
  /// **'Net payable now'**
  String get runningCycleNetPayable;

  /// Running cycle card
  ///
  /// In en, this message translates to:
  /// **'Milk value'**
  String get runningCycleGross;

  /// Running cycle card empty state
  ///
  /// In en, this message translates to:
  /// **'No cycle cadence set'**
  String get runningCycleNoCadence;

  /// Running cycle card empty state
  ///
  /// In en, this message translates to:
  /// **'Set a collection cycle in Settings to see a running balance'**
  String get runningCycleNoCadenceHint;

  /// Running cycle card empty state
  ///
  /// In en, this message translates to:
  /// **'No collection yet this cycle'**
  String get runningCycleNoPours;

  /// Running cycle card error
  ///
  /// In en, this message translates to:
  /// **'Could not load this cycle'**
  String get runningCycleLoadError;

  /// Chip shown when the cycle is locked/paid so the figure can no longer move
  ///
  /// In en, this message translates to:
  /// **'Locked — final'**
  String get runningCycleFrozen;

  /// Chip shown while the cycle is still collecting
  ///
  /// In en, this message translates to:
  /// **'Running total'**
  String get runningCycleLive;

  /// Shown when deductions absorb the whole milk value
  ///
  /// In en, this message translates to:
  /// **'Fully recovered against dues'**
  String get runningCycleFullyRecovered;

  /// Running cycle card, CC mode
  ///
  /// In en, this message translates to:
  /// **'{count} centres'**
  String runningCycleVmccCount(int count);

  /// Running cycle card
  ///
  /// In en, this message translates to:
  /// **'{count} farmers'**
  String runningCycleFarmerCount(int count);

  /// CC per-VMCC running balance screen
  ///
  /// In en, this message translates to:
  /// **'Cycle balance'**
  String get ccCycleBalanceTitle;

  /// CC home quick link
  ///
  /// In en, this message translates to:
  /// **'Cycle balance'**
  String get ccCycleBalanceLink;

  /// CC per-VMCC running balance screen
  ///
  /// In en, this message translates to:
  /// **'No centre has collected yet this cycle'**
  String get ccCycleBalanceEmpty;

  /// Per-VMCC row subtitle
  ///
  /// In en, this message translates to:
  /// **'Milk {amount}'**
  String ccCycleBalanceMilk(String amount);

  /// Per-VMCC row subtitle
  ///
  /// In en, this message translates to:
  /// **'Comp {amount}'**
  String ccCycleBalanceComp(String amount);

  /// Running cycle card deduction line
  ///
  /// In en, this message translates to:
  /// **'less dues {amount}'**
  String runningCycleDeducted(String amount);

  /// Running cycle card — operator comp folded into a CC bill
  ///
  /// In en, this message translates to:
  /// **'plus comp {amount}'**
  String runningCycleComp(String amount);

  /// CC Payments tab — the per-VMCC view of the same cycles
  ///
  /// In en, this message translates to:
  /// **'Centres'**
  String get ccPaymentsCentresTitle;

  /// Cycle card — payees are centres, not farmers (bulk-settled CC)
  ///
  /// In en, this message translates to:
  /// **'{count} centres'**
  String paymentsCentreCount(Object count);

  /// Pending-to-pay subtitle for a bulk-settled CC
  ///
  /// In en, this message translates to:
  /// **'{centres} centres · {open} open'**
  String paymentsPendingCentresSub(Object centres, Object open);

  /// Cycle detail — per-VMCC breakdown heading
  ///
  /// In en, this message translates to:
  /// **'By centre'**
  String get cycleCentreBreakup;

  /// Cycle detail — empty breakdown
  ///
  /// In en, this message translates to:
  /// **'No centre bills in this cycle'**
  String get cycleNoBills;

  /// Cycle detail — an unpaid centre bill
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get cycleBillDue;
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
