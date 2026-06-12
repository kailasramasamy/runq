import 'dart:io' show Platform;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Firebase Auth glue for the mobile sign-in flow. Sign-in is **Google or Apple
/// only** — Firebase returns a uid + ID token that the API verifies.
///
///  - **First login:** Google/Apple → `/auth/social/login` returns
///    `needsBinding` → the app collects phone + date of birth → the same token
///    plus phone+DOB go to `/auth/social/bind`, which links the uid to the
///    employee. No SMS — DOB is the one-time ownership check.
///  - **Every login after:** Google/Apple → same uid → `/auth/social/login`
///    issues the runq JWT directly.
///
/// All UI state (step, error copy, loading) lives in the calling provider; this
/// class is a thin protocol-of-record over Firebase.
class FirebaseAuthService {
  FirebaseAuthService._();
  static final FirebaseAuthService instance = FirebaseAuthService._();

  FirebaseAuth get _auth => FirebaseAuth.instance;

  /// Builds a Google credential by going through `google_sign_in`.
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

  /// Apple credential via the system flow (iOS/macOS). A user-cancelled sheet
  /// is normalised to the same `cancelled` code Google raises, so the caller
  /// can treat both quietly.
  Future<AuthCredential> getAppleCredential() async {
    try {
      final apple = await SignInWithApple.getAppleIDCredential(
        scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
      );
      return OAuthProvider('apple.com').credential(
        idToken: apple.identityToken,
        accessToken: apple.authorizationCode,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw FirebaseAuthException(code: 'cancelled', message: 'Sign-in cancelled');
      }
      rethrow;
    }
  }

  /// Sign in with a social credential and return a fresh Firebase ID token to
  /// hand to the API.
  Future<String> signInAndGetToken(AuthCredential cred) async {
    final result = await _auth.signInWithCredential(cred);
    final user = result.user;
    if (user == null) {
      throw FirebaseAuthException(code: 'no-user', message: 'Sign-in failed');
    }
    final token = await user.getIdToken();
    if (token == null || token.isEmpty) {
      throw FirebaseAuthException(code: 'no-token', message: 'Could not mint ID token');
    }
    return token;
  }

  /// Google sign-in → Firebase ID token, in one call.
  Future<String> googleIdToken() async => signInAndGetToken(await getGoogleCredential());

  /// Apple sign-in → Firebase ID token, in one call.
  Future<String> appleIdToken() async => signInAndGetToken(await getAppleCredential());

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

  /// Apple Sign In is temporarily OFF while the Apple Developer account is
  /// mid personal→org transition — the App ID's "Sign in with Apple"
  /// capability can't be toggled, so the entitlement is also removed from
  /// Runner.entitlements. To re-enable: flip this to true, re-add the
  /// `com.apple.developer.applesignin` entitlement, and enable the capability
  /// on the App ID in the Apple Developer portal.
  static const appleSignInEnabled = false;

  /// `true` on iOS / recent macOS, once [appleSignInEnabled]. Android has no
  /// native flow we ship, so the button is hidden there too.
  bool get appleSignInSupported =>
      appleSignInEnabled && (Platform.isIOS || Platform.isMacOS);
}
