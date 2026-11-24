import SwiftUI

@main
struct ErrorNotebookApp: App {
  var body: some Scene {
    WindowGroup {
      #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--self-test") {
          LegacyNotebookView().ignoresSafeArea(.container, edges: .bottom)
        } else {
          NativeNotebookView()
        }
      #else
        NativeNotebookView()
      #endif
    }
  }
}

#if DEBUG
  private struct LegacyNotebookView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> NotebookViewController {
      NotebookViewController()
    }
    func updateUIViewController(_ controller: NotebookViewController, context: Context) {}
  }
#endif
