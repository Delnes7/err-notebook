import Charts
import SwiftUI

struct RecordEditorRequest: Identifiable {
  let id = UUID()
  var type: String
  var record: Fields
}
struct NativeGradesView: View {
  @EnvironmentObject private var store: NotebookStore
  var subjectID: String? = nil
  @State private var subject = ""
  private var activeSubject: String { subjectID ?? subject }
  @State private var category = ""
  @State private var editor: RecordEditorRequest?
  @State private var delete: NotebookRecord?
  private var records: [NotebookRecord] {
    store.exams.filter {
      (activeSubject.isEmpty || $0.text("subjectId") == activeSubject)
        && (category.isEmpty || $0.text("category") == category)
    }.sorted { $0.text("date") > $1.text("date") }
  }
  private var categories: [Fields] { store.assessment(activeSubject).rows("config") }
  var body: some View {
    List {
      if subjectID == nil {
        Section {
          ForEach(store.subjects.filter { subject.isEmpty || $0.id == subject }) { sub in
            NavigationLink {
              NativeGradesView(subjectID: sub.id)
            } label: {
              HStack {
                VStack(alignment: .leading, spacing: 5) {
                  SubjectName(subject: sub).font(.headline).fontWeight(.medium)
                  Text(sub.text("curriculum")).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                let result = store.assessment(sub.id)
                if let score = result["overallScore"] as? NSNumber {
                  Text(score.doubleValue, format: .number.precision(.fractionLength(1))).font(
                    .title2
                  )
                  .monospacedDigit()
                }
                Text(result.text("grade", "—")).font(.subheadline).foregroundStyle(.secondary)
              }.padding(.vertical, 7)
            }
            .accessibilityIdentifier("grade-subject-\(sub.id)")
          }
        } header: { NotebookSectionHeader("加权成绩") }
      }
      if subjectID != nil || !records.isEmpty {
        Section {
          NativeScoreTrend(records: records, subjectID: activeSubject)
        } header: { NotebookSectionHeader("成绩趋势 · 百分制") }
        Section { DisclosureGroup("更多成绩图表") { NativeGradeCharts(subjectID: activeSubject) } }
      }
      Section {
        if records.isEmpty {
          EmptyNotebook(
            title: "还没有考试记录", symbol: "chart.bar", message: "添加原始分数或 Curve 后成绩，自动计算等级和加权成绩。")
        }
        ForEach(records) { exam in
          Button {
            editor = RecordEditorRequest(type: "exam", record: exam.fields)
          } label: {
            HStack {
              VStack(alignment: .leading, spacing: 6) {
                Text(exam.text("title")).foregroundStyle(.primary)
                if subjectID == nil, let subject = store.subject(exam.text("subjectId")) {
                  SubjectName(subject: subject).font(.caption).foregroundStyle(.secondary)
                } else if store.subject(exam.text("subjectId")) == nil {
                  Text("待指定学科").font(.caption).foregroundStyle(.secondary)
                }
                Text(
                  [exam.text("date"), exam.text("categoryName")].filter { !$0.isEmpty }.joined(
                    separator: " · ")
                )
                .font(.caption).foregroundStyle(.secondary)
              }
              Spacer()
              VStack(alignment: .trailing) {
                Text(
                  exam.fields.number("percentage"), format: .number.precision(.fractionLength(1))
                ).monospacedDigit()
                Text(exam.text("grade") + (exam.fields.flag("isCurved") ? " · Curve" : "")).font(
                  .caption
                ).foregroundStyle(.secondary)
              }
            }.padding(.vertical, 6).contentShape(Rectangle())
          }.buttonStyle(.plain).swipeActions { Button("删除", role: .destructive) { delete = exam } }
        }
      } header: { NotebookSectionHeader("考试记录 · \(records.count) 场") }
    }.notebookSurface()
      .navigationTitle(subjectID.flatMap { store.subject($0)?.text("name") } ?? "成绩")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Menu {
            if subjectID == nil {
              Picker("学科", selection: $subject) {
                Text("全部学科").tag("")
                ForEach(store.subjects) { SubjectName(subject: $0).tag($0.id) }
              }
            }
            Picker("考核项目", selection: $category) {
              Text("全部项目").tag("")
              ForEach(categories.map { NotebookRecord(fields: $0) }) {
                Text($0.text("name")).tag($0.id)
              }
            }
          } label: {
            Label("筛选", systemImage: "line.3.horizontal.decrease")
          }
        }
        ToolbarItem(placement: .primaryAction) {
          Button {
            editor = RecordEditorRequest(
              type: "exam",
              record: [
                "subjectId": activeSubject.isEmpty ? store.subjects.first?.id ?? "" : activeSubject
              ])
          } label: {
            Label("添加成绩", systemImage: "plus")
          }.accessibilityIdentifier("add-exam")
        }
      }.onChange(of: subject) { _ in
        category = ""
      }
      .sheet(item: $editor) { NativeRecordEditor(type: $0.type, initial: $0.record) }
      .confirmationDialog(
        "删除这条成绩？", isPresented: Binding(get: { delete != nil }, set: { if !$0 { delete = nil } }),
        titleVisibility: .visible
      ) {
        Button("删除成绩", role: .destructive) {
          if let delete {
            Task { await store.perform("delete", ["type": "exam", "id": delete.id]) }
          }
          delete = nil
        }
      } message: {
        if !(delete?.fields.strings("legacyExamIds") ?? []).isEmpty {
          Text("这场考试已合并旧版本的重复记录，删除时会一并移除。")
        }
      }
  }

}

