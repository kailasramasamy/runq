// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Tamil (`ta`).
class AppLocalizationsTa extends AppLocalizations {
  AppLocalizationsTa([String locale = 'ta']) : super(locale);

  @override
  String get navHome => 'முகப்பு';

  @override
  String get navCollect => 'சேகரிப்பு';

  @override
  String get navDispatch => 'அனுப்புதல்';

  @override
  String get navPayments => 'கொடுப்பனவு';

  @override
  String get navProfile => 'சுயவிவரம்';

  @override
  String get commonLitres => 'லிட்டர்';

  @override
  String get commonSelectFarmer => 'விவசாயியைத் தேர்ந்தெடுக்கவும்';

  @override
  String get commonMilkType => 'பால் வகை';

  @override
  String get commonCancel => 'ரத்து செய்';

  @override
  String get commonNext => 'அடுத்து';

  @override
  String get commonToday => 'இன்று';

  @override
  String get milkTypeCowA1 => 'பசு A1 (சாதாரண)';

  @override
  String get milkTypeCowA2 => 'பசு A2 (நாட்டு)';

  @override
  String get milkTypeBuffalo => 'எருமை';

  @override
  String get milkTypeMixed => 'கலப்பு';

  @override
  String get milkTypeCowLegacy => 'பசு (பழைய)';

  @override
  String get recordCollectionTitle => 'சேகரிப்பைப் பதிவு செய்க';

  @override
  String get editCollectionTitle => 'சேகரிப்பைத் திருத்து';

  @override
  String collectAlreadyRecorded(String shift) {
    return 'இந்த $shift ஷிப்டில் ஏற்கனவே பதிவு செய்யப்பட்டது';
  }

  @override
  String collectReplaceOrAdd(String name) {
    return '$name க்கு அதை மாற்றவா (திருத்தம்) அல்லது மற்றொரு லாட் சேர்க்கவா?';
  }

  @override
  String get collectReplace => 'மாற்று';

  @override
  String get collectAddLot => 'லாட் சேர்';

  @override
  String get collectSavedOnDevice =>
      'சாதனத்தில் சேமிக்கப்பட்டது · ஒத்திசைக்கும்';

  @override
  String get collectComputingRate => 'விலை கணக்கிடப்படுகிறது…';

  @override
  String get collectEnterClrPreview => 'விலையைப் பார்க்க CLR ஐ உள்ளிடவும்';

  @override
  String get collectEnterFatSnfPreview =>
      'விலையைப் பார்க்க FAT & SNF ஐ உள்ளிடவும்';

  @override
  String get collectRateOnSync => 'ஒத்திசைக்கும்போது விலை கணக்கிடப்படும்';

  @override
  String collectTodaysEntries(int count) {
    return 'இன்றைய பதிவுகள் ($count)';
  }

  @override
  String get collectSaveAndNext => 'சேமித்து அடுத்து';

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
  String get collectReopen => 'Reopen';

  @override
  String get collectCloseBlockedPending =>
      'Some pours haven\'t synced yet — wait for sync, then close.';

  @override
  String get dispatchCloseFirst =>
      'Close collection for this shift before dispatching.';

  @override
  String get dispatchCloseFirstDay =>
      'Close today\'s collection before dispatching.';

  @override
  String get historyLoadError => 'வரலாற்றை ஏற்ற முடியவில்லை';

  @override
  String get historyByDay => 'நாள் வாரியாக';

  @override
  String get historyByFarmer => 'விவசாயி வாரியாக';

  @override
  String get historyAll => 'அனைத்தும்';

  @override
  String get historyNoHistory => 'சேகரிப்பு வரலாறு இல்லை';

  @override
  String get historyNoHistorySubtitle =>
      'கடந்த 30 நாட்களின் பதிவு செய்யப்பட்ட சேகரிப்புகள் இங்கே தோன்றும்';

  @override
  String get historyNoFarmersMatch => 'எந்த விவசாயியும் பொருந்தவில்லை';

