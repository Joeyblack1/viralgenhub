//
//  SafariWebExtensionHandler.swift
//  ViralGenHub Extension
//
//  Copyright (c) 2026 Talkiru Communications Ltd. GNU AGPL v3.
//
//  The extension does not use native messaging (no "nativeMessaging" permission
//  in manifest.json), so Safari never calls this. Xcode still needs a principal
//  class for the extension target; it answers with an empty reply.
//

import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: [], completionHandler: nil)
    }

}
