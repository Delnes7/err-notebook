import Charts
import SwiftUI

private enum TrendAssessment: String, CaseIterable {
  case attainment = "Attainment"
  case skills = "Course Skills"
  case final = "Final"

  init(_ exam: NotebookRecord) {
    let category = exam.text("category")
    if category.contains("skill") {
      self = .skills
    } else if exam.fields.flag("isFinal") || category.hasPrefix("final") {
      self = .final
    } else {
      self = .attainment
    }
  }

  var color: Color {
    switch self {
    case .attainment: Color(light: 0x1756a4, dark: 0x85bdff)
    case .skills: Color(light: 0xa94712, dark: 0xffb471)
    case .final: Color(light: 0x8d2975, dark: 0xf5a1dc)
    }
  }

  func marker(size: CGFloat) -> some View {
    let shape = TrendMarkerShape(assessment: self)
    return shape.fill(color)
      .overlay { shape.stroke(Color(uiColor: .systemBackground), lineWidth: 1.5) }
      .frame(width: size, height: size)
  }
}

private struct TrendMarkerShape: Shape {
  let assessment: TrendAssessment

  func path(in rect: CGRect) -> Path {
    switch assessment {
    case .attainment:
      return Circle().path(in: rect)
    case .skills:
      return Path { path in
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
      }
    case .final:
      return RoundedRectangle(cornerRadius: 1.5).path(in: rect.insetBy(dx: 1, dy: 1))
    }
  }
}

struct NativeScoreTrend: View {
  @EnvironmentObject private var store: NotebookStore
  @AppStorage("notebook_design", store: NotebookPreferences.defaults) private var design = "study"
  let records: [NotebookRecord]
  let subjectID: String
  @State private var visible = Set(TrendAssessment.allCases)
  @State private var selected: String?

  private var subject: NotebookRecord? { store.subject(subjectID) }
  private var tint: Color {
    subject.map { Color(subjectHex: $0.text("color")) }
      ?? (NotebookStyle(rawValue: design) ?? .study).tint
  }
  private var points: [NotebookRecord] {
    records.filter { record in
      let category = record.text("category")
      guard store.subject(record.text("subjectId")) != nil, !record.text("date").isEmpty,
        record.fields["percentage"] is NSNumber, !category.contains("behavior")
      else { return false }
      return visible.contains(TrendAssessment(record))
    }.sorted { ($0.text("date"), $0.id) < ($1.text("date"), $1.id) }
  }