  @override
  String get historyNoFarmersMatchSubtitle => 'மற்றொரு பெயரை முயற்சிக்கவும்';

  @override
  String get historySearchFarmer => 'விவசாயியைத் தேடவும்';

  @override
  String get historyFarmerFallback => 'விவசாயி';

  @override
  String historyDaySubtitle(int count, String pm, String am) {
    return '$count விவசாயிகள் · 🌙 $pm · ☀️ $am';
  }

  @override
  String get pourDetailDeleteTitle => 'பதிவை நீக்கவா?';

  @override
  String pourDetailDeleteContent(String qty, String name) {
    return '$name க்கு $qty திரும்பப் பெறப்படும். இதை மாற்ற முடியாது.';
  }

  @override
  String get pourDetailFarmerFallback => 'இந்த விவசாயி';

  @override
  String get pourDetailDelete => 'நீக்கு';

  @override
  String get pourDetailModify => 'மாற்று';

  @override
  String get pourDetailReversed => 'திரும்பப் பெறப்பட்டது';

  @override
  String get pourDetailRatePerLitre => 'விலை / லிட்டர்';

  @override
  String get pourDetailQuantity => 'அளவு';

  @override
  String get pourDetailMilkType => 'பால் வகை';

  @override
  String get pourDetailShift => 'ஷிப்ட்';

  @override
  String get pourDetailDate => 'தேதி';

  @override
  String get pourDetailAmount => 'தொகை';

  @override
  String get shiftAm => 'AM';

  @override
  String get shiftPm => 'PM';

  @override
  String get shiftMorning => 'காலை';

  @override
  String get shiftEvening => 'மாலை';

  @override
  String get shiftFarmerFallback => 'விவசாயி';

  @override
  String get profileMemberSince => 'உறுப்பினராக இருந்து';

  @override
  String get profileCollectionCentre => 'சேகரிப்பு மையம்';

  @override
  String get profileBankPayout => 'வங்கி & கொடுப்பனவு';

  @override
  String get profileNotifications => 'அறிவிப்புகள்';

  @override
  String get profileHelpSupport => 'உதவி & ஆதரவு';

  @override
  String get profileAbout => 'பற்றி';

  @override
  String get profileAppearance => 'தோற்றம்';

  @override
  String get profileThemeSystem => 'கணினி இயல்புநிலை';

  @override
  String get profileThemeLight => 'ஒளி';

  @override
  String get profileThemeDark => 'இருள்';

  @override
  String get profileLogOut => 'வெளியேறு';

  @override
  String get homeRecentEntries => 'சமீபத்திய உள்ளீடுகள்';

  @override
  String get homeFarmers => 'விவசாயிகள்';

  @override
  String get homeHistory => 'வரலாறு';

  @override
  String get homeReports => 'அறிக்கைகள்';

  @override
  String get homeAmShiftInProgress => '☀️ காலை ஷிஃப்ட் · நடைபெறுகிறது';

  @override
  String get homePmShiftInProgress => '🌙 மாலை ஷிஃப்ட் · நடைபெறுகிறது';

  @override
  String get homeJustNow => 'இப்போதுதான்';

  @override
  String get homeHeroToday => 'இன்று';

  @override
  String get homeHeroTodayAm => 'இன்று ☀️ காலை';

  @override
  String get homeHeroTodayPm => 'இன்று 🌙 மாலை';

  @override
  String homeFarmerCount(Object count) {
    return '$count விவசாயிகள்';
  }

  @override
  String get homeToDispatch => 'அனுப்ப வேண்டியது';

  @override
  String get homeAllDispatched => 'அனைத்தும் அனுப்பப்பட்டது';

  @override
  String get homeNothingYet => 'இன்னும் எதுவும் இல்லை';

  @override
  String get homeCollected => 'சேகரிக்கப்பட்டது';

  @override
  String get homeBmcTank => 'BMC தொட்டி';

  @override
  String get homeLoadError => 'உள்ளீடுகளை ஏற்ற முடியவில்லை';

