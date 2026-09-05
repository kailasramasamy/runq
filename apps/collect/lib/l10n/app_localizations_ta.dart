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
  String collectReplaceOrCombine(String name) {
    return '$name க்கு அதை மாற்றவா (திருத்தம்) அல்லது மற்றொரு கேனாக இணைக்கவா?';
  }

  @override
  String collectCombineResult(String total) {
    return 'மொத்த இணைப்பு: $total';
  }

  @override
  String get collectReplace => 'மாற்று';

  @override
  String get collectCombine => 'இணை';

  @override
  String get collectAddMoreMilk => 'மேலும் பால் சேர்';

  @override
  String get collectCansTotal => 'மொத்தம்';

  @override
  String collectCanN(int n, String qty) {
    return 'கேன் $n · $qty';
  }

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
  String collectEntries(int count) {
    return 'பதிவுகள் ($count)';
  }

  @override
  String get collectSaveAndNext => 'சேமித்து அடுத்து';

  @override
  String collectCloseShift(String shift) {
    return '$shift சேகரிப்பை மூடு';
  }

  @override
  String get collectCloseDay => 'இன்றைய சேகரிப்பை மூடு';

  @override
  String collectClosedBanner(String shift) {
    return '$shift சேகரிப்பு மூடப்பட்டது — அனுப்புவதற்கு தயார்.';
  }

  @override
  String get collectDayClosedBanner =>
      'இன்றைய சேகரிப்பு மூடப்பட்டது — அனுப்புவதற்கு தயார்.';

  @override
  String get collectClosedAction => 'சேகரிப்பு மூடப்பட்டது';

  @override
  String get collectReopen => 'மீண்டும் திற';

  @override
  String get collectDispatchNow => 'இப்போது அனுப்பவும்';

  @override
  String get collectCloseBlockedPending =>
      'சில ஊற்றுகள் இன்னும் ஒத்திசைக்கவில்லை — ஒத்திசைத்த பின் மூடவும்.';

  @override
  String get dispatchCloseFirst =>
      'அனுப்புவதற்கு முன் இந்த ஷிப்ட் சேகரிப்பை மூடவும்.';

  @override
  String dispatchPendingTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count அனுப்புதல்கள் நிலுவையில்',
      one: '$count அனுப்புதல் நிலுவையில்',
    );
    return '$_temp0';
  }

  @override
  String dispatchPendingOldest(String slot, String qty) {
    return 'பழையது: $slot · $qty';
  }

  @override
  String get pendingWorkCloseScreenTitle => 'மூட வேண்டிய சேகரிப்புகள்';

  @override
  String get pendingWorkDispatchScreenTitle => 'நிலுவையில் உள்ள அனுப்புதல்கள்';

  @override
  String get pendingWorkEmpty => 'நிலுவையில் எதுவும் இல்லை';

  @override
  String get pendingWorkEmptySubtitle =>
      'சேகரிக்கப்பட்ட அனைத்து பாலும் அனுப்பப்பட்டுவிட்டது';

  @override
  String pendingWorkDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days நாட்களுக்கு முன்',
      one: '$days நாளுக்கு முன்',
    );
    return '$_temp0';
  }

  @override
  String get dispatchUntypedTitle => 'பால் வகை பதிவாகவில்லை';

  @override
  String get dispatchUntypedHint => 'அனுப்பும் முன் வகையைத் தேர்வுசெய்யவும்';

  @override
  String get dispatchErrorTypeNotChosen =>
      'வகை இல்லாத அனுப்புதலுக்கு பால் வகையைத் தேர்வுசெய்யவும்.';

  @override
  String dispatchPendingCloseTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count சேகரிப்புகளை மூட வேண்டும்',
      one: '$count சேகரிப்பை மூட வேண்டும்',
    );
    return '$_temp0';
  }

  @override
  String get dispatchCloseFirstDay =>
      'அனுப்புவதற்கு முன் இன்றைய சேகரிப்பை மூடவும்.';

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
    return '$count விவசாயிகள் · ☾ $pm · ☀️ $am';
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
  String ppHomeTankersToReceive(num count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.compact(
      locale: localeName,
    );
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'பெற $countString டேங்கர்கள்',
      one: 'பெற 1 டேங்கர்',
    );
    return '$_temp0';
  }

  @override
  String ccReceivePoolWaitsForMorning(String date) {
    return 'மாலைப் பால் அடுத்த நாள் காலைச் சேகரிப்புடன் செல்லும். இந்தப் பூலை $date அன்று மூடி அனுப்பவும்.';
  }

  @override
  String get consignmentSlotPooled => 'தொகுக்கப்பட்டது';

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
  String get profileDeleteAccount => 'கணக்கை நீக்கு';

  @override
  String get profileDeleteAccountTitle => 'கணக்கை நீக்கவா?';

  @override
  String get profileDeleteAccountBody =>
      'இது உங்கள் கணக்கையும் தனிப்பட்ட விவரங்களையும் நிரந்தரமாக நீக்கும். உங்கள் பால் சேகரிப்பு மற்றும் பணப் பதிவுகள் பால் நிறுவனத்தின் கணக்கில் இருக்கும். இதை மீட்டெடுக்க முடியாது.';

  @override
  String get profileDeleteAccountConfirm => 'கணக்கை நீக்கு';

  @override
  String get profileDeleteAccountError =>
      'உங்கள் கணக்கை நீக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.';

  @override
  String get homeRecentEntries => 'சமீபத்திய உள்ளீடுகள்';

  @override
  String get homeFarmers => 'விவசாயிகள்';

  @override
  String get homeHistory => 'வரலாறு';

  @override
  String get homeReports => 'அறிக்கைகள்';

  @override
  String farmerRateSpeakCoach(Object metric, Object value, Object extra) {
    return 'உங்கள் $metric $value ஐ அடைந்தால், ஒரு லிட்டருக்கு $extra ரூபாய் கூடுதலாக கிடைக்கும்.';
  }

  @override
  String get helpTitle => 'உதவி & ஆதரவு';

  @override
  String get helpCallSupport => 'ஆதரவை அழைக்கவும்';

  @override
  String get helpEmailSupport => 'மின்னஞ்சல் அனுப்பவும்';

  @override
  String get helpWhatsApp => 'WhatsApp இல் பேசவும்';

  @override
  String get helpReplySoon => 'பொதுவாக சில மணி நேரங்களில் பதிலளிப்போம்.';

  @override
  String get helpNoContacts =>
      'ஆதரவு தொடர்புகள் இன்னும் அமைக்கப்படவில்லை — உங்கள் பால் நிர்வாகியை கேட்கவும்.';

  @override
  String get helpCouldNotOpen => 'திறக்க முடியவில்லை';

  @override
  String get faqFarmerQ1 => 'என் பால் பதிவுகளை எங்கே பார்க்கலாம்?';

  @override
  String get faqFarmerA1 =>
      'சேகரிப்புகள் தாவலில் ஒவ்வொரு நாளின் அளவும் தரமும் உள்ள எல்லா பதிவுகளும் உள்ளன.';

  @override
  String get faqFarmerQ2 => 'என் விலை எப்படி தீர்மானிக்கப்படுகிறது?';

  @override
  String get faqFarmerA2 =>
      'முகப்பிலிருந்து விலைப் பட்டியலைத் திறக்கவும் — உங்கள் FAT மற்றும் SNF (அல்லது CLR) லிட்டர் விலையை தீர்மானிக்கிறது.';

  @override
  String get faqFarmerQ3 => 'எனக்கு எப்போது பணம் கிடைக்கும்?';

  @override
  String get faqFarmerA3 =>
      'பணம் உங்கள் பால் நிறுவனத்தின் சுழற்சியை பின்பற்றும். பணம் தாவலில் தற்போதைய சுழற்சியும் நிலுவையும் தெரியும்.';

  @override
  String get faqOperatorQ1 => 'சேகரிப்பை எப்படி பதிவு செய்வது?';

  @override
  String get faqOperatorA1 =>
      'கீழ் பட்டியில் சேகரிப்பு தட்டி, விவசாயியைத் தேர்ந்தெடுத்து, அளவு, FAT மற்றும் SNF உள்ளிடவும்.';

  @override
  String get faqOperatorQ2 => 'பணம் எப்போது தீர்க்கப்படும்?';

  @override
  String get faqOperatorA2 =>
      'பணம் உங்கள் மையத்தின் சுழற்சியை பின்பற்றும். தற்போதைய சுழற்சிக்கு பணம் தாவலைப் பார்க்கவும்.';

  @override
  String get commonRetry => 'மீண்டும் முயற்சி';

  @override
  String get commonErrorTitle => 'உங்கள் தரவை ஏற்ற முடியவில்லை';

  @override
  String get commonErrorSubtitle =>
      'இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.';

  @override
  String get commonOfflineSaved => 'ஆஃப்லைன் — சேமித்த தரவு காட்டப்படுகிறது';

  @override
  String get shiftNotRecorded => 'பதிவாகவில்லை';

  @override
  String get syncSyncedLabel => 'ஒத்திசைந்தது';

  @override
  String syncSyncedAgoLabel(Object ago) {
    return 'ஒத்திசைந்தது $ago';
  }

  @override
  String syncToSendLabel(Object count) {
    return '$count அனுப்ப வேண்டும்';
  }

  @override
  String get syncOfflineLabel => 'ஆஃப்லைன் — சாதனத்தில் சேமிக்கப்பட்டது';

  @override
  String get notifScreenTitle => 'அறிவிப்புகள்';

  @override
  String get notifPushTitle => 'புஷ் அறிவிப்புகள்';

  @override
  String get notifPushSubtitle =>
      'சேகரிப்பு, அனுப்புதல் மற்றும் பணம் பற்றிய எச்சரிக்கைகள்';

  @override
  String get notifPushFootnote =>
      'அணைத்தால் இந்த சாதனத்திற்கு புஷ் அறிவிப்புகள் வராது. எப்போது வேண்டுமானாலும் மீண்டும் இயக்கலாம்.';

  @override
  String farmerRateEffectiveFrom(Object date) {
    return '$date முதல்';
  }

  @override
  String get errorOffline =>
      'இணையம் இல்லை — இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.';

  @override
  String get errorTimeout =>
      'கோரிக்கை நேரம் முடிந்தது — மீண்டும் முயற்சிக்கவும்.';

  @override
  String get errorGeneric => 'ஏதோ தவறு நடந்தது — மீண்டும் முயற்சிக்கவும்.';

  @override
  String get syncSheetTitle => 'இந்த சாதனத்தில் உள்ள பதிவுகள்';

  @override
  String syncSheetCounts(Object pending, Object failed) {
    return '$pending காத்திருக்கிறது · $failed தோல்வி';
  }

  @override
  String get syncSheetAllClear => 'அனைத்தும் ஒத்திசைக்கப்பட்டது.';

  @override
  String get syncRetry => 'மீண்டும் முயற்சி';

  @override
  String get syncDelete => 'அழி';

  @override
  String get syncDeleteConfirmTitle => 'இந்த பதிவை அழிக்கவா?';

  @override
  String get syncDeleteConfirmBody =>
      'இந்த பால் பதிவு சர்வருக்கு அனுப்பப்படவில்லை. அழித்தால் நிரந்தரமாக நீங்கும் — விவசாயிக்கு இதற்கு பணம் கிடைக்காது.';

  @override
  String get syncSyncNow => 'இப்போது ஒத்திசை';

  @override
  String get pendingSavingPill => 'சேமிக்கப்படுகிறது…';

  @override
  String get pendingFailedPill => 'தோல்வி';

  @override
  String get collectCorrectionNeedsConnection =>
      'திருத்தங்களுக்கு இணைப்பு தேவை — ஆன்லைனில் வந்ததும் மீண்டும் முயற்சிக்கவும்.';

  @override
  String get profileLogOutConfirmTitle => 'வெளியேறவா?';

  @override
  String get profileLogOutConfirmBody =>
      'உங்கள் ஃபோனுக்கு வரும் OTP மூலம் மீண்டும் உள்நுழைய வேண்டியிருக்கும்.';

  @override
  String get collectImplausibleTitle => 'வழக்கத்திற்கு மாறாக அதிக மதிப்புகள்';

  @override
  String collectImplausibleBody(Object values) {
    return '$values — இது சரியா?';
  }

  @override
  String get collectSaveAnyway => 'இருந்தாலும் சேமி';

  @override
  String get collectPendingDupTitle =>
      'இந்த சாதனத்தில் ஏற்கனவே சேமிக்கப்பட்டுள்ளது';

  @override
  String collectPendingDupBody(Object name) {
    return '$nameக்கு இந்த ஷிஃப்டுக்கான பதிவு ஏற்கனவே ஒத்திசைவுக்காக காத்திருக்கிறது. அதை மாற்றவா, அல்லது இதை கூடுதல் பாத்திரமாக சேர்க்கவா?';
  }

  @override
  String get collectPendingDupReplace => 'சேமித்த பதிவை மாற்று';

  @override
  String get collectPendingDupExtraLot => 'கூடுதல் லாட்டாக சேர்';

  @override
  String syncFailedLabel(Object count) {
    return '$count தோல்வி — கவனம் தேவை';
  }

  @override
  String get homeSeeFullHistory => 'முழு வரலாற்றைக் காண்க';

  @override
  String get homeAmShiftInProgress => 'காலை ஷிஃப்ட் · நடைபெறுகிறது';

  @override
  String get homePmShiftInProgress => 'மாலை ஷிஃப்ட் · நடைபெறுகிறது';

  @override
  String get homeJustNow => 'இப்போதுதான்';

  @override
  String get homeHeroToday => 'இன்று';

  @override
  String get homeHeroTotalToday => 'இன்றைய மொத்தம்';

  @override
  String get homeShiftNotStarted => 'இன்னும் தொடங்கவில்லை';

  @override
  String get homeShiftCollecting => 'சேகரிப்பு நடக்கிறது';

  @override
  String get homeShiftToDispatch => 'அனுப்ப வேண்டியது';

  @override
  String get homeShiftInTransit => 'போக்குவரத்தில்';

  @override
  String get homeShiftAtCc => 'CC-ல் பெறப்பட்டது';

  @override
  String homeFarmerCount(Object count) {
    return '$count விவசாயிகள்';
  }

  @override
  String get homeAllDispatched => 'அனைத்தும் அனுப்பப்பட்டது';

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
  String get dispatchErrorNoTypeSelected =>
      'அனுப்ப குறைந்தது ஒரு பால் வகையையாவது தேர்ந்தெடுக்கவும்.';

  @override
  String dispatchTankerButtonMulti(int count) {
    return '$count சுமைகளை அனுப்பவும்';
  }

  @override
  String get dispatchTypeHeldBack => 'அடுத்த அனுப்புதலுக்காக வைக்கப்பட்டுள்ளது';

  @override
  String get dispatchContainerHint => 'கொள்கலன் எண் (விருப்பமான)';

  @override
  String get dispatchTankerButton => 'டேங்கரை அனுப்பவும்';

  @override
  String get dispatchTodaysOutbound => 'இன்றைய வெளிச்செல்லும் சரக்கு';

  @override
  String get dispatchNoDispatchesToday => 'இன்று அனுப்புதல்கள் இல்லை';

  @override
  String dispatchOutboundOn(String date) {
    return 'வெளிச்செல்லும் சரக்கு · $date';
  }

  @override
  String dispatchNoDispatchesOn(String date) {
    return '$date அன்று அனுப்புதல்கள் இல்லை';
  }

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
  String dispatchSoldBreakdown(
    Object collected,
    Object sold,
    Object available,
  ) {
    return '$collected லி சேகரிப்பு − $sold லி வாயிலில் விற்பனை = $available லி';
  }

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
  String get dispatchStatusTransit => 'வழியில்';

  @override
  String get dispatchStatusReceived => 'சேர்ந்தது';

  @override
  String get dispatchAvailableToDispatch => 'அனுப்ப கிடைக்கும்';

  @override
  String dispatchCollectedDispatched(Object collected, Object dispatched) {
    return 'சேகரிக்கப்பட்டது $collected · அனுப்பப்பட்டது $dispatched';
  }

  @override
  String get dispatchNoData => 'தரவு இல்லை';

  @override
  String get dispatchShiftAm => 'காலை';

  @override
  String get dispatchShiftPm => 'மாலை';

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
  String payoutsLatestCycle(Object period) {
    return 'சமீபத்திய சுழற்சி · $period';
  }

  @override
  String get payoutsLoadError => 'பணப்பட்டுவாடாக்களை ஏற்ற முடியவில்லை';

  @override
  String get payoutsCycleHistory => 'சுழற்சி வரலாறு';

  @override
  String get payoutLineQty => 'வழங்கிய பால்';

  @override
  String get payoutLineGross => 'மொத்தத் தொகை';

  @override
  String get payoutLineBonus => 'தர ஊக்கத்தொகை';

  @override
  String get payoutLineDeductions => 'கழிவுகள்';

  @override
  String get payoutLineOtherDeduction => 'பிற கழிவு';

  @override
  String get payoutLineStatementNo => 'அறிக்கை';

  @override
  String payoutLinePaidOn(Object date) {
    return '$date அன்று செலுத்தப்பட்டது';
  }

  @override
  String get payoutLineNotPaid => 'இன்னும் செலுத்தப்படவில்லை';

  @override
  String get payoutLineMarkPaid => 'செலுத்தியதாகக் குறி';

  @override
  String get payoutLineMarkUnpaid => 'செலுத்தாததாகக் குறி';

  @override
  String get payoutsEmptyTitle => 'இதுவரை பணப்பட்டுவாடா இல்லை';

  @override
  String get payoutsEmptySubtitle =>
      'இந்த விவசாயியை உள்ளடக்கிய சுழற்சி வந்ததும் இங்கே தோன்றும்';

  @override
  String payoutsEarnedLabel(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count சுழற்சிகள்',
      one: '$count சுழற்சி',
    );
    return 'சம்பாத்தியம் · $_temp0';
  }

  @override
  String payoutsPaidAmount(Object amount) {
    return '$amount செலுத்தப்பட்டது';
  }

  @override
  String payoutsDueAmount(Object amount) {
    return '$amount நிலுவை';
  }

  @override
  String get payoutsCycleFallback => 'சுழற்சி';

  @override
  String payoutsGrossLessDeductions(Object gross, Object deductions) {
    return '$gross மொத்தம் − $deductions கழிவு';
  }

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
  String get reportsTabQc => 'தரம்';

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
  String get statementDownloadButton => 'சுழற்சி அறிக்கையைப் பதிவிறக்கு';

  @override
  String get statementViewerTitle => 'சுழற்சி அறிக்கை';

  @override
  String get pickerSearchHint => 'பெயர் அல்லது குறியீட்டால் விவசாயியை தேடவும்';

  @override
  String get pickerLoadError => 'விவசாயிகளை ஏற்ற முடியவில்லை';

  @override
  String get pickerNoMatch => 'பொருத்தமான விவசாயிகள் இல்லை';

  @override
  String get pickerRecorded => 'பதிவு செய்யப்பட்டது';

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
  String get addFarmerScanFrontHint => 'பெயர், எண்';

  @override
  String get addFarmerScanBack => 'பின் பக்கம்';

  @override
  String get addFarmerScanBackHint => 'முகவரி';

  @override
  String get photoSourceTitle => 'புகைப்படம் சேர்க்கவும்';

  @override
  String get farmerPhotoUpdated => 'சுயவிவரப் படம் புதுப்பிக்கப்பட்டது';

  @override
  String get farmerPhotoFailed =>
      'படத்தைப் புதுப்பிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.';

  @override
  String get navCollections => 'சேகரிப்புகள்';

  @override
  String get navServices => 'சேவைகள்';

  @override
  String get farmerHomeGoodMorning => 'காலை வணக்கம்';

  @override
  String get farmerHomeGoodAfternoon => 'மதிய வணக்கம்';

  @override
  String get farmerHomeGoodEvening => 'மாலை வணக்கம்';

  @override
  String get farmerHomeNoNotifications => 'புதிய அறிவிப்புகள் இல்லை';

  @override
  String get farmerHomeThisCycle => 'இந்த சுழற்சி';

  @override
  String farmerHomeHeroPours(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ஊற்றுகள்',
      one: '$count ஊற்று',
    );
    return '$_temp0';
  }

  @override
  String farmerHomeHeroListenSpeak(String litres, String rupees) {
    return 'இந்த சுழற்சி, $litres லிட்டர், $rupees ரூபாய்';
  }

  @override
  String get farmerHomeHeroListenLabel => 'கேளுங்கள்';

  @override
  String farmerHomeProjection(String amount) {
    return 'இந்த சுழற்சிக்கு ~$amount எதிர்பார்க்கப்படுகிறது';
  }

  @override
  String get farmerHomeEmptyTitle => 'இந்த சுழற்சியில் இன்னும் ஊற்றுகள் இல்லை';

  @override
  String get farmerHomeEmptySubtitle =>
      'மையத்தில் பதிவு செய்யப்பட்ட பிறகு உங்கள் சேகரிப்புகள் இங்கே தோன்றும்.';

  @override
  String get farmerHomeRefresh => 'புதுப்பிக்கவும்';

  @override
  String farmerHomeTodayCollected(String litres) {
    return '$litres L சேகரிக்கப்பட்டது';
  }

  @override
  String get farmerHomeNudgeImproved =>
      'சிறப்பான வேலை — தீவன மற்றும் வழக்கத்தை தொடருங்கள்.';

  @override
  String get farmerHomeNudgeFatDown =>
      'பொதுவாக தீவன தரம் அல்லது தாமதமான பால் கறவை. தீவனம் மற்றும் சுத்தமான தண்ணீர் சரிபார்க்கவும், அல்லது உங்கள் கால்நடை மருத்துவரை கேளுங்கள்.';

  @override
  String get farmerHomeNudgeSnfDown =>
      'பொதுவாக ஊட்டச்சத்து அல்லது தண்ணீர். தீவனம் மற்றும் சுத்தமான தண்ணீர் சரிபார்க்கவும், அல்லது உங்கள் கால்நடை மருத்துவரை கேளுங்கள்.';

  @override
  String farmerHomeNudgeTitle(String metric, String direction, String delta) {
    return '$metric இந்த வாரம் $delta $direction';
  }

  @override
  String get farmerHomeNudgeUp => 'அதிகரித்தது';

  @override
  String get farmerHomeNudgeDown => 'குறைந்தது';

  @override
  String farmerHomeStreakTitle(int streak) {
    String _temp0 = intl.Intl.pluralLogic(
      streak,
      locale: localeName,
      other: '$streak நாள் தர வரிசை',
      one: '$streak நாள் தர வரிசை',
    );
    return '$_temp0';
  }

  @override
  String get farmerHomeStreakBonusUnlocked =>
      'போனஸ் திறக்கப்பட்டது — தொடருங்கள்!';

  @override
  String farmerHomeStreakRemaining(int remaining) {
    String _temp0 = intl.Intl.pluralLogic(
      remaining,
      locale: localeName,
      other: 'போனஸ் திறக்க $remaining Grade-A நாட்கள் மேலும்',
      one: 'போனஸ் திறக்க $remaining Grade-A நாள் மேலும்',
    );
    return '$_temp0';
  }

  @override
  String get farmerHomeRateChart => 'விலை அட்டவணை';

  @override
  String get farmerHomeRewards => 'வெகுமதிகள்';

  @override
  String get farmerHomeQuality => 'தரம்';

  @override
  String get farmerQcTitle => 'என் தரம்';

  @override
  String farmerQcHeroLabel(int days) {
    return 'என் தரம் · கடந்த $days நாட்கள்';
  }

  @override
  String get farmerQcFooter => 'நீங்கள் ஊற்றிய லிட்டர் அடிப்படையில் சராசரி';

  @override
  String get farmerQcEmptySubtitle => 'உங்கள் தர போக்கைக் காண பால் ஊற்றுங்கள்';

  @override
  String get farmerCollectionsTitle => 'சேகரிப்புகள்';

  @override
  String farmerCollectionsCyclePours(String scope, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ஊற்றுகள்',
      one: '$count ஊற்று',
    );
    return '$scope · $_temp0';
  }

  @override
  String get farmerCollectionsDailyVolume => 'தினசரி அளவு';

  @override
  String farmerCollectionsAvgPerDay(String litres) {
    return '$litres L/நாள் சராசரி';
  }

  @override
  String get farmerCollectionsThisCycle => 'இந்த சுழற்சி';

  @override
  String get farmerCollectionsPastCycles => 'கடந்த சுழற்சிகள்';

  @override
  String get farmerCollectionsEmptyTitle =>
      'இந்த சுழற்சியில் சேகரிப்புகள் இல்லை';

  @override
  String get farmerCollectionsEmptySubtitle =>
      'பதிவு செய்யப்பட்ட பிறகு உங்கள் தினசரி ஊற்றுகள் இங்கே தோன்றும்.';

  @override
  String farmerCollectionsPastCycleSummary(String litres, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ஊற்றுகள்',
      one: '$count ஊற்று',
    );
    return '$litres L · $_temp0';
  }

  @override
  String get farmerCollectionDetailTotal => 'மொத்தம்';

  @override
  String get farmerCollectionDetailGross => 'மொத்த தொகை';

  @override
  String get farmerCollectionDetailNoCollection =>
      'எந்த சேகரிப்பும் பதிவு செய்யப்படவில்லை';

  @override
  String get farmerCollectionDetailShift => 'ஷிப்ட்';

  @override
  String farmerCollectionDetailRatePerLitre(String rate) {
    return '@ $rate/L';
  }

  @override
  String get farmerPaymentsTitle => 'கொடுப்பனவுகள்';

  @override
  String get farmerPaymentsSubtitle =>
      'வெளிப்படையானது, ஒவ்வொரு ரூபாயும் கணக்கிடப்பட்டது';

  @override
  String farmerPaymentsNetPayable(String cycle) {
    return 'நிகர செலுத்த வேண்டியது · $cycle';
  }

  @override
  String farmerPaymentsListenSpeak(String rupees) {
    return 'இந்த சுழற்சி நிகர செலுத்த வேண்டியது, $rupees ரூபாய்';
  }

  @override
  String farmerPaymentsProjection(String amount) {
    return 'இந்த சுழற்சிக்கு ~$amount எதிர்பார்க்கப்படுகிறது';
  }

  @override
  String get farmerPaymentsGrossMilk => 'பால் மதிப்பு (அடிப்படை)';

  @override
  String get farmerPaymentsEstimatedDeduction => 'முன்பணப் பிடிப்பு';

  @override
  String get farmerPaymentsStatusPending => 'நிலுவையில்';

  @override
  String get farmerPaymentsStatusProcessing => 'செயலாக்கத்தில்';

  @override
  String get farmerPaymentsQualityBonus => 'தர போனஸ்';

  @override
  String farmerPaymentsOutstandingAdvance(String amount) {
    return 'நிலுவை முன்பணம்: $amount';
  }

  @override
  String get farmerPaymentsHistoryHeader => 'கொடுப்பனவு வரலாறு';

  @override
  String get farmerPaymentsPaid => 'செலுத்தப்பட்டது';

  @override
  String get farmerPaymentsDeductCattleFeedLoan => 'கால்நடை தீவன கடன்';

  @override
  String get farmerPaymentsDeductAdvance => 'முன்பணம்';

  @override
  String get farmerPaymentsDeductMedicine => 'மருந்து';

  @override
  String get farmerPaymentsDeductInsurance => 'காப்பீடு';

  @override
  String farmerPaymentsHistorySummary(String litres, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ஊற்றுகள்',
      one: '$count ஊற்று',
    );
    return '$litres L · $_temp0';
  }

  @override
  String get farmerRateChartTitle => 'விலை அட்டவணை';

  @override
  String get farmerRateShareTooltip => 'விலை அட்டவணையை பகிரவும்';

  @override
  String farmerRateShareError(Object error) {
    return 'விலை அட்டவணையை பகிர முடியவில்லை: $error';
  }

  @override
  String get farmerRateListenSpeak => 'உங்கள் பால் விலை அட்டவணை';

  @override
  String farmerRateListenSpeakWithRate(String rate) {
    return 'உங்கள் விலை லிட்டருக்கு $rate ரூபாய்';
  }

  @override
  String get farmerRateEmptyTitle => 'செயலில் விலை அட்டவணை இல்லை';

  @override
  String get farmerRateEmptySubtitle =>
      'உங்கள் பால் சேகரிப்பு மையத்தை தொடர்பு கொள்ளுங்கள்';

  @override
  String get farmerRateLastPourLabel => 'உங்கள் கடைசி ஊற்று';

  @override
  String get farmerRateMatrixTitle => 'விலை அட்டவணை (₹/L)';

  @override
  String get farmerRateBonusSlabsTitle => 'போனஸ் & அடுக்குகள்';

  @override
  String get farmerRateFlatRateLabel => 'நிலையான விலை';

  @override
  String get farmerRateEarnMore => 'லிட்டருக்கு அதிகமாக சம்பாதிக்கவும்';

  @override
  String farmerRateRaiseSnf(String value) {
    return 'SNF ஐ $value ஆக உயர்த்தவும்';
  }

  @override
  String farmerRateRaiseFat(String value) {
    return 'FAT ஐ $value ஆக உயர்த்தவும்';
  }

  @override
  String get farmerRateNoMatrixData => 'அட்டவணை தரவு இல்லை';

  @override
  String farmerRateRuleGradeBonus(String grade) {
    return 'Grade-$grade போனஸ்';
  }

  @override
  String farmerRateRuleVolumeRange(String min, String max) {
    return 'அளவு $min–$max L';
  }

  @override
  String farmerRateRuleVolumeMin(String min) {
    return 'அளவு > $min L';
  }

  @override
  String get farmerRewardsTitle => 'வெகுமதிகள்';

  @override
  String get farmerRewardsBadgesSection => 'பதக்கங்கள்';

  @override
  String get farmerRewardsQualityStreak => 'தர வரிசை';

  @override
  String farmerRewardsStreakDays(int target) {
    return '/ $target நாட்கள்';
  }

  @override
  String get farmerRewardsBonusUnlocked => 'போனஸ் திறக்கப்பட்டது — தொடருங்கள்!';

  @override
  String farmerRewardsStreakRemaining(int remaining) {
    return '₹500 போனஸ் திறக்க $remaining நாட்கள் மேலும்';
  }

  @override
  String get farmerRewardsBadgeUnlocked => 'திறக்கப்பட்டது';

  @override
  String get farmerRewardsBadgeLocked => 'பூட்டப்பட்டது';

  @override
  String get farmerRewardsBadgeConsistent => 'நிலையான';

  @override
  String get farmerRewardsBadge100Day => '100 நாள் கிளப்';

  @override
  String get farmerRewardsBadgeTopFat => 'சிறந்த FAT';

  @override
  String get farmerRewardsBadgeReferrer => 'பரிந்துரைத்தவர்';

  @override
  String get farmerRewardsReferTitle => 'விவசாயியை பரிந்துரைக்கவும்';

  @override
  String get farmerRewardsReferBody =>
      'சேரும் ஒவ்வொரு விவசாயிக்கும் ₹100 சம்பாதிக்கவும்';

  @override
  String get farmerRewardsShareInvite => 'அழைப்பை பகிர்';

  @override
  String get farmerRewardsReferralComingSoon =>
      'பரிந்துரை அழைப்பு விரைவில் வருகிறது!';

  @override
  String get farmerServicesTitle => 'சேவைகள்';

  @override
  String get farmerServicesSubtitle =>
      'விவசாயி சேவைகள் வருகின்றன — காத்திருங்கள்.';

  @override
  String get farmerServicesSoon => 'விரைவில்';

  @override
  String get farmerServicesNotifyMe => 'நேரடியாக வரும்போது தெரிவிக்கவும்';

  @override
  String get farmerServicesNotifyToast =>
      'சேவைகள் நேரடியாக வரும்போது உங்களுக்கு தெரிவிக்கிறோம்!';

  @override
  String get farmerServicesCattleFeedName => 'கால்நடை தீவனம்';

  @override
  String get farmerServicesCattleFeedDesc =>
      'தரமான புல் & சத்துக்கள் உங்கள் பண்ணைக்கு வழங்கப்படும்.';

  @override
  String get farmerServicesVetName => 'கால்நடை மருத்துவ சேவை';

  @override
  String get farmerServicesVetDesc =>
      'வீட்டு வாசலில் கால்நடை மருத்துவர் வருகை, உடல்நல பரிசோதனை & தடுப்பூசி.';

  @override
  String get farmerServicesInsuranceName => 'காப்பீடு';

  @override
  String get farmerServicesInsuranceDesc =>
      'உங்கள் கால்நடை & வாழ்வாதாரத்தை பாதுகாக்க கால்நடை காப்பீடு.';

  @override
  String get farmerServicesLoansName => 'கடன் & முன்பணம்';

  @override
  String get farmerServicesLoansDesc =>
      'உங்கள் பால் வருமானத்திற்கு எதிராக உடனடி முன்பணம்.';

  @override
  String get navReceive => 'பெறுதல்';

  @override
  String get ccDispatchToPlant => 'பிளாண்டுக்கு அனுப்பு';

  @override
  String get ccDispatchSelectDestinationPlant =>
      'இலக்கு பிளாண்டைத் தேர்ந்தெடுக்கவும்…';

  @override
  String get ccDispatchSearchPlant => 'பிளாண்ட் தேடுக';

  @override
  String get ccDispatchNoPlantsFound => 'பிளாண்ட் எதுவும் இல்லை';

  @override
  String get ccDispatchErrorNoDestination =>
      'இலக்கு பிளாண்டைத் தேர்ந்தெடுக்கவும்';

  @override
  String get ccDispatchErrorInvalidNumbers => 'சரியான எண்களை உள்ளிடவும்';

  @override
  String get ccDispatchCloseFirstShift =>
      'அனுப்பும் முன் இந்த ஷிப்ட் வரவேற்பை மூடவும்.';

  @override
  String get ccDispatchCloseFirstDay =>
      'அனுப்பும் முன் இன்றைய வரவேற்பை மூடவும்.';

  @override
  String get ccDispatchCloseFirstPool =>
      'அனுப்பும் முன் பூலை மூடவும் (நேற்று மாலை + இன்று காலை).';

  @override
  String get ccDispatchCloseReceivingPool => 'பூல் வரவேற்பை மூடு';

  @override
  String ccDispatchCloseReceivingShift(Object slot) {
    return '$slot வரவேற்பை மூடு';
  }

  @override
  String get ccDispatchCloseReceivingToday => 'இன்றைய வரவேற்பை மூடு';

  @override
  String ccDispatchUnlocksFor(Object slot) {
    return '$slotக்கு பிளாண்டுக்கு அனுப்புவதைத் திறக்கும்.';
  }

  @override
  String ccDispatchClosedFor(Object slot) {
    return '$slotக்கு வரவேற்பு மூடப்பட்டது';
  }

  @override
  String get ccDispatchReadyForDispatch => 'அனுப்ப தயார்';

  @override
  String get ccDispatchSlotToday => 'இன்று';

  @override
  String get ccDispatchSlotPool => 'இந்த பூல்';

  @override
  String get ccDispatchHistoryTitle => 'அனுப்பிய வரலாறு';

  @override
  String get ccHomeChillingTank => 'குளிரூட்டும் தொட்டி';

  @override
  String get ccHomeVmccsPool => 'VMCCகள் · இந்த பூல்';

  @override
  String get ccHomeVmccsToday => 'VMCCகள் · இன்று';

  @override
  String get ccHomeAcrossVmccs => 'எல்லா VMCCகளிலும்';

  @override
  String get ccHomeInPoolLabel => 'பூலில் · முந்தைய மாலை + இன்று காலை';

  @override
  String get ccHomeCollectedTodayLabel =>
      'எல்லா VMCCகளிலிருந்தும் சேகரிப்பு · இன்று';

  @override
  String ccHomeActiveOfTotal(int active, int total, Object inTransit) {
    return '$totalஇல் $active VMCC · $inTransit போக்குவரத்தில்';
  }

  @override
  String ccHomeNextPoolNote(Object amount) {
    return 'அடுத்த அனுப்புதலுக்கு $amount சேகரிக்கப்படுகிறது';
  }

  @override
  String get ccHomeReportLink => 'அறிக்கை';

  @override
  String get ccHomeQcReportLink => 'QC அறிக்கை';

  @override
  String get ccHomeRateChartLink => 'விலை அட்டவணை';

  @override
  String get ccRateChartsEmptyTitle => 'செயலில் உள்ள விலை அட்டவணைகள் இல்லை';

  @override
  String get ccRateChartsEmptySubtitle =>
      'பால் நிறுவனம் அமைத்த விலை அட்டவணைகள் இங்கே தோன்றும்';

  @override
  String get ccInTransitLabel => 'போக்குவரத்தில்';

  @override
  String get ccHomePlantReadyLabel => 'பிளாண்டுக்கு தயார்';

  @override
  String get ccVmccsLoadError => 'VMCCகளை ஏற்ற முடியவில்லை';

  @override
  String get ccNoVmccsLinkedTitle => 'VMCC எதுவும் இணைக்கப்படவில்லை';

  @override
  String get ccNoVmccsLinkedSubtitle =>
      'இந்த CCக்கு VMCCகளை வெப் நிர்வாகத்தில் ஒதுக்கவும்';

  @override
  String ccHomeFarmersCount(int count) {
    return '$count விவசாயிகள்';
  }

  @override
  String get ccHomeMorning => 'காலை';

  @override
  String get ccHomeEvening => 'மாலை';

  @override
  String ccHomeShiftInTransit(Object amount) {
    return '$amount வழியில்';
  }

  @override
  String ccHomeShiftReceivedCount(int done, int total) {
    return '$total இல் $done வந்துவிட்டது';
  }

  @override
  String get ccHomeShiftNothingIn => 'இன்னும் எதுவும் இல்லை';

  @override
  String get ccReceiveTitle => 'பெறுதல்';

  @override
  String get ccReceiveLoadError => 'அனுப்புகைகளை ஏற்ற முடியவில்லை';

  @override
  String get ccReceiveManualButton => 'கைமுறையாக பெறு';

  @override
  String get ccReceiveNothingInTransit => 'போக்குவரத்தில் எதுவும் இல்லை';

  @override
  String get ccReceiveNothingInTransitSubtitle =>
      'வரும் அனுப்புகைகள் இங்கே தோன்றும்';

  @override
  String get ccReceiveRecentReceives => 'சமீபத்திய பெறுதல்கள்';

  @override
  String get historyNotReceivedYet => 'இன்னும் பெறப்படவில்லை';

  @override
  String historyUpstreamPending(Object qty) {
    return '$qty இன்னும் பெறப்படவில்லை';
  }

  @override
  String get historyAtSource => 'மையத்தில்';

  @override
  String get historyNothingToday =>
      'இன்று இன்னும் எதுவும் பெறப்படவோ சேகரிக்கப்படவோ இல்லை';

  @override
  String get ccReceiveNoReceiptsYet => 'இன்னும் ரசீதுகள் இல்லை';

  @override
  String get ccReceiveNoReceiptsSubtitle =>
      'VMCCகளிடமிருந்து நீங்கள் பெறும் பால் இங்கே தோன்றும்';

  @override
  String get ccReceiveHistoryTitle => 'பெறுதல் வரலாறு';

  @override
  String get ccReceivePillInTransit => 'போக்குவரத்தில்';

  @override
  String get ccReceiveTapToReceive => 'பெற தட்டவும்';

  @override
  String ccVarianceSuffix(Object value) {
    return '$value% வேறுபாடு';
  }

  @override
  String get ccReceiveEditReceipt => 'ரசீதைத் திருத்து';

  @override
  String get ccReceiveDeleteReceipt => 'ரசீதை நீக்கு';

  @override
  String get ccReceiveLockedForDispatch =>
      'பூட்டப்பட்டது — அனுப்புதலுக்காக வரவேற்பு மூடப்பட்டது';

  @override
  String get ccReceiveDeleteConfirmTitle => 'ரசீதை நீக்கவா?';

  @override
  String ccReceiveDeleteConfirmBody(Object name, Object qty) {
    return '$name · $qty அகற்றப்படும்.';
  }

  @override
  String get ccReceiveReceiptDeletedToast => 'ரசீது நீக்கப்பட்டது';

  @override
  String get ccReceiveNoVmccsLinkedToast =>
      'இந்த CCக்கு VMCC எதுவும் இணைக்கப்படவில்லை';

  @override
  String get ccHistoryNoReceiptsSubtitle =>
      'கடந்த 30 நாட்களில் VMCCகளிடமிருந்து பெற்ற பால் இங்கே தோன்றும்';

  @override
  String ccHistoryVmccCount(int count) {
    return '$count VMCC';
  }

  @override
  String get ccHistoryDayLoadError => 'இந்த நாளை ஏற்ற முடியவில்லை';

  @override
  String get ccDayLabel => 'நாள்';

  @override
  String get ccReportLoadError => 'அறிக்கையை ஏற்ற முடியவில்லை';

  @override
  String get ccReportNoMilkReceived => 'இந்த தேதியில் பால் பெறப்படவில்லை';

  @override
  String get ccReportTotalReceived => 'மொத்தம் பெற்றது';

  @override
  String ccReportSourcesReceipts(int sources, int receipts) {
    return '$sources VMCC · $receipts ரசீதுகள்';
  }

  @override
  String get ccReportAvgFat => 'சராசரி FAT';

  @override
  String get ccReportAvgSnf => 'சராசரி SNF';

  @override
  String get ccReportAvgWater => 'சராசரி தண்ணீர்';

  @override
  String get ccReportSourceVmccs => 'மூல VMCCகள்';

  @override
  String get ccQcLoadError => 'QC தரவை ஏற்ற முடியவில்லை';

  @override
  String ccQcHeroLabelAll(int days) {
    return 'பெற்றது · கடந்த $days நாட்கள்';
  }

  @override
  String get ccQcHeroFooterAll => 'எல்லா VMCC பெறுதல்களிலும் அளவு-எடை தரம்';

  @override
  String ccQcHeroLabelVmcc(Object name, int days) {
    return '$name · கடந்த $days நாட்கள்';
  }

  @override
  String get ccQcHeroFooterVmcc => 'இந்த VMCCயிடமிருந்து பெற்ற அளவு-எடை தரம்';

  @override
  String get ccQcEmptySubtitleVmcc =>
      'இந்த காலகட்டத்தில் இந்த VMCCயிடமிருந்து பால் பெறப்படவில்லை';

  @override
  String get ccQcScopeAll => 'அனைத்தும்';

  @override
  String get ccQcScopeByVmcc => 'VMCC வாரியாக';

  @override
  String get ccQcScopeRanking => 'தரவரிசை';

  @override
  String get ccQcSelectVmccTitle => 'VMCC தேர்ந்தெடுக்கவும்';

  @override
  String get ccQcSelectVmccPlaceholder => 'ஒரு VMCC தேர்ந்தெடுக்கவும்';

  @override
  String ccQcRangeDays(int d) {
    return '$d நாட்கள்';
  }

  @override
  String get ccVmccsSearchHint => 'VMCCகளை தேடுக';

  @override
  String get ccVmccsNoneAssigned => 'VMCC எதுவும் ஒதுக்கப்படவில்லை';

  @override
  String get ccVmccsNoMatch => 'பொருந்தும் VMCC இல்லை';

  @override
  String get ccManualReceiveTitle => 'கைமுறையாக பெறு';

  @override
  String get ccManualReceiveInfoBanner =>
      'ஆப்பில் அனுப்புதல் பதிவு இல்லாமல் பால் வந்தபோது மட்டும் இதைப் பயன்படுத்தவும்.';

  @override
  String get ccManualReceiveReceivingFor => 'இதற்காக பெறுகிறது';

  @override
  String get ccManualReceiveShiftLabel => 'ஷிப்ட்';

  @override
  String get ccManualReceiveSelectVmcc => 'VMCC தேர்ந்தெடுக்கவும்';

  @override
  String get ccManualReceiveNoVmccsLinked =>
      'இந்த CCக்கு VMCC எதுவும் இணைக்கப்படவில்லை.';

  @override
  String ccManualReceiveNoVmccsShift(Object shift) {
    return '$shift ஷிப்டில் எந்த VMCCயும் சேகரிக்கவில்லை.';
  }

  @override
  String ccManualReceiveReceivedBadge(Object qty) {
    return '$qty பெறப்பட்டது';
  }

  @override
  String get ccManualReceiveCollectionDate => 'சேகரிப்பு தேதி';

  @override
  String ccManualReceiveDeleteConfirmBody(
    Object name,
    Object date,
    Object shift,
  ) {
    return '$name · $date $shift அகற்றப்படும்.';
  }

  @override
  String get ccManualReceiveErrorMissingFields =>
      'அளவு, FAT மற்றும் SNF உள்ளிடவும்';

  @override
  String get ccMeasuredAtCc => 'CCயில் அளக்கப்பட்டது';

  @override
  String get ccManualReceiveQtyHint => 'அளவு (L)';

  @override
  String get ccManualReceiveSaveChanges => 'மாற்றங்களை சேமி';

  @override
  String get ccManualReceiveMarkReceived => 'பெறப்பட்டதாக குறி';

  @override
  String get ccReceiveConsignmentSourceFallback => 'மூலம்';

  @override
  String get ccReceiveConsignmentReceiptTitle => 'ரசீது';

  @override
  String get ccReceiveConsignmentReceiveMilkTitle => 'பால் பெறு';

  @override
  String get ccReceiveConsignmentQuantityLabel => 'அளவு';

  @override
  String get ccReceiveConsignmentSameAsDispatched => 'அனுப்பியது போலவே';

  @override
  String get ccReceiveConsignmentReceivedQtyHint => 'பெற்ற அளவு (L)';

  @override
  String get ccReceiveConsignmentUpdateReceipt => 'ரசீதை புதுப்பி';

  @override
  String get ccReceiveConsignmentConfirmReceipt => 'ரசீதை உறுதிசெய்';

  @override
  String get ccReceiveConsignmentErrorQty => 'பெற்ற அளவை உள்ளிடவும்';

  @override
  String get ccReceiveConsignmentEnterQtyForVariance =>
      'அனுப்பியதோடு ஒப்பிட்டு வேறுபாட்டை காண பெற்ற அளவை உள்ளிடவும்';

  @override
  String get ccReceiveConsignmentVarianceLabel => 'அனுப்பியதோடு வேறுபாடு';

  @override
  String get ccReceiveConsignmentDispatchedByVmcc => 'VMCC ஆல் அனுப்பப்பட்டது';

  @override
  String get ccQcReportEmptyTitle => 'இந்த காலகட்டத்தில் ரசீதுகள் இல்லை';

  @override
  String get ccQcReportEmptySubtitle =>
      'தினசரி QC அறிக்கையை காண VMCCகளிடமிருந்து பால் பெறவும்';

  @override
  String get ccQcReportTrendsLabel => 'தர போக்குகள்';

  @override
  String get ccQcReportDailyQualityLabel => 'தினசரி தரம் · அளவு-எடை';

  @override
  String get ccQcReportDateHeader => 'தேதி';

  @override
  String get ccQcReportNoReadings => 'இந்த காலகட்டத்தில் அளவீடுகள் இல்லை';

  @override
  String ccQcRankingByMetric(Object metric) {
    return '$metric வாரியாக';
  }

  @override
  String get ccQcRankingHighToLow => 'அதிகம் → குறைவு';

  @override
  String get ccQcRankingLowToHigh => 'குறைவு → அதிகம்';

  @override
  String ccQcRankingSummary(int active, int total, int days) {
    return '$totalஇல் $active VMCC வழங்கியது · கடந்த $days நாட்கள்';
  }

  @override
  String get navTankers => 'டேங்கர்கள்';

  @override
  String get ppHomeRawMilkTank => 'மூல பால் தொட்டி';

  @override
  String get ppHomeCcsToday => 'CCக்கள் · இன்று';

  @override
  String get ppHomeTodayLabel => 'இன்று';

  @override
  String get ppHomeTodayReceivedLabel => 'இன்று பெறப்பட்டது';

  @override
  String ppHomeTankersCount(int count) {
    return '$count டேங்கர்';
  }

  @override
  String ppHomeVarianceVsDispatch(Object value) {
    return '$value% அனுப்பியதோடு ஒப்பிடும்போது';
  }

  @override
  String get ppHomeReceivedLabel => 'பெறப்பட்டது';

  @override
  String get ppHomeNoCcsTitle => 'அனுப்பும் CCக்கள் இல்லை';

  @override
  String get ppHomeNoCcsSubtitle =>
      'இந்த ஆலைக்கு பால் அளிக்கும் குளிரூட்டும் மையங்கள் இங்கே தோன்றும்';

  @override
  String ppHomeFlowTransit(Object amount) {
    return '$amount போக்குவரத்தில்';
  }

  @override
  String ppHomeFlowReceived(Object amount) {
    return '$amount பெறப்பட்டது';
  }

  @override
  String get ppReceiveNoReceiptsSubtitle =>
      'CCக்களிடமிருந்து நீங்கள் பெறும் டேங்கர்கள் இங்கே தோன்றும்';

  @override
  String get ppReceiveLoadError => 'டேங்கர்களை ஏற்ற முடியவில்லை';

  @override
  String get ppReceiveNothingInTransitSubtitle =>
      'அனுப்பிய பிறகு உள்வரும் டேங்கர்கள் இங்கே தோன்றும்';

  @override
  String get ppReceiveDispatchedByCc => 'CC ஆல் அனுப்பப்பட்டது';

  @override
  String get ppReceiveMeasuredAtPlant => 'ஆலையில் அளக்கப்பட்டது';

  @override
  String get ppManualReceiveButton => 'அனுப்புதல் இல்லாமல் பெறுக';

  @override
  String get ppManualReceiveTitle => 'அனுப்புதல் இல்லாமல் பெறுக';

  @override
  String get ppManualReceiveInfoBanner =>
      'பால் ஆலைக்கு வந்துவிட்டது ஆனால் CC இன்னும் தனது சேகரிப்பைப் பதிவு செய்யவில்லை எனும்போது இதைப் பயன்படுத்தவும். உற்பத்தித் திட்டமிடலுக்காக ஒவ்வொரு பால் வகைக்கும் தனித்தனியாகப் பதிவு செய்யவும்.';

  @override
  String get ppManualReceiveArrivedFrom => 'எங்கிருந்து வந்தது';

  @override
  String get ppManualReceiveSourceCc => 'குளிரூட்டும் மையம்';

  @override
  String get ppManualReceivePerTypeLabel =>
      'பெறப்பட்ட அளவு, ஒவ்வொரு பால் வகைக்கும்';

  @override
  String get ppManualReceiveNotReceived => 'பெறவில்லை';

  @override
  String get ppManualReceiveSaveEmpty => 'அளவை உள்ளிடவும்';

  @override
  String manualReceiveSaveCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ரசீதுகளைச் சேமி',
      one: '1 ரசீதைச் சேமி',
    );
    return '$_temp0';
  }

  @override
  String manualReceivePartialError(int saved, String error) {
    String _temp0 = intl.Intl.pluralLogic(
      saved,
      locale: localeName,
      other: '$saved ரசீதுகள் சேமிக்கப்பட்டன',
      one: '1 ரசீது சேமிக்கப்பட்டது',
    );
    return '$_temp0, பிறகு: $error';
  }

  @override
  String get ppReceiveManualTag => 'கைமுறை';

  @override
  String ppReceiveDeleteManualConfirm(String qty, String cc, String date) {
    return '$date அன்று $cc இலிருந்து வந்த $qty கைமுறை ரசீதை நீக்கவா? அது பதிவு செய்த மூலப்பால் இருப்பு திரும்பப் பெறப்படும்.';
  }

  @override
  String get ppReceiveManualDuplicateWarning =>
      'இந்த CC, தேதி மற்றும் பால் வகைக்கு ஏற்கனவே ஒரு கைமுறை ரசீது உள்ளது. இந்த டேங்கரையும் பெற்றால் பால் இரண்டு முறை கணக்கிடப்படும் — ஒன்றை நீக்கவும்.';

  @override
  String get ppTankersEmptyTitle => 'இன்று டேங்கர்கள் இல்லை';

  @override
  String get ppTankersEmptySubtitle =>
      'இந்த ஆலைக்கு அனுப்பப்பட்ட டேங்கர்கள் இங்கே தோன்றும்';

  @override
  String get adminSwitchTitlePp => 'பதப்படுத்தும் ஆலைகள்';

  @override
  String get adminSwitchTitleCc => 'குளிரூட்டும் மையங்கள்';

  @override
  String get adminSwitchTitleVmcc => 'கிராம சேகரிப்பு மையங்கள்';

  @override
  String get adminSwitchFarmersNav => 'விவசாயிகள்';

  @override
  String get adminSwitchDefaultUserName => 'Dhenu பயனர்';

  @override
  String get adminSwitchLoadError => 'இன்றைய சேகரிப்பை ஏற்ற முடியவில்லை';

  @override
  String get adminSwitchTodayCollectionLabel => 'இன்றைய சேகரிப்பு';

  @override
  String get adminSwitchByChillingCentre => 'குளிரூட்டும் மையம் வாரியாக';

  @override
  String get adminSwitchByMilkType => 'பால் வகை வாரியாக';

  @override
  String get adminSwitchNoCollectionTitle => 'இன்று இன்னும் சேகரிப்பு இல்லை';

  @override
  String get adminSwitchNoCollectionSubtitle =>
      'ஒவ்வொரு மையம் மற்றும் பால் வகையின் மொத்தமும் இங்கே தோன்றும்.';

  @override
  String get adminSwitchNoCollectionSuffix => ' · சேகரிப்பு இல்லை';

  @override
  String get adminSwitchNotLinkedToCc =>
      'குளிரூட்டும் மையத்துடன் இணைக்கப்படவில்லை';

  @override
  String get adminSwitchCcFallback => 'குளிரூட்டும் மையம்';

  @override
  String get adminSwitchUnlinkedVmccs => 'இணைக்கப்படாத VMCCக்கள்';

  @override
  String adminSwitchVmccsInCc(Object name) {
    return '$name இல் உள்ள VMCCக்கள்';
  }

  @override
  String get adminSwitchSheetTitle => 'மையத்தை மாற்று';

  @override
  String get adminSwitchLoadCentresError => 'மையங்களை ஏற்ற முடியவில்லை';

  @override
  String get adminSwitchNoCentresTitle => 'இன்னும் மையங்கள் இல்லை';

  @override
  String get adminSwitchNoCentresSubtitle =>
      'வெப் அட்மினில் முதலில் VMCCக்கள், குளிரூட்டும் மையங்கள் அல்லது ஆலைகளை சேர்க்கவும்';

  @override
  String get operatorSwitchRolePp => 'பதப்படுத்தும் ஆலை';

  @override
  String get operatorSwitchRoleCc => 'குளிரூட்டும் மையம்';

  @override
  String get operatorSwitchRoleVmcc => 'கிராம சேகரிப்பு மையம்';

  @override
  String get operatorSwitchLoadError => 'உங்கள் மையங்களை ஏற்ற முடியவில்லை';

  @override
  String get operatorSwitchNoneTitle => 'மையம் எதுவும் ஒதுக்கப்படவில்லை';

  @override
  String get operatorSwitchNoneSubtitle =>
      'மையத்திற்கு நியமிக்க உங்கள் நிர்வாகியிடம் கேளுங்கள்.';

  @override
  String get operatorSwitchTodayLoading => 'இன்று  …';

  @override
  String get operatorSwitchNoCollection => 'இன்னும் சேகரிப்பு இல்லை';

  @override
  String operatorSwitchTodaySummary(Object qty, int count) {
    return 'இன்று  $qty · $count விவசாயிகள்';
  }

  @override
  String get operatorSwitchButton => 'மாற்று';

  @override
  String get operatorSelectorGreetingPlain => 'வணக்கம்';

  @override
  String operatorSelectorGreetingNamed(Object name) {
    return 'வணக்கம், $name';
  }

  @override
  String get operatorSelectorSubtitle => 'இயக்க ஒரு மையத்தை தேர்ந்தெடுக்கவும்';

  @override
  String get operatorNoAccessTitle => 'இன்னும் Dhenu அணுகல் இல்லை';

  @override
  String get operatorNoAccessSubtitle =>
      'உங்கள் கணக்கிற்கு பால் கொள்முதலை இயக்க உங்கள் டெய்ரி நிர்வாகியிடம் கேளுங்கள்.';

  @override
  String get operatorNoAccessSignOut => 'வெளியேறு';

  @override
  String get authLoginTagline => 'பால் கொள்முதல், நியாயமாக';

  @override
  String get authLoginSessionExpired =>
      'உங்கள் அமர்வு காலாவதியானது. உங்கள் தொலைபேசி எண்ணுடன் மீண்டும் உள்நுழையவும்.';

  @override
  String get commonBack => 'பின்';

  @override
  String get authOtpPhoneLabel => 'தொலைபேசி எண்';

  @override
  String get authOtpPhoneHint => '10-இலக்க மொபைல்';

  @override
  String get authOtpSendButton => 'OTP அனுப்பு';

  @override
  String get authOtpEnterDigits => '10-இலக்க மொபைல் எண்ணை உள்ளிடவும்';

  @override
  String get authOtpEnterCode => '6-இலக்க குறியீட்டை உள்ளிடவும்';

  @override
  String authOtpCodeSentTo(Object phone) {
    return '$phone க்கு அனுப்பப்பட்ட குறியீட்டை உள்ளிடவும்';
  }

  @override
  String get authOtpSignIn => 'உள்நுழை';

  @override
  String get authOtpSmsDelay => 'SMS வர ஒரு நிமிடம் வரை ஆகலாம்.';

  @override
  String get authOtpChangeNumber => 'எண்ணை மாற்று';

  @override
  String authOtpResendIn(int seconds) {
    return '$secondsவி இல் மீண்டும் அனுப்பு';
  }

  @override
  String get authOtpResendButton => 'OTP ஐ மீண்டும் அனுப்பு';

  @override
  String authOtpNetworkErrorDebug(Object baseUrl) {
    return '$baseUrl சேவையகத்தை அடைய முடியவில்லை. API இயங்குகிறதா, தொலைபேசி அதே நெட்வொர்க்கில் உள்ளதா?';
  }

  @override
  String get authOtpNetworkErrorProd =>
      'சேவையகத்தை அடைய முடியவில்லை. உங்கள் இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.';

  @override
  String get aboutScreenTitle => 'பற்றி';

  @override
  String get aboutScreenTagline => 'பால் கொள்முதல், எளிமையாக்கப்பட்டது';

  @override
  String aboutScreenVersion(Object version, Object build) {
    return 'பதிப்பு $version ($build)';
  }

  @override
  String get aboutScreenPrivacyPolicy => 'தனியுரிமைக் கொள்கை';

  @override
  String get aboutScreenTermsOfService => 'சேவை விதிமுறைகள்';

  @override
  String get aboutScreenMadeWith =>
      'இந்தியாவில் அக்கறையுடன் உருவாக்கப்பட்டது 🇮🇳';

  @override
  String get aboutScreenCouldNotOpen => 'திறக்க முடியவில்லை';

  @override
  String get bankPayoutTitle => 'வங்கி & பணம் செலுத்துதல்';

  @override
  String get bankPayoutLoadError => 'பணம் செலுத்துதலை ஏற்ற முடியவில்லை';

  @override
  String get bankPayoutEmptyTitle =>
      'இன்னும் பணம் செலுத்தும் விதிமுறைகள் இல்லை';

  @override
  String get bankPayoutEmptySubtitle =>
      'உங்கள் ஊதியம் உங்கள் நிர்வாகியால் அமைக்கப்படும், இங்கே தோன்றும்.';

  @override
  String get bankPayoutThisMonth => 'இந்த மாதம்';

  @override
  String bankPayoutCollectedEstEarning(Object qty) {
    return '$qty சேகரிக்கப்பட்டது · இதுவரை மதிப்பிடப்பட்ட வருமானம்';
  }

  @override
  String get bankPayoutMethodLabel => 'பணம் செலுத்தும் முறை';

  @override
  String get bankPayoutRentLabel => 'வாடகை';

  @override
  String bankPayoutPerMonth(Object amount) {
    return '$amount / மாதம்';
  }

  @override
  String get bankPayoutSinceLabel => 'முதல்';

  @override
  String get bankPayoutHasAccount =>
      'பணம் உங்கள் பதிவு செய்யப்பட்ட வங்கிக் கணக்கிற்குச் செல்லும்.';

  @override
  String get bankPayoutNoAccount =>
      'பதிவில் வங்கிக் கணக்கு இல்லை — ஒன்றைச் சேர்க்க உங்கள் நிர்வாகியிடம் கேளுங்கள்.';

  @override
  String get bankPayoutFixedSalary => 'நிலையான சம்பளம்';

  @override
  String get bankPayoutPerLitreCommission => 'ஒரு லிட்டருக்கான கமிஷன்';

  @override
  String bankPayoutPerLitre(Object rate) {
    return '$rate / லிட்டர்';
  }

  @override
  String get langPickerTitle => 'மொழியைத் தேர்ந்தெடுக்கவும்';

  @override
  String get langPickerComingSoon => 'விரைவில் வரும்';

  @override
  String get dispatchFatHint => 'FAT %';

  @override
  String get dispatchSnfHint => 'SNF %';

  @override
  String get dispatchQtyLabel => 'அளவு (L)';

  @override
  String get dispatchWaterLabel => 'நீர் %';

  @override
  String get dispatchContainerFieldLabel => 'கொள்கலன்';

  @override
  String get dispatchWaterHint => 'நீர் % (விருப்பம்)';

  @override
  String get dispatchHistoryTitle => 'அனுப்புதல் வரலாறு';

  @override
  String get dispatchSeeFullHistory => 'முழு வரலாற்றைக் காண்க';

  @override
  String get dispatchHistoryLoadError => 'வரலாற்றை ஏற்ற முடியவில்லை';

  @override
  String get dispatchHistoryEmptyTitle => 'இன்னும் அனுப்புதல்கள் இல்லை';

  @override
  String get dispatchHistoryEmptySubtitle =>
      'கடந்த 30 நாட்களில் அனுப்பப்பட்ட டேங்கர்கள் இங்கே தோன்றும்';

  @override
  String get dispatchHistoryPlantFallback => 'ஆலை';

  @override
  String get dispatchHistoryCcFallback => 'குளிரூட்டும் மையம்';

  @override
  String dispatchHistoryCount(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n அனுப்புதல்கள்',
      one: '$n அனுப்புதல்',
    );
    return '$_temp0';
  }

  @override
  String dispatchHistoryInTransit(int n) {
    return '$n போக்குவரத்தில்';
  }

  @override
  String get dispatchHistoryReversed => '⊘ ரத்து செய்யப்பட்டது';

  @override
  String farmerPoursGradeLabel(Object letter) {
    return 'தரம் $letter';
  }

  @override
  String get collectLowWord => 'குறைவு';

  @override
  String get qcReportLoadError => 'QC தரவை ஏற்ற முடியவில்லை';

  @override
  String qcReportHeroLabelFarmer(Object name, int days) {
    return '$name · கடந்த $days நாட்கள்';
  }

  @override
  String qcReportHeroLabelAll(int days) {
    return 'சேகரிக்கப்பட்டது · கடந்த $days நாட்கள்';
  }

  @override
  String qcReportHeroLabelDays(int days) {
    return 'கடந்த $days நாட்கள்';
  }

  @override
  String get qcReportFooterFarmer => 'இந்த விவசாயிக்கான அளவு-எடையிடப்பட்ட தரம்';

  @override
  String get qcReportFooterAll => 'அனைத்து விவசாயிகளின் அளவு-எடையிடப்பட்ட தரம்';

  @override
  String get qcReportEmptyTitle => 'இந்த காலகட்டத்தில் அளவீடுகள் இல்லை';

  @override
  String get qcReportEmptySubtitle =>
      'தினசரி QC போக்கைக் காண சேகரிப்புகளைப் பதிவு செய்யவும்';

  @override
  String get qcReportSelectFarmerTitle => 'ஒரு விவசாயியைத் தேர்ந்தெடுக்கவும்';

  @override
  String get qcReportSelectFarmerSubtitle =>
      'தர போக்கைக் காண ஒரு விவசாயியைத் தேர்ந்தெடுக்கவும்';

  @override
  String get qcReportScopeAll => 'அனைத்து விவசாயிகள்';

  @override
  String get qcReportScopePerFarmer => 'ஒரு விவசாயிக்கு';

  @override
  String qcReportDaysChip(int d) {
    return '$d நாட்கள்';
  }

  @override
  String get homeCouldNotLoadCentre => 'உங்கள் மையத்தை ஏற்ற முடியவில்லை';

  @override
  String get updateRequiredTitle => 'புதுப்பிப்பு தேவை';

  @override
  String get updateRequiredButton => 'இப்போது புதுப்பிக்கவும்';

  @override
  String get updateRequiredCouldNotOpenStore => 'ஸ்டோரைத் திறக்க முடியவில்லை';

  @override
  String get nodePickerSearchHint => 'தேடு…';

  @override
  String get nodePickerNoMatch => 'பொருத்தம் இல்லை';

  @override
  String get voiceFieldDictateTooltip => 'வாய்மொழி உள்ளீடு';

  @override
  String get voiceFieldReadBackTooltip => 'மீண்டும் படி';

  @override
  String get splashTagline => 'ஒவ்வொரு துளியும் முக்கியம்';

  @override
  String get farmerBankAccountHolder => 'கணக்கு வைத்திருப்பவர்';

  @override
  String get farmerBankAccountNumber => 'கணக்கு எண்';

  @override
  String get farmerBankIfsc => 'IFSC';

  @override
  String get farmerBankName => 'வங்கி';

  @override
  String get farmerBankUpi => 'UPI ID';

  @override
  String get farmerBankEmpty =>
      'பணம் பெறும் விவரங்கள் இன்னும் இல்லை — உங்கள் சேகரிப்பு மைய ஆபரேட்டரை கேளுங்கள்.';

  @override
  String get farmerBankFootnote =>
      'உங்கள் பால் பணம் இந்த கணக்கிற்கு செல்லும். மாற்ற உங்கள் சேகரிப்பு மைய ஆபரேட்டரை கேளுங்கள்.';

  @override
  String get farmerReportProblem => 'பிரச்சனையை தெரிவிக்கவும்';

  @override
  String farmerReportPrefill(Object date, Object shift, Object qty) {
    return 'வணக்கம், $date ($shift, $qty) அன்றைய என் பால் பதிவு பற்றி கேள்வி உள்ளது.';
  }

  @override
  String collectAdvanceChip(Object amount) {
    return '$amount முன்பணம் நிலுவை';
  }

  @override
  String get collectShareSummary => 'சுருக்கத்தை பகிர்';

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
    return '$node · $date · $shift\nசேகரித்த பால்: $qty\nவிவசாயிகள்: $count\nசராசரி FAT $fat · SNF $snf';
  }

  @override
  String farmerRateNewNotice(Object date) {
    return '$date முதல் புதிய விலை அமலில் உள்ளது';
  }

  @override
  String homeCloseShiftNudge(Object shift) {
    return '$shift சேகரிப்பு இன்னும் திறந்துள்ளது — முடிந்ததும் மூடவும்.';
  }

  @override
  String get notificationsTitle => 'அறிவிப்புகள்';

  @override
  String get notificationsMarkAllRead => 'அனைத்தையும் படித்ததாகக் குறி';

  @override
  String get notificationsEmptyTitle => 'இதுவரை எதுவும் இல்லை';

  @override
  String get notificationsEmptySubtitle =>
      'உங்கள் மையத்தின் அனுப்புதல்கள் மற்றும் பெறுதல்கள் இங்கே தோன்றும்.';

  @override
  String get notificationsLoadError => 'அறிவிப்புகளை ஏற்ற முடியவில்லை';

  @override
  String get notificationsJustNow => 'இப்போதுதான்';

  @override
  String notificationsMinutesAgo(int n) {
    return '$n நிமிடங்களுக்கு முன்';
  }

  @override
  String notificationsHoursAgo(int n) {
    return '$n மணி நேரத்திற்கு முன்';
  }

  @override
  String notificationsDaysAgo(int n) {
    return '$n நாட்களுக்கு முன்';
  }

  @override
  String ppHistoryCcCount(int count) {
    return '$count CC';
  }

  @override
  String get ppHistoryNoReceiptsSubtitle =>
      'கடந்த 30 நாட்களில் CC-களிடமிருந்து பெற்ற டாங்கர்கள் இங்கே தெரியும்';

  @override
  String get ppQcScopeByCc => 'CC வாரியாக';

  @override
  String get ppQcHeroFooterAll => 'அனைத்து CC டாங்கர்களின் அளவு-என்னிக்கை தரம்';

  @override
  String ppQcHeroLabelCc(Object name, int days) {
    return '$name · கடந்த $days நாட்கள்';
  }

  @override
  String get ppQcHeroFooterCc => 'இந்த CC-இலிருந்து பெற்ற பாலின் தரம்';

  @override
  String get ppQcEmptySubtitleCc =>
      'இந்த காலகட்டத்தில் இந்த CC-இலிருந்து பால் பெறப்படவில்லை';

  @override
  String get ppQcSelectCcTitle => 'CC தேர்ந்தெடுக்க';

  @override
  String get ppQcSelectCcPlaceholder => 'ஒரு CC தேர்ந்தெடுக்க';

  @override
  String ppQcRankingSummary(int active, int total, int days) {
    return '$total-இல் $active CC விநியோகித்தது · கடந்த $days நாட்கள்';
  }

  @override
  String fastTrackTitle(String plant) {
    return '$plant க்கு அனுப்பவா?';
  }

  @override
  String get fastTrackChecking => 'தயாராக உள்ளதைச் சரிபார்க்கிறது…';

  @override
  String get fastTrackSend => 'அனுப்பு';

  @override
  String get fastTrackNothingTitle => 'அனுப்ப ஒன்றுமில்லை';

  @override
  String get fastTrackNothingSubtitle =>
      'இப்போது ஆலைக்குச் செல்ல பால் எதுவும் காத்திருக்கவில்லை.';

  @override
  String get fastTrackClosesWholeDay =>
      'இது இந்த மையத்தின் முழு நாள் சேகரிப்பையும் மூடும் — அதன் பிறகு ஊற்றப்படும் பாலுக்கு ஸ்லாட்டை மீண்டும் திறக்க வேண்டும்.';

  @override
  String fastTrackSuccess(String qty, String plant) {
    return '$qty $plant க்கு அனுப்பப்பட்டது';
  }

  @override
  String fastTrackPartial(String vmcc) {
    return '$vmcc இல் நின்றது. அதற்கு முந்தையவை பதிவாகிவிட்டன — மீதியை அனுப்பும் திரையில் முடிக்கவும்.';
  }

  @override
  String get dispatchDestTitle => 'இது எங்கே செல்கிறது?';

  @override
  String dispatchDestPlant(String plant) {
    return '$plant க்கு அனுப்பு';
  }

  @override
  String get dispatchDestPlantSub =>
      'குளிரூட்டும் மையத்தை மூடி பாலை மூலப் பால் சரக்கில் சேர்க்கும் — முழு சங்கிலியும் ஒரே படியில்';

  @override
  String dispatchDestCc(String cc) {
    return '$cc க்கு அனுப்பு';
  }

  @override
  String get dispatchDestCcSub =>
      'வழக்கமான படி — குளிரூட்டும் மையம் பெற்று எடை பார்க்கும்';

  @override
  String get fastTrackChainSummary =>
      'இரு மையங்களையும் மூடி, ஒவ்வொரு படியின் அனுப்புதல் மற்றும் பெறுதலைப் பதிவு செய்து, பாலை மூலப் பால் சரக்கில் சேர்க்கும்.';

  @override
  String get ccHomeShiftAwaitingVmcc => 'இன்னும் பெறவில்லை';

  @override
  String homeDispatchShiftQty(String shift, String qty) {
    return '$shift அனுப்பு · $qty';
  }

  @override
  String homeDispatchSlotDated(String shift, String date, String qty) {
    return '$shift · $date · $qty அனுப்பு';
  }

  @override
  String homeDispatchBothShifts(String qty) {
    return 'AM மற்றும் PM அனுப்பு · $qty';
  }

  @override
  String dispatchDestPlantSubBoth(String qty) {
    return 'இரு பணிமுறைகளும் · $qty';
  }

  @override
  String dispatchDestCcSubOne(String shift) {
    return 'ஒரு பணிமுறை மட்டும் — $shift இல் தொடங்கும்';
  }

  @override
  String get dispatchDestPlantGeneric => 'முதன்மை ஆலைக்கு அனுப்பு';

  @override
  String get dispatchDestCcGeneric => 'குளிரூட்டும் மையத்திற்கு அனுப்பு';

  @override
  String get farmerPaymentsSegPayouts => 'கொடுப்பனவுகள்';

  @override
  String get farmerPaymentsSegLedger => 'முன்பணம்';

  @override
  String get farmerPaymentsLastPayout => 'கடைசி கொடுப்பனவு';

  @override
  String get farmerPaymentsNoPayouts => 'இதுவரை கொடுப்பனவு இல்லை';

  @override
  String get farmerPaymentsNoPayoutsSubtitle =>
      'சுழற்சி உருவாக்கப்பட்ட பிறகு சுழற்சி கொடுப்பனவுகள் இங்கே தோன்றும்';

  @override
  String get farmerPaymentsPayoutsLoadError => 'கொடுப்பனவுகளை ஏற்ற முடியவில்லை';

  @override
  String farmerPaymentsLitresNet(String litres, String amount) {
    return '$litres லி · நிகர $amount';
  }

  @override
  String get farmerPaymentsMarkPaid => 'பணம் செலுத்தியதாகக் குறி';

  @override
  String get farmerPaymentsMarkPaidError =>
      'கொடுப்பனவு நிலையைப் புதுப்பிக்க முடியவில்லை';

  @override
  String get farmerPaymentsUnpaid => 'செலுத்தப்படவில்லை';

  @override
  String farmerPaymentsPaidOn(String date) {
    return '$date அன்று செலுத்தப்பட்டது';
  }

  @override
  String get farmerPaymentsBreakdown => 'விவரம்';

  @override
  String get farmerPaymentsGross => 'மொத்தம்';

  @override
  String get farmerPaymentsBonus => 'தர ஊக்கத்தொகை';

  @override
  String get farmerPaymentsNet => 'நிகர கொடுப்பனவு';

  @override
  String get farmerPaymentsDeductionAdvance => 'முன்பணம் வசூல்';

  @override
  String get farmerPaymentsDeductionFeedLoan => 'தீவன கடன் வசூல்';

  @override
  String get farmerPaymentsDeductionOther => 'பிற பிடித்தம்';

  @override
  String get farmerPaymentsPaymentMode => 'செலுத்திய முறை';

  @override
  String get farmerPaymentsStatementNo => 'அறிக்கை எண்';

  @override
  String farmerPaymentsAdvanceDue(String amount) {
    return 'முன்பணம் $amount';
  }

  @override
  String farmerPaymentsFeedLoanDue(String amount) {
    return 'தீவன கடன் $amount';
  }

  @override
  String get farmerPaymentsRecordEntryButton =>
      'முன்பணம், கடன் அல்லது திருப்பிச் செலுத்துதலைப் பதிவு செய்';

  @override
  String get farmerPaymentsEntrySaved => 'பதிவு சேமிக்கப்பட்டது';

  @override
  String get farmerPaymentsEarnings => 'வருவாய்';

  @override
  String get farmerPaymentsDeductions => 'பிடித்தங்கள்';

  @override
  String get farmerPaymentsPaymentSection => 'கொடுப்பனவு';

  @override
  String get farmerPaymentsPaidOnLabel => 'செலுத்திய தேதி';

  @override
  String get farmerPaymentsReference => 'UTR / குறிப்பு';

  @override
  String get farmerPaymentsNotConfirmed => 'இன்னும் உறுதி செய்யப்படவில்லை';

  @override
  String get farmerPaymentsModeBankTransfer => 'வங்கி பரிமாற்றம்';

  @override
  String get farmerPaymentsModeUpi => 'UPI';

  @override
  String get farmerPaymentsModeCash => 'ரொக்கம்';

  @override
  String get farmerPaymentsModeCheque => 'காசோலை';

  @override
  String get farmerPaymentsModeOther => 'பிற';

  @override
  String get suppliedRecordedAtCc =>
      'குளிரூட்டும் மையத்தில் பதிவு செய்யப்பட்டது';

  @override
  String suppliedRecordedAtNamedCc(String cc) {
    return '$cc இல் பதிவு செய்யப்பட்டது';
  }

  @override
  String get suppliedWholeDay => 'முழு நாள்';

  @override
  String get suppliedNotPriced => 'விலை நிர்ணயிக்கப்படவில்லை';

  @override
  String historyDaySupplySubtitle(String pm, String am) {
    return '☾ $pm · ☀️ $am';
  }

  @override
  String get dispatchHistoryRecordedOnArrival => 'வந்தபோது பதிவு செய்யப்பட்டது';

  @override
  String get paymentsBillsTitle => 'பணப் பட்டியல்கள்';

  @override
  String get paymentsBillsSubtitle =>
      'இந்த மையத்திற்கு ஒவ்வொரு சுழற்சியிலும் வழங்கப்பட்ட தொகை';

  @override
  String get paymentsBillsEmptyTitle => 'இதுவரை பட்டியல் இல்லை';

  @override
  String get paymentsBillsEmptySubtitle =>
      'குளிரூட்டும் மையம் ஒரு சுழற்சியை முடித்ததும் பட்டியல் இங்கே காணப்படும்';

  @override
  String get paymentsBillMilk => 'பால்';

  @override
  String get paymentsBillOperator => 'இயக்குநர்';

  @override
  String get paymentsBillReversed => 'திரும்பப் பெறப்பட்டது';

  @override
  String get paymentsBillStatement => 'விவரப் பட்டியல்';

  @override
  String get paymentsBillsPaidTotal => 'இதுவரை வழங்கியது';

  @override
  String get paymentsBillsDueTotal => 'வழங்க வேண்டியது';

  @override
  String get paymentsBillTotal => 'மொத்தம்';

  @override
  String get paymentsBillStatusPaid => 'வழங்கப்பட்டது';

  @override
  String get paymentsBillStatusDue => 'நிலுவை';

  @override
  String get farmerSaleTitle => 'விவசாயிக்கு விற்க';

  @override
  String get farmerSaleRecord => 'விற்பனையை பதிவு செய்';

  @override
  String get farmerSaleQtyHint => 'அளவு';

  @override
  String get farmerSaleRateHint => 'விலை / லி';

  @override
  String get farmerSaleInvalidEntry => 'லிட்டர் மற்றும் விலையை உள்ளிடவும்';

  @override
  String get farmerSalePickMilkType =>
      'விற்கப்படும் பாலின் வகையைத் தேர்ந்தெடுக்கவும்';

  @override
  String get farmerSaleSaved => 'விற்பனை பதிவானது';

  @override
  String farmerSaleAmountNote(String amount) {
    return '$amount — அடுத்த பணத்திலிருந்து பிடிக்கப்படும்';
  }

  @override
  String get farmerPaymentsSold => 'விவசாயிக்கு விற்பனை';

  @override
  String farmerPaymentsSaleDue(String amount) {
    return 'கொள்முதல் $amount';
  }

  @override
  String get farmerPaymentsBought => 'எங்களிடம் வாங்கியது';

  @override
  String get farmerPaymentsEarlierPurchases => 'முந்தைய கொள்முதல்கள்';

  @override
  String get farmerPaymentsSegSold => 'விற்பனை';

  @override
  String get farmerSaleNoneYet => 'இந்த விவசாயிக்கு இதுவரை எதுவும் விற்கவில்லை';

  @override
  String get farmerSaleKindMilk => 'பால்';

  @override
  String get farmerSaleKindProduct => 'பொருள்';

  @override
  String get farmerSaleProductHint => 'பொருளைத் தேர்ந்தெடு';

  @override
  String get farmerSaleNoProducts => 'விற்க பொருட்கள் இல்லை';

  @override
  String get productPickerLoadError => 'பொருட்களை ஏற்ற முடியவில்லை';

  @override
  String get productPickerNoMatch => 'பொருந்தும் பொருட்கள் இல்லை';

  @override
  String get commonSave => 'சேமி';

  @override
  String get farmerSaleEditTitle => 'விற்பனையைத் திருத்து';

  @override
  String get farmerSaleUpdated => 'விற்பனை புதுப்பிக்கப்பட்டது';

  @override
  String get farmerSaleEdit => 'திருத்து';

  @override
  String get farmerSaleDelete => 'நீக்கு';

  @override
  String get farmerSaleDeleteConfirm =>
      'இந்த விற்பனையை நீக்கவா? இனி பிடிக்கப்படாது.';

  @override
  String get farmerSaleDeleted => 'விற்பனை நீக்கப்பட்டது';

  @override
  String farmerPaymentsStillOwed(String amount) {
    return 'இந்தப் பணத்திற்குப் பிறகும் $amount பாக்கி';
  }

  @override
  String get runningCycleTitle => 'இந்தச் சுழற்சி';

  @override
  String get runningCycleNetPayable => 'இப்போது செலுத்த வேண்டிய நிகரம்';

  @override
  String get runningCycleGross => 'பாலின் மதிப்பு';

  @override
  String get runningCycleNoCadence => 'சுழற்சி காலம் அமைக்கப்படவில்லை';

  @override
  String get runningCycleNoCadenceHint =>
      'நடப்பு நிலுவையைப் பார்க்க அமைப்புகளில் சேகரிப்புச் சுழற்சியை அமைக்கவும்';

  @override
  String get runningCycleNoPours =>
      'இந்தச் சுழற்சியில் இன்னும் சேகரிப்பு இல்லை';

  @override
  String get runningCycleLoadError => 'இந்தச் சுழற்சியை ஏற்ற முடியவில்லை';

  @override
  String get runningCycleFrozen => 'பூட்டப்பட்டது — இறுதி';

  @override
  String get runningCycleLive => 'நடப்புத் தொகை';

  @override
  String get runningCycleFullyRecovered =>
      'நிலுவைக்கு முழுமையாக ஈடுசெய்யப்பட்டது';

  @override
  String runningCycleVmccCount(int count) {
    return '$count மையங்கள்';
  }

  @override
  String runningCycleFarmerCount(int count) {
    return '$count விவசாயிகள்';
  }

  @override
  String get ccCycleBalanceTitle => 'சுழற்சி நிலுவை';

  @override
  String get ccCycleBalanceLink => 'சுழற்சி நிலுவை';

  @override
  String get ccCycleBalanceEmpty =>
      'இந்தச் சுழற்சியில் எந்த மையமும் இன்னும் சேகரிக்கவில்லை';

  @override
  String ccCycleBalanceMilk(String amount) {
    return 'பால் $amount';
  }

  @override
  String ccCycleBalanceComp(String amount) {
    return 'ஊதியம் $amount';
  }

  @override
  String runningCycleDeducted(String amount) {
    return 'நிலுவை கழித்து $amount';
  }

  @override
  String runningCycleComp(String amount) {
    return 'மேலும் ஊதியம் $amount';
  }

  @override
  String get ccPaymentsCentresTitle => 'மையங்கள்';

  @override
  String paymentsCentreCount(Object count) {
    return '$count மையங்கள்';
  }

  @override
  String paymentsPendingCentresSub(Object centres, Object open) {
    return '$centres மையங்கள் · $open திறந்துள்ளது';
  }

  @override
  String get cycleCentreBreakup => 'மையவாரியாக';

  @override
  String get cycleNoBills => 'இந்தச் சுழற்சியில் மைய பில்கள் இல்லை';

  @override
  String get cycleBillDue => 'நிலுவை';

  @override
  String get cancelDispatchAction => 'அனுப்புதலை ரத்து செய்';

  @override
  String get cancelDispatchTitle => 'இந்த அனுப்புதலை ரத்து செய்யவா?';

  @override
  String cancelDispatchBody(Object qty, Object name) {
    return '$name க்கு அனுப்பிய $qty ரத்து செய்யப்படும். பால் இந்த மையத்தின் கையிருப்புக்கு திரும்பும்.';
  }

  @override
  String get cancelReceiptAction => 'பெறுதலை ரத்து செய்';

  @override
  String get cancelReceiptTitle => 'இந்தப் பெறுதலை ரத்து செய்யவா?';

  @override
  String cancelReceiptBody(Object qty, Object name) {
    return '$name இடமிருந்து பெற்ற $qty மீண்டும் வழியில் உள்ளது எனக் குறிக்கப்படும். பிறகு அனுப்பியவர் அனுப்புதலை ரத்து செய்யலாம்.';
  }

  @override
  String cancelDispatchReceivedHint(Object name) {
    return '$name இல் பெறப்பட்டது. முதலில் அங்கு பெறுதலை ரத்து செய்யுங்கள், பிறகு இந்த அனுப்புதலை ரத்து செய்யலாம்.';
  }

  @override
  String get dispatchSentTitle => 'ஏற்கனவே அனுப்பப்பட்டது';

  @override
  String get rejectAction => 'பாலை நிராகரி';

  @override
  String get rejectTitle => 'பாலை நிராகரி';

  @override
  String get rejectQtyLabel => 'நிராகரித்த லிட்டர்';

  @override
  String get rejectReasonLabel => 'காரணம்?';

  @override
  String get rejectNotesLabel => 'என்ன பிரச்சினை?';

  @override
  String get rejectDispositionLabel => 'பால் எங்கே போனது?';

  @override
  String get rejectReturned => 'திருப்பி அனுப்பப்பட்டது';

  @override
  String get rejectDestroyed => 'அழிக்கப்பட்டது';

  @override
  String get rejectReasonSour => 'புளித்தது';

  @override
  String get rejectReasonTemperature => 'அதிக வெப்பம்';

  @override
  String get rejectReasonAdulterated => 'கலப்படம்';

  @override
  String get rejectReasonCob => 'COB பாசிட்டிவ்';

  @override
  String get rejectReasonAntibiotic => 'மருந்து எச்சம்';

  @override
  String get rejectReasonForeign => 'வெளிப்பொருள்';

  @override
  String get rejectReasonOther => 'மற்றவை';

  @override
  String get rejectSubmit => 'நிராகரிப்பைப் பதிவு செய்';

  @override
  String rejectDoneToast(Object qty) {
    return '$qty நிராகரிக்கப்பட்டதாக பதிவாகியது';
  }

  @override
  String rejectMaxHint(Object qty) {
    return '$qty வரை பெறப்பட்டது';
  }

  @override
  String get rejectNeedsReason => 'பாலில் என்ன பிரச்சினை என எழுதுங்கள்';

  @override
  String get rejectNotAccepted => 'ஏற்கப்படவில்லை';

  @override
  String rejectedChip(Object qty) {
    return '$qty நிராகரிப்பு';
  }

  @override
  String get rejectUndo => 'நிராகரிப்பை ரத்து செய்';

  @override
  String rejectUndoConfirm(Object qty) {
    return 'நிராகரித்த $qty இந்த சரக்குக்குத் திரும்பும், கழிவும் ரத்தாகும்.';
  }

  @override
  String get rejectNoneTitle => 'பால் எதுவும் நிராகரிக்கப்படவில்லை';

  @override
  String rejectNoneSubtitle(Object days) {
    return 'கடந்த $days நாட்களில் எதுவும் நிராகரிக்கப்படவில்லை';
  }

  @override
  String get rejectBySourceTitle => 'மூலவாரியாக நிராகரிப்பு விகிதம்';

  @override
  String get rejectByReasonTitle => 'பால் ஏன் நிராகரிக்கப்பட்டது';

  @override
  String rejectEventsLine(num count, Object qty) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count நிராகரிப்புகள்',
      one: '$count நிராகரிப்பு',
    );
    return '$_temp0 · $qty';
  }

  @override
  String get rejectScope => 'நிராகரிப்பு';
}
