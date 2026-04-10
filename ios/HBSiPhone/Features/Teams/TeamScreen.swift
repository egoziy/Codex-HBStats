import SwiftUI

struct TeamScreen: View {
    let teamID: String
    let service: MobileService

    @State private var state: LoadState<MobileTeamResponse> = .idle

    var body: some View {
        AsyncStateView(state: state) { payload in
            ScrollView {
                VStack(alignment: .trailing, spacing: 16) {
                    SectionCard(title: payload.team.name, subtitle: payload.team.season.name) {
                        VStack(alignment: .trailing, spacing: 12) {
                            HStack(spacing: 12) {
                                metricPill(title: "מיקום", value: payload.summary.standingPosition.map(String.init) ?? "-")
                                metricPill(title: "נקודות", value: "\(payload.summary.points)")
                                metricPill(title: "משחקים", value: "\(payload.summary.matchesPlayed)")
                            }

                            Text("מאמן: \(payload.team.coach ?? "לא זמין")")
                                .font(.subheadline)
                            Text("מאזן: \(payload.summary.record)")
                                .font(.subheadline)
                            Text("שערים: \(payload.summary.goals.for)-\(payload.summary.goals.against)")
                                .font(.subheadline)
                            Text("אחזקת כדור ממוצעת: \(payload.summary.averagePossession.formatted(.number.precision(.fractionLength(1))))%")
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.mutedText)
                        }
                    }

                    if let nextMatch = payload.sections.nextMatch {
                        matchNavigationCard(title: "המשחק הקרוב", match: nextMatch)
                    }

                    if let lastMatch = payload.sections.lastMatch {
                        matchNavigationCard(title: "המשחק האחרון", match: lastMatch)
                    }

                    if !payload.sections.recentForm.isEmpty {
                        SectionCard(title: "כושר אחרון", subtitle: nil) {
                            HStack(spacing: 8) {
                                ForEach(payload.sections.recentForm) { item in
                                    NavigationLink(value: AppRoute.game(item.id)) {
                                        VStack(spacing: 4) {
                                            Text(item.result)
                                                .font(.headline.bold())
                                                .foregroundStyle(resultColor(item.result))
                                            Text(item.score)
                                                .font(.caption)
                                                .foregroundStyle(.primary)
                                            Text(item.opponent)
                                                .font(.caption2)
                                                .foregroundStyle(AppTheme.mutedText)
                                                .lineLimit(1)
                                        }
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    if !payload.sections.standings.isEmpty {
                        SectionCard(title: "סביבת טבלה", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.standings) { row in
                                    NavigationLink(value: AppRoute.team(row.teamId)) {
                                        HStack {
                                            Text("\(row.points)")
                                                .foregroundStyle(row.isCurrentTeam == true ? AppTheme.brand : .primary)
                                            Spacer()
                                            Text(row.teamName)
                                                .fontWeight(row.isCurrentTeam == true ? .bold : .regular)
                                            Text("\(row.position)")
                                                .fontWeight(.bold)
                                        }
                                        .font(.subheadline)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    SectionCard(title: "סיכום עונה", subtitle: nil) {
                        VStack(spacing: 10) {
                            summaryRow(label: "מאזן", value: "\(payload.sections.seasonSummary.wins) ניצחונות, \(payload.sections.seasonSummary.draws) תיקו, \(payload.sections.seasonSummary.losses) הפסדים")
                            summaryRow(label: "שערים", value: "\(payload.sections.seasonSummary.goalsFor) זכות, \(payload.sections.seasonSummary.goalsAgainst) חובה")
                            summaryRow(label: "שער נקי", value: "\(payload.sections.seasonSummary.cleanSheets)")
                            summaryRow(label: "קרנות", value: "\(payload.sections.seasonSummary.corners)")
                            summaryRow(label: "נבדלים", value: "\(payload.sections.seasonSummary.offsides)")
                        }
                    }

                    if !payload.sections.minuteBuckets.isEmpty {
                        SectionCard(title: "חלוקה לפי דקות", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.minuteBuckets.prefix(6)) { bucket in
                                    VStack(alignment: .trailing, spacing: 6) {
                                        HStack {
                                            Text("גולים \(bucket.goals) | בישולים \(bucket.assists)")
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.mutedText)
                                            Spacer()
                                            Text(bucket.label)
                                                .font(.subheadline.weight(.semibold))
                                        }

                                        GeometryReader { proxy in
                                            let width = max(proxy.size.width * CGFloat(min(bucket.minutesPlayed, 90)) / 90.0, 12)
                                            ZStack(alignment: .trailing) {
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(AppTheme.surface)
                                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                    .fill(AppTheme.brand)
                                                    .frame(width: width)
                                            }
                                        }
                                        .frame(height: 10)
                                    }
                                }
                            }
                        }
                    }

                    if !payload.sections.topScorers.isEmpty {
                        SectionCard(title: "מובילי התקפה", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.topScorers) { player in
                                    HStack {
                                        Text("\(player.goals) ש'")
                                            .foregroundStyle(AppTheme.brand)
                                        Text("\(player.assists) ב'")
                                            .foregroundStyle(AppTheme.mutedText)
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(player.name)
                                                .font(.subheadline.weight(.semibold))
                                            Text("\(player.minutes) דקות")
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.mutedText)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !payload.sections.upcomingMatches.isEmpty {
                        SectionCard(title: "לוח משחקים קרוב", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.upcomingMatches) { match in
                                    NavigationLink(value: AppRoute.game(match.id)) {
                                        VStack(alignment: .trailing, spacing: 4) {
                                            Text("\(match.homeTeamName) - \(match.awayTeamName)")
                                                .font(.subheadline.weight(.semibold))
                                            Text(match.competition)
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.mutedText)
                                            Text(match.displayDate)
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.brand)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .trailing)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    SectionCard(title: "סגל", subtitle: nil) {
                        VStack(spacing: 10) {
                            ForEach(payload.sections.squad) { player in
                                NavigationLink(value: AppRoute.player(player.id)) {
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

    private func metricPill(title: String, value: String) -> some View {
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

    private func summaryRow(label: String, value: String) -> some View {
        HStack {
            Text(value)
                .foregroundStyle(AppTheme.mutedText)
            Spacer()
            Text(label)
                .fontWeight(.semibold)
        }
        .font(.subheadline)
    }

    private func resultColor(_ result: String) -> Color {
        switch result {
        case "W":
            return .green
        case "L":
            return .red
        default:
            return .orange
        }
    }

    private func matchNavigationCard(title: String, match: MobileMatchCard) -> some View {
        NavigationLink(value: AppRoute.game(match.id)) {
            SectionCard(title: title, subtitle: match.competition) {
                VStack(alignment: .trailing, spacing: 8) {
                    Text("\(match.homeTeamName) - \(match.awayTeamName)")
                        .font(.headline)
                        .multilineTextAlignment(.trailing)
                    if let score = match.score {
                        Text(score)
                            .font(.title3.bold())
                    }
                    Text(match.dateTime)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedText)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .buttonStyle(.plain)
    }
}
