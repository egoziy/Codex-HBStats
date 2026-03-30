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
                        VStack(alignment: .trailing, spacing: 12) {
                            if let photoURL = payload.player.photoUrl, let url = URL(string: photoURL) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .empty:
                                        ProgressView()
                                            .frame(width: 88, height: 88)
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .scaledToFill()
                                            .frame(width: 88, height: 88)
                                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                                    default:
                                        EmptyView()
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .trailing)
                            }

                            HStack(spacing: 12) {
                                metricPill(title: "שערים", value: "\(payload.summary.goals)")
                                metricPill(title: "בישולים", value: "\(payload.summary.assists)")
                                metricPill(title: "משחקים", value: "\(payload.summary.gamesPlayed)")
                            }

                            HStack(spacing: 12) {
                                metricPill(title: "דקות", value: "\(payload.summary.minutesPlayed)")
                                metricPill(title: "הרכב", value: "\(payload.summary.starts)")
                                metricPill(title: "ספסל", value: "\(payload.summary.benchAppearances)")
                            }

                            Text(payload.player.position ?? "-")
                                .font(.subheadline)
                            if let jersey = payload.player.jerseyNumber {
                                Text("מספר חולצה: \(jersey)")
                                    .font(.subheadline)
                                    .foregroundStyle(AppTheme.mutedText)
                            }
                        }
                    }

                    SectionCard(title: "סינון", subtitle: nil) {
                        VStack(alignment: .trailing, spacing: 12) {
                            if !payload.filters.availableSeasons.isEmpty {
                                Picker("עונה", selection: Binding(
                                    get: { selectedSeasonID ?? payload.player.season?.id ?? payload.filters.availableSeasons.first?.id ?? "" },
                                    set: { selectedSeasonID = $0.isEmpty ? nil : $0 }
                                )) {
                                    ForEach(payload.filters.availableSeasons) { season in
                                        Text(season.name).tag(season.id)
                                    }
                                }
                                .pickerStyle(.menu)
                            }

                            gameFilterBar(payload: payload)
                        }
                    }

                    SectionCard(title: "פרופיל", subtitle: nil) {
                        VStack(spacing: 10) {
                            summaryRow(label: "לאום", value: payload.sections.profile.nationality ?? "לא זמין")
                            summaryRow(label: "קבוצות במערכת", value: "\(payload.sections.profile.teamsInCareer)")
                            summaryRow(label: "עונות במערכת", value: "\(payload.sections.profile.seasonsInSystem)")
                            summaryRow(label: "מדיה שנשמרה", value: "\(payload.sections.profile.uploadsCount)")
                            summaryRow(label: "הוחלף פנימה", value: "\(payload.summary.substituteAppearances)")
                            summaryRow(label: "הוחלף החוצה", value: "\(payload.summary.timesSubbedOff)")
                            summaryRow(label: "צהובים / אדומים", value: "\(payload.summary.yellowCards) / \(payload.summary.redCards)")
                        }
                    }

                    if !payload.sections.aggregatedStats.isEmpty {
                        SectionCard(title: "סטטיסטיקות מצטברות", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.aggregatedStats.prefix(8)) { stat in
                                    VStack(alignment: .trailing, spacing: 6) {
                                        Text("\(stat.seasonName) • \(stat.competitionName)")
                                            .font(.subheadline.weight(.semibold))
                                        HStack {
                                            Text("דק' \(stat.minutesPlayed)")
                                            Text("ב' \(stat.assists)")
                                            Text("ש' \(stat.goals)")
                                            Spacer()
                                            Text("\(stat.gamesPlayed) משחקים")
                                                .foregroundStyle(AppTheme.mutedText)
                                        }
                                        .font(.caption)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                }
                            }
                        }
                    }

                    if !payload.sections.seasonEntries.isEmpty {
                        SectionCard(title: "רישומי עונה", subtitle: nil) {
                            VStack(spacing: 10) {
                                ForEach(payload.sections.seasonEntries) { entry in
                                    HStack {
                                        if entry.hasPhoto {
                                            Image(systemName: "photo.fill")
                                                .foregroundStyle(AppTheme.brand)
                                        }
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(entry.teamName)
                                                .font(.subheadline.weight(.semibold))
                                            Text(entry.seasonName)
                                                .font(.caption)
                                                .foregroundStyle(AppTheme.mutedText)
                                        }
                                        if let jersey = entry.jerseyNumber {
                                            Text("#\(jersey)")
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(AppTheme.brand)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !payload.sections.gallery.isEmpty {
                        SectionCard(title: "גלריה", subtitle: nil) {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(payload.sections.gallery.prefix(8)) { item in
                                        VStack(alignment: .trailing, spacing: 6) {
                                            galleryThumbnail(item.filePath)
                                            Text(item.title ?? (item.isPrimary ? "תמונה ראשית" : "מדיה"))
                                                .font(.caption)
                                                .lineLimit(1)
                                                .frame(width: 110, alignment: .trailing)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    SectionCard(title: "משחקים", subtitle: nil) {
                        VStack(spacing: 10) {
                            if payload.sections.games.isEmpty {
                                Text("אין משחקים להצגה לפי הסינון שנבחר.")
                                    .font(.subheadline)
                                    .foregroundStyle(AppTheme.mutedText)
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                            }

                            ForEach(payload.sections.games.prefix(12)) { game in
                                NavigationLink(value: AppRoute.game(game.gameId)) {
                                    VStack(alignment: .trailing, spacing: 6) {
                                        Text(game.matchLabel)
                                            .font(.headline)
                                            .multilineTextAlignment(.trailing)
                                        Text("\(game.displayDate) • \(game.competitionName)")
                                            .font(.subheadline)
                                            .foregroundStyle(AppTheme.mutedText)
                                        HStack {
                                            Text(game.scoreLabel)
                                                .foregroundStyle(.primary)
                                            Spacer()
                                            Text(game.squadRoleLabel)
                                                .foregroundStyle(AppTheme.brand)
                                        }
                                        .font(.caption.weight(.semibold))
                                        HStack {
                                            Text("גולים \(game.goals) | בישולים \(game.assists)")
                                            Text("דקות \(game.minutesLabel)")
                                            Spacer()
                                            if game.wasSubbedIn || game.wasSubbedOff {
                                                Text("כניסה \(game.enteredMinuteLabel) • יציאה \(game.exitedMinuteLabel)")
                                                    .foregroundStyle(AppTheme.mutedText)
                                            }
                                        }
                                        .font(.caption)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                    .padding(.vertical, 4)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding()
            }
            .background(AppTheme.surface.ignoresSafeArea())
            .navigationTitle(payload.player.name)
            .refreshable {
                await load()
            }
            .onAppear {
                syncSelection(with: payload)
            }
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

    private func syncSelection(with payload: MobilePlayerResponse) {
        if selectedSeasonID == nil {
            selectedSeasonID = payload.player.season?.id ?? payload.filters.availableSeasons.first?.id
        }
        if selectedView != payload.filters.activeView {
            selectedView = payload.filters.activeView
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

    @ViewBuilder
    private func gameFilterBar(payload: MobilePlayerResponse) -> some View {
        let items: [(String, String, Int)] = [
            ("all", "הכל", payload.sections.gameFilterCounts.all),
            ("starts", "הרכב", payload.sections.gameFilterCounts.starts),
            ("bench", "ספסל", payload.sections.gameFilterCounts.bench),
            ("sub-in", "נכנס", payload.sections.gameFilterCounts.subIn),
            ("sub-off", "יצא", payload.sections.gameFilterCounts.subOff),
        ]

        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.0) { item in
                    Button {
                        selectedView = item.0
                    } label: {
                        VStack(spacing: 2) {
                            Text(item.1)
                                .font(.caption.weight(.semibold))
                            Text("\(item.2)")
                                .font(.caption2)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(
                            selectedView == item.0 ? AppTheme.brand : AppTheme.card,
                            in: Capsule(style: .continuous)
                        )
                        .foregroundStyle(selectedView == item.0 ? Color.white : Color.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 1)
        }
    }

    private func galleryThumbnail(_ path: String) -> some View {
        Group {
            if let url = URL(string: path), let scheme = url.scheme, !scheme.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        placeholderThumb
                    }
                }
            } else {
                placeholderThumb
            }
        }
        .frame(width: 110, height: 110)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var placeholderThumb: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(AppTheme.surface)
            Image(systemName: "photo")
                .foregroundStyle(AppTheme.mutedText)
        }
    }
}