  @override
  String get homeNoCollectionToday => 'இன்று இன்னும் சேகரிப்பு இல்லை';

  @override
  String get homeNoCollectionSubtitle =>
      'தொடங்க சேகரிப்பை பதிவு செய்யவும் என்பதை தட்டவும்';

  @override
  String get dispatchTitle => 'அனுப்புதல்';

  @override
  String get dispatchAvailability => 'கிடைக்கும் அளவு';

  @override
  String get dispatchToCollectionCentre => 'சேகரிப்பு மையத்திற்கு அனுப்பவும்';

  @override
  String get dispatchQtyHint => 'அனுப்பும் அளவு (L)';

  @override
  String get dispatchContainerHint => 'கொள்கலன் எண் (விருப்பமான)';

  @override
  String get dispatchTankerButton => 'டேங்கரை அனுப்பவும்';

  @override
  String get dispatchTodaysOutbound => 'இன்றைய வெளிச்செல்லும் சரக்கு';

  @override
  String get dispatchNoDispatchesToday => 'இன்று அனுப்புதல்கள் இல்லை';

  @override
  String get dispatchNoDispatchesSubtitle =>
      'டேங்கரை அனுப்ப மேலே உள்ள படிவத்தை பயன்படுத்தவும்';

  @override
  String get dispatchSelectDestination => 'சேருமிட மையத்தை தேர்ந்தெடுக்கவும்…';

  @override
  String get dispatchSearchCentre => 'மையத்தை தேடவும்';

  @override
  String get dispatchNoCentresFound => 'மையங்கள் எதுவும் கிடைக்கவில்லை';

  @override
  String get dispatchErrorNoDestination =>
      'சேருமிட சேகரிப்பு மையத்தை தேர்ந்தெடுக்கவும்';

  @override
  String get dispatchErrorInvalidQty => 'சரியான அனுப்பும் அளவை உள்ளிடவும்';

  @override
  String dispatchErrorOverQty(Object available) {
    return 'அனுப்ப $available L மட்டுமே உள்ளது';
  }

  @override
  String dispatchAmountDispatched(Object amount) {
    return '$amount அனுப்பப்பட்டது';
  }

  @override
  String get dispatchNothingLeft => 'அனுப்ப ஏதும் இல்லை.';

  @override
  String get dispatchNothingLeftThisShift =>
      'இந்த ஷிஃப்டில் அனுப்ப ஏதும் இல்லை.';

  @override
  String dispatchContainerLabel(Object no) {
    return 'கொள்கலன் $no';
  }

  @override
  String get dispatchNoContainerNo => 'கொள்கலன் எண் இல்லை';

  @override
  String get dispatchStatusTransit => '⏳ வழியில்';

  @override
  String get dispatchStatusReceived => '✓ சேர்ந்தது';

  @override
  String get dispatchAvailableToDispatch => 'அனுப்ப கிடைக்கும்';

  @override
  String dispatchCollectedDispatched(Object collected, Object dispatched) {
    return 'சேகரிக்கப்பட்டது $collected · அனுப்பப்பட்டது $dispatched';
  }

  @override
  String get dispatchNoData => 'தரவு இல்லை';

  @override
  String get dispatchShiftAm => '☀️ காலை';

  @override
  String get dispatchShiftPm => '🌙 மாலை';

  @override
  String get paymentsCouldNotLoadCycles => 'சுழற்சிகளை ஏற்ற முடியவில்லை';

  @override
  String get paymentsStartNewCycle => 'புதிய சுழற்சி தொடங்கு';

  @override
  String get paymentsNoCyclesTitle => 'இன்னும் சுழற்சிகள் இல்லை';

  @override
  String get paymentsNoCyclesSubtitle =>
      'ஒரு காலகட்டத்திற்கு விவசாயிகளுக்கு செலுத்த சுழற்சி தொடங்கவும்';

  @override
  String get paymentsCyclesDisbursements => 'சுழற்சிகள் & விவசாயி விநியோகங்கள்';

