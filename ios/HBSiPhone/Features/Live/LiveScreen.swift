import SwiftUI

struct LiveScreen: View {
    let service: MobileService
    let router: (AppRoute) -> Void

    @State private var state: LoadState<MobileLiveResponse> = .idle

    var body: some View {
        AsyncStateView(state: state) { payload in
            List {
                if !payload.hasLive, let message = payload.message {
                    Text(message)
                        .foregroundStyle(AppTheme.mutedText)
                }

                ForEach(payload.groups) { group in
                    Section("\(group.countryLabel) • \(group.leagueLabel)") {
                        ForEach(group.matches) { match in
                            Button {
                                router(.game(match.gameId))
                            } label: {
                                HStack {
                                    Text("\(match.homeScore)-\(match.awayScore)")
                                        .fontWeight(.bold)
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 4) {
                                        Text("\(match.homeTeamName) - \(match.awayTeamName)")
                                            .lineLimit(1)
                                        Text(match.minuteLabel)
                                            .font(.caption)
                                            .foregroundStyle(AppTheme.brand)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("לייב")
            .refreshable {
                await load()
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await service.fetchLive())
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
