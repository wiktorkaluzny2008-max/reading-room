import UIKit
import WebKit
import Network

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UINavigationController(rootViewController: ReadingViewController())
        window.makeKeyAndVisible()
        self.window = window
    }
}

// Never follow a redirect with a progress credential (including Cloudflare Access login redirects).
final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

enum Connection {
    static let key = "ReadingRoomWorkerOrigin"
    static func origin(_ text: String) -> URL? {
        guard let parts = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/", parts.port == nil || parts.port == 443
        else { return nil }
        return URL(string: "https://\(host)")
    }
    static func request(origin: URL, message: [String: Any]) throws -> URLRequest {
        guard let code = message["code"] as? String, code.range(of: "^[a-z2-7]{32}$", options: .regularExpression) != nil,
              let path = message["path"] as? String, let method = message["method"] as? String,
              (method == "POST" && path == "/api/sync") || (method == "GET" && path.range(of: "^/api/sync\\?since=-?[0-9]+$", options: .regularExpression) != nil),
              let url = URL(string: path, relativeTo: origin)?.absoluteURL, url.host == origin.host
        else { throw Failure.message("Invalid sync request.") }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        request.httpMethod = method
        request.setValue("Bearer " + code, forHTTPHeaderField: "Authorization")
        if method == "POST" {
            guard let body = message["body"] as? String, let data = body.data(using: .utf8), data.count <= 4_000_000 else { throw Failure.message("Progress is too large to sync.") }
            request.httpBody = data
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }
    enum Failure: LocalizedError {
        case message(String)
        var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
    }
}

final class BundleScheme: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root.standardizedFileURL }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, url.scheme == "readingroom", url.host == "localhost" else {
            urlSchemeTask.didFailWithError(URLError(.unsupportedURL)); return
        }
        let path = url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let mime = ["html":"text/html", "js":"application/javascript", "css":"text/css", "json":"application/json", "svg":"image/svg+xml", "webp":"image/webp"][file.pathExtension] ?? "application/octet-stream"
        urlSchemeTask.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime, "Content-Length": String(data.count), "Cache-Control": "no-cache"])!)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class ReadingViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    private(set) var webView: WKWebView!
    private let monitor = NWPathMonitor()
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        return URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
    }()
    private var backButton: UIBarButtonItem!
    private var historyObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Reading & Writing"
        view.backgroundColor = .systemBackground
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.setURLSchemeHandler(BundleScheme(root: Bundle.main.url(forResource: "Web", withExtension: nil)!), forURLScheme: "readingroom")
        for name in ["sync", "clipboard", "backup"] {
            configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: name)
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        backButton = UIBarButtonItem(image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(back))
        backButton.accessibilityLabel = "Back"
        navigationItem.leftBarButtonItem = backButton
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Connection", style: .plain, target: self, action: #selector(connection))
        historyObservation = webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] web, _ in self?.backButton.isEnabled = web.canGoBack }
        NotificationCenter.default.addObserver(self, selector: #selector(active), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(save), name: UIApplication.willResignActiveNotification, object: nil)
        monitor.pathUpdateHandler = { [weak self] path in
            if path.status == .satisfied { DispatchQueue.main.async { self?.event("native-active") } }
        }
        monitor.start(queue: DispatchQueue(label: "ReadingRoom.connection"))
        webView.load(URLRequest(url: URL(string: "readingroom://localhost/index.html")!))
    }
    private func event(_ name: String) { webView?.evaluateJavaScript("window.dispatchEvent(new Event('\(name)'))", completionHandler: nil) }
    @objc private func active() { event("native-active") }
    @objc private func save() { event("native-save") }
    @objc private func back() { if webView.canGoBack { webView.goBack() } }
    @objc private func connection() {
        let alert = UIAlertController(title: "Connect to your Mac", message: "Enter the HTTPS address of your existing Reading Room website. Then use the same 32-character code in Settings → Sync across browsers. You can practice offline without connecting.", preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "https://your-worker.workers.dev"
            field.text = UserDefaults.standard.string(forKey: Connection.key)
            field.keyboardType = .URL
            field.autocapitalizationType = .none
            field.autocorrectionType = .no
            field.accessibilityLabel = "Reading Room website address"
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Save address", style: .default) { [weak self, weak alert] _ in
            guard let value = alert?.textFields?.first?.text, let origin = Connection.origin(value) else {
                self?.message("Enter an HTTPS website address without a path, query, password, or port."); return
            }
            UserDefaults.standard.set(origin.absoluteString, forKey: Connection.key)
            self?.event("native-connection")
        })
        present(alert, animated: true)
    }
    private func message(_ text: String) {
        let alert = UIAlertController(title: "Reading Room", message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "readingroom", message.frameInfo.securityOrigin.host == "localhost" else {
            replyHandler(nil, "Only bundled Reading Room pages can use this action."); return
        }
        switch message.name {
        case "clipboard":
            guard let code = message.body as? String, code.range(of: "^[a-z2-7]{4}(-[a-z2-7]{4}){7}$", options: .regularExpression) != nil else { replyHandler(nil, "Invalid code."); return }
            UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: code]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)])
            replyHandler(true, nil)
        case "backup":
            guard let text = message.body as? String, let data = text.data(using: .utf8), data.count <= 30_000_000 else { replyHandler(nil, "Invalid backup."); return }
            do {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("reading-room-progress-\(UUID().uuidString).json")
                try data.write(to: url, options: [.atomic, .completeFileProtection])
                let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = view
                share.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: url) }
                present(share, animated: true)
                replyHandler(true, nil)
            } catch { replyHandler(nil, "Backup could not be prepared.") }
        case "sync":
            guard let origin = UserDefaults.standard.string(forKey: Connection.key).flatMap(Connection.origin) else { replyHandler(nil, "Tap Connection and enter your existing Reading Room website address."); return }
            guard let body = message.body as? [String: Any] else { replyHandler(nil, "Invalid sync request."); return }
            do {
                let request = try Connection.request(origin: origin, message: body)
                session.dataTask(with: request) { data, response, error in
                    DispatchQueue.main.async {
                        if error != nil { replyHandler(nil, "Could not connect. Progress is saved on this iPad and sync will retry when you reconnect."); return }
                        guard let response = response as? HTTPURLResponse, let data = data, data.count <= 4_000_000 else { replyHandler(nil, "Invalid sync response."); return }
                        guard response.statusCode == 204 || response.value(forHTTPHeaderField: "Content-Type")?.contains("application/json") == true else {
                            replyHandler(nil, "The website did not return a sync response. Check the address. Cloudflare Access login is not supported by this app."); return
                        }
                        replyHandler(["status": response.statusCode, "body": String(data: data, encoding: .utf8) ?? "", "headers": ["x-sync-version": response.value(forHTTPHeaderField: "x-sync-version") ?? ""]], nil)
                    }
                }.resume()
            } catch { replyHandler(nil, error.localizedDescription) }
        default: replyHandler(nil, "Unsupported action.")
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        // The remote full website (including Math) never loads in the app, and never gets bridge access.
        decisionHandler(url.scheme == "readingroom" && url.host == "localhost" ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url, url.scheme == "readingroom", url.host == "localhost", url.path.hasPrefix("/questions/"), url.pathExtension == "webp" else { return nil }
        let controller = UIViewController()
        let imageView = WKWebView(frame: .zero, configuration: configuration)
        controller.view = imageView
        controller.navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Done", style: .done, target: self, action: #selector(closeImage))
        present(UINavigationController(rootViewController: controller), animated: true)
        imageView.load(URLRequest(url: url))
        return imageView
    }
    @objc private func closeImage() { dismiss(animated: true) }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "Reading Room", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
    deinit { monitor.cancel(); NotificationCenter.default.removeObserver(self) }
}