  @override
  String get paymentsCyclesTitle => 'சுழற்சிகள்';

  @override
  String get paymentsPendingToPayLabel => 'செலுத்த நிலுவை';

  @override
  String paymentsPendingFarmersSub(Object farmers, Object open) {
    return '$farmers விவசாயிகள் · $open திறந்தவை';
  }

  @override
  String get paymentsPaidLabel => 'செலுத்தப்பட்டது';

  @override
  String paymentsPaidCyclesSub(Object count) {
    return '$count சுழற்சிகளில்';
  }

  @override
  String get paymentsCycleStatusOpen => 'திறந்தது';

  @override
  String get paymentsCycleStatusLocked => 'பூட்டப்பட்டது';

  @override
  String get paymentsCycleStatusPaid => 'செலுத்தப்பட்டது';

  @override
  String get paymentsCycleStatusReversed => 'திரும்பப் பெறப்பட்டது';

  @override
  String get paymentsNetLabel => 'நிகர';

  @override
  String paymentsFarmerCount(Object count) {
    return '$count விவசாயிகள்';
  }

  @override
  String paymentsPaidCount(Object paid, Object total) {
    return '$paid/$total செலுத்தப்பட்டது';
  }

  @override
  String paymentsAmountPending(Object amount) {
    return '$amount நிலுவை';
  }

  @override
  String get paymentsSelectPeriod => 'காலகட்டம் தேர்ந்தெடுக்கவும்';

  @override
  String get paymentsCouldNotLoadPeriods => 'காலகட்டங்களை ஏற்ற முடியவில்லை';

  @override
  String get paymentsPeriodInProgress => 'நடந்து கொண்டிருக்கிறது';

  @override
  String get paymentsPeriodClosed => 'மூடப்பட்டது';

  @override
  String get farmersAddFarmer => 'விவசாயி சேர்';

  @override
  String get farmersSearchHint => 'பெயர் அல்லது குறியீட்டால் தேடவும்';

  @override
  String get farmersCouldNotLoad => 'விவசாயிகளை ஏற்ற முடியவில்லை';

  @override
  String get farmersEmptyTitle => 'விவசாயிகள் பதிவு செய்யப்படவில்லை';

  @override
  String get farmersNoMatchTitle => 'பொருந்தும் விவசாயிகள் இல்லை';

  @override
  String get farmersEmptySubtitle =>
      'இந்த VMCC இல் பதிவு செய்யப்பட்ட விவசாயிகள் இங்கே தோன்றுவார்கள்';

  @override
  String get farmerDetailEditTooltip => 'விவசாயியை திருத்து';

  @override
  String get farmerDetailTabDetails => 'விவரங்கள்';

  @override
  String get farmerDetailTabPours => 'ஊற்றல்கள்';

  @override
  String get farmerDetailTabPayments => 'கொடுப்பனவுகள்';

  @override
  String get farmerDetailStatusActive => 'செயலில்';

  @override
  String get farmerDetailStatusInactive => 'செயலற்ற';

  @override
  String get farmerDetailPhone => 'தொலைபேசி';

  @override
  String get farmerDetailContact => 'தொடர்பு';

  @override
  String get farmerDetailVillage => 'கிராமம்';

  @override
  String get farmerDetailAddress => 'முகவரி';

  @override
  String get farmerDetailGps => 'GPS';

  @override
  String get farmerDetailLocation => 'இடம்';

  @override
  String get farmerDetailTotalCattle => 'மொத்த கால்நடைகள்';

  @override
  String get farmerDetailCurrentlyMilking => 'தற்போது பால் கறக்கும்';

  @override
  String get farmerDetailHerd => 'மந்தை';

  @override
  String get farmerDetailAadhaar => 'ஆதார்';

  @override
  String get farmerDetailIdentity => 'அடையாளம்';

  @override
  String get farmerDetailBankName => 'வங்கி பெயர்';

  @override
  String get farmerDetailAccountNumber => 'கணக்கு எண்';

