import SwiftUI

struct GameScreen: View {
    let gameID: String
    let service: MobileService

    @State private var state: LoadState<MobileGameResponse> = .idle

    var body: some View {
        AsyncStateView(state: state) { payload in
            ScrollView {
                VStack(alignment: .trailing, spacing: 16) {
                    SectionCard(title: payload.game.competition, subtitle: payload.game.round) {
                        Text(payload.game.homeTeam.name)
                        Text(payload.game.score)
                            .font(.title.bold())
                        Text(payload.game.awayTeam.name)
                        Text(payload.game.displayDate)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.mutedText)
                    }

                    SectionCard(title: "סטטיסטיקות", subtitle: nil) {
                        VStack(spacing: 10) {
                            ForEach(payload.sections.stats) { row in
                                HStack {
                                    Text(row.awayDisplay)
                                    Spacer()
                                    Text(row.label)
                                    Spacer()
                                    Text(row.homeDisplay)
                                }
                            }
                        }
                    }

                    SectionCard(title: "אירועים", subtitle: nil) {
                        VStack(spacing: 10) {
                            ForEach(payload.sections.events) { event in
                                VStack(alignment: .trailing, spacing: 4) {
                                    Text("\(event.displayMinute) • \(event.playerName)")
                                        .font(.headline)
                                    Text(event.type)
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
            .navigationTitle("משחק")
        }
        .task(id: gameID) {
            await load()
        }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await service.fetchGame(id: gameID))
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
