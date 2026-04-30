import UIKit
import Social

// Subclass the receive_sharing_intent base controller (RSIShareViewController.swift
// is compiled directly into this extension target — we deliberately do NOT
// link the full receive_sharing_intent pod here because its host-side code
// uses APIs forbidden in app extensions). Returning true from
// shouldAutoRedirect() means the user doesn't see an iOS share-sheet
// confirmation form; the share lands directly in runQ's PO/bill flow.
class ShareViewController: RSIShareViewController {
    override func shouldAutoRedirect() -> Bool {
        return true
    }
}
