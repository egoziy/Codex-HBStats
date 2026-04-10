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
                            VStack(alignment: .trailing, spacing: 12) {
                                HStack(spacing: 12) {
                                    summaryPill(title: "לייב", value: "\(payload.summary.liveCount)")
                                    summaryPill(title: "עדכונים", value: "\(payload.summary.newsCount)")
                                }

                                if !payload.summary.hasData {
                                    Text("עדיין אין מספיק נתונים להצגה במסך הבית.")
                                        .font(.subheadline)
                                        .foregroundStyle(AppTheme.mutedText)
                                }
                            }
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

                    if !payload.sections.live.isEmpty {
                        SectionCard(title: "לייב עכשיו", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.live.prefix(4)) { match in
                                    if canOpenGame(match.gameId) {
                                        Button {
                                            router(.game(match.gameId))
                                        } label: {
                                            liveItemRow(match)
                                        }
                                        .buttonStyle(.plain)
                                    } else {
                                        liveItemRow(match)
                                    }
                                }
                            }
                        }
                    }

                    if !payload.sections.upcomingMatches.isEmpty {
                        SectionCard(title: "משחקים קרובים", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.upcomingMatches.prefix(4)) { match in
                                    Button {
                                        router(.game(match.id))
                                    } label: {
                                        VStack(alignment: .trailing, spacing: 6) {
                                            Text("\(match.homeTeamName) - \(match.awayTeamName)")
                                                .font(.subheadline.weight(.semibold))
                                                .multilineTextAlignment(.trailing)
                                            Text(match.competition)
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.mutedText)
                                            Text(match.dateTime)
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.brand)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .trailing)
                                        .padding(.vertical, 2)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    if !payload.sections.standings.isEmpty {
                        SectionCard(title: "טבלה מצומצמת", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.standings) { row in
                                    Button {
                                        router(.team(row.teamId))
                                    } label: {
                                        HStack {
                                            Text("\(row.points)")
                                                .foregroundStyle(row.isFavorite == true || row.isCurrentTeam == true ? AppTheme.brand : .primary)
                                            Spacer()
                                            Text(row.teamName)
                                            Text("\(row.position)")
                                                .fontWeight(.bold)
                                        }
                                        .font(.subheadline.weight(.semibold))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    if !payload.sections.predictions.isEmpty {
                        SectionCard(title: "תחזיות", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.predictions.prefix(3)) { prediction in
                                    Button {
                                        router(.game(prediction.gameId))
                                    } label: {
                                        VStack(alignment: .trailing, spacing: 6) {
                                            Text("\(prediction.homeTeamName) - \(prediction.awayTeamName)")
                                                .font(.subheadline.weight(.semibold))
                                                .multilineTextAlignment(.trailing)
                                            Text(prediction.competition)
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.mutedText)
                                            HStack(spacing: 8) {
                                                predictionStat(label: "2", value: prediction.percentAway)
                                                predictionStat(label: "X", value: prediction.percentDraw)
                                                predictionStat(label: "1", value: prediction.percentHome)
                                            }
                                        }
                                        .frame(maxWidth: .infinity, alignment: .trailing)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    if !payload.sections.news.isEmpty {
                        SectionCard(title: "כותרות אחרונות", subtitle: nil) {
                            VStack(spacing: 12) {
                                ForEach(payload.sections.news.prefix(3)) { item in
                                    VStack(alignment: .trailing, spacing: 6) {
                                        HStack {
                                            Text(item.source)
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(AppTheme.brand)
                                            Spacer()
                                            if !item.teamLabel.isEmpty {
                                                Text(item.teamLabel)
                                                    .font(.caption)
                                                    .foregroundStyle(AppTheme.mutedText)
                                            }
                                        }

                                        Text(item.title)
                                            .font(.subheadline.weight(.semibold))
                                            .multilineTextAlignment(.trailing)

                                        Text(item.previewText)
                                            .font(.caption)
                                            .foregroundStyle(AppTheme.mutedText)
                                            .multilineTextAlignment(.trailing)
                                            .lineLimit(3)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .background(AppTheme.surface.ignoresSafeArea())
            .navigationTitle("ראשי")
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
            state = .loaded(try await service.fetchHome())
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func summaryPill(title: String, value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.headline.bold())
            Text(title)
                .font(.caption)
                .foregroundStyle(AppTheme.mutedText)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func predictionStat(label: String, value: String?) -> some View {
        VStack(spacing: 2) {
            Text(value ?? "-")
                .font(.caption.weight(.bold))
            Text(label)
                .font(.caption2)
                .foregroundStyle(AppTheme.mutedText)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func liveItemRow(_ match: MobileLiveItem) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(match.homeScore)-\(match.awayScore)")
                    .font(.headline.bold())
                Text(match.minuteLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.brand)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text("\(match.homeTeamName) - \(match.awayTeamName)")
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.trailing)
                Text(match.leagueLabel)
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private func canOpenGame(_ gameId: String) -> Bool {
        gameId.hasPrefix("/games/") && gameId.count > 8
    }
}
