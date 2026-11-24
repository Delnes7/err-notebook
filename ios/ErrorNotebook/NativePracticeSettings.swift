import SwiftUI
import UniformTypeIdentifiers

struct NativePracticeView: View {
  @EnvironmentObject private var store: NotebookStore
  @State private var subject = ""
  @State private var units = Set<String>()
  @State private var options: Fields = [
    "title": "错题复盘与重做强化试卷", "subtitle": "姓名：__________   班级：__________   用时：______分钟",
    "fontSize": "medium", "spacing": "auto", "includeSolutions": false, "showExamInfo": false,
    "showReasons": false, "showUnitBadge": true,
  ]
  @State private var spacing: Fields = [:]
  @State private var preview: NotebookExport?
  @State private var previewURL: URL?
  @State private var exporting = false
  var matching: [NotebookRecord] {
    store.questions.filter {
      (subject.isEmpty || $0.text("subjectId") == subject)
        && (units.isEmpty || units.contains($0.text("unitId")))
    }
  }
  var body: some View {
    Form {
      Section(notebookTitle: "单元专项组卷") {
        Picker("学科", selection: $subject) {
          Text("全部学科").tag("")
          ForEach(store.subjects) { SubjectName(subject: $0).tag($0.id) }
        }.onChange(of: subject) { _ in units = [] }
        ForEach(
          (store.subject(subject)?.fields.rows("units") ?? []).map { NotebookRecord(fields: $0) }
        ) { unit in
          Toggle(
            unit.text("name"),
            isOn: Binding(
              get: { units.contains(unit.id) },
              set: { if $0 { units.insert(unit.id) } else { units.remove(unit.id) } }))
        }
        Button("选择符合条件的 \(matching.count) 道题") { store.selected = Set(matching.map(\.id)) }
        Button("清空已选", role: .destructive) { store.selected = [] }.disabled(store.selected.isEmpty)
      }
      Section(notebookTitle: "试卷设置") {
        NotebookTextField("试卷标题", text: $options.text("title"))
        NotebookTextField("副标题", text: $options.text("subtitle"), axis: .vertical)
        Picker("题目字号", selection: $options.text("fontSize")) {
          Text("小").tag("small")
          Text("中").tag("medium")
          Text("大").tag("large")
        }
        Picker("答题留白", selection: $options.text("spacing")) {
          Text("按小问自动").tag("auto")
          Text("无留白").tag("none")
          Text("紧凑").tag("compact")
          Text("适中").tag("medium")
          Text("宽松").tag("large")
        }
        Toggle("卷末附参考解析", isOn: $options.flag("includeSolutions"))
        Toggle("显示学科与单元", isOn: $options.flag("showUnitBadge"))
        Toggle("显示考试来源", isOn: $options.flag("showExamInfo"))
        Toggle("显示错因", isOn: $options.flag("showReasons"))
      }
      Section(notebookTitle: "已选 \(store.selected.count) 道题") {
        if store.selected.isEmpty { Text("在错题本向右滑动题目，或在上方按单元选题。").foregroundStyle(.secondary) }
        ForEach(store.questions.filter { store.selected.contains($0.id) }) { q in
          DisclosureGroup(q.text("title", "未命名错题")) {
            NavigationLink("查看题目") { NativeQuestionDetail(id: q.id) }
            if q.text("questionType") != "multiple_choice" {
              let px = spacing[q.id] as? Double ?? defaultSpace(q)
              VStack(alignment: .leading) {
                Text("本题答题留白：\(Int(px)) px").font(.caption)
                Slider(
                  value: Binding(get: { px }, set: { spacing[q.id] = $0 }), in: 0...800, step: 20
                ).accessibilityLabel("本题答题留白")
              }
              Button("恢复默认留白") { spacing.removeValue(forKey: q.id) }
            }
            Button("移出练习", role: .destructive) { store.selected.remove(q.id) }
          }
        }
      }
      Section {
        Button {
          Task { await makePaper(share: false) }
        } label: {
          Label("预览试卷", systemImage: "doc.text.magnifyingglass")
        }.accessibilityIdentifier("preview-paper")
        Button {
          Task { await makePaper(share: true) }
        } label: {
          Label("分享 PDF / 系统打印", systemImage: "square.and.arrow.up")
        }.accessibilityIdentifier("share-paper")
        if exporting { ProgressView("正在排版试卷") }
      }.disabled(store.selected.isEmpty || exporting)
    }.notebookSurface().navigationTitle("组卷")
      .sheet(
        item: $preview,
        onDismiss: {
          if let previewURL { try? FileManager.default.removeItem(at: previewURL) }
          previewURL = nil
        }
      ) { item in
        NavigationStack {
          NativePDFPreview(url: item.url).navigationTitle("练习卷预览").navigationBarTitleDisplayMode(
            .inline
          ).toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("完成") { preview = nil } }
            ToolbarItem(placement: .confirmationAction) { ShareLink(item: item.url) }
          }
        }
      }
  }
  private func defaultSpace(_ q: NotebookRecord) -> Double {
    switch options.text("spacing") {
    case "none": return 0
    case "compact": return 80
    case "medium": return 160
    case "large": return 300
    default:
      let count = max(1, q.fields.rows("parts").count)
      return count <= 2 ? 140 : min(520, Double(240 + (count - 3) * 100))
    }
  }
  private func makePaper(share: Bool) async {
    exporting = true
    defer { exporting = false }
    do {
      _ = try await store.service.call(
        "paper", ["ids": Array(store.selected), "options": options, "spacing": spacing])
      let data = try store.service.pdf()
      if share {
        try store.share(data, extension: "pdf")
      } else {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(
          "练习卷-\(UUID().uuidString).pdf")
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        previewURL = url
        preview = NotebookExport(url: url)
      }
    } catch { store.error = error.localizedDescription }
  }
}

