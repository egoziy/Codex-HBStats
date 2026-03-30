import SwiftUI

struct NewsScreen: View {
    let service: MobileService

    @State private var state: LoadState<MobileNewsResponse> = .idle
    @State private var selectedSource: String = "all"
    @State private var expandedItems: Set<String> = []

    var body: some View {
        AsyncStateView(state: state) { payload in
            ScrollView {
                VStack(alignment: .trailing, spacing: 16) {
                    sourceFilter(payload: payload)

                    if filteredItems(from: payload).isEmpty {
                        ContentUnavailableView(
                            "אין עדכונים להצגה",
                            systemImage: "newspaper",
                            description: Text("נסה לבחור מקור אחר או לרענן שוב.")
                        )
                    }

                    ForEach(filteredItems(from: payload)) { item in
                        VStack(alignment: .trailing, spacing: 12) {
                            if let imageURL = item.imageUrl, let url = URL(string: imageURL) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .empty:
                                        ZStack {
                                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                .fill(AppTheme.surface)
                                            ProgressView()
                                        }
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .scaledToFill()
                                    case .failure:
                                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                                            .fill(AppTheme.surface)
                                            .overlay {
                                                Image(systemName: "photo")
                                                    .foregroundStyle(AppTheme.mutedText)
                                            }
                                    @unknown default:
                                        EmptyView()
                                    }
                                }
                                .frame(height: 180)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            }

                            HStack {
                                Text(item.source)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(AppTheme.brand)

                                Spacer()

                                if let publishedAt = item.publishedAt {
                                    Text(formatDate(publishedAt))
                                        .font(.caption)
                                        .foregroundStyle(AppTheme.mutedText)
                                }
                            }

                            if !item.teamLabel.isEmpty {
                                Text(item.teamLabel)
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.mutedText)
                            }

                            Text(item.title)
                                .font(.headline)
                                .multilineTextAlignment(.trailing)

                            Text(expandedItems.contains(item.id) ? item.fullText : item.previewText)
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.mutedText)
                                .multilineTextAlignment(.trailing)

                            HStack(spacing: 12) {
                                if let sourceURL = URL(string: item.url) {
                                    Link(destination: sourceURL) {
                                        Label("למקור", systemImage: "arrow.up.forward.square")
                                            .font(.subheadline.weight(.semibold))
                                    }
                                }

                                Spacer()

                                if item.fullText != item.previewText {
                                    Button(expandedItems.contains(item.id) ? "פחות" : "הרחב") {
                                        toggleExpanded(item.id)
                                    }
                                    .font(.subheadline.weight(.semibold))
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding()
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                }
                .padding()
            }
            .background(AppTheme.surface.ignoresSafeArea())
            .navigationTitle("עדכונים")
            .refreshable {
                await load()
            }
        }
        .task {
            await load()
        }
    }

    private func filteredItems(from payload: MobileNewsResponse) -> [MobileNewsItem] {
        payload.items.filter { item in
            selectedSource == "all" || item.source == selectedSource
        }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await service.fetchNews())
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    @ViewBuilder
    private func sourceFilter(payload: MobileNewsResponse) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip(title: "הכל", isSelected: selectedSource == "all") {
                    selectedSource = "all"
                }

                ForEach(payload.sources) { source in
                    filterChip(title: source.label, isSelected: selectedSource == source.label) {
                        selectedSource = source.label
                    }
                }
            }
            .padding(.horizontal, 1)
        }
    }

    private func filterChip(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    isSelected ? AppTheme.brand : AppTheme.card,
                    in: Capsule(style: .continuous)
                )
                .foregroundStyle(isSelected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func toggleExpanded(_ id: String) {
        if expandedItems.contains(id) {
            expandedItems.remove(id)
        } else {
            expandedItems.insert(id)
        }
    }

    private func formatDate(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: value) else {
            return value
        }

        return date.formatted(
            Date.FormatStyle()
                .year(.defaultDigits)
                .month(.wide)
                .day(.defaultDigits)
                .hour(.twoDigits(amPM: .omitted))
                .minute(.twoDigits)
                .locale(Locale(identifier: "he_IL"))
        )
    }
}
