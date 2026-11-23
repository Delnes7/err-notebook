import SwiftUI

@main
struct ErrorNotebookApp: App {
    var body: some Scene {
        WindowGroup {
            NotebookView()
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }
}

struct NotebookView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> NotebookViewController {
        NotebookViewController()
    }
    func updateUIViewController(_ controller: NotebookViewController, context: Context) {}
}
