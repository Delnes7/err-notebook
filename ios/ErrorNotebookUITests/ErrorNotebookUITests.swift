import XCTest

final class ErrorNotebookUITests: XCTestCase {
  private func tapAction(_ identifier: String, in app: XCUIApplication) {
    let action = app.buttons[identifier]
    if !action.exists {
      let more = app.buttons["OverflowBarButtonItem"]
      if more.exists { more.tap() }
    }
    XCTAssertTrue(action.waitForExistence(timeout: 5), app.debugDescription)
    action.tap()
  }
  private func selectTab(_ name: String, in app: XCUIApplication) {
    let tab = app.tabBars.buttons[name]
    if tab.exists {
      tab.tap()
      return
    }
    let button = app.buttons[name].firstMatch
    if button.exists {
      button.tap()
      return
    }
    let sidebar = app.buttons.matching(
      NSPredicate(format: "label CONTAINS[c] 'sidebar' OR label CONTAINS '边栏'")
    ).firstMatch
    if sidebar.exists { sidebar.tap() }
    XCTAssertTrue(button.waitForExistence(timeout: 5), app.debugDescription)
    button.tap()
  }
  func testNativeJSONBackupShareSheet() {
    let app = XCUIApplication()
    app.launchArguments = ["--native-ui-test"]
    app.launch()
    XCTAssertTrue(app.staticTexts["question-list-heading"].waitForExistence(timeout: 30))
    selectTab("设置", in: app)
    let button = app.buttons["export-backup"]
    for _ in 0..<12 where !button.isHittable { app.swipeUp() }
    XCTAssertTrue(button.isHittable)
    button.tap()
    XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 10))
  }
  func testNativeServiceContract() {
    let app = XCUIApplication()
    app.launchArguments = ["--native-ui-test", "--native-contract-test"]
    app.launch()
    let status = app.staticTexts["native-contract-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 30))
    expectation(
      for: NSPredicate(format: "label BEGINSWITH 'PASS' OR label BEGINSWITH 'FAIL'"),
      evaluatedWith: status)
    waitForExpectations(timeout: 60)
    XCTAssertFalse(status.label.contains("FAIL"), status.label)
  }
  func testEditorCancelExpandsOnlyAfterChanges() {
    let app = XCUIApplication()
    app.launchArguments = ["--native-ui-test"]
    app.launch()
    let title = app.textFields["question-title"]
    let questionListHeading = app.staticTexts["question-list-heading"]
    XCTAssertTrue(questionListHeading.waitForExistence(timeout: 30))
    func openEditor() {
      tapAction("add-question", in: app)
      if !title.waitForExistence(timeout: 2), app.buttons["add-question"].isHittable {
        tapAction("add-question", in: app)
      }
      XCTAssertTrue(title.waitForExistence(timeout: 10), app.debugDescription)
    }
    openEditor()
    app.buttons["cancel-editor"].tap()
    XCTAssertTrue(questionListHeading.waitForExistence(timeout: 10))
    openEditor()
    title.tap()
    title.typeText("Unsaved exercise")
    app.buttons["cancel-editor"].tap()
    XCTAssertTrue(app.staticTexts["discard-editor-prompt"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.alerts.count, 0)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.lifetime = .keepAlways
    add(attachment)
    app.buttons["继续编辑"].tap()
    XCTAssertEqual(title.value as? String, "Unsaved exercise")
    app.buttons["cancel-editor"].tap()
    app.buttons["放弃修改"].tap()
    XCTAssertTrue(app.staticTexts["question-list-heading"].waitForExistence(timeout: 10))
  }
  func testNativeQuestionAndPDF() {
    let app = XCUIApplication()
    app.launchArguments = ["--native-ui-test"]
    app.launch()
    XCTAssertTrue(app.staticTexts["question-list-heading"].waitForExistence(timeout: 30))
    XCTAssertEqual(app.webViews.count, 0, "Main screen must use SwiftUI")
    tapAction("add-question", in: app)
    let title = app.textFields["question-title"]
    XCTAssertTrue(title.waitForExistence(timeout: 10))
    title.tap()
    title.typeText("Native regression question")
    let content = app.textViews["question-content"]
    for _ in 0..<5 where !content.isHittable { app.swipeUp() }
    content.tap()
    content.typeText("Find the derivative of $x^2$.")
    app.buttons["save-question"].tap()
    let row = app.staticTexts["Native regression question"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    row.tap()
    XCTAssertTrue(app.buttons["edit-question"].waitForExistence(timeout: 10))
    let selectForPaper = app.buttons["加入练习"].firstMatch
    for _ in 0..<5 where !selectForPaper.isHittable { app.swipeUp() }
    selectForPaper.tap()
    selectTab("组卷", in: app)
    let share = app.buttons["share-paper"]
    for _ in 0..<12 where !share.isHittable { app.swipeUp() }
    XCTAssertTrue(share.isHittable)
    share.tap()
    XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 20))
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  func testNativeAppearanceAndGrades() {
    let app = XCUIApplication()
    app.launchArguments = ["--native-ui-test"]
    app.launch()
    XCTAssertTrue(app.staticTexts["question-list-heading"].waitForExistence(timeout: 30))
    selectTab("设置", in: app)
    app.buttons["style-studio"].tap()
    app.terminate()
    app.launch()
    XCTAssertTrue(app.staticTexts["question-list-heading"].waitForExistence(timeout: 30))
    selectTab("设置", in: app)
    XCTAssertTrue(app.buttons["style-studio"].exists)
    app.buttons["style-study"].tap()
    for name in ["深浅色", "题目字号"] {
      let choice = app.buttons["display-" + name]
      XCTAssertTrue(choice.waitForExistence(timeout: 5))
      XCTAssertLessThan(choice.frame.height, 66)
    }
    let settingsScreenshot = XCTAttachment(screenshot: app.screenshot())
    settingsScreenshot.name = "Compact display settings"
    settingsScreenshot.lifetime = .keepAlways
    add(settingsScreenshot)
    selectTab("成绩", in: app)
    func addExam(_ name: String, category: String? = nil, score: String, total: String? = nil) {
      tapAction("add-exam", in: app)
      let title = app.textFields["exam-title"]
      XCTAssertTrue(title.waitForExistence(timeout: 10))
      if let category {
        app.buttons["exam-category"].tap()
        app.buttons[category].tap()
      }
      title.tap()
      title.typeText(name)
      let rawScore = app.textFields["exam-score"]
      rawScore.tap()
      rawScore.typeText(score)
      if let total {
        let fullScore = app.textFields["exam-max"]
        fullScore.tap()
        if let value = fullScore.value as? String {
          fullScore.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count))
        }
        fullScore.typeText(total)
      }
      app.buttons["save-record"].tap()
      XCTAssertTrue(
        app.navigationBars["成绩"].waitForExistence(timeout: 5)
      )
    }
    addExam("Native grade test", score: "42", total: "50")
    addExam("Native skills test", category: "Course Skills", score: "92")
    addExam("Native final test", category: "Final P1", score: "88")
    let saved = app.staticTexts["Native grade test"]
    for _ in 0..<10 where !saved.isHittable { app.swipeUp() }
    XCTAssertTrue(saved.exists)
    let charts = app.buttons["更多成绩图表"]
    if charts.isHittable {
      charts.tap()
      XCTAssertTrue(app.buttons["grade-chart-picker"].waitForExistence(timeout: 5))
      let chartScreenshot = XCTAttachment(screenshot: app.screenshot())
      chartScreenshot.name = "Native score charts"
      chartScreenshot.lifetime = .keepAlways
      add(chartScreenshot)
    }
    let mathHistory = app.buttons["grade-subject-sub-al-math"]
    for _ in 0..<10 where !mathHistory.isHittable { app.swipeDown() }
    XCTAssertTrue(mathHistory.isHittable)
    mathHistory.tap()
    let filter = app.buttons["trend-assessment-filter"]
    XCTAssertTrue(filter.waitForExistence(timeout: 5))
    for category in ["Attainment", "Course Skills", "Final"] {
      XCTAssertTrue(app.staticTexts["trend-legend-" + category].exists)
    }
    let markerScreenshot = XCTAttachment(screenshot: app.screenshot())
    markerScreenshot.name = "Assessment markers"
    markerScreenshot.lifetime = .keepAlways
    add(markerScreenshot)
    filter.tap()
    XCTAssertTrue(app.buttons["Final"].waitForExistence(timeout: 5))
    app.buttons["Final"].tap()
    XCTAssertFalse(app.staticTexts["trend-legend-Final"].exists)
    for _ in 0..<5 where !saved.isHittable { app.swipeUp() }
    XCTAssertTrue(saved.exists)
    XCTAssertFalse(app.buttons["保存权重"].exists)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.lifetime = .keepAlways
    add(attachment)
    saved.tap()
    XCTAssertTrue(app.staticTexts["exam-question-count"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["本场考试还没有错题"].exists)
    XCTAssertFalse(app.textFields["exam-title"].exists)
    app.buttons["edit-exam"].tap()
    XCTAssertTrue(app.textFields["exam-title"].waitForExistence(timeout: 5))
    app.buttons["cancel-editor"].tap()
    selectTab("学科", in: app)
    app.buttons["manage-subject-sub-al-math"].tap()
    app.buttons["subject-assessment"].tap()
    XCTAssertTrue(app.buttons["保存权重"].waitForExistence(timeout: 5))
  }

  func testOfflineSharedFeatures() {
    let app = XCUIApplication()
    app.launchArguments = ["--self-test"]
    app.launch()
    let result = app.staticTexts["self-test-status"]
    XCTAssertTrue(result.waitForExistence(timeout: 30))
    let passed = NSPredicate(format: "label BEGINSWITH 'PASS'")
    expectation(for: passed, evaluatedWith: result)
    waitForExpectations(timeout: 60)
    app.webViews.buttons["分享 PDF"].tap()
    let shareSheet = app.otherElements["ActivityListView"]
    if !shareSheet.waitForExistence(timeout: 10) {
      print(app.debugDescription)
      XCTFail("Native share sheet did not appear")
    }
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.lifetime = .keepAlways
    add(attachment)
  }
  func testPersistenceAcrossRelaunch() throws {
    if #unavailable(iOS 17.0) {
      throw XCTSkip("Independent persistent test stores require iOS 17+")
    }
    let app = XCUIApplication()
    for mode in ["write", "read"] {
      app.launchArguments = ["--self-test", "--persistence-" + mode]
      app.launch()
      let status = app.staticTexts["self-test-status"]
      XCTAssertTrue(status.waitForExistence(timeout: 30))
      expectation(
        for: NSPredicate(format: "label == %@", "PASS persistence " + mode), evaluatedWith: status)
      waitForExpectations(timeout: 30)
      app.terminate()
    }
  }

  func testJSONBackupShareSheet() {
    let app = XCUIApplication()
    app.launchArguments = ["--self-test"]
    app.launch()
    let result = app.staticTexts["self-test-status"]
    XCTAssertTrue(result.waitForExistence(timeout: 30))
    expectation(for: NSPredicate(format: "label BEGINSWITH 'PASS'"), evaluatedWith: result)
    waitForExpectations(timeout: 60)
    app.webViews.buttons.matching(
      NSPredicate(format: "label CONTAINS '备份' AND NOT label CONTAINS '导出'")
    ).firstMatch.tap()
    let export = app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS '导出全量 JSON 备份'"))
      .firstMatch
    for _ in 0..<8 where !export.isHittable { app.swipeUp() }
    export.tap()
    XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 10))
  }

}