  @override
  String get farmerDetailIfsc => 'IFSC';

  @override
  String get farmerDetailUpiId => 'UPI ID';

  @override
  String get farmerDetailPayment => 'கொடுப்பனவு';

  @override
  String get farmerDetailNotProvided => 'வழங்கப்படவில்லை';

  @override
  String get farmerPoursLoadError => 'ஊற்றல்களை ஏற்ற முடியவில்லை';

  @override
  String get farmerPoursEmptyTitle => 'சமீபத்திய ஊற்றல்கள் இல்லை';

  @override
  String get farmerPoursEmptySubtitle =>
      'கடந்த 30 நாட்களில் ஊற்றல்கள் இல்லை. மேலே உள்ள கடந்த சுழற்சி அறிக்கையை பகிரவும்.';

  @override
  String farmerPoursCount(Object count) {
    return '$count ஊற்றல்கள்';
  }

  @override
  String get farmerPours30DayTotal => '30 நாள் மொத்தம்';

  @override
  String get farmerPaymentsAddEntry => 'பதிவு சேர்க்கவும்';

  @override
  String get farmerPaymentsAmountHint => 'தொகை (₹)';

  @override
  String get farmerPaymentsRecordEntry => 'பதிவை பதிவு செய்';

  @override
  String get farmerPaymentsHistory => 'வரலாறு';

  @override
  String get farmerPaymentsLoadError => 'லெட்ஜரை ஏற்ற முடியவில்லை';

  @override
  String get farmerPaymentsOutstanding => 'நிலுவை';

  @override
  String get farmerPaymentsInvalidAmount => 'சரியான தொகையை உள்ளிடவும்';

  @override
  String get farmerPaymentsNoEntries => 'இன்னும் பதிவுகள் இல்லை';

  @override
  String get farmerPaymentsTypeAdvance => 'முன்பணம்';

  @override
  String get farmerPaymentsFeedLoan => 'தீவன கடன்';

  @override
  String get farmerPaymentsRepayment => 'திருப்பிச் செலுத்துதல்';

  @override
  String get farmerPaymentsAgainstAdvance => 'முன்பணத்திற்கு எதிராக';

  @override
  String get farmerPaymentsAgainstFeedLoan => 'தீவன கடனுக்கு எதிராக';

  @override
  String get farmerPaymentsAdvanceGiven => 'முன்பணம் வழங்கப்பட்டது';

  @override
  String get farmerPaymentsFeedLoanGiven => 'தீவன கடன் வழங்கப்பட்டது';

  @override
  String get farmerPaymentsRepaymentLabel => 'திருப்பிச் செலுத்துதல்';

  @override
  String get farmerPaymentsAdjustment => 'சரிசெய்தல்';

  @override
  String get addFarmerAddTitle => 'விவசாயியைச் சேர்க்கவும்';

  @override
  String get addFarmerEditTitle => 'விவசாயியைத் திருத்தவும்';

  @override
  String get addFarmerCamera => 'கேமரா';

  @override
  String get addFarmerGallery => 'கேலரி';

  @override
  String get addFarmerNameRequired => 'பெயர் தேவை';

  @override
  String get addFarmerAadhaarLength =>
      'ஆதார் எண் சரியாக 12 இலக்கங்களாக இருக்க வேண்டும்';

  @override
  String get addFarmerLocationPermissionDenied => 'இட அனுமதி மறுக்கப்பட்டது';

  @override
  String addFarmerRegisteredToast(Object name) {
    return '$name பதிவு செய்யப்பட்டது';
  }

  @override
  String addFarmerUpdatedToast(Object name) {
    return '$name புதுப்பிக்கப்பட்டது';
  }

  @override
  String get addFarmerSaveChanges => 'மாற்றங்களைச் சேமிக்கவும்';

  @override
  String get addFarmerRegisterFarmer => 'விவசாயியைப் பதிவு செய்யவும்';

  @override
  String get addFarmerSectionBasics => 'அடிப்படை விவரங்கள்';

