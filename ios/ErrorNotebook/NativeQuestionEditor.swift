import ImageIO
import PhotosUI
import SwiftUI

struct NativeQuestionEditor: View {
  @EnvironmentObject private var store: NotebookStore
  @Environment(\.dismiss) private var dismiss
  var questionID: String?
  @State private var fields: Fields = [:]
  @State private var ready = false
  @State private var saving = false
  @State private var originalFields: Fields?
  @State private var preview: RichContent?
  @State private var customReason = ""
  @State private var aiBusy = false
  @State private var autoSolution = true
  @State private var pictures: [NotebookImage] = []
  @State private var msPictures: [NotebookImage] = []
  @State private var photos: [PhotosPickerItem] = []
  @State private var imageTarget = "question"
  @State private var camera = false
  @State private var crop: NotebookImage?
  @State private var insertionTarget = "stem"
  @State private var localError: String?
  @State private var imageFiles = false
  private var subject: NotebookRecord? { store.subject(fields.text("subjectId")) }
  private var multi: Bool { fields.text("questionType") == "multiple_choice" }
  var body: some View {
    NavigationStack {
      Group {
        if ready {
          Form {
            aiSection
            Section(notebookTitle: "归档") {
              NotebookTextField("题目标题", text: $fields.text("title"), identifier: "question-title")
              Picker(
                "学科",
                selection: Binding(
                  get: { fields.text("subjectId") },
                  set: { id in
                    guard id != fields.text("subjectId") else { return }
                    fields["subjectId"] = id
                    fields["unitId"] = ""
                    fields["examId"] = ""
                  }
                )
              ) {
                ForEach(store.subjects) { SubjectName(subject: $0).tag($0.id) }
              }
              Picker("单元", selection: $fields.text("unitId")) {
                Text("不指定").tag("")
                ForEach((subject?.fields.rows("units") ?? []).map { NotebookRecord(fields: $0) }) {
                  Text($0.text("name")).tag($0.id)
                }
              }
              Picker("关联考试", selection: $fields.text("examId")) {
                Text("不关联").tag("")
                ForEach(store.exams.filter { $0.text("subjectId") == fields.text("subjectId") }) {
                  Text($0.text("title")).tag($0.id)
                }
              }
              NotebookTextField("真题号", text: $fields.text("paperCode"), prompt: "例如 S25-12-6")
                .textInputAutocapitalization(.characters).autocorrectionDisabled()
              Button("查找 CIE 真题号") { Task { await lookup() } }.disabled(aiBusy)
            }
            Section(notebookTitle: "题型") {
              Picker("题型", selection: $fields.text("questionType")) {
                Text("结构题").tag("structured")
                Text("选择题").tag("multiple_choice")
              }
              if !multi {
                Picker("结构", selection: $fields.text("structuredMode")) {
                  Text("单题").tag("single")
                  Text("多小问").tag("multi_part")
                }
              }
            }
            if multi {
              mcqSection
            } else if fields.text("structuredMode") == "multi_part" {
              structuredSections
            } else {
              Section(notebookTitle: "题目正文 · Markdown / LaTeX") {
                MarkdownInput("正文", text: $fields.text("content"), identifier: "question-content")
              }
            }
            if multi || fields.text("structuredMode") != "multi_part"
              || fields.rows("parts").isEmpty
            {
              Section(notebookTitle: "参考解析 / Mark Scheme") {
                NativeSolutionEditor(fields: $fields, rowsKey: "markSchemeRows")
              }
            }
            Section(notebookTitle: "解题备注") {
              MarkdownInput("备注", text: $fields.text("solutionNote"))
            }
            Section(notebookTitle: "复盘") {
              Stepper(
                "难度：\(Int(fields.number("difficulty"))) / 5",
                value: Binding(
                  get: { max(1, Int(fields.number("difficulty"))) },
                  set: { fields["difficulty"] = $0 }), in: 1...5)
              ForEach(store.snapshot.strings("reasons"), id: \.self) { reason in
                Toggle(reason, isOn: $fields.toggleString("reasons", reason))
              }
              HStack {
                NotebookTextField("其他错因", text: $customReason)
                Button("添加") {
                  let value = customReason.trimmingCharacters(in: .whitespacesAndNewlines)
                  if !value.isEmpty {
                    var reasons = fields.strings("reasons")
                    if !reasons.contains(value) { reasons.append(value) }
                    fields["reasons"] = reasons
                    customReason = ""
                  }
                }
              }
              ForEach(
                fields.strings("reasons").filter {
                  !store.snapshot.strings("reasons").contains($0)
                }, id: \.self
              ) { value in Toggle(value, isOn: $fields.toggleString("reasons", value)) }
            }
          }.notebookSurface().disabled(saving || aiBusy)
        } else {
          ProgressView("正在打开编辑器")
        }
      }
      .navigationTitle(questionID == nil ? "录入错题" : "编辑错题").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          EditorCancelButton(
            hasChanges: {
              guard let originalFields else { return false }
              return !NSDictionary(dictionary: fields).isEqual(to: originalFields)
                || !pictures.isEmpty || !msPictures.isEmpty
            }, dismiss: { dismiss() }
          )
          .disabled(saving || aiBusy)
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button("预览") { Task { await makePreview() } }.disabled(!ready || saving || aiBusy)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("保存") { Task { await save() } }.disabled(!ready || saving || aiBusy)
            .accessibilityIdentifier("save-question")
        }
      }
      .task { await load() }
      .interactiveDismissDisabled(true)
      .sheet(item: $preview) { NativeDocumentSheet(content: $0, title: "题目与解析预览") }
      .sheet(isPresented: $camera) { NativeCamera { image in if let image { accept(image) } } }
      .sheet(item: $crop) { image in
        NativeCropEditor(image: image) { cropped in insertImage(cropped) }
      }
      .fileImporter(
        isPresented: $imageFiles, allowedContentTypes: [.image], allowsMultipleSelection: true
      ) { result in
        Task {
          do {
            for url in try result.get() {
              let access = url.startAccessingSecurityScopedResource()
              defer { if access { url.stopAccessingSecurityScopedResource() } }
              let values = try url.resourceValues(forKeys: [.fileSizeKey])
              guard (values.fileSize ?? 0) <= 64 * 1024 * 1024 else {
                throw NotebookError.message("图片超过 64 MiB")
              }
              accept(try NotebookImage(data: Data(contentsOf: url)))
            }
          } catch { localError = error.localizedDescription }
        }
      }
      .alert(
        "未能完成",
        isPresented: Binding(get: { localError != nil }, set: { if !$0 { localError = nil } })
      ) {
        Button("好") {}
      } message: {
        Text(localError ?? "")
      }
    }
  }
  private var aiSection: some View {
    Section {
      Picker("图片用途", selection: $imageTarget) {
        Text("题目图片").tag("question")
        Text("评分标准图片").tag("ms")
      }.pickerStyle(.segmented)
      HStack {
        PhotosPicker(selection: $photos, maxSelectionCount: 8, matching: .images) {
          Label("相册", systemImage: "photo")
        }
        .onChange(of: photos) { selected in
          Task {
            let target = imageTarget
            do {
              for item in selected {
                if let data = try await item.loadTransferable(type: Data.self) {
                  accept(try NotebookImage(data: data), target: target)
                }
              }
            } catch { localError = error.localizedDescription }
            photos = []
          }
        }
        Spacer()
        Button {
          imageFiles = true
        } label: {
          Label("文件", systemImage: "folder")
        }
        Spacer()
        PasteButton(supportedContentTypes: [.image]) { providers in
          let target = imageTarget
          for provider in providers.prefix(8) {
            provider.loadObject(ofClass: UIImage.self) { object, error in
              Task { @MainActor in
                if let image = object as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.9)
                {
                  do { accept(try NotebookImage(data: data), target: target) } catch {
                    localError = error.localizedDescription
                  }
                } else if let error {
                  localError = error.localizedDescription
                }
              }
            }
          }
        }.labelStyle(.iconOnly).accessibilityLabel("粘贴图片")
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
          Spacer()
          Button {
            camera = true
          } label: {
            Label("拍照", systemImage: "camera")
          }
        }
      }.buttonStyle(.borderless)
      if !(pictures + msPictures).isEmpty {
        ScrollView(.horizontal) {
          HStack(spacing: 12) {
            ForEach(pictures + msPictures) { image in
              VStack(spacing: 7) {
                Image(uiImage: image.image).resizable().scaledToFit().frame(width: 100, height: 80)
                  .clipShape(RoundedRectangle(cornerRadius: 8))
                Text(msPictures.contains { $0.id == image.id } ? "评分标准" : "题目").font(.caption2)
                  .foregroundStyle(.secondary)
                Menu("图片操作") {
                  Menu("框选并插入") { insertionButtons(image: image, cropping: true) }
                  Menu("整图插入") { insertionButtons(image: image, cropping: false) }
                  Button("移除图片", role: .destructive) {
                    pictures.removeAll { $0.id == image.id }
                    msPictures.removeAll { $0.id == image.id }
                  }
                }
              }
            }
          }
        }
      }
      Toggle("自动生成参考解析", isOn: $autoSolution)
      HStack {
        Button("识别题目") { Task { await recognize(msOnly: false) } }.disabled(pictures.isEmpty)
        Spacer()
        Button("仅识别评分标准") { Task { await recognize(msOnly: true) } }.disabled(msPictures.isEmpty)
      }.buttonStyle(.borderless)
      if aiBusy { ProgressView("AI 正在处理，请稍候…") }
    } header: {
      NotebookSectionHeader("图片与 AI 录入")
    } footer: {
      Text("仅点击识别时，所选图片和题目上下文才会发往你配置的 AI 服务。识别结果需核对后保存。")
    }
  }
  private var mcqSection: some View {
    Group {
      Section(notebookTitle: "选择题题干") {
        MarkdownInput("题干", text: $fields.text("stem"))
        Picker("选择类型", selection: $fields.text("mcqType")) {
          Text("单选").tag("single")
          Text("多选 / 不定项").tag("multiple")
        }
      }
      Section(notebookTitle: "选项与答案") {
        ForEach(fields.rows("optionsList").indices, id: \.self) { i in
          let key = fields.rows("optionsList")[i].text("key")
          DisclosureGroup("选项 \(key)") {
            MarkdownInput("选项内容", text: $fields.row("optionsList", i).text("text"))
            Toggle("正确选项", isOn: optionBinding("correctOptions", key))
            Toggle("当时选择", isOn: optionBinding("myOptions", key))
            Button("删除选项", role: .destructive) {
              var list = fields.rows("optionsList")
              list.remove(at: i)
              fields["optionsList"] = list
              fields["correctOptions"] = fields.strings("correctOptions").filter { $0 != key }
              fields["myOptions"] = fields.strings("myOptions").filter { $0 != key }
            }.disabled(fields.rows("optionsList").count <= 2)
          }
        }
        Button("添加选项") {
          let used = Set(fields.rows("optionsList").map { $0.text("key") })
          if let key = (65...90).map({ String(UnicodeScalar($0)!) }).first(where: {
            !used.contains($0)
          }) {
            var list = fields.rows("optionsList")
            list.append(["key": key, "text": ""])
            fields["optionsList"] = list
          }
        }
      }
    }
  }
  private var structuredSections: some View {
    Group {
      Section(notebookTitle: "共同题干") {
        MarkdownInput("题干", text: $fields.text("stem"))
        NotebookTextField("题干分值（无小问时）", text: $fields.text("stemMarks")).keyboardType(.decimalPad)
      }
      ForEach(fields.rows("parts").indices, id: \.self) { i in
        Section(notebookTitle: "小问 \(fields.rows("parts")[i].text("label"))") {
          NativePartEditor(fields: $fields.row("parts", i))
          Button("删除小问", role: .destructive) {
            var parts = fields.rows("parts")
            parts.remove(at: i)
            fields["parts"] = parts
          }
        }
      }
      Section {
        Button("添加小问") {
          var parts = fields.rows("parts")
          parts.append([
            "id": UUID().uuidString,
            "label": "(\(String(UnicodeScalar(97 + min(parts.count,25))!)))", "marks": "",
            "isWrong": true, "text": "", "solutionMode": "markdown", "solution": "",
            "solutionRows": [],
          ])
          fields["parts"] = parts
        }
      }
    }
  }
  private func optionBinding(_ key: String, _ option: String) -> Binding<Bool> {
    Binding(
      get: { fields.strings(key).contains(option) },
      set: { checked in
        var list = fields.strings(key)
        list.removeAll { $0 == option }
        if checked {
          if fields.text("mcqType") != "multiple" { list = [] }
          list.append(option)
        }
        fields[key] = list
        fields[key == "correctOptions" ? "correctOption" : "myOption"] = list.joined(
          separator: ", ")
      })
  }
  private func load() async {
    do {
      let action = questionID == nil ? "newQuestion" : "editQuestion"
      fields =
        try await store.service.call(action, questionID.map { ["id": $0] } ?? [:]) as? Fields ?? [:]
      if questionID == nil {
        fields["structuredMode"] = "single"
        fields["solutionMode"] = "markdown"
      }
      if !store.subjects.contains(where: { $0.id == fields.text("subjectId") }) {
        fields["subjectId"] = store.subjects.first?.id ?? ""
      }
      ready = true
      originalFields = fields
    } catch { localError = error.localizedDescription }
  }
  private func save() async {
    saving = true
    defer { saving = false }
    if await store.perform("saveQuestion", ["id": questionID ?? "", "form": fields]) {
      dismiss()
    } else {
      localError = store.error
      store.error = nil
    }
  }
  private func makePreview() async {
    do {
      let result = try await store.service.call("compile", ["form": fields]) as? Fields ?? [:]
      let text =
        result.text("content") + "\n\n---\n\n"
        + result.text(multi ? "compiledSolution" : "solution") + "\n\n"
        + result.text("solutionNote")
      preview = RichContent(
        html: try await store.service.call("rich", ["text": text]) as? String ?? "")
    } catch { localError = error.localizedDescription }
  }
  private func recognize(msOnly: Bool) async {
    aiBusy = true
    defer { aiBusy = false }
    do {
      fields =
        try await store.service.call(
          msOnly ? "recognizeMS" : "recognize",
          [
            "form": fields, "questionImages": pictures.map(\.payload),
            "markSchemeImages": msPictures.map(\.payload), "autoGenerateSolution": autoSolution,
          ]) as? Fields ?? fields
    } catch { localError = error.localizedDescription }
  }
  private func lookup() async {
    aiBusy = true
    defer { aiBusy = false }
    do {
      let result =
        try await store.service.call(
          "lookup",
          ["text": fields.text("content") + fields.text("stem"), "images": pictures.map(\.payload)])
        as? Fields ?? [:]
      if !result.text("paperCode").isEmpty {
        fields["paperCode"] = result.text("paperCode")
      } else {
        localError = "未找到可确认的真题号，请手动填写。"
      }
    } catch { localError = error.localizedDescription }
  }
  private func accept(_ image: NotebookImage, target: String? = nil) {
    if (target ?? imageTarget) == "ms" {
      if msPictures.count < 8 { msPictures.append(image) }
    } else if pictures.count < 8 {
      pictures.append(image)
    }
  }
  @ViewBuilder private func insertionButtons(image: NotebookImage, cropping: Bool) -> some View {
    Button("题目正文 / 题干") { insert(image, target: "stem", cropping: cropping) }
    ForEach(fields.rows("parts").indices, id: \.self) { index in
      Button("小问 " + fields.rows("parts")[index].text("label")) {
        insert(image, target: "part:\(index)", cropping: cropping)
      }
    }
    Button("解题备注") { insert(image, target: "solutionNote", cropping: cropping) }
  }
  private func insert(_ image: NotebookImage, target: String, cropping: Bool) {
    insertionTarget = target
    if cropping { crop = image } else { insertImage(image) }
  }
  private func insertImage(_ image: NotebookImage) {
    let markdown = "\n\n![题目配图](\(image.dataURL))\n"
    if insertionTarget.hasPrefix("part:"), let index = Int(insertionTarget.dropFirst(5)) {
      var parts = fields.rows("parts")
      if parts.indices.contains(index) {
        parts[index]["text"] = parts[index].text("text") + markdown
        fields["parts"] = parts
      }
    } else {
      let key =
        insertionTarget == "solutionNote"
        ? "solutionNote"
        : (multi || fields.text("structuredMode") == "multi_part" ? "stem" : "content")
      fields[key] = fields.text(key) + markdown
    }
  }
}