  var body: some View {
    let points = points
    let shown = Set(points.map(TrendAssessment.init))
    let cncc = subject?.text("curriculum") == "CNCC"
    let excellent = cncc ? 94.5 : 89.5
    let good = cncc ? 89.5 : 79.5
    VStack(alignment: .leading, spacing: 12) {
      Menu {
        ForEach(TrendAssessment.allCases, id: \.self) { assessment in
          Toggle(
            assessment.rawValue,
            isOn: Binding(
              get: { visible.contains(assessment) },
              set: { if $0 { visible.insert(assessment) } else { visible.remove(assessment) } }
            ))
        }
      } label: {
        Label("考核项目", systemImage: "line.3.horizontal.decrease")
      }
      .accessibilityIdentifier("trend-assessment-filter")
      if points.isEmpty {
        Text("这些筛选条件下暂无成绩。").foregroundStyle(.secondary)
      } else {
        let ticks = stride(from: 0, to: points.count, by: max(1, (points.count + 3) / 4))
          .map { Double($0) }
        let scores = points.map { $0.fields.number("percentage") }
        let lowest = scores.min() ?? 0
        let baseline =
          lowest < 0
          ? floor(lowest / 10) * 10 : max(0, floor((min(lowest, 40) - 10) / 10) * 10)
        let scoreRange = baseline...max(100, scores.max() ?? 100)
        let indexedPoints = Array(points.enumerated())
        Chart {
          ForEach(indexedPoints, id: \.element.id) { index, exam in
            AreaMark(
              x: .value("测验", Double(index)), yStart: .value("基线", baseline),
              yEnd: .value("得分率", exam.fields.number("percentage"))
            )
            .interpolationMethod(.monotone)
            .foregroundStyle(
              LinearGradient(
                colors: [tint.opacity(0.13), tint.opacity(0.015)], startPoint: .top, endPoint: .bottom)
            )
          }
          RuleMark(y: .value("高分线", excellent)).foregroundStyle(.green.opacity(0.65))
            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
          RuleMark(y: .value("A 线", good)).foregroundStyle(.blue.opacity(0.6))
            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
          ForEach(indexedPoints, id: \.element.id) { index, exam in
            LineMark(
              x: .value("测验", Double(index)), y: .value("得分率", exam.fields.number("percentage"))
            )
              .interpolationMethod(.monotone).foregroundStyle(tint.opacity(0.62))
              .lineStyle(StrokeStyle(lineWidth: 2))
          }
          ForEach(indexedPoints, id: \.element.id) { index, exam in
            let score = exam.fields.number("percentage")
            let assessment = TrendAssessment(exam)
            PointMark(x: .value("测验", Double(index)), y: .value("得分率", score))
              .symbol { assessment.marker(size: selected == exam.id ? 15 : 10) }
              .accessibilityLabel(exam.text("title"))
              .accessibilityValue(
                "\(exam.text("categoryName", assessment.rawValue)) · \(score.formatted(.number.precision(.fractionLength(1))))%"
              )
          }
        }
        .chartXScale(domain: -0.25...max(0.25, Double(points.count - 1) + 0.25))
        .chartXAxis {
          AxisMarks(values: ticks) { value in
            if let position = value.as(Double.self), points.indices.contains(Int(position)) {
              AxisValueLabel(anchor: .top) {
                Text(points[Int(position)].text("date").suffix(5)).font(.caption2)
              }
            }
          }
        }
        .chartYAxis {
          AxisMarks(position: .leading) { value in
            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
            if let score = value.as(Double.self) {
              AxisValueLabel { Text("\(score.formatted())%").font(.caption2) }
            }
          }
        }
        .chartYScale(domain: scoreRange)
        .chartOverlay { proxy in
          GeometryReader { geometry in
            Rectangle().fill(.clear).contentShape(Rectangle()).gesture(
              SpatialTapGesture().onEnded { tap in
                let origin = geometry[proxy.plotAreaFrame].origin
                if let index: Double = proxy.value(atX: tap.location.x - origin.x),
                  points.indices.contains(Int(index.rounded()))
                {
                  selected = points[Int(index.rounded())].id
                }
              })
          }
        }
        .frame(height: 210).padding(.top, 12).accessibilityLabel("考试成绩趋势图")
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 12) { assessmentLegend(shown) }
          VStack(alignment: .leading, spacing: 6) { assessmentLegend(shown) }
        }.font(.caption)
        HStack(spacing: 16) {
          Label("\(cncc ? "A+" : "A*") \(excellent.formatted())%", systemImage: "line.horizontal.3")
            .foregroundStyle(.green)
          Label("A \(good.formatted())%", systemImage: "line.horizontal.3")
            .foregroundStyle(.blue)
        }.font(.caption)
        if let exam = points.first(where: { $0.id == selected }) {
          LabeledContent {
            Text(
              exam.fields.number("percentage").formatted(.number.precision(.fractionLength(1)))
                + "%"
            ).monospacedDigit()
          } label: {
            VStack(alignment: .leading, spacing: 3) {
              Text(exam.text("title"))
              Text(
                [exam.text("date"), exam.text("categoryName")].filter { !$0.isEmpty }
                  .joined(separator: " · "))
                .foregroundStyle(.secondary)
            }
          }.font(.caption)
        }
      }
    }.padding(.vertical, 6)
  }

  private func assessmentLegend(_ shown: Set<TrendAssessment>) -> some View {
    ForEach(TrendAssessment.allCases.filter { shown.contains($0) }, id: \.self) { assessment in
      HStack(spacing: 5) {
        assessment.marker(size: 10)
          .accessibilityHidden(true)
        Text(assessment.rawValue).foregroundStyle(.secondary)
          .accessibilityIdentifier("trend-legend-" + assessment.rawValue)
      }.fixedSize(horizontal: true, vertical: false)
    }
  }
}