struct NativeSettingsView: View {
  @EnvironmentObject private var store: NotebookStore
  @AppStorage("notebook_design", store: NotebookPreferences.defaults) private var design = "study"
  @AppStorage("notebook_appearance", store: NotebookPreferences.defaults) private var appearance =
    "system"
  @AppStorage("question_font_size", store: NotebookPreferences.defaults) private var fontSize =
    "medium"
  @State private var email = ""
  @State private var password = ""
  @State private var provider = "deepseek"
  @State private var key = ""
  @State private var model = ""
  @State private var baseURL = ""
  @State private var cloudURL = ""
  @State private var cloudKey = ""
  @State private var importing = false
  @State private var pendingBackup: String?
  @State private var confirmation = ""
  @State private var licenses = false
  var sync: Fields { store.snapshot["sync"] as? Fields ?? [:] }
  var body: some View {
    Form {
      Section(notebookTitle: "界面风格") {
        ForEach(NotebookStyle.allCases) { style in
          Button {
            design = style.rawValue
          } label: {
            HStack {
              VStack(alignment: .leading, spacing: 6) {
                Text(style.title).foregroundStyle(.primary)
                Text(style.subtitle).font(.caption).foregroundStyle(.secondary)
              }
              Spacer()
              Image(systemName: design == style.rawValue ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(style.tint)
            }.padding(.vertical, 7)
          }.accessibilityIdentifier("style-" + style.rawValue)
        }
      }
      Section(notebookTitle: "显示") {
        displayChoice(
          "深浅色", selection: $appearance,
          options: [("system", "跟随系统"), ("light", "浅色"), ("dark", "深色")])
        displayChoice(
          "题目字号", selection: $fontSize,
          options: [("normal", "标准"), ("medium", "适中"), ("large", "特大")])
        Text("外观和阅读字号设置仅影响当前设备。").font(.caption).foregroundStyle(.secondary)
      }
      Section(notebookTitle: "账号与同步") {
        if sync.flag("loggedIn") {
          LabeledContent("账号", value: sync.text("email"))
          LabeledContent(
            "同步状态",
            value: ["idle": "等待同步", "syncing": "同步中", "synced": "已同步", "error": "同步失败"][
              sync.text("syncStatus")] ?? "等待同步")
          if !sync.text("lastError").isEmpty {
            Text(sync.text("lastError")).font(.caption).foregroundStyle(.red)
          }
          Button("立即双向同步") { Task { await store.perform("sync") } }
          Button("以本机覆盖云端") { confirmation = "push" }
          Button("以云端覆盖本机") { confirmation = "pull" }
          Button("退出账号", role: .destructive) { Task { await store.perform("signOut") } }
        } else {
          NotebookTextField("邮箱", text: $email).keyboardType(.emailAddress).textContentType(.username)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
          NotebookField(title: "密码") {
            SecureField("", text: $password).textContentType(.password)
          }
          Button("登录") {
            Task {
              if await store.perform("signIn", ["email": email, "password": password]) {
                password = ""
                await store.perform("sync")
              }
            }
          }
          Button("注册账号") {
            Task {
              if await store.perform("signUp", ["email": email, "password": password]) {
                password = ""
                store.notice = "账号已提交注册。如需验证，请在邮箱中完成确认，再回到 App 登录。"
              }
            }
          }
        }
        DisclosureGroup("Supabase 项目设置") {
          NotebookTextField("项目 HTTPS 地址", text: $cloudURL).keyboardType(.URL).textInputAutocapitalization(
            .never
          ).autocorrectionDisabled()
          NotebookTextField("Publishable / anon key", text: $cloudKey).textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          Button("保存并切换项目") { confirmation = "cloudSettings" }
        }
      }.disabled(store.busy)
      Section {
        Picker("服务", selection: $provider) {
          Text("OpenAI 兼容接口").tag("deepseek")
          Text("Google Gemini").tag("gemini")
        }.onChange(of: provider) { value in
          Task {
            do {
              let cfg =
                try await store.service.call("aiConfig", ["provider": value]) as? Fields ?? [:]
              model = cfg.text("model")
              baseURL = cfg.text("baseUrl")
              key = ""
            } catch { store.error = error.localizedDescription }
          }
        }
        NotebookField(title: "API Key") {
          SecureField(
            "", text: $key,
            prompt: (store.snapshot["ai"] as? Fields)?.flag("hasKey") == true
              ? Text("留空保留现有密钥") : nil
          ).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        NotebookTextField("模型名称", text: $model).textInputAutocapitalization(.never).autocorrectionDisabled()
        NotebookTextField("服务 HTTPS 地址", text: $baseURL).keyboardType(.URL).textInputAutocapitalization(
          .never
        ).autocorrectionDisabled()
        Button("保存 AI 设置") {
          Task {
            var payload: Fields = ["provider": provider, "model": model, "baseUrl": baseURL]
            if !key.isEmpty { payload["apiKey"] = key }
            if await store.perform("aiSettings", payload) {
              key = ""
              store.notice = "AI 设置已保存，密钥保存在本机钥匙串。"
            }
          }
        }
        Button("测试连接") { Task { if await store.perform("testAI") { store.notice = "AI 连接成功。" } } }
        Button("删除此服务密钥", role: .destructive) { confirmation = "deleteKey" }
      } header: {
        NotebookSectionHeader("AI 识别")
      } footer: {
        Text("密钥仅存入本机钥匙串。点击 AI 识别时，会将所选图片和题目上下文发送至配置的服务地址。")
      }
      Section(notebookTitle: "备份与恢复") {
        Button {
          Task { await store.backup() }
        } label: {
          Label("导出全量 JSON 备份", systemImage: "square.and.arrow.up")
        }.accessibilityIdentifier("export-backup")
        Button {
          importing = true
        } label: {
          Label("从 JSON 恢复", systemImage: "square.and.arrow.down")
        }
        Text("恢复会覆盖本机数据；云端覆盖需单独操作。备份兼容网页版与此前 iOS 版本。").font(.caption).foregroundStyle(.secondary)
      }
      Section(notebookTitle: "关于") {
        LabeledContent("开发", value: "Gemini × ChatGPT")
        Button("开源许可") { licenses = true }
        Text("默认在本机离线保存。登录同步会将错题、成绩和学科传至 Supabase。请勿将未备份的重要数据用于破坏性测试。").font(.caption)
          .foregroundStyle(.secondary)
      }
      if store.busy { Section { ProgressView("正在处理") } }
    }.notebookSurface().navigationTitle("设置")
      .task {
        let cfg = store.snapshot["ai"] as? Fields ?? [:]
        provider = cfg.text("provider", "deepseek")
        model = cfg.text("model")
        baseURL = cfg.text("baseUrl")
        let cloud = store.snapshot["cloudConfig"] as? Fields ?? [:]
        cloudURL = cloud.text("url")
        cloudKey = cloud.text("key")
      }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
        do {
          let url = try result.get()
          let access = url.startAccessingSecurityScopedResource()
          defer { if access { url.stopAccessingSecurityScopedResource() } }
          let values = try url.resourceValues(forKeys: [.fileSizeKey])
          guard (values.fileSize ?? 0) <= 128 * 1024 * 1024 else {
            throw NotebookError.message("备份文件超过 128 MiB")
          }
          let data = try Data(contentsOf: url)
          guard let json = String(data: data, encoding: .utf8) else {
            throw NotebookError.message("备份文件编码无效")
          }
          pendingBackup = json
          confirmation = "restore"
        } catch { store.error = error.localizedDescription }
      }
      .confirmationDialog(
        confirmationTitle,
        isPresented: Binding(
          get: { !confirmation.isEmpty },
          set: {
            if !$0 {
              confirmation = ""
              pendingBackup = nil
            }
          }), titleVisibility: .visible
      ) {
        Button("确认继续", role: .destructive) {
          let action = confirmation
          let backup = pendingBackup
          confirmation = ""
          pendingBackup = nil
          Task {
            switch action {
            case "restore": if let backup { await store.perform("restore", ["json": backup]) }
            case "deleteKey":
              await store.perform(
                "aiSettings",
                ["provider": provider, "apiKey": "", "model": model, "baseUrl": baseURL])
            case "cloudSettings":
              await store.perform("cloudSettings", ["url": cloudURL, "key": cloudKey])
            default: await store.perform(action)
            }
          }
        }
        Button("取消", role: .cancel) {
          confirmation = ""
          pendingBackup = nil
        }
      }
      .sheet(isPresented: $licenses) { NativeLicensesView() }
  }
  private func displayChoice(
    _ title: String, selection: Binding<String>, options: [(String, String)]
  ) -> some View {
    let active = options.first { $0.0 == selection.wrappedValue }?.1 ?? ""
    let tint = (NotebookStyle(rawValue: design) ?? .study).tint
    return Menu {
      Picker(title, selection: selection) {
        ForEach(options, id: \.0) { value, label in Text(label).tag(value) }
      }
    } label: {
      HStack(spacing: 8) {
        Text(title).foregroundStyle(Color(uiColor: .label))
        Spacer(minLength: 8)
        Text(active).multilineTextAlignment(.trailing).foregroundStyle(tint)
        Image(systemName: "chevron.up.chevron.down").font(.caption.weight(.semibold))
          .foregroundStyle(tint)
      }.contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
    .accessibilityValue(active)
    .accessibilityIdentifier("display-" + title)
  }
  private var confirmationTitle: String {
    switch confirmation {
    case "push": return "本机数据将替换云端全部记录。已备份后再继续。"
    case "pull": return "云端数据将替换本机全部记录。已备份后再继续。"
    case "restore": return "备份将覆盖本机的错题、考试、学科与权重配置。"
    case "deleteKey": return "删除此服务在本机保存的密钥？"
    case "cloudSettings": return "切换云端项目将退出当前账号。本机数据保留。"
    default: return "确认操作？"
    }
  }
}
struct NativeLicensesView: View {
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    NavigationStack {
      ScrollView {
        Text(text).font(.system(.caption, design: .monospaced)).textSelection(.enabled).padding()
      }.navigationTitle("开源许可").navigationBarTitleDisplayMode(.inline).toolbar {
        Button("完成") { dismiss() }
      }
    }
  }
  private var text: String {
    ["tailwind", "katex", "chart", "prism", "supabase"].map { name in
      let url = Bundle.main.url(forResource: "Web", withExtension: nil)!.appendingPathComponent(
        "vendor/licenses/\(name).txt")
      return "\n\n\(name)\n" + ((try? String(contentsOf: url, encoding: .utf8)) ?? "")
    }.joined()
  }
}
