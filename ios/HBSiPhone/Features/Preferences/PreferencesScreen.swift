import SwiftUI

struct PreferencesScreen: View {
    let service: MobileService
    @State private var state: LoadState<MobilePreferencesResponse> = .idle

    var body: some View {
        AsyncStateView(state: state) { payload in
            List {
                Section("קבוצות מועדפות") {
                    ForEach(payload.availableTeams.prefix(12)) { team in
                        HStack {
                            if payload.favoriteTeamApiIds.contains(team.apiFootballId ?? -1) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(AppTheme.brand)
                            }
                            Spacer()
                            Text(team.name)
                        }
                    }
                }

                Section("ליגות מועדפות") {
                    ForEach(payload.availableCompetitions.prefix(12)) { competition in
                        HStack {
                            if payload.favoriteCompetitionApiIds.contains(competition.apiFootballId ?? -1) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(AppTheme.brand)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(competition.name)
                                if let country = competition.country {
                                    Text(country)
                                        .font(.caption)
                                        .foregroundStyle(AppTheme.mutedText)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("העדפות")
        }
        .task {
            await load()
        }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await service.fetchPreferences())
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