private struct StudyChartValue: Identifiable {
  let id: String
  let label: String
  let value: Double
}

struct NativeGradeCharts: View {
  @EnvironmentObject private var store: NotebookStore
  let subjectID: String
  @AppStorage("notebook_design", store: NotebookPreferences.defaults) private var design = "study"
  @State private var chart = "categories"
  private var exams: [NotebookRecord] {
    store.exams.filter {
      store.subject($0.text("subjectId")) != nil
        && (subjectID.isEmpty || $0.text("subjectId") == subjectID)
    }
  }
  private var questions: [NotebookRecord] {
    store.questions.filter { subjectID.isEmpty || $0.text("subjectId") == subjectID }
  }
  private var categories: [StudyChartValue] {
    let groups = [
      ("attainment", "Attainment", ["attainment", "att_p1", "att_s1", "exams"]),
      ("skills", "Course Skills", ["skills"]),
      ("behavior", "Learning Behavior", ["behavior"]),
      ("final", "Final", ["final", "final_p1", "final_s1"]),
    ]
    return groups.compactMap { id, label, keys in
      let scores = exams.filter { keys.contains($0.text("category")) }
        .compactMap { ($0.fields["percentage"] as? NSNumber)?.doubleValue }
      guard !scores.isEmpty else { return nil }
      return StudyChartValue(
        id: id, label: label, value: scores.reduce(0, +) / Double(scores.count))
    }
  }
  private var unitCounts: [StudyChartValue] {
    let names = Dictionary(
      store.subjects.flatMap { $0.fields.rows("units") }.map { ($0.text("id"), $0.text("name")) },
      uniquingKeysWith: { first, _ in first })
    return Dictionary(grouping: questions, by: { $0.text("unitId") }).map { key, records in
      StudyChartValue(id: key, label: names[key] ?? "未指定单元", value: Double(records.count))
    }.sorted { $0.value > $1.value }
  }
  private var grades: [StudyChartValue] {
    let counts = Dictionary(grouping: exams, by: { $0.text("grade", "未定级") })
    return ["A+", "A*", "A", "A-", "B", "C", "D", "E", "F", "U", "未定级"].compactMap { grade in
      guard let records = counts[grade] else { return nil }
      return StudyChartValue(id: grade, label: grade, value: Double(records.count))
    }
  }
  private var radar: [StudyChartValue] {
    if !subjectID.isEmpty {
      return store.assessment(subjectID).rows("categories").compactMap { category in
        guard let score = category["score"] as? NSNumber else { return nil }
        return StudyChartValue(
          id: category.text("id"), label: category.text("name"), value: score.doubleValue)
      }
    }
    return store.assessments.compactMap { assessment in
      guard let value = assessment["overallScore"] as? NSNumber,
        let subject = assessment["subject"] as? Fields
      else { return nil }
      return StudyChartValue(
        id: subject.text("id"), label: subject.text("name"), value: value.doubleValue)
    }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Picker("图表类型", selection: $chart) {
        Text("考核对比").tag("categories")
        Text("单元错题").tag("units")
        Text("等级分布").tag("grades")
        Text("雷达概览").tag("radar")
      }.pickerStyle(.menu).accessibilityIdentifier("grade-chart-picker")
      switch chart {
      case "units": bars(unitCounts, suffix: "道", unit: "错题数")
      case "grades": bars(grades, suffix: "场", unit: "考试数")
      case "radar": radarView
      default: bars(categories, suffix: "%", unit: "得分率")
      }
    }
  }
  @ViewBuilder private func bars(_ values: [StudyChartValue], suffix: String, unit: String)
    -> some View
  {
    if values.isEmpty {
      Text("暂无可展示的数据").foregroundStyle(.secondary)
    } else {
      let maximum = max(suffix == "%" ? 100 : 1, values.map(\.value).max() ?? 1)
      VStack(alignment: .leading, spacing: 14) {
        ForEach(values) { entry in
          VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
              Text(entry.label).font(.subheadline).foregroundStyle(.primary)
              Spacer()
              Text(
                entry.value.formatted(.number.precision(.fractionLength(suffix == "%" ? 1 : 0)))
                  + suffix
              )
              .font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }
            GeometryReader { geometry in
              Capsule().fill(.quaternary).overlay(alignment: .leading) {
                Capsule().fill((NotebookStyle(rawValue: design) ?? .study).tint)
                  .frame(width: geometry.size.width * max(0, min(1, entry.value / maximum)))
              }
            }.frame(height: 7).accessibilityHidden(true)
          }.accessibilityElement(children: .combine)
        }
      }.accessibilityLabel("\(unit)统计")
    }
  }
  @ViewBuilder private var radarView: some View {
    if radar.count < 3 {
      bars(radar, suffix: "%", unit: "得分率")
    } else {
      GeometryReader { proxy in
        let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
        let radius = min(proxy.size.width, proxy.size.height) * 0.26
        let entries = radar
        ZStack {
          ForEach(1...4, id: \.self) { step in
            radarPath(entries.map { _ in Double(step) * 25 }, center: center, radius: radius)
              .stroke(.secondary.opacity(0.2), lineWidth: 1)
          }
          ForEach(entries.indices, id: \.self) { i in
            Path { path in
              path.move(to: center)
              path.addLine(
                to: point(
                  index: i, count: entries.count, value: 100, center: center, radius: radius))
            }.stroke(.secondary.opacity(0.2), lineWidth: 1)
            Text(entries[i].label).font(.caption2).multilineTextAlignment(.center).frame(
              width: min(90, proxy.size.width * 0.25)
            )
            .position(
              point(index: i, count: entries.count, value: 134, center: center, radius: radius))
          }
          radarPath(entries.map(\.value), center: center, radius: radius).fill(
            Color.accentColor.opacity(0.18))
          radarPath(entries.map(\.value), center: center, radius: radius).stroke(
            Color.accentColor, lineWidth: 2)
        }
      }.frame(height: 280).accessibilityElement(children: .ignore).accessibilityLabel("成绩雷达图")
        .accessibilityValue(
          radar.map { "\($0.label) \(String(format:"%.1f",$0.value))" }.joined(separator: "，"))
      Text("雷达刻度：0–100；具体成绩见下方。").font(.caption).foregroundStyle(.secondary)
      ForEach(radar) { entry in
        LabeledContent(entry.label, value: String(format: "%.1f", entry.value)).font(.caption)
      }
    }
  }
  private func point(index: Int, count: Int, value: Double, center: CGPoint, radius: Double)
    -> CGPoint
  {
    let angle = Double(index) * 2 * Double.pi / Double(count) - Double.pi / 2
    let scale = max(0, min(134, value)) / 100
    return CGPoint(
      x: center.x + cos(angle) * radius * scale, y: center.y + sin(angle) * radius * scale)
  }
  private func radarPath(_ values: [Double], center: CGPoint, radius: Double) -> Path {
    Path { path in
      for (i, value) in values.enumerated() {
        let p = point(
          index: i, count: values.count, value: min(100, value), center: center, radius: radius)
        if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
      }
      path.closeSubpath()
    }
  }
}