struct MarkdownInput: View {
  let title: String
  @Binding var text: String
  let identifier: String

  init(_ title: String, text: Binding<String>, identifier: String = "markdown-input") {
    self.title = title
    _text = text
    self.identifier = identifier
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      NotebookField(title: title) {
        TextEditor(text: $text).font(.body.monospaced()).frame(minHeight: 120)
          .accessibilityIdentifier(identifier)
      }
      Menu("插入公式 / 排版") {
        Button("行内公式") { text += "$x$" }
        Button("独立公式") { text += "\n$$\\frac{a}{b}$$\n" }
        Button("分数") { text += "$\\frac{a}{b}$" }
        Button("根号") { text += "$\\sqrt{x}$" }
        Button("上下标") { text += "$x_i^{2}$" }
        Button("积分") { text += "$\\int_a^b f(x)\\,dx$" }
        Button("表格") { text += "\n| 项目 | 内容 |\n| --- | --- |\n|  |  |\n" }
        Button("代码块") { text += "\n```\n\n```\n" }
      }.font(.caption)
    }
  }
}
struct NativePartEditor: View {
  @Binding var fields: Fields
  var body: some View {
    NotebookTextField("小问题号", text: $fields.text("label"))
    NotebookTextField("分值", text: $fields.text("marks")).keyboardType(.decimalPad)
    Toggle("错在此问", isOn: $fields.flag("isWrong"))
    MarkdownInput("小问正文", text: $fields.text("text"))
    DisclosureGroup("小问后的补充题干") {
      MarkdownInput("补充题干", text: $fields.text("afterText"))
    }
    NativeSolutionEditor(fields: $fields, rowsKey: "solutionRows")
  }
}
struct NativeSolutionEditor: View {
  @Binding var fields: Fields
  var rowsKey: String
  var body: some View {
    Picker("解析格式", selection: $fields.text("solutionMode")) {
      Text("Markdown").tag("markdown")
      Text("评分表格").tag("mark_scheme_table")
      Text("暂不录入").tag("none")
    }
    if fields.text("solutionMode") == "mark_scheme_table" {
      ForEach(fields.rows(rowsKey).indices, id: \.self) { i in
        DisclosureGroup("评分步骤 \(i + 1) · \(fields.rows(rowsKey)[i].text("marks"))") {
          NotebookTextField("Question / 题号", text: $fields.row(rowsKey, i).text("question"))
          NotebookTextField("Answer / 得分点", text: $fields.row(rowsKey, i).text("answer"), axis: .vertical)
          NotebookTextField("Marks / 分值", text: $fields.row(rowsKey, i).text("marks"), prompt: "例如 M1 A1")
          NotebookTextField(
            "Guidance / 指引", text: $fields.row(rowsKey, i).text("guidance"), axis: .vertical)
          Button("删除评分步骤", role: .destructive) {
            var rows = fields.rows(rowsKey)
            rows.remove(at: i)
            fields[rowsKey] = rows
          }
        }
      }
      Button("添加评分步骤") {
        var rows = fields.rows(rowsKey)
        rows.append(["question": fields.text("label"), "answer": "", "marks": "M1", "guidance": ""])
        fields[rowsKey] = rows
      }
    } else if fields.text("solutionMode") == "markdown" {
      MarkdownInput("解析正文", text: $fields.text("solution"))
    }
  }
}

