import SwiftUI

struct HomeScreen: View {
    let service: MobileService
    let router: (AppRoute) -> Void

    @State private var state: LoadState<MobileHomeResponse> = .idle

    var body: some View {
        AsyncStateView(state: state) { payload in
            ScrollView {
                VStack(alignment: .trailing, spacing: 16) {
                    if let season = payload.season {
                        SectionCard(title: "עונה פעילה", subtitle: season.label) {
                            Text("לייב: \(payload.summary.liveCount) | עדכונים: \(payload.summary.newsCount)")
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.mutedText)
                        }
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

                    SectionCard(title: "טבלה מצומצמת", subtitle: nil) {
                        VStack(spacing: 10) {
                            ForEach(payload.sections.standings) { row in
                                Button {
                                    router(.team(row.teamId))
                                } label: {
                                    HStack {
                                        Text("\(row.points)")
                                        Spacer()
                                        Text(row.teamName)
                                        Text("\(row.position)")
                                    }
                                    .font(.subheadline.weight(.semibold))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding()
            }
            .background(AppTheme.surface.ignoresSafeArea())
            .navigationTitle("ראשי")
        }
        .task {
            await load()
        }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await service.fetchHome())
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
