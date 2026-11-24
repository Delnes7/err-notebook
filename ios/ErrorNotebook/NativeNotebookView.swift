import Charts
import SwiftUI
import UniformTypeIdentifiers

enum NativeTab: Hashable { case questions, grades, practice, subjects, settings }
struct NativeNotebookView: View {
  @StateObject private var store = NotebookStore()
  @AppStorage("notebook_design", store: NotebookPreferences.defaults) private var design = "study"
  @AppStorage("notebook_appearance", store: NotebookPreferences.defaults) private var appearance =
    "system"
  @Environment(\.scenePhase) private var scenePhase
  @State private var tab = NativeTab.questions
  var body: some View {
    Group {
      if store.loaded {
        TabView(selection: $tab) {
          NavigationStack { NativeQuestionList() }.tabItem {
            Label("错题本", systemImage: "book.closed")
          }.tag(NativeTab.questions)
          NavigationStack { NativeGradesView() }.tabItem {
            Label("成绩", systemImage: "chart.xyaxis.line")
          }.tag(NativeTab.grades)
          NavigationStack { NativePracticeView() }.tabItem {
            Label("组卷", systemImage: "list.bullet.rectangle")
          }.tag(NativeTab.practice)
          NavigationStack { NativeSubjectsView() }.tabItem {
            Label("学科", systemImage: "square.grid.2x2")
          }.tag(NativeTab.subjects)
          NavigationStack { NativeSettingsView() }.tabItem { Label("设置", systemImage: "gearshape") }
            .tag(NativeTab.settings)
        }.notebookTabs()
      } else {
        VStack(spacing: 18) {
          Image(systemName: "book.pages").font(.largeTitle)
          ProgressView("正在打开你的学习空间")
          if store.error != nil { Button("重试") { Task { await store.refresh() } } }
        }.frame(maxWidth: .infinity, maxHeight: .infinity).background(style.background)
      }
    }
    .environmentObject(store).tint(style.tint)
    .onChange(of: store.requestedTab) { value in
      if let value {
        tab = value
        store.requestedTab = nil
      }
    }
    .preferredColorScheme(appearance == "system" ? nil : (appearance == "dark" ? .dark : .light))
    .task { await store.refresh() }
    #if DEBUG
      .overlay(alignment: .bottomLeading) {
        if ProcessInfo.processInfo.arguments.contains("--native-contract-test") {
          Text(store.testStatus).font(.caption2).accessibilityIdentifier("native-contract-status")
          .task { store.startContractChecks() }
        }
      }
    #endif
    .onChange(of: scenePhase) { phase in
      if phase == .active && store.loaded { Task { await store.refresh() } }
    }
    .alert(
      "操作未完成",
      isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })
    ) {
      Button("好") { store.error = nil }
    } message: {
      Text(store.error ?? "")
    }
    .alert(
      "提示",
      isPresented: Binding(get: { store.notice != nil }, set: { if !$0 { store.notice = nil } })
    ) {
      Button("好") { store.notice = nil }
    } message: {
      Text(store.notice ?? "")
    }
    .sheet(item: $store.export) { item in
      NativeShareSheet(url: item.url) {
        try? FileManager.default.removeItem(at: item.url)
        store.export = nil
      }
    }
  }
  private var style: NotebookStyle { NotebookStyle(rawValue: design) ?? .study }
}

