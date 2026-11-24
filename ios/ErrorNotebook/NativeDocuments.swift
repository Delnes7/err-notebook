import PDFKit
import SwiftUI
import WebKit

struct RichContent: Identifiable {
  let id = UUID()
  var html: String
}
struct NativeRichText: UIViewRepresentable {
  let content: RichContent
  @AppStorage("question_font_size", store: NotebookPreferences.defaults) private var fontSize =
    "medium"
  @Environment(\.colorScheme) private var scheme
  @State private var measured: CGFloat = 300
  func makeCoordinator() -> Coordinator { Coordinator(self) }
  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(LocalAssets(), forURLScheme: LocalAssets.scheme)
    config.userContentController.add(context.coordinator, name: "size")
    let web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = context.coordinator
    web.isOpaque = false
    web.backgroundColor = .clear
    web.scrollView.isScrollEnabled = false
    return web
  }
  func updateUIView(_ web: WKWebView, context: Context) {
    context.coordinator.parent = self
    let key = "\(content.id)-\(scheme)-\(fontSize)"
    guard context.coordinator.key != key else { return }
    context.coordinator.key = key
    let size = fontSize == "large" ? 21 : (fontSize == "normal" ? 16 : 18)
    let html = """
      <!doctype html><html class="\(scheme == .dark ? "dark" : "light")"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' notebook:; font-src notebook:; img-src data: https:; script-src 'unsafe-inline';"><link rel="stylesheet" href="vendor/katex.min.css"><link rel="stylesheet" href="css/style.css"><style>html,body{margin:0;padding:0;background:transparent;color:\(scheme == .dark ? "#e7ece7" : "#28312a");font: \(size)px/1.8 -apple-system,BlinkMacSystemFont,serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse;font-size:.85em}td,th{border:1px solid #8886;padding:8px}pre{white-space:pre-wrap}p{margin:0 0 12px}a{color:inherit}.katex-display{overflow:auto}</style></head><body><article id="rich-body" class="markdown-body">\(content.html)</article><script>function report(){window.webkit.messageHandlers.size.postMessage(document.getElementById('rich-body').getBoundingClientRect().height)}new ResizeObserver(report).observe(document.getElementById('rich-body'));document.fonts.ready.then(report);</script></body></html>
      """
    web.loadHTMLString(html, baseURL: URL(string: "notebook://localhost/"))
  }
  func sizeThatFits(_ proposal: ProposedViewSize, uiView: WKWebView, context: Context) -> CGSize? {
    CGSize(width: proposal.width ?? 300, height: measured)
  }
  static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
    web.stopLoading()
    web.configuration.userContentController.removeScriptMessageHandler(forName: "size")
    web.navigationDelegate = nil
  }
  final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var parent: NativeRichText
    var key = ""
    init(_ parent: NativeRichText) { self.parent = parent }
    func userContentController(
      _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
    ) {
      guard message.frameInfo.isMainFrame, let value = message.body as? Double, value.isFinite
      else { return }
      DispatchQueue.main.async { self.parent.measured = max(40, min(100_000, CGFloat(value) + 8)) }
    }
    func webView(
      _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      if action.navigationType == .linkActivated {
        if let url = action.request.url,
          ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "")
        {
          UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
      } else {
        decisionHandler(action.targetFrame?.isMainFrame == false ? .cancel : .allow)
      }
    }
  }
}

struct NativeDocumentSheet: View {
  @Environment(\.dismiss) private var dismiss
  let content: RichContent
  var title = "预览"
  var body: some View {
    NavigationStack {
      ScrollView { NativeRichText(content: content).padding(22) }.notebookSurface().navigationTitle(
        title
      ).navigationBarTitleDisplayMode(.inline).toolbar { Button("完成") { dismiss() } }
    }
  }
}
struct NativeShareSheet: UIViewControllerRepresentable {
  let url: URL
  var completed: () -> Void
  func makeUIViewController(context: Context) -> UIActivityViewController {
    let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    controller.completionWithItemsHandler = { _, _, _, _ in completed() }
    return controller
  }
  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
struct NativePDFPreview: UIViewRepresentable {
  let url: URL
  func makeUIView(context: Context) -> PDFView {
    let view = PDFView()
    view.autoScales = true
    view.displayMode = .singlePageContinuous
    view.document = PDFDocument(url: url)
    return view
  }
  func updateUIView(_ view: PDFView, context: Context) {
    if view.document?.documentURL != url { view.document = PDFDocument(url: url) }
  }
}

extension Binding where Value == Fields {
  func text(_ key: String, fallback: String = "") -> Binding<String> {
    Binding<String>(get: { wrappedValue.text(key, fallback) }, set: { wrappedValue[key] = $0 })
  }
  func flag(_ key: String) -> Binding<Bool> {
    Binding<Bool>(get: { wrappedValue.flag(key) }, set: { wrappedValue[key] = $0 })
  }
  func row(_ key: String, _ index: Int) -> Binding<Fields> {
    Binding<Fields>(
      get: {
        let list = wrappedValue.rows(key)
        return list.indices.contains(index) ? list[index] : [:]
      },
      set: { value in
        var list = wrappedValue.rows(key)
        if list.indices.contains(index) {
          list[index] = value
          wrappedValue[key] = list
        }
      })
  }
  func toggleString(_ key: String, _ value: String) -> Binding<Bool> {
    Binding<Bool>(
      get: { wrappedValue.strings(key).contains(value) },
      set: { checked in
        var list = wrappedValue.strings(key)
        list.removeAll { $0 == value }
        if checked { list.append(value) }
        wrappedValue[key] = list
      })
  }
}
