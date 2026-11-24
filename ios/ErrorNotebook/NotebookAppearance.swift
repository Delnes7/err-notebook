import SwiftUI

enum NotebookPreferences {
  static let defaults: UserDefaults = {
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("--native-ui-test") {
        return UserDefaults(suiteName: "com.delnes.errornotebook.ui-tests")!
      }
    #endif
    return .standard
  }()
}

enum NotebookStyle: String, CaseIterable, Identifiable {
  case study, studio
  var id: String { rawValue }
  var title: String { self == .study ? "安静书房" : "极简工作台" }
  var subtitle: String { self == .study ? "暖色底 · 墨绿点缀" : "中性灰底 · 紫色点缀" }
  var tint: Color {
    self == .study ? Color(light: 0x35624c, dark: 0xaccbab) : Color(light: 0x6559ac, dark: 0xbcb1eb)
  }
  var background: Color {
    self == .study
      ? Color(light: 0xf9f8f4, dark: 0x1e241f) : Color(uiColor: .systemGroupedBackground)
  }
  var paper: Color {
    self == .study
      ? Color(light: 0xfffefa, dark: 0x272f28) : Color(uiColor: .secondarySystemGroupedBackground)
  }
}
extension Color {
  init(subjectHex: String) {
    let digits = subjectHex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard digits.count == 6 || digits.count == 3, let hex = UInt(digits, radix: 16) else {
      self = .secondary
      return
    }
    let rgb =
      digits.count == 3
      ? ((hex >> 8) & 15) * 0x110000 + ((hex >> 4) & 15) * 0x1100 + (hex & 15) * 0x11
      : hex
    self.init(light: rgb, dark: rgb)
  }

  var subjectHex: String? {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    guard UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
    func byte(_ component: CGFloat) -> Int { Int((min(1, max(0, component)) * 255).rounded()) }
    return String(format: "#%02X%02X%02X", byte(red), byte(green), byte(blue))
  }

  init(light: UInt, dark: UInt) {
    self.init(
      uiColor: UIColor { trait in
        let value = trait.userInterfaceStyle == .dark ? dark : light
        return UIColor(
          red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255,
          blue: Double(value & 255) / 255, alpha: 1)
      })
  }
}
struct NotebookSurface: ViewModifier {
  @AppStorage("notebook_design", store: NotebookPreferences.defaults) private var design = "study"
  func body(content: Content) -> some View {
    let style = NotebookStyle(rawValue: design) ?? .study
    content.scrollContentBackground(.hidden).background(style.background).tint(style.tint)
  }
}

struct NotebookSectionHeader: View {
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  let title: String

  init(_ title: String) { self.title = title }

  var body: some View {
    Text(title)
      .textCase(nil)
      .padding(.leading, -headerInset)
      .accessibilityAddTraits(.isHeader)
  }

  private var headerInset: CGFloat {
    if #available(iOS 26.0, *), horizontalSizeClass == .compact { return 16 }
    return 20
  }
}

extension Section where Parent == NotebookSectionHeader, Footer == EmptyView {
  init(notebookTitle: String, @ViewBuilder content: () -> Content) {
    self.init(content: content) { NotebookSectionHeader(notebookTitle) }
  }
}

struct NotebookField<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
      content.accessibilityLabel(title)
    }.padding(.vertical, 3)
  }
}

struct NotebookTextField: View {
  let title: String
  @Binding var text: String
  var axis: Axis = .horizontal
  var prompt: String?
  var identifier: String?

  init(
    _ title: String, text: Binding<String>, axis: Axis = .horizontal, prompt: String? = nil,
    identifier: String? = nil
  ) {
    self.title = title
    _text = text
    self.axis = axis
    self.prompt = prompt
    self.identifier = identifier
  }

  var body: some View {
    NotebookField(title: title) {
      TextField(title, text: $text, prompt: prompt.map { Text($0) } ?? Text(""), axis: axis)
        .accessibilityIdentifier(identifier ?? title)
    }
  }
}

struct SubjectName: View {
  let subject: NotebookRecord
  var body: some View {
    HStack(spacing: 8) {
      Circle().fill(Color(subjectHex: subject.text("color"))).frame(width: 9, height: 9)
        .accessibilityHidden(true)
      Text(subject.text("name"))
    }
  }
}

struct EditorCancelButton: View {
  var hasChanges: () -> Bool
  var dismiss: () -> Void
  @State private var confirming = false

  var body: some View {
    Button("取消") {
      if hasChanges() { confirming = true } else { dismiss() }
    }
    .accessibilityIdentifier("cancel-editor")
    .popover(isPresented: $confirming, attachmentAnchor: .rect(.bounds), arrowEdge: .top) {
      VStack(alignment: .leading, spacing: 14) {
        Text("放弃尚未保存的修改？").font(.headline).accessibilityIdentifier("discard-editor-prompt")
        Button("继续编辑") { confirming = false }.buttonStyle(.bordered)
        Button("放弃修改", role: .destructive) {
          confirming = false
          dismiss()
        }.buttonStyle(.bordered).tint(.red)
      }
      .padding(18)
      .presentationCompactAdaptation(.popover)
    }
  }
}
extension View {
  func notebookSurface() -> some View { modifier(NotebookSurface()) }
  @ViewBuilder func notebookTabs() -> some View {
    if #available(iOS 18.0, *) { tabViewStyle(.sidebarAdaptable) } else { self }
  }
}
struct EmptyNotebook: View {
  var title: String
  var symbol: String
  var message: String
  var body: some View {
    VStack(spacing: 14) {
      Image(systemName: symbol).font(.largeTitle).foregroundStyle(.secondary)
      Text(title).font(.headline)
      Text(message).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
    }.frame(maxWidth: .infinity).padding(40)
  }
}
