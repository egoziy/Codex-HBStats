import SwiftUI

struct TeamScreen: View {
    let teamID: String
    let service: MobileService
    let router: (AppRoute) -> Void

    @State private var state: LoadState<MobileTeamResponse> = .idle

    var body: some View {
        AsyncStateView(state: state) { payload in
            ScrollView {
                VStack(alignment: .trailing, spacing: 16) {
                    SectionCard(title: payload.team.name, subtitle: payload.team.season.name) {
                        Text("מאמן: \(payload.team.coach ?? "לא זמין")")
                        Text("מאזן: \(payload.summary.record)")
                        Text("נקודות: \(payload.summary.points)")
                    }

                    if let nextMatch = payload.sections.nextMatch {
                        MatchCard(title: "המשחק הקרוב", match: nextMatch) {
                            router(.game(nextMatch.id))
                        }
                    }

                    if let lastMatch = payload.sections.lastMatch {
                        MatchCard(title: "המשחק האחרון", match: lastMatch) {
                            router(.game(lastMatch.id))
                        }
                    }

                    SectionCard(title: "סגל", subtitle: nil) {
                        VStack(spacing: 10) {
                            ForEach(payload.sections.squad) { player in
                                Button {
                                    router(.player(player.id))
                                } label: {
                                    HStack {
                                        Text(player.position ?? "-")
                                            .foregroundStyle(AppTheme.mutedText)
                                        Spacer()
                                        Text(player.name)
                                        if let number = player.jerseyNumber {
                                            Text("#\(number)")
                                                .foregroundStyle(AppTheme.brand)
                                        }
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding()
            }
            .background(AppTheme.surface.ignoresSafeArea())
            .navigationTitle(payload.team.name)
        }
        .task(id: teamID) {
            await load()
        }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await service.fetchTeam(id: teamID))
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
