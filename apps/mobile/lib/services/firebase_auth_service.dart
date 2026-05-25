import 'dart:async';
import 'dart:io' show Platform;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Firebase Auth glue for the mobile sign-in flow. The mobile app runs **two**
/// kinds of sign-in through Firebase:
///
///  1. **First-time bind:** phone OTP → `signInWithCredential(phone)` → then
///     `currentUser.linkWithCredential(google|apple)`. Firebase issues a
///     single uid that has both providers attached. We POST the resulting ID
///     token to `/auth/social/bind`.
///
///  2. **Every login after:** Google or Apple sign-in only → Firebase returns
///     the same linked uid → POST to `/auth/social/login`.
///
/// All UI state (which step, error copy, loading) lives in the calling
/// provider; this class is just a thin protocol-of-record over Firebase.
class FirebaseAuthService {
  FirebaseAuthService._();
  static final FirebaseAuthService instance = FirebaseAuthService._();

  FirebaseAuth get _auth => FirebaseAuth.instance;

  // ---------------- Phone OTP ----------------

  /// Sends the SMS code. Returns a `verificationId` that must be paired with
  /// the user-entered 6-digit `smsCode` in [confirmPhoneCode].
  ///
  /// Android may auto-retrieve the code (`verificationCompleted` fires before
  /// the user types anything); we don't auto-complete here to keep the flow
  /// uniform across platforms — the UI always asks for the code.
  Future<String> sendPhoneCode(String e164Phone) async {
    final completer = Completer<String>();
    await _auth.verifyPhoneNumber(
      phoneNumber: e164Phone,
      // 0 = no auto-retrieval on Android (forces manual entry, matches iOS).
      timeout: const Duration(seconds: 60),
      verificationCompleted: (_) {},
      verificationFailed: (e) {
        if (!completer.isCompleted) completer.completeError(e);
      },
      codeSent: (verificationId, _) {
        if (!completer.isCompleted) completer.complete(verificationId);
      },
      codeAutoRetrievalTimeout: (_) {},
    );
    return completer.future;
  }

  /// Builds a phone credential from the SMS code. Used by [linkPhoneCredential]
  /// during the Phase-1 bind so we attach phone onto the already-Google-signed-in
  /// user, instead of switching to a fresh phone-only Firebase user.
  PhoneAuthCredential buildPhoneCredential(String verificationId, String smsCode) {
    return PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
  }

  /// Links the phone credential onto the currently-signed-in Firebase user
  /// (which after Phase-2 Google/Apple sign-in is the social uid). Result: one
  /// Firebase user owns both providers, so the ID token carries both identities
  /// and the server can verify the OTP without a second handshake.
  Future<User> linkPhoneCredential(String verificationId, String smsCode) async {
    final current = _auth.currentUser;
    if (current == null) {
      throw FirebaseAuthException(code: 'no-current-user', message: 'Sign in with Google first');
    }
    final cred = buildPhoneCredential(verificationId, smsCode);
    final result = await current.linkWithCredential(cred);
    return result.user ?? current;
  }

  // ---------------- Google / Apple ----------------

  /// Builds a Google credential by going through `google_sign_in`. Used both
  /// for first-time link (with [linkWithCredential]) and for repeat sign-in.
  Future<AuthCredential> getGoogleCredential() async {
    final g = GoogleSignIn();
    final account = await g.signIn();
    if (account == null) {
      throw FirebaseAuthException(code: 'cancelled', message: 'Sign-in cancelled');
    }
    final tokens = await account.authentication;
    return GoogleAuthProvider.credential(
      idToken: tokens.idToken,
      accessToken: tokens.accessToken,
    );
  }

  /// Apple credential via the system flow (iOS) or web flow (Android).
  Future<AuthCredential> getAppleCredential() async {
    final apple = await SignInWithApple.getAppleIDCredential(
      scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
    );
    return OAuthProvider('apple.com').credential(
      idToken: apple.identityToken,
      accessToken: apple.authorizationCode,
    );
  }

  /// Link a social credential onto the currently signed-in (phone-verified)
  /// user. The resulting Firebase user keeps the same uid but now has both
  /// providers — that uid is what the server stores in `users.firebase_uid`.
  Future<User> linkWithCredential(AuthCredential cred) async {
    final current = _auth.currentUser;
    if (current == null) {
      throw FirebaseAuthException(code: 'no-current-user', message: 'No phone session to link');
    }
    final result = await current.linkWithCredential(cred);
    final user = result.user ?? current;
    return user;
  }

  /// Plain sign-in with a social credential (used for Phase 2).
  Future<User> signInWithCredential(AuthCredential cred) async {
    final result = await _auth.signInWithCredential(cred);
    final user = result.user;
    if (user == null) {
      throw FirebaseAuthException(code: 'no-user', message: 'Sign-in failed');
    }
    return user;
  }

  /// Fresh ID token for the currently signed-in user. `forceRefresh: true`
  /// guarantees the token reflects providers linked since the last fetch —
  /// important after [linkWithCredential] returns.
  Future<String> currentIdToken({bool forceRefresh = true}) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw FirebaseAuthException(code: 'no-current-user', message: 'No signed-in user');
    }
    final token = await user.getIdToken(forceRefresh);
    if (token == null || token.isEmpty) {
      throw FirebaseAuthException(code: 'no-token', message: 'Could not mint ID token');
    }
    return token;
  }

  /// Sign out of Firebase + Google so the next sign-in shows the picker.
  /// Apple has no equivalent — its credential lives only at the OS level.
  Future<void> signOut() async {
    try {
      await GoogleSignIn().signOut();
    } catch (e) {
      if (kDebugMode) debugPrint('[firebase-auth] google signOut: $e');
    }
    await _auth.signOut();
  }

  /// `true` on iOS (Apple is mandatory there per App Store rule 4.8) and on
  /// recent macOS. Android falls back to the web flow via sign_in_with_apple
  /// — we hide the button on Android for now to keep the UI honest.
  bool get appleSignInSupported => Platform.isIOS || Platform.isMacOS;
}