  @override
  String get addFarmerFieldFullName => 'முழு பெயர் *';

  @override
  String get addFarmerFieldPhoneNumber => 'தொலைபேசி எண்';

  @override
  String get addFarmerFieldDobHint =>
      'பிறந்த தேதி (விருப்பமானது — ஆப் உள்நுழைவை இயக்குகிறது)';

  @override
  String get addFarmerSectionLocation => 'இடம்';

  @override
  String get addFarmerFieldVillage => 'கிராமம்';

  @override
  String get addFarmerFieldAddress => 'முகவரி';

  @override
  String get addFarmerGettingLocation => 'இடத்தைப் பெறுகிறது…';

  @override
  String get addFarmerCaptureGps => 'GPS இடத்தைப் பதிவு செய்யவும்';

  @override
  String get addFarmerSectionIdentity => 'அடையாளம்';

  @override
  String get addFarmerPhotoAdded => 'சுயவிவர புகைப்படம் சேர்க்கப்பட்டது';

  @override
  String get addFarmerPhotoAdd => 'சுயவிவர புகைப்படம் சேர்க்கவும்';

  @override
  String get addFarmerPhotoTapToChange => 'மாற்ற தொடவும்';

  @override
  String get addFarmerPhotoHint =>
      'புகைப்படம் எடுக்கவும் அல்லது கேலரியிலிருந்து தேர்ந்தெடுக்கவும்';

  @override
  String get addFarmerFieldAadhaar => 'ஆதார் எண்';

  @override
  String get addFarmerFieldKyc => 'KYC ஆவணம்';

  @override
  String get addFarmerFieldKycAdded => 'KYC ஆவணம் சேர்க்கப்பட்டது';

  @override
  String get addFarmerSectionPayment => 'கட்டணம்';

  @override
  String get addFarmerFieldBankName => 'வங்கி பெயர்';

  @override
  String get addFarmerFieldAccountHolderName => 'கணக்கு வைத்திருப்பவர் பெயர்';

  @override
  String get addFarmerFieldAccountNumber => 'கணக்கு எண்';

  @override
  String get addFarmerFieldIfscCode => 'IFSC குறியீடு';

  @override
  String get addFarmerFieldUpiId => 'UPI ID';

  @override
  String get herdSectionTitle => 'கால்நடை';

  @override
  String herdTotalHead(Object count) {
    return '$count தலை';
  }

  @override
  String get herdMilkType => 'பால் வகை';

  @override
  String get herdCattleBreeds => 'கால்நடை இனங்கள்';

  @override
  String get herdNoBreedsYet => 'இன்னும் இனங்கள் சேர்க்கப்படவில்லை.';

  @override
  String get herdAddBreed => 'இனம் சேர்க்கவும்';

  @override
  String get herdInMilkCount => 'தற்போது பால் கறக்கும் எண்ணிக்கை';

  @override
  String get herdBreedLabel => 'இனம்';

  @override
  String get herdQtyHint => 'எண்ணிக்கை';

  @override
  String get herdBreedDesiNatti => 'தேசி / நாட்டு';

  @override
  String get herdBreedCrossbred => 'கலப்பினம்';

  @override
  String get herdBreedJersey => 'ஜெர்சி';

  @override
  String get herdBreedHf => 'HF';

  @override
  String get herdBreedGir => 'கிர்';

  @override
  String get herdBreedSahiwal => 'சாஹிவால்';

  @override
  String get herdBreedMurrah => 'முர்ரா';

  @override
  String get herdBreedOther => 'மற்றவை';

  @override
  String get reportsTodaysCollection => 'இன்றைய சேகரிப்பு';

  @override
  String get reportsCouldNotLoadSummary => 'சுருக்கத்தை ஏற்ற முடியவில்லை';

  @override
  String get reportsNoCollectionToday => 'இன்று சேகரிப்பு இல்லை';

  @override
  String get reportsTotalCollected => 'மொத்த சேகரிப்பு';

