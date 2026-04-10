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
                        VStack(alignment: .trailing, spacing: 12) {
                            Text(statusLabel(payload.game.status))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(AppTheme.brand)

                            HStack {
                                teamButton(payload.game.awayTeam)
                                Spacer()
                                Text(payload.game.score)
                                    .font(.title.bold())
                                Spacer()
                                teamButton(payload.game.homeTeam)
                            }

                            Text(payload.game.displayDate)
                                .font(.footnote)
                                .foregroundStyle(AppTheme.mutedText)
                        }
                    }

                    if !payload.sections.stats.isEmpty {
                        SectionCard(title: "סטטיסטיקות", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.stats) { row in
                                    VStack(alignment: .trailing, spacing: 6) {
                                        HStack {
                                            Text(row.awayDisplay)
                                            Spacer()
                                            Text(row.label)
                                                .fontWeight(.semibold)
                                            Spacer()
                                            Text(row.homeDisplay)
                                        }
                                        .font(.subheadline)

                                        statBar(homeValue: row.homeValue, awayValue: row.awayValue)
                                    }
                                }
                            }
                        }
                    }

                    if !payload.sections.events.isEmpty {
                        SectionCard(title: "אירועי משחק", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.events) { event in
                                    HStack(alignment: .top, spacing: 10) {
                                        Circle()
                                            .fill(event.teamId == payload.game.homeTeam.id ? AppTheme.brand : AppTheme.brandDark)
                                            .frame(width: 10, height: 10)
                                            .padding(.top, 6)

                                        VStack(alignment: .trailing, spacing: 4) {
                                            HStack {
                                                Text(localizedEventType(event.type))
                                                    .font(.subheadline.weight(.semibold))
                                                Spacer()
                                                Text(event.displayMinute)
                                                    .font(.caption.weight(.bold))
                                                    .foregroundStyle(AppTheme.brand)
                                            }

                                            Text(event.playerName)
                                                .font(.headline)
                                            if let relatedPlayer = event.relatedPlayerName {
                                                Text("קשור: \(relatedPlayer)")
                                                    .font(.caption)
                                                    .foregroundStyle(AppTheme.mutedText)
                                            }
                                            if let notes = event.notes, !notes.isEmpty {
                                                Text(notes)
                                                    .font(.caption)
                                                    .foregroundStyle(AppTheme.mutedText)
                                            }
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                }
                            }
                        }
                    }

                    SectionCard(title: "הרכבים", subtitle: nil) {
                        VStack(spacing: 16) {
                            lineupSection(title: payload.game.homeTeam.name, lineup: payload.sections.lineups.home)
                            lineupSection(title: payload.game.awayTeam.name, lineup: payload.sections.lineups.away)
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

    private func teamButton(_ team: MobileNamedTeam) -> some View {
        NavigationLink(value: AppRoute.team(team.id)) {
            VStack(spacing: 6) {
                Text(team.name)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                if let logoURL = team.logoUrl, let url = URL(string: logoURL) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFit()
                        default:
                            Image(systemName: "shield")
                                .resizable()
                                .scaledToFit()
                                .foregroundStyle(AppTheme.mutedText)
                        }
                    }
                    .frame(width: 36, height: 36)
                }
            }
            .frame(maxWidth: 110)
        }
        .buttonStyle(.plain)
    }

    private func statBar(homeValue: Double?, awayValue: Double?) -> some View {
        let home = max(homeValue ?? 0, 0)
        let away = max(awayValue ?? 0, 0)
        let total = max(home + away, 1)

        return GeometryReader { proxy in
            let fullWidth = proxy.size.width
            let homeWidth = max(fullWidth * (home / total), home > 0 ? 12 : 0)
            let awayWidth = max(fullWidth * (away / total), away > 0 ? 12 : 0)

            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(AppTheme.brand)
                    .frame(width: homeWidth)
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(AppTheme.brandDark)
                    .frame(width: awayWidth)
            }
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .frame(height: 10)
    }

    private func lineupSection(title: String, lineup: MobileTeamLineup) -> some View {
        VStack(alignment: .trailing, spacing: 10) {
            Text(title)
                .font(.headline.bold())

            HStack {
                Text("מאמן: \(lineup.coachName ?? "לא ידוע")")
                    .foregroundStyle(AppTheme.mutedText)
                Spacer()
                Text("מערך: \(lineup.formation ?? "-")")
                    .foregroundStyle(AppTheme.mutedText)
            }
            .font(.caption)

            if !lineup.starters.isEmpty {
                VStack(alignment: .trailing, spacing: 8) {
                    Text("פותחים")
                        .font(.subheadline.weight(.semibold))
                    ForEach(lineup.starters) { player in
                        lineupPlayerRow(player)
                    }
                }
            }

            if !lineup.substitutes.isEmpty {
                VStack(alignment: .trailing, spacing: 8) {
                    Text("ספסל")
                        .font(.subheadline.weight(.semibold))
                    ForEach(lineup.substitutes) { player in
                        lineupPlayerRow(player)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding()
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func lineupPlayerRow(_ player: MobileLineupPlayer) -> some View {
        HStack {
            Text(player.positionName ?? "-")
                .font(.caption)
                .foregroundStyle(AppTheme.mutedText)
            Spacer()
            Text(player.displayName)
                .font(.subheadline)
            if let jerseyNumber = player.jerseyNumber {
                Text("#\(jerseyNumber)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.brand)
            }
        }
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "ONGOING":
            return "בשידור חי"
        case "COMPLETED":
            return "הסתיים"
        case "CANCELLED":
            return "בוטל"
        default:
            return "בקרוב"
        }
    }

    private func localizedEventType(_ type: String) -> String {
        switch type {
        case "GOAL":
            return "שער"
        case "PENALTY_GOAL":
            return "פנדל"
        case "OWN_GOAL":
            return "שער עצמי"
        case "YELLOW_CARD":
            return "כרטיס צהוב"
        case "RED_CARD":
            return "כרטיס אדום"
        case "SUBSTITUTION_IN":
            return "חילוף"
        case "SUBSTITUTION_OUT":
            return "יצא"
        default:
            return type
        }
    }
}
