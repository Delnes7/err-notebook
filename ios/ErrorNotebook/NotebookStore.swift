import PDFKit
import SwiftUI
import WebKit

typealias Fields = [String: Any]

extension Dictionary where Key == String, Value == Any {
  func text(_ key: String, _ fallback: String = "") -> String {
    if let value = self[key] as? String { return value }
    if let value = self[key] as? NSNumber { return value.stringValue }
    return fallback
  }
  func number(_ key: String) -> Double {
    (self[key] as? NSNumber)?.doubleValue ?? Double(text(key)) ?? 0
  }
  func flag(_ key: String) -> Bool { self[key] as? Bool ?? false }
  func rows(_ key: String) -> [Fields] { self[key] as? [Fields] ?? [] }
  func strings(_ key: String) -> [String] { self[key] as? [String] ?? [] }
}

struct NotebookRecord: Identifiable {
  var fields: Fields
  var id: String { fields.text("id") }
  func text(_ key: String, _ fallback: String = "") -> String { fields.text(key, fallback) }
}

struct NotebookExport: Identifiable {
  let id = UUID()
  let url: URL
}

/// Keeps the existing on-device database and battle-tested calculation/sync logic.
/// The service document is never presented as an application screen.
@MainActor
final class NotebookService: NSObject, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
  let webView: WKWebView
  private var started = false
  private var failure: Error?
  var onDataChange: (() -> Void)?
  private let testing: Bool
  override init() {
    #if DEBUG
      testing = ProcessInfo.processInfo.arguments.contains("--native-ui-test")
    #else
      testing = false
    #endif
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = testing ? .nonPersistent() : .default()
    configuration.setURLSchemeHandler(LocalAssets(), forURLScheme: LocalAssets.scheme)
    let useTestKeys = testing
    let secrets = Dictionary(
      uniqueKeysWithValues: KeychainStore.keys.compactMap { key in
        KeychainStore.read(key, testing: useTestKeys).map { (key, $0) }
      })
    let data = try! JSONSerialization.data(withJSONObject: secrets)
    configuration.userContentController.addUserScript(
      WKUserScript(
        source: "window.__notebookSecrets = \(String(decoding: data, as: UTF8.self));",
        injectionTime: .atDocumentStart, forMainFrameOnly: true))
    webView = WKWebView(
      frame: CGRect(x: 0, y: 0, width: 794, height: 1123), configuration: configuration)
    super.init()
    webView.isHidden = true
    configuration.userContentController.addScriptMessageHandler(
      NotebookServiceMessages(owner: self), contentWorld: .page, name: "notebook")
    webView.navigationDelegate = self
    webView.load(URLRequest(url: URL(string: "notebook://localhost/native-engine.html")!))
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { started = true }
  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) { failure = error }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    failure = error
  }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    guard message.frameInfo.isMainFrame, message.webView === webView,
      message.frameInfo.request.url?.host == LocalAssets.host,
      message.frameInfo.request.url?.scheme == LocalAssets.scheme,
      let body = message.body as? Fields
    else {
      replyHandler(nil, "无效来源")
      return
    }
    let payload = body["payload"] as? Fields ?? [:]
    if body.text("action") == "dataChanged" {
      onDataChange?()
      replyHandler(["ok": true], nil)
      return
    }
    if body.text("action") == "appearance" {
      replyHandler(["ok": true], nil)
      return
    }
    guard body.text("action") == "saveSecret", KeychainStore.keys.contains(payload.text("key")),
      payload.text("value").utf8.count < 16384
    else {
      replyHandler(nil, "不支持的操作")
      return
    }
    do {
      try KeychainStore.write(payload.text("value"), key: payload.text("key"), testing: testing)
      replyHandler(["ok": true], nil)
    } catch { replyHandler(nil, error.localizedDescription) }
  }
  func call(_ action: String, _ payload: Fields = [:]) async throws -> Any {
    for _ in 0..<200 where !started && failure == nil {
      try await Task.sleep(nanoseconds: 50_000_000)
    }
    if let failure { throw failure }
    guard started else { throw NotebookError.message("数据服务启动超时，请重试") }
    do {
      let input = try JSONSerialization.data(withJSONObject: payload)
      let result = try await webView.callAsyncJavaScript(
        """
        try {
          const value = await window.nativeService(action, JSON.parse(input));
          return JSON.stringify({ok: true, value});
        } catch (error) {
          return JSON.stringify({ok: false, message: String(error?.message || error)});
        }
        """,
        arguments: ["action": action, "input": String(decoding: input, as: UTF8.self)],
        in: nil, contentWorld: .page)
      guard let result = result as? String,
        let envelope = try JSONSerialization.jsonObject(with: Data(result.utf8)) as? Fields
      else { throw NotebookError.message("未能读取操作结果，请刷新页面后重试。") }
      guard envelope.flag("ok") else {
        throw NotebookError.message(envelope.text("message", "操作未能完成。"))
      }
      return envelope["value"] ?? NSNull()
    } catch let error as NSError {
      if error.domain == WKError.errorDomain
        && error.code == WKError.Code.javaScriptResultTypeIsUnsupported.rawValue
      {
        throw NotebookError.message("未能读取操作结果，请刷新页面确认最新数据。")
      }
      if let message = error.userInfo["WKJavaScriptExceptionMessage"] as? String {
        throw NotebookError.message(message)
      }
      throw error
    }
  }
  func pdf() throws -> Data {
    guard
      let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        .flatMap(\.windows).first(where: { $0.isKeyWindow })
    else { throw NotebookError.message("请在 App 打开后再生成试卷") }
    // Only attach WebKit during printing; ordinary screens contain no service view.
    let host = UIView(frame: .zero)
    host.clipsToBounds = true
    host.isUserInteractionEnabled = false
    host.accessibilityElementsHidden = true
    window.addSubview(host)
    host.addSubview(webView)
    webView.isHidden = false
    defer {
      webView.isHidden = true
      webView.removeFromSuperview()
      host.removeFromSuperview()
    }
    webView.layoutIfNeeded()
    let renderer = NativePaperRenderer()
    renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
    renderer.prepare(forDrawingPages: NSRange(location: 0, length: 1))
    guard (1...500).contains(renderer.numberOfPages) else {
      throw NotebookError.message("试卷页数无效或超过 500 页")
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
  #if DEBUG
    func verifyContract() async throws -> String {
      guard testing, let file = Bundle.main.url(forResource: "native-contract", withExtension: "js")
      else { throw NotebookError.message("测试配置无效") }
      let script = try String(contentsOf: file, encoding: .utf8)
      let diagnostic =
        "return await (async () => {\n" + script
        + "\n})().catch(error => 'FAIL ' + String(error.message || error));"
      let result =
        try await webView.callAsyncJavaScript(
          diagnostic, arguments: [:], in: nil, contentWorld: .page) as? String ?? "FAIL"
      if result.hasPrefix("PASS") {
        let document = PDFDocument(data: try pdf())
        guard let document, document.pageCount > 0,
          document.string?.contains("Differentiate") == true
        else {
          return
            "FAIL PDF document content: pages=\(document?.pageCount ?? 0), text=\(document?.string?.prefix(150) ?? "")"
        }
      }
      return result
    }
  #endif
}

private final class NotebookServiceMessages: NSObject, WKScriptMessageHandlerWithReply {
  weak var owner: NotebookService?
  init(owner: NotebookService) { self.owner = owner }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    guard let owner else {
      replyHandler(nil, "数据服务已关闭")
      return
    }
    owner.userContentController(
      userContentController, didReceive: message, replyHandler: replyHandler)
  }
}