struct NativeAssessmentView: View {
  @EnvironmentObject private var store: NotebookStore
  let subjectID: String
  @State private var config: Fields = [:]
  @State private var ready = false
  @State private var error: String?
  @State private var saved = false
  private var result: Fields { store.assessment(subjectID) }
  var body: some View {
    Form {
      Section(notebookTitle: "当前加权成绩") {
        LabeledContent(
          "得分率",
          value: result["overallScore"] is NSNull
            ? "暂无" : String(format: "%.1f", result.number("overallScore")))
        LabeledContent("等级", value: result.text("grade"))
        Text("已录入项目按有效权重折算；A Level 数学 P1 / S1 合并规则与网页端保持一致。").font(.caption).foregroundStyle(
          .secondary)
      }
      ForEach(config.rows("categories").indices, id: \.self) { i in
        Section(notebookTitle: "考核项目 \(i+1)") {
          NotebookTextField("项目名称", text: $config.row("categories", i).text("name"))
          NotebookTextField("权重 %", text: $config.row("categories", i).text("weight")).keyboardType(
            .decimalPad)
          NotebookTextField("默认分数（可留空）", text: $config.row("categories", i).text("defaultScore"))
            .keyboardType(.decimalPad)
          let catID = config.rows("categories")[i].text("id")
          let evaluated = result.rows("categories").first { $0.text("id") == catID }
          Text(
            "\(evaluated?.text("count") ?? "0") 条成绩 · 当前均分 \(evaluated?.text("score","—") ?? "—")"
          ).font(.caption).foregroundStyle(.secondary)
          NotebookTextField("手动覆盖分数（留空恢复自动）", text: overrideBinding(catID)).keyboardType(.decimalPad)
          Button("删除考核项目", role: .destructive) {
            var cats = config.rows("categories")
            cats.remove(at: i)
            config["categories"] = cats
          }
        }
      }
      Section {
        Button("添加考核项目") {
          var cats = config.rows("categories")
          cats.append(["id": UUID().uuidString, "name": "新项目", "weight": 0])
          config["categories"] = cats
        }
        LabeledContent(
          "权重合计",
          value: String(
            format: "%.1f%%", config.rows("categories").reduce(0) { $0 + $1.number("weight") }))
        if saved { Text("配置已保存").foregroundStyle(.secondary) }
      }
      Section(notebookTitle: "单元诊断") {
        ForEach(
          (store.subject(subjectID)?.fields.rows("units") ?? []).map { NotebookRecord(fields: $0) }
        ) { unit in
          let questions = store.questions.filter {
            $0.text("subjectId") == subjectID && $0.text("unitId") == unit.id
          }
          let exams = store.exams.filter {
            $0.text("subjectId") == subjectID
              && ($0.fields.strings("unitIds").contains(unit.id) || $0.text("unitId") == unit.id)
          }
          VStack(alignment: .leading, spacing: 8) {
            Text(unit.text("name"))
            Text(
              "\(questions.count) 道错题 · \(exams.count) 场考试"
            ).font(.caption).foregroundStyle(.secondary)
            Button("生成本单元练习") {
              store.selected = Set(questions.map(\.id))
              store.requestedTab = .practice
            }.disabled(questions.isEmpty)
          }
        }
      }
      Section(notebookTitle: "等级标准") {
        Text(
          (store.subject(subjectID)?.text("curriculum") == "CNCC"
            ? "A+ ≥ 94.5；A ≥ 89.5；A− ≥ 84.5；B ≥ 79.5；C ≥ 69.5；D ≥ 59.5；其余 F"
            : "A* ≥ 89.5；A ≥ 79.5；B ≥ 69.5；C ≥ 59.5；D ≥ 49.5；E ≥ 40；其余 U")
        ).font(.footnote)
      }
    }.notebookSurface().navigationTitle(store.subject(subjectID)?.text("name") ?? "学科成绩")
      .navigationBarTitleDisplayMode(.inline)
      .task {
        config = [
          "categories": result.rows("config"),
          "scores": (store.snapshot["categoryScores"] as? Fields)?[subjectID] as? Fields ?? [:],
        ]
        ready = true
      }
      .toolbar {
        Button("保存权重") {
          Task {
            let cats = config.rows("categories").map { row -> Fields in
              var c = row
              c["weight"] = row.number("weight")
              if row.text("defaultScore").isEmpty {
                c.removeValue(forKey: "defaultScore")
              } else {
                c["defaultScore"] = row.number("defaultScore")
              }
              return c
            }
            if await store.perform(
              "assessment",
              ["id": subjectID, "categories": cats, "scores": config["scores"] ?? [:]])
            {
              saved = true
            } else {
              error = store.error
              store.error = nil
            }
          }
        }.disabled(!ready || store.busy)
      }
      .alert("配置未保存", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } }))
    {
      Button("好") {}
    } message: {
      Text(error ?? "")
    }
  }
  private func overrideBinding(_ id: String) -> Binding<String> {
    Binding(
      get: { (config["scores"] as? Fields)?.text(id) ?? "" },
      set: {
        var scores = config["scores"] as? Fields ?? [:]
        if $0.isEmpty { scores.removeValue(forKey: id) } else { scores[id] = $0 }
        config["scores"] = scores
      })
  }
}

