import XCTest
import WebKit
@testable import ReadingRoom

@MainActor
final class ReadingRoomTests: XCTestCase {
    private var web: WKWebView {
        let navigation = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first(where: { $0.isKeyWindow })!.rootViewController as! UINavigationController
        return (navigation.viewControllers.first as! ReadingViewController).webView
    }
    private func js(_ source: String) async throws -> Any? {
        try await web.evaluateJavaScript(source)
    }
    private func ready() async throws {
        for _ in 0..<100 {
            if (try? await js("!!document.querySelector('.nav-item')")) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let body = try await js("document.body.innerText")
        XCTFail("Bundled app did not load: \(body ?? "")")
        throw Connection.Failure.message("App did not load")
    }
    private func route(_ hash: String) async throws {
        _ = try await js("location.hash='\(hash)'")
        try await Task.sleep(nanoseconds: 250_000_000)
    }
    func testOriginAndCredentialBoundary() throws {
        XCTAssertNotNil(Connection.origin("https://reading.example/"))
        for bad in ["http://reading.example", "https://user:password@reading.example", "https://reading.example/path", "https://reading.example?code=secret", "https://reading.example:444", "https://reading.example/#fragment"] {
            XCTAssertNil(Connection.origin(bad))
        }
        let origin = Connection.origin("https://reading.example")!
        let code = String(repeating: "a", count: 32)
        let request = try Connection.request(origin: origin, message: ["code": code, "path": "/api/sync?since=-1", "method": "GET"])
        XCTAssertEqual(request.url?.absoluteString, "https://reading.example/api/sync?since=-1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer " + code)
        for path in ["//evil.example/api/sync", "/api/sync?code=secret", "/api/sync/other"] {
            XCTAssertThrowsError(try Connection.request(origin: origin, message: ["code": code, "path": path, "method": "GET"]))
        }
    }
    func testOfflineReadingUIAndPersistentMixedProgress() async throws {
        UserDefaults.standard.removeObject(forKey: Connection.key)
        try await ready()
        // Use the real bundled core, localStorage, IndexedDB and content loader in WKWebView.
        let fixture = try await web.callAsyncJavaScript("""
            const c=await import('/core.js');
            const qs=await (await fetch('/bank/index.json')).json();
            const s=c.migrate(JSON.parse(localStorage.getItem('reading-room-v1')))||c.fresh();
            for(const section of ['rw','math']) {
                const q=qs.find(q=>q.s===section&&q.t==='mcq');
                const o={section,domain:q.d,skill:'All',difficulty:'All',mode:'all'};
                const k=c.sessionKey(o);
                s.sessions[k]=c.makeSession([q.id],o,qs,s.pace);
                s.sessions[k].choice=q.a;
                c.recordAnswer(s,k,qs);
                s.bookmarks.push(q.id);
                s.lastSession=k;
            }
            localStorage.removeItem('reading-room-sync');
            localStorage.setItem('reading-room-v1',JSON.stringify(s));
            window.dispatchEvent(new StorageEvent('storage',{key:'reading-room-v1',newValue:JSON.stringify(s)}));
            const storage=await import('/storage.js');
            await storage.idbPut('latest',JSON.stringify(s));
            return s.attempts.length;
            """, arguments: [:], in: nil, contentWorld: .page)
        let baseline = try XCTUnwrap(fixture as? Int)
        XCTAssertGreaterThanOrEqual(baseline, 2)
        web.reload()
        try await Task.sleep(nanoseconds: 300_000_000)
        try await ready()
        for hash in ["home", "history", "review", "settings", "math", "math/algebra", "practice"] {
            try await route(hash)
            let text = try await js("document.body.innerText") as? String ?? ""
            XCTAssertFalse(text.contains("Math"), "Math leaked on \(hash)")
            XCTAssertFalse(text.contains("Desmos"))
        }
        let stored = try await js("JSON.parse(localStorage.getItem('reading-room-v1')).attempts.length")
        XCTAssertEqual(stored as? Int, baseline, "Hidden Math answer must survive iPad save/reload")
        let mirrorCount = try await web.callAsyncJavaScript("const s=await import('/storage.js');return JSON.parse(await s.idbGet('latest')).attempts.length", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(mirrorCount as? Int, baseline)
        try await route("rw/information-and-ideas")
        _ = try await js("document.querySelector('[data-start]').click()")
        try await Task.sleep(nanoseconds: 500_000_000)
        _ = try await js("document.querySelector('[data-action=next]')?.click()")
        try await Task.sleep(nanoseconds: 400_000_000)
        let hasChoices = try await js("!!document.querySelector('[data-choice]')") as? Bool
        XCTAssertEqual(hasChoices, true)
        let imagesOK = try await js("[...document.querySelectorAll('.question-image')].every(i=>i.complete&&i.naturalWidth>0)") as? Bool
        XCTAssertEqual(imagesOK, true, "Original question images must render offline")
        _ = try await js("document.querySelector('[data-choice]').click();document.querySelector('[data-action=check]').click()")
        let hasExplanation = try await js("!!document.querySelector('.explanation')") as? Bool
        XCTAssertEqual(hasExplanation, true)
        let count = try await js("JSON.parse(localStorage.getItem('reading-room-v1')).attempts.length") as? Int
        XCTAssertEqual(count, baseline + 1)
        web.reload()
        try await Task.sleep(nanoseconds: 300_000_000)
        try await ready()
        let reloadedCount = try await js("JSON.parse(localStorage.getItem('reading-room-v1')).attempts.length") as? Int
        XCTAssertEqual(reloadedCount, baseline + 1)
        try await route("settings")
        _ = try await js("document.querySelector('[data-action=sync-new]').click()")
        try await Task.sleep(nanoseconds: 200_000_000)
        let codeLength = try await js("localStorage.getItem('reading-room-sync').length") as? Int
        XCTAssertEqual(codeLength, 32)
        let missingAddress = try await js("document.querySelector('#sync-status').textContent.includes('Connection')") as? Bool
        XCTAssertEqual(missingAddress, true)
        web.reload()
        try await Task.sleep(nanoseconds: 300_000_000)
        try await ready()
        let savedCodeLength = try await js("localStorage.getItem('reading-room-sync').length") as? Int
        XCTAssertEqual(savedCodeLength, 32)
        _ = try await js("localStorage.removeItem('reading-room-sync')")
    }
}
