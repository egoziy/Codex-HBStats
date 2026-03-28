import Foundation

struct AppEnvironment {
    let mobileService: MobileService

    static let preview = AppEnvironment(
        mobileService: MobileService(
            client: APIClient(
                baseURL: URL(string: "http://127.0.0.1:8011")!,
                session: .shared
            )
        )
    )
}
