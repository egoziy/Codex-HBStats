import SwiftUI

@main
struct HBSiPhoneApp: App {
    @State private var environment = AppEnvironment.preview

    var body: some Scene {
        WindowGroup {
            RootTabView(environment: environment)
                .environment(\.layoutDirection, .rightToLeft)
        }
    }
}