  @override
  String reportsFarmersPoursStat(Object farmerCount, Object pourCount) {
    return '$farmerCount விவசாயிகள் · $pourCount ஊற்றுகள்';
  }

  @override
  String get reportsStatAmLabel => '☀️ AM';

  @override
  String get reportsStatPmLabel => '🌙 PM';

  @override
  String get reportsStatAvgFat => 'சராசரி FAT';

  @override
  String get reportsStatAvgSnf => 'சராசரி SNF';

  @override
  String get reportsStatFarmers => 'விவசாயிகள்';

  @override
  String get reportsStatGross => 'மொத்தம்';

  @override
  String get cycleCycle => 'சுழற்சி';

  @override
  String get cycleCouldNotLoad => 'சுழற்சியை ஏற்ற முடியவில்லை';

  @override
  String get cycleNotFound => 'சுழற்சி கிடைக்கவில்லை';

  @override
  String get cycleNoLines => 'இந்த சுழற்சியில் வரிகள் இல்லை';

  @override
  String get cycleNoFarmersMatch => 'எந்த விவசாயியும் பொருந்தவில்லை';

  @override
  String get cycleNetPayable => 'நிகர செலுத்தவேண்டியது';

  @override
  String cyclePaidLegend(Object amount, Object paid, Object total) {
    return '$amount செலுத்தப்பட்டது · $paid/$total';
  }

  @override
  String get cycleMarkAllPaid => 'அனைவரையும் செலுத்தப்பட்டதாக குறி';

  @override
  String get cycleMarkAllUnpaid => 'அனைவரையும் செலுத்தப்படவில்லை என குறி';

  @override
  String get cycleFilterAll => 'அனைத்தும்';

  @override
  String get cycleFilterUnpaid => 'செலுத்தப்படவில்லை';

  @override
  String get cycleFilterPaid => 'செலுத்தப்பட்டது';

  @override
  String get cycleLockTitle => 'சுழற்சியை பூட்டுவதா?';

  @override
  String get cycleLockContent =>
      'பூட்டுவது மொத்தங்களை நிறுத்தி கடன் திருப்பிச் செலுத்துதலை பதிவு செய்யும். பிறகு செலுத்தலாம்.';

  @override
  String get cyclePayTitle => 'சுழற்சியை செலுத்துவதா?';

  @override
  String get cyclePayContent =>
      'இது ஒவ்வொரு விவசாயிக்கும் கொடுப்பனவை பதிவு செய்யும், மீளாது.';

  @override
  String get cycleLockAction => 'பூட்டு';

  @override
  String get cyclePayAction => 'செலுத்து';

  @override
  String get cycleLockCycle => 'சுழற்சியை பூட்டு';

  @override
  String get cyclePayCycle => 'சுழற்சியை செலுத்து';

  @override
  String get farmerHistoryNoPoursSubtitle =>
      'இந்த விவசாயி கடந்த 30 நாட்களில் எந்த ஊற்றையும் பதிவு செய்யவில்லை';

  @override
  String get ledgerEditDetails => 'விவரங்களை திருத்தவும்';

  @override
  String get ledgerAddEntry => 'பதிவு சேர்க்கவும்';

  @override
  String get ledgerAmountHint => 'தொகை (₹)';

  @override
  String get ledgerInvalidAmount => 'சரியான தொகையை உள்ளிடவும்';

  @override
  String get ledgerRecordEntry => 'பதிவை பதிவுசெய்யவும்';

  @override
  String get ledgerHistory => 'வரலாறு';

  @override
  String get ledgerLoadError => 'லெட்ஜரை ஏற்ற முடியவில்லை';

  @override
  String get ledgerOutstanding => 'நிலுவை';

  @override
  String get ledgerNoEntries => 'இன்னும் பதிவுகள் இல்லை';

  @override
  String get ledgerEntryAdvance => 'முன்பணம்';

  @override
  String get ledgerEntryFeedLoan => 'தீவன கடன்';

