import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  // Holds the file URL captured before the Flutter side has connected.
  private var pendingFilePath: String?
  private var shareChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Cold-start: app launched by tapping a file in the share sheet / Files /
    // "Open in runQ". Stash the URL before Flutter starts so we can hand it
    // to Dart once the channel is wired.
    if let url = launchOptions?[.url] as? URL, url.isFileURL {
      pendingFilePath = url.path
    }

    GeneratedPluginRegistrant.register(with: self)
    let started = super.application(application, didFinishLaunchingWithOptions: launchOptions)

    // Window/rootViewController only exist after super runs.
    if let controller = window?.rootViewController as? FlutterViewController {
      let channel = FlutterMethodChannel(
        name: "runq.in/share-files",
        binaryMessenger: controller.binaryMessenger
      )
      channel.setMethodCallHandler { [weak self] call, result in
        if call.method == "getInitialFile" {
          let path = self?.pendingFilePath
          self?.pendingFilePath = nil
          result(path)
        } else {
          result(FlutterMethodNotImplemented)
        }
      }
      shareChannel = channel
    }

    return started
  }

  // Warm-start: app already running, user shares another file. Forward the
  // path to Flutter and short-circuit the URL so go_router doesn't try to
  // route to file:///... and render a "Page Not Found".
  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey : Any] = [:]
  ) -> Bool {
    if url.isFileURL {
      shareChannel?.invokeMethod("onFile", arguments: url.path)
      return true
    }
    // Other schemes (e.g. receive_sharing_intent's ShareMedia-<bundle>://) —
    // let the plugin chain handle them.
    return super.application(app, open: url, options: options)
  }
}
