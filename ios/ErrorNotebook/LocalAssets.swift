import Foundation
import WebKit
import UniformTypeIdentifiers

/// A stable app origin keeps IndexedDB/localStorage independent of Safari and bundle paths.
final class LocalAssets: NSObject, WKURLSchemeHandler {
    static let scheme = "notebook"
    static let host = "localhost"
    private let root = Bundle.main.url(forResource: "Web", withExtension: nil)!

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        do {
            guard let url = urlSchemeTask.request.url, url.scheme == Self.scheme,
                  url.host == Self.host else { throw URLError(.unsupportedURL) }
            let path = url.path == "/" ? "index.html" : String(url.path.dropFirst())
            let file = root.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
            guard file.path.hasPrefix(root.resolvingSymlinksInPath().path + "/"),
                  !path.split(separator: "/").contains(where: { $0.hasPrefix(".") }),
                  let data = try? Data(contentsOf: file) else { throw URLError(.fileDoesNotExist) }
            let mime: String
            switch file.pathExtension {
            case "js": mime = "application/javascript"
            case "css": mime = "text/css"
            case "html": mime = "text/html"
            case "woff2": mime = "font/woff2"
            case "woff": mime = "font/woff"
            default: mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            }
            let response = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: ["js", "css", "html"].contains(file.pathExtension) ? "utf-8" : nil)
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch { urlSchemeTask.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