struct NotebookImage: Identifiable {
  let id = UUID()
  let image: UIImage
  let data: Data
  var dataURL: String { "data:image/jpeg;base64," + data.base64EncodedString() }
  var payload: Fields {
    [
      "id": id.uuidString, "dataUrl": dataURL, "base64": data.base64EncodedString(),
      "mimeType": "image/jpeg", "name": "题目.jpg",
    ]
  }
  init(data: Data) throws {
    guard data.count <= 64 * 1024 * 1024,
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      let cg = CGImageSourceCreateThumbnailAtIndex(
        source, 0,
        [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceThumbnailMaxPixelSize: 2000,
          kCGImageSourceCreateThumbnailWithTransform: true,
        ] as CFDictionary)
    else { throw NotebookError.message("无法读取图片或文件超过 64 MiB") }
    let image = UIImage(cgImage: cg)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    self.image = UIGraphicsImageRenderer(size: image.size, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: image.size))
      image.draw(at: .zero)
    }
    guard let jpeg = self.image.jpegData(compressionQuality: 0.86) else {
      throw NotebookError.message("图片转换失败")
    }
    self.data = jpeg
  }
}
struct NativeCamera: UIViewControllerRepresentable {
  @Environment(\.dismiss) private var dismiss
  var completed: (NotebookImage?) -> Void
  func makeCoordinator() -> Coordinator { Coordinator(self) }
  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.delegate = context.coordinator
    return picker
  }
  func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate
  {
    let parent: NativeCamera
    init(_ parent: NativeCamera) { self.parent = parent }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      let image = info[.originalImage] as? UIImage
      parent.completed(
        image?.jpegData(compressionQuality: 0.9).flatMap { try? NotebookImage(data: $0) })
      parent.dismiss()
    }
  }
}
struct NativeCropEditor: View {
  @Environment(\.dismiss) private var dismiss
  let image: NotebookImage
  var completed: (NotebookImage) -> Void
  @State private var selection = CGRect(x: 0.1, y: 0.1, width: 0.8, height: 0.8)
  @State private var anchor: CGPoint?
  var body: some View {
    NavigationStack {
      VStack(spacing: 20) {
        Text("在图片上拖动，框选需要插入的区域").font(.subheadline).foregroundStyle(.secondary)
        GeometryReader { proxy in
          let ratio = image.image.size.width / image.image.size.height
          let width = min(proxy.size.width, proxy.size.height * ratio)
          let height = width / ratio
          ZStack(alignment: .topLeading) {
            Image(uiImage: image.image).resizable().frame(width: width, height: height)
            Rectangle().fill(.black.opacity(0.08)).frame(width: width, height: height)
            Rectangle().stroke(.white, lineWidth: 2).background(.blue.opacity(0.12)).frame(
              width: selection.width * width, height: selection.height * height
            ).offset(x: selection.minX * width, y: selection.minY * height)
          }.frame(width: width, height: height).contentShape(Rectangle())
            .gesture(
              DragGesture(minimumDistance: 0).onChanged { value in
                let start =
                  anchor
                  ?? CGPoint(
                    x: max(0, min(1, value.startLocation.x / width)),
                    y: max(0, min(1, value.startLocation.y / height)))
                anchor = start
                let end = CGPoint(
                  x: max(0, min(1, value.location.x / width)),
                  y: max(0, min(1, value.location.y / height)))
                selection = CGRect(
                  x: min(start.x, end.x), y: min(start.y, end.y), width: abs(start.x - end.x),
                  height: abs(start.y - end.y))
              }.onEnded { _ in anchor = nil })
        }
      }.padding().navigationTitle("框选插图").navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
          ToolbarItem(placement: .confirmationAction) {
            Button("插入") {
              if let cg = image.image.cgImage {
                let rect = CGRect(
                  x: selection.minX * CGFloat(cg.width), y: selection.minY * CGFloat(cg.height),
                  width: selection.width * CGFloat(cg.width),
                  height: selection.height * CGFloat(cg.height)
                ).integral
                if let cropped = cg.cropping(to: rect),
                  let data = UIImage(cgImage: cropped).jpegData(compressionQuality: 0.9),
                  let result = try? NotebookImage(data: data)
                {
                  completed(result)
                  dismiss()
                }
              }
            }.disabled(selection.width < 0.01 || selection.height < 0.01)
          }
        }
    }
  }
}