struct QuestionEditorRequest: Identifiable {
  let id = UUID()
  var questionID: String?
}
struct NativeQuestionList: View {
  @EnvironmentObject private var store: NotebookStore
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @AppStorage("notebook_design", store: NotebookPreferences.defaults) private var design = "study"
  @State private var search = ""
  @State private var subject = ""
  @State private var unit = ""
  @State private var exam = ""
  @State private var reason = ""
  @State private var newest = true
  @State private var editor: QuestionEditorRequest?
  @State private var delete: NotebookRecord?
  private var filtered: [NotebookRecord] {
    let result = store.questions.filter { q in
      (subject.isEmpty || q.text("subjectId") == subject)
        && (unit.isEmpty || q.text("unitId") == unit) && (exam.isEmpty || q.text("examId") == exam)
        && (reason.isEmpty || q.fields.strings("reasons").contains(reason))
        && (search.isEmpty
          || [q.text("title"), q.text("content"), q.text("paperCode")].joined()
            .localizedCaseInsensitiveContains(search))
    }
    return result.sorted {
      newest
        ? $0.text("createdAt") > $1.text("createdAt") : $0.text("createdAt") < $1.text("createdAt")
    }
  }
  var body: some View {
    List {
      Section {
        if filtered.isEmpty {
          EmptyNotebook(title: "这里还没有错题", symbol: "book.closed", message: "录入一道题，或调整筛选条件。")
        }
        ForEach(filtered) { q in
          NavigationLink {
            NativeQuestionDetail(id: q.id)
          } label: {
            NativeQuestionRow(question: q)
          }
          .listRowBackground(style.paper)
          .swipeActions {
            Button("删除", role: .destructive) { delete = q }
            Button("编辑") { editor = QuestionEditorRequest(questionID: q.id) }.tint(style.tint)
          }
          .swipeActions(edge: .leading) {
            Button(store.selected.contains(q.id) ? "移出练习" : "加入练习") { store.toggle(q.id) }.tint(
              style.tint)
          }
        }
      } header: {
        NotebookSectionHeader("\(filtered.count) 道题 · 左滑编辑，右滑加入练习")
          .accessibilityIdentifier("question-list-heading")
      }
    }
    .listStyle(.insetGrouped).environment(\.defaultMinListRowHeight, 62)
    .notebookSurface()
    .navigationTitle("错题本").searchable(text: $search, prompt: "搜索题目、考点或真题号")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Menu {
          Picker("学科", selection: $subject) {
            Text("全部学科").tag("")
            ForEach(store.subjects) { SubjectName(subject: $0).tag($0.id) }
          }.onChange(of: subject) { _ in unit = "" }
          Picker("单元", selection: $unit) {
            Text("全部单元").tag("")
            ForEach(
              (store.subject(subject)?.fields.rows("units") ?? []).map {
                NotebookRecord(fields: $0)
              }
            ) { Text($0.text("name")).tag($0.id) }
          }
          Picker("考试", selection: $exam) {
            Text("全部考试").tag("")
            ForEach(store.exams.filter { subject.isEmpty || $0.text("subjectId") == subject }) {
              Text($0.text("title")).tag($0.id)
            }
          }
          Picker("错因", selection: $reason) {
            Text("全部错因").tag("")
            ForEach(
              Array(Set(store.questions.flatMap { $0.fields.strings("reasons") })).sorted(),
              id: \.self
            ) { Text($0).tag($0) }
          }
          Toggle("最新优先", isOn: $newest)
          Button("清除筛选") {
            subject = ""
            unit = ""
            exam = ""
            reason = ""
            search = ""
          }
        } label: {
          Label("筛选", systemImage: "line.3.horizontal.decrease")
        }.accessibilityIdentifier("question-filter")
      }
      ToolbarItem(placement: horizontalSizeClass == .regular ? .topBarLeading : .primaryAction) {
        Button {
          editor = QuestionEditorRequest()
        } label: {
          Label("录入错题", systemImage: "plus")
        }.accessibilityIdentifier("add-question")
      }
    }
    .sheet(item: $editor) { request in NativeQuestionEditor(questionID: request.questionID) }
    .confirmationDialog(
      "删除这道错题？", isPresented: Binding(get: { delete != nil }, set: { if !$0 { delete = nil } }),
      titleVisibility: .visible
    ) {
      Button("删除错题", role: .destructive) {
        if let delete {
          Task { await store.perform("delete", ["type": "question", "id": delete.id]) }
        }
        delete = nil
      }
    }
    .refreshable {
      if (store.snapshot["sync"] as? Fields)?.flag("loggedIn") == true {
        await store.perform("sync")
      } else {
        await store.refresh()
      }
    }
  }
  private var style: NotebookStyle { NotebookStyle(rawValue: design) ?? .study }
}

struct NativeQuestionRow: View {
  @EnvironmentObject private var store: NotebookStore
  let question: NotebookRecord
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack {
        if let subject = store.subject(question.text("subjectId")) {
          SubjectName(subject: subject)
        } else {
          Text("待指定学科")
        }
        Spacer()
        if store.selected.contains(question.id) { Image(systemName: "checkmark.circle.fill") }
      }.font(.caption).foregroundStyle(.secondary)
      Text(question.text("title").isEmpty ? "未命名错题" : question.text("title")).font(.headline)
        .fontWeight(.medium).lineLimit(2)
      if !question.text("paperCode").isEmpty {
        Text(question.text("paperCode")).font(.caption.monospaced()).foregroundStyle(.secondary)
      }
    }.padding(.vertical, 9)
  }
}

struct NativeQuestionDetail: View {
  @EnvironmentObject private var store: NotebookStore
  let id: String
  @State private var editing = false
  @State private var solution = false
  @State private var rich: RichContent?
  var question: NotebookRecord? { store.questions.first { $0.id == id } }
  var body: some View {
    Group {
      if let q = question {
        ScrollView {
          VStack(alignment: .leading, spacing: 20) {
            NativeQuestionRow(question: q)
            if let rich { NativeRichText(content: rich) } else { ProgressView() }
            Divider()
            HStack {
              Button {
                solution.toggle()
                Task { await load() }
              } label: {
                Label(solution ? "收起解析" : "查看解析", systemImage: solution ? "eye.slash" : "eye")
              }
              Spacer()
              Button {
                store.toggle(id)
              } label: {
                Label(
                  store.selected.contains(id) ? "已加入练习" : "加入练习",
                  systemImage: store.selected.contains(id) ? "checkmark.circle.fill" : "plus.circle"
                )
              }
            }.buttonStyle(.bordered)
            if !q.fields.strings("reasons").isEmpty {
              Text("错因：" + q.fields.strings("reasons").joined(separator: "、")).font(.footnote)
                .foregroundStyle(.secondary)
            }
          }.padding(24).frame(maxWidth: 900)
        }.notebookSurface()
      } else {
        EmptyNotebook(title: "题目已移除", symbol: "doc", message: "返回错题本查看其他题目。")
      }
    }.navigationTitle("题目详情").navigationBarTitleDisplayMode(.inline)
      .toolbar { Button("编辑") { editing = true }.accessibilityIdentifier("edit-question") }
      .sheet(isPresented: $editing) { NativeQuestionEditor(questionID: id) }
      .task(id: question?.text("updatedAt")) { await load() }
  }
  private func load() async {
    guard let q = question else { return }
    let text =
      q.text("content")
      + (solution
        ? "\n\n---\n\n## 参考解析\n\n" + q.text("solution") + "\n\n" + q.text("solutionNote") : "")
    do {
      rich = RichContent(
        html: try await store.service.call("rich", ["text": text]) as? String ?? "")
    } catch { store.error = error.localizedDescription }
  }
}
