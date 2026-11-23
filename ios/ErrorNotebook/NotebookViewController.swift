import UIKit
import WebKit
import SafariServices
import PDFKit
import ImageIO

final class NotebookViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private(set) var webView: WKWebView!
    private let assets = LocalAssets()
    private var bridge: NativeMessages!
    private var selfTesting = false
    private var temporaryExports: [URL] = []
    private let testStatus = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        #if DEBUG
        selfTesting = ProcessInfo.processInfo.arguments.contains("--self-test")
        #endif
        let config = WKWebViewConfiguration()
        config.websiteDataStore = selfTesting ? .nonPersistent() : .default()
        #if DEBUG
        if selfTesting && ProcessInfo.processInfo.arguments.contains(where: { $0.hasPrefix("--persistence-") }), #available(iOS 17.0, *) {
            config.websiteDataStore = WKWebsiteDataStore(forIdentifier: UUID(uuidString: "8B170220-009A-4CAB-82D2-27A24B20DD54")!)
        }
        #endif
        config.setURLSchemeHandler(assets, forURLScheme: LocalAssets.scheme)
        config.allowsInlineMediaPlayback = true
        bridge = NativeMessages(owner: self)
        config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "notebook")
        let secrets = Dictionary(uniqueKeysWithValues: KeychainStore.keys.compactMap { key in
            KeychainStore.read(key, testing: selfTesting).map { (key, $0) }
        })
        let json = String(data: try! JSONSerialization.data(withJSONObject: secrets, options: [.fragmentsAllowed]), encoding: .utf8)!
        let mode = selfTesting && ProcessInfo.processInfo.arguments.contains("--persistence-write") ? "write" : (selfTesting && ProcessInfo.processInfo.arguments.contains("--persistence-read") ? "read" : "")
        let bootstrap = "window.__notebookSecrets = \(json); window.__notebookSelfTest = \(selfTesting); window.__notebookPersistenceMode = '\(mode)';"
        config.userContentController.addUserScript(WKUserScript(source: bootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        if selfTesting {
            testStatus.text = "RUNNING"
            testStatus.accessibilityIdentifier = "self-test-status"
            testStatus.font = .systemFont(ofSize: 10)
            testStatus.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(testStatus)
            NSLayoutConstraint.activate([testStatus.leadingAnchor.constraint(equalTo: view.leadingAnchor), testStatus.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)])
        }
        webView.load(URLRequest(url: URL(string: "notebook://localhost/index.html")!))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        if selfTesting {
            guard let url = Bundle.main.url(forResource: "self-test", withExtension: "js"), let script = try? String(contentsOf: url, encoding: .utf8) else { return }
            webView.evaluateJavaScript(script) { _, error in
                if let error { self.testStatus.text = "FAIL: \(error.localizedDescription)" }
            }
        }
        #endif
    }

    func handle(_ action: String, payload: [String: Any], reply: @escaping (Any?, String?) -> Void) {
        switch action {
        case "appearance":
            let theme = payload["theme"] as? String ?? "system"
            view.window?.overrideUserInterfaceStyle = theme == "dark" ? .dark : (theme == "light" ? .light : .unspecified)
            setNeedsStatusBarAppearanceUpdate()
            reply(["ok": true], nil)
        case "saveSecret":
            guard let key = payload["key"] as? String, let value = payload["value"] as? String,
                  KeychainStore.keys.contains(key), value.utf8.count < 16_384 else { reply(nil, "无效密钥"); return }
            do {
                try KeychainStore.write(value, key: key, testing: selfTesting)
                if selfTesting && (KeychainStore.read(key, testing: true) ?? "") != value { throw NSError(domain: "Test", code: 1) }
                reply(["ok": true], nil)
            }
            catch { reply(nil, error.localizedDescription) }
        case "convertImage":
            guard let base64 = payload["base64"] as? String, base64.utf8.count <= 96 * 1024 * 1024,
                  let data = Data(base64Encoded: base64),
                  let source = CGImageSourceCreateWithData(data as CFData, nil) else { reply(nil, "图片无效或过大"); return }
            let dimension = min(4096, max(320, payload["dimension"] as? Int ?? 1600))
            let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: dimension, kCGImageSourceCreateThumbnailWithTransform: true]
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { reply(nil, "无法解码图片"); return }
            let size = CGSize(width: image.width, height: image.height)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            format.opaque = true
            let output = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
                UIColor.white.setFill()
                ctx.fill(CGRect(origin: .zero, size: size))
                UIImage(cgImage: image).draw(in: CGRect(origin: .zero, size: size))
            }
            let quality = min(1, max(0.1, payload["quality"] as? Double ?? 0.86))
            guard let jpeg = output.jpegData(compressionQuality: quality) else { reply(nil, "图片转换失败"); return }
            let encoded = jpeg.base64EncodedString()
            reply(["dataUrl": "data:image/jpeg;base64," + encoded, "base64": encoded,
                   "mimeType": "image/jpeg", "width": image.width, "height": image.height], nil)
        case "licenses":
            guard presentedViewController == nil else { reply(nil, "请先关闭当前窗口"); return }
            let names = ["tailwind.txt", "katex.txt", "chart.txt", "prism.txt", "supabase.txt"]
            let text = names.map { name -> String in
                let url = Bundle.main.url(forResource: "Web", withExtension: nil)!.appendingPathComponent("vendor/licenses/" + name)
                return "\n\n=== " + name + " ===\n" + ((try? String(contentsOf: url, encoding: .utf8)) ?? "")
            }.joined()
            let controller = UIViewController()
            controller.title = "开源许可"
            let textView = UITextView()
            textView.text = text
            textView.isEditable = false
            textView.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
            controller.view = textView
            controller.navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(closePresented))
            present(UINavigationController(rootViewController: controller), animated: true)
            reply(["ok": true], nil)
        case "exportBackup":
            guard let text = payload["json"] as? String, text.utf8.count <= 128 * 1024 * 1024,
                  let data = text.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) != nil else { reply(nil, "备份内容无效或过大"); return }
            share(data: data, extension: "json", reply: reply)
        case "print":
            guard presentedViewController == nil else { reply(nil, "请先关闭当前窗口"); return }
            let controller = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = "错题重练卷"
            info.outputType = .general
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(from: CGRect(x: view.bounds.midX, y: view.bounds.maxY - 80, width: 1, height: 1), in: view, animated: true) { _, completed, error in
                if let error { reply(nil, error.localizedDescription) }
                else { reply(["cancelled": !completed], nil) }
            }
        case "exportPDF":
            do { share(data: try makePDF(), extension: "pdf", reply: reply) }
            catch { reply(nil, error.localizedDescription) }
        case "selfTest":
            #if DEBUG
            if selfTesting {
                if payload["fixtureHEIC"] as? Bool == true,
                   let url = Bundle.main.url(forResource: "test-image", withExtension: "heic"),
                   let data = try? Data(contentsOf: url) {
                    reply(["base64": data.base64EncodedString()], nil); return
                }
                if payload["inspectPDF"] as? Bool == true {
                    do {
                        let data = try makePDF()
                        let document = PDFDocument(data: data)
                        reply(["pages": document?.pageCount ?? 0, "text": document?.string ?? "", "bytes": data.count], nil)
                    } catch { reply(nil, error.localizedDescription) }
                    return
                }
                testStatus.text = payload["result"] as? String ?? "FAIL"
                reply(["ok": true], nil); return
            }
            #endif
            reply(nil, "无效请求")
        default: reply(nil, "不支持的操作")
        }
    }

    @objc private func closePresented() { dismiss(animated: true) }

    private func makePDF() throws -> Data {
        let renderer = A4Renderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: 1))
        guard renderer.numberOfPages > 0 && renderer.numberOfPages <= 500 else {
            throw NSError(domain: "PDF", code: 1, userInfo: [NSLocalizedDescriptionKey: "页数无效或超过 500 页，请减少组卷题目"])
        }
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, renderer.paperRect, nil)
        for page in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: page, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        return data as Data
    }

    private func share(data: Data, extension ext: String, reply: @escaping (Any?, String?) -> Void) {
        guard presentedViewController == nil else { reply(nil, "请先关闭当前窗口"); return }
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent("NotebookExports", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let file = folder.appendingPathComponent("ErrorNotebook-\(UUID().uuidString).\(ext)")
            try data.write(to: file, options: .atomic)
            temporaryExports.append(file)
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 80, width: 1, height: 1)
            sheet.completionWithItemsHandler = { [weak self] _, completed, _, error in
                try? FileManager.default.removeItem(at: file)
                self?.temporaryExports.removeAll { $0 == file }
                reply(error == nil ? ["cancelled": !completed] : nil, error?.localizedDescription)
            }
            present(sheet, animated: true)
        } catch { reply(nil, error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if url.scheme == LocalAssets.scheme && url.host == LocalAssets.host { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        openExternal(url)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { openExternal(url) }
        return nil
    }
    private func openExternal(_ url: URL) {
        guard let scheme = url.scheme?.lowercased() else { return }
        if ["https", "http"].contains(scheme), presentedViewController == nil {
            present(SFSafariViewController(url: url), animated: true)
        } else if ["mailto", "tel"].contains(scheme) { UIApplication.shared.open(url) }
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "个人工作台", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "请确认", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "继续", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showLoadError(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showLoadError(error) }
    private func showLoadError(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        let alert = UIAlertController(title: "页面未能加载", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "重试", style: .default) { _ in self.webView.reload() })
        present(alert, animated: true)
    }
}

private final class NativeMessages: NSObject, WKScriptMessageHandlerWithReply {
    weak var owner: NotebookViewController?
    init(owner: NotebookViewController) { self.owner = owner }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == LocalAssets.scheme,
              message.frameInfo.securityOrigin.host == LocalAssets.host,
              let request = message.body as? [String: Any], let action = request["action"] as? String,
              let owner else { replyHandler(nil, "拒绝来自外部页面的请求"); return }
        owner.handle(action, payload: request["payload"] as? [String: Any] ?? [:], reply: replyHandler)
    }
}

private final class A4Renderer: UIPrintPageRenderer {
    override var paperRect: CGRect { CGRect(x: 0, y: 0, width: 595.28, height: 841.89) }
    override var printableRect: CGRect { paperRect.insetBy(dx: 28.35, dy: 28.35) }
}
