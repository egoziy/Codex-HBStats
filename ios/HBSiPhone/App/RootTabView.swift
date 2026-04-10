import SwiftUI

struct RootTabView: View {
    @State private var homePath: [AppRoute] = []
    @State private var livePath: [AppRoute] = []
    @State private var newsPath: [AppRoute] = []
    @State private var preferencesPath: [AppRoute] = []

    let environment: AppEnvironment

    var body: some View {
        TabView {
            NavigationStack(path: $homePath) {
                HomeScreen(service: environment.mobileService, router: { homePath.append($0) })
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
            .tabItem {
                Label("ראשי", systemImage: "house.fill")
            }

            NavigationStack(path: $livePath) {
                LiveScreen(service: environment.mobileService, router: { livePath.append($0) })
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
            .tabItem {
                Label("לייב", systemImage: "dot.radiowaves.left.and.right")
            }

            NavigationStack(path: $newsPath) {
                NewsScreen(service: environment.mobileService)
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
            .tabItem {
                Label("עדכונים", systemImage: "newspaper.fill")
            }

            NavigationStack(path: $preferencesPath) {
                PreferencesScreen(service: environment.mobileService)
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
            .tabItem {
                Label("העדפות", systemImage: "slider.horizontal.3")
            }
        }
        .tint(AppTheme.brand)
    }

    @ViewBuilder
    private func destination(for route: AppRoute) -> some View {
        switch route {
        case .team(let id):
            TeamScreen(teamID: id, service: environment.mobileService)
        case .game(let id):
            GameScreen(gameID: id, service: environment.mobileService)
        case .player(let id):
            PlayerScreen(playerID: id, service: environment.mobileService)
        }
    }
}