private final class NativePaperRenderer: UIPrintPageRenderer {
  override var paperRect: CGRect { CGRect(x: 0, y: 0, width: 595.28, height: 841.89) }
  override var printableRect: CGRect { paperRect.insetBy(dx: 30, dy: 32) }
}
enum NotebookError: LocalizedError {
  case message(String)
  var errorDescription: String? {
    if case .message(let value) = self { return value }
    return nil
  }
}

@MainActor final class NotebookStore: ObservableObject {
  let service = NotebookService()
  @Published var subjects: [NotebookRecord] = []
  @Published var questions: [NotebookRecord] = []
  @Published var exams: [NotebookRecord] = []
  @Published var assessments: [Fields] = []
  @Published var snapshot: Fields = [:]
  @Published var loaded = false
  @Published var busy = false
  @Published var error: String?
  @Published var notice: String?
  @Published var selected = Set<String>()
  @Published var requestedTab: NativeTab?
  @Published var export: NotebookExport?
  #if DEBUG
    @Published var testStatus = "RUNNING"
    private var testStarted = false
    func startContractChecks() {
      guard !testStarted else { return }
      testStarted = true
      Task {
        do {
          while !loaded { try await Task.sleep(nanoseconds: 100_000_000) }
          testStatus = try await service.verifyContract()
          await refresh()
        } catch { testStatus = "FAIL " + error.localizedDescription }
      }
    }
  #endif
  init() {
    service.onDataChange = { [weak self] in
      guard let self, self.loaded else { return }
      Task { await self.refresh() }
    }
  }
  func apply(_ data: Fields) {
    snapshot = data
    subjects = data.rows("subjects").map { NotebookRecord(fields: $0) }.sorted {
      $0.fields.number("order") < $1.fields.number("order")
    }
    questions = data.rows("questions").map { NotebookRecord(fields: $0) }
    exams = data.rows("exams").map { NotebookRecord(fields: $0) }
    assessments = data.rows("assessments")
    selected.formIntersection(Set(questions.map(\.id)))
    loaded = true
  }
  @discardableResult func perform(_ action: String, _ payload: Fields = [:]) async -> Bool {
    guard !busy else { return false }
    busy = true
    defer { busy = false }
    do {
      let result = try await service.call(action, payload)
      if let result = result as? Fields, result["subjects"] != nil { apply(result) }
      return true
    } catch {
      self.error = error.localizedDescription
      return false
    }
  }
  func refresh() async { _ = await perform("snapshot") }
  func subject(_ id: String) -> NotebookRecord? { subjects.first { $0.id == id } }
  func assessment(_ id: String) -> Fields {
    assessments.first { ($0["subject"] as? Fields)?.text("id") == id } ?? [:]
  }
  func toggle(_ id: String) {
    if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
  }
  func share(_ data: Data, extension ext: String) throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(
      "错题本-\(UUID().uuidString).\(ext)")
    try data.write(to: url, options: [.atomic, .completeFileProtection])
    export = NotebookExport(url: url)
  }
  func backup() async {
    do {
      let result = try await service.call("backup") as? String ?? ""
      try share(Data(result.utf8), extension: "json")
    } catch { self.error = error.localizedDescription }
  }
}
