import SwiftUI

struct PlayerScreen: View {
    let playerID: String
    let service: MobileService

    @State private var state: LoadState<MobilePlayerResponse> = .idle
    @State private var selectedSeasonID: String?
    @State private var selectedView: String = "all"

    var body: some View {
        AsyncStateView(state: state) { payload in
            ScrollView {
                VStack(alignment: .trailing, spacing: 16) {
                    SectionCard(title: payload.player.name, subtitle: payload.player.teamName) {
                        Text(payload.player.position ?? "-")
                        Text("דקות: \(payload.summary.minutesPlayed)")
                        Text("משחקים: \(payload.summary.gamesPlayed)")
                    }

                    SectionCard(title: "משחקים", subtitle: nil) {
                        VStack(spacing: 10) {
                            ForEach(payload.sections.games.prefix(10)) { game in
                                VStack(alignment: .trailing, spacing: 4) {
                                    Text(game.matchLabel).font(.headline)
                                    Text("\(game.displayDate) • \(game.scoreLabel)")
                                        .font(.subheadline)
                                        .foregroundStyle(AppTheme.mutedText)
                                }
                                .frame(maxWidth: .infinity, alignment: .trailing)
                            }
                        }
                    }
                }
                .padding()
            }
            .background(AppTheme.surface.ignoresSafeArea())
            .navigationTitle(payload.player.name)
        }
        .task(id: "\(playerID)-\(selectedSeasonID ?? "")-\(selectedView)") {
            await load()
        }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await service.fetchPlayer(id: playerID, season: selectedSeasonID, view: selectedView == "all" ? nil : selectedView))
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