  @override
  String get ledgerEntryRepayment => 'திருப்பிச் செலுத்துதல்';

  @override
  String get ledgerAgainstAdvance => 'முன்பணத்திற்கு எதிராக';

  @override
  String get ledgerAgainstFeedLoan => 'தீவன கடனுக்கு எதிராக';

  @override
  String get ledgerHistoryAdvanceGiven => 'முன்பணம் வழங்கப்பட்டது';

  @override
  String get ledgerHistoryFeedLoanGiven => 'தீவன கடன் வழங்கப்பட்டது';

  @override
  String get ledgerHistoryRepayment => 'திருப்பிச் செலுத்துதல்';

  @override
  String get ledgerHistoryAdjustment => 'சரிசெய்தல்';

  @override
  String get statementNoCycles => 'சுழற்சிகள் எதுவும் கிடைக்கவில்லை';

  @override
  String get statementSelectCycle => 'சுழற்சியை தேர்ந்தெடுக்கவும்';

  @override
  String statementGenerateError(Object error) {
    return 'அறிக்கையை உருவாக்க முடியவில்லை: $error';
  }

  @override
  String get statementPreparing => 'தயாரிக்கப்படுகிறது…';

  @override
  String get statementShareButton => 'சுழற்சி அறிக்கையை பகிரவும்';

  @override
  String get pickerSearchHint => 'பெயர் அல்லது குறியீட்டால் விவசாயியை தேடவும்';

  @override
  String get pickerLoadError => 'விவசாயிகளை ஏற்ற முடியவில்லை';

  @override
  String get pickerNoMatch => 'பொருத்தமான விவசாயிகள் இல்லை';

  @override
  String get addFarmerNativeNameLabel => 'பெயர் (வட்டார எழுத்து)';

  @override
  String get addFarmerNativeNameHint =>
      'மேலே உள்ள பெயரிலிருந்து தானாக நிரப்பப்பட்டது — தேவைப்பட்டால் திருத்தவும்';

  @override
  String get voiceMicNeededTitle => 'மைக்ரோஃபோன் அணுகல் தேவை';

  @override
  String get voiceMicNeededBody =>
      'குரல் மூலம் சொல்ல, இந்த ஆப்பிற்கு மைக்ரோஃபோன் மற்றும் பேச்சு அங்கீகாரத்தை அனுமதிக்கவும், பின்னர் திரும்பி வந்து மீண்டும் மைக்கைத் தட்டவும்.';

  @override
  String get voiceOpenSettings => 'அமைப்புகளைத் திற';

  @override
  String get voiceSpeakNow => 'இப்போது பேசவும்';

  @override
  String get voiceListening => 'கேட்கிறது…';

  @override
  String get voiceTapToSpeak => 'மைக்கைத் தட்டி பேசவும்';

  @override
  String get voiceNoSpeech =>
      'கேட்கவில்லை — மீண்டும் முயற்சிக்க மைக்கைத் தட்டவும்';

  @override
  String get voiceDone => 'முடிந்தது';

  @override
  String get addFarmerScanAadhaar =>
      'விவரங்களை தானாக நிரப்ப ஆதார் ஸ்கேன் செய்யவும்';

  @override
  String get addFarmerScanning => 'ஆதார் படிக்கிறது…';

  @override
  String get addFarmerScanFilled => 'விவரங்கள் நிரப்பப்பட்டன — சரிபார்க்கவும்';

  @override
  String get addFarmerScanFailed =>
      'அட்டையைப் படிக்க முடியவில்லை — தெளிவான படத்தை முயற்சிக்கவும்';

  @override
  String get addFarmerScanFront => 'முன் பக்கம்';

  @override
  String get addFarmerScanFrontHint => 'பெயர், பிறந்த தேதி, எண்';

  @override
  String get addFarmerScanBack => 'பின் பக்கம்';

  @override
  String get addFarmerScanBackHint => 'முகவரி';

  @override
  String get photoSourceTitle => 'புகைப்படம் சேர்க்கவும்';
}