struct NativeSubjectsView: View {
  @EnvironmentObject private var store: NotebookStore
  @State private var editor: RecordEditorRequest?
  @State private var delete: NotebookRecord?
  var body: some View {
    List {
      ForEach(store.subjects) { subject in
        NavigationLink {
          List {
            Button("编辑学科与单元") {
              editor = RecordEditorRequest(
                type: "subject", record: (store.subject(subject.id) ?? subject).fields)
            }
            NavigationLink("考核项目与权重") { NativeAssessmentView(subjectID: subject.id) }
              .accessibilityIdentifier("subject-assessment")
          }.notebookSurface().navigationTitle(subject.text("name"))
        } label: {
          HStack {
            VStack(alignment: .leading, spacing: 8) {
              SubjectName(subject: subject).font(.headline).fontWeight(.medium)
              Text("\(subject.text("curriculum")) · \(subject.fields.rows("units").count) 个单元")
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
          }.padding(.vertical, 8)
        }
        .accessibilityIdentifier("manage-subject-\(subject.id)")
        .swipeActions { Button("删除", role: .destructive) { delete = subject } }
      }
      if store.subjects.isEmpty {
        EmptyNotebook(title: "添加你的第一门学科", symbol: "square.grid.2x2", message: "设置课程体系、单元与默认总分。")
      }
    }.notebookSurface().navigationTitle("学科与单元")
      .toolbar {
        Button {
          editor = RecordEditorRequest(type: "subject", record: [:])
        } label: {
          Label("添加学科", systemImage: "plus")
        }.accessibilityIdentifier("add-subject")
      }
      .sheet(item: $editor) { NativeRecordEditor(type: $0.type, initial: $0.record) }
      .confirmationDialog(
        "删除学科？已有错题与考试会保留。",
        isPresented: Binding(get: { delete != nil }, set: { if !$0 { delete = nil } }),
        titleVisibility: .visible
      ) {
        Button("删除学科", role: .destructive) {
          if let delete {
            Task { await store.perform("delete", ["type": "subject", "id": delete.id]) }
          }
          delete = nil
        }
      }
  }
}

struct NativeRecordEditor: View {
  @EnvironmentObject private var store: NotebookStore
  @Environment(\.dismiss) private var dismiss
  let type: String
  let initial: Fields
  @State private var record: Fields = [:]
  @State private var error: String?
  @State private var originalRecord: Fields?
  var body: some View {
    NavigationStack {
      Form {
        if type == "subject" {
          Section(notebookTitle: "学科信息") {
            NotebookTextField("学科名称", text: $record.text("name"), identifier: "subject-name")
            Picker("课程体系", selection: $record.text("curriculum")) {
              Text("A Level").tag("A Level")
              Text("CNCC").tag("CNCC")
            }
            NotebookTextField("课程代码", text: $record.text("code"))
            NotebookTextField("默认考试总分", text: $record.text("defaultMaxScore")).keyboardType(.decimalPad)
            ColorPicker(
              "学科颜色",
              selection: Binding(
                get: { Color(subjectHex: record.text("color", "#35624c")) },
                set: { if let hex = $0.subjectHex { record["color"] = hex } }
              ), supportsOpacity: false)
          }
          Section(notebookTitle: "单元") {
            ForEach(record.rows("units").indices, id: \.self) { i in
              NotebookTextField("单元名称", text: $record.row("units", i).text("name"))
            }.onDelete { indexes in
              var rows = record.rows("units")
              rows.remove(atOffsets: indexes)
              record["units"] = rows
            }
            Button("添加单元") {
              var rows = record.rows("units")
              rows.append(["id": UUID().uuidString, "name": "新单元"])
              record["units"] = rows
            }
          }
        } else {
          Section(notebookTitle: "考试信息") {
            NotebookTextField("考试名称", text: $record.text("title"), identifier: "exam-title")
            Picker("学科", selection: examSubject) {
              if record.text("subjectId").isEmpty { Text("请选择学科").tag("") }
              ForEach(store.subjects) { SubjectName(subject: $0).tag($0.id) }
            }
            Picker("考核项目", selection: $record.text("category")) {
              let choices = store.assessment(record.text("subjectId")).rows("config").map {
                NotebookRecord(fields: $0)
              }
              if !choices.contains(where: { $0.id == record.text("category") }) {
                Text(record.text("categoryName", "请选择考核项目")).tag(record.text("category"))
              }
              ForEach(choices) { Text($0.text("name")).tag($0.id) }
            }.accessibilityIdentifier("exam-category")
            DatePicker(
              "日期",
              selection: Binding(
                get: {
                  ISO8601DateFormatter().date(from: record.text("date") + "T12:00:00Z") ?? Date()
                },
                set: { record["date"] = String(ISO8601DateFormatter().string(from: $0).prefix(10)) }
              ), displayedComponents: .date)
          }
          Section(notebookTitle: "分数") {
            NotebookTextField("原始得分", text: $record.text("score"), identifier: "exam-score")
              .keyboardType(.decimalPad)
            NotebookTextField("考试总分", text: $record.text("maxScore"), identifier: "exam-max")
              .keyboardType(.decimalPad)
            NotebookTextField("Curve 后百分制成绩（可留空）", text: $record.text("curvedScore")).keyboardType(
              .decimalPad)
          }
          Section(notebookTitle: "涉及单元 · 可多选") {
            ForEach(
              (store.subject(record.text("subjectId"))?.fields.rows("units") ?? []).map {
                NotebookRecord(fields: $0)
              }
            ) { unit in Toggle(unit.text("name"), isOn: $record.toggleString("unitIds", unit.id)) }
          }
          Section(notebookTitle: "备注") { NotebookTextField("考试备注", text: $record.text("note"), axis: .vertical) }
        }
      }.notebookSurface().navigationTitle(type == "subject" ? "编辑学科" : "编辑成绩")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            EditorCancelButton(
              hasChanges: {
                guard let originalRecord else { return false }
                return !NSDictionary(dictionary: record).isEqual(to: originalRecord)
              }, dismiss: { dismiss() }
            )
            .disabled(store.busy)
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("保存") {
              Task {
                if await store.perform(
                  type == "subject" ? "saveSubject" : "saveExam", ["record": record])
                {
                  dismiss()
                } else {
                  error = store.error
                  store.error = nil
                }
              }
            }.disabled(store.busy).accessibilityIdentifier("save-record")
          }
        }.task {
          if type == "subject" {
            record = [
              "id": UUID().uuidString, "name": "", "curriculum": "A Level", "defaultMaxScore": 100,
              "color": "#35624c", "units": [], "order": store.subjects.count,
            ]
          } else {
            let sub =
              initial.text("subjectId").isEmpty
              ? store.subjects.first?.id ?? "" : initial.text("subjectId")
            record = [
              "id": UUID().uuidString, "subjectId": sub,
              "category": store.assessment(sub).rows("config").first?.text("id") ?? "attainment",
              "title": "", "date": String(ISO8601DateFormatter().string(from: Date()).prefix(10)),
              "score": "", "maxScore": store.subject(sub)?.fields.number("defaultMaxScore") ?? 100,
              "curvedScore": "", "unitIds": [],
            ]
          }
          initial.forEach { record[$0.key] = $0.value }
          if record["curvedScore"] is NSNull { record["curvedScore"] = "" }
          if type == "exam", !store.subjects.contains(where: { $0.id == record.text("subjectId") })
          {
            record["subjectId"] = ""
          }
          originalRecord = record
        }
        .interactiveDismissDisabled(true)
        .alert("保存失败", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } }))
      {
        Button("好") {}
      } message: {
        Text(error ?? "")
      }
    }
  }

  private var examSubject: Binding<String> {
    Binding(
      get: { record.text("subjectId") },
      set: { subjectID in
        guard subjectID != record.text("subjectId") else { return }
        record["subjectId"] = subjectID
        record["category"] =
          store.assessment(subjectID).rows("config").first?.text("id") ?? "attainment"
        record["unitIds"] = []
      })
  }
}
