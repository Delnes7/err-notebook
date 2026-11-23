import XCTest

final class ErrorNotebookUITests: XCTestCase {
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
        if #unavailable(iOS 17.0) { throw XCTSkip("Independent persistent test stores require iOS 17+") }
        let app = XCUIApplication()
        for mode in ["write", "read"] {
            app.launchArguments = ["--self-test", "--persistence-" + mode]
            app.launch()
            let status = app.staticTexts["self-test-status"]
            XCTAssertTrue(status.waitForExistence(timeout: 30))
            expectation(for: NSPredicate(format: "label == %@", "PASS persistence " + mode), evaluatedWith: status)
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
        app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS '⚙️' AND label CONTAINS '备份'")).firstMatch.tap()
        let export = app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS '导出全量 JSON 备份'")).firstMatch
        for _ in 0..<8 where !export.isHittable { app.swipeUp() }
        export.tap()
        XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 10))
    }

}
