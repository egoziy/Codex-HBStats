import SwiftUI

struct NewsScreen: View {
    let service: MobileService

    @State private var state: LoadState<MobileNewsResponse> = .idle

    var body: some View {
        AsyncStateView(state: state) { payload in
            List(payload.items) { item in
                VStack(alignment: .trailing, spacing: 8) {
                    Text(item.source)
                        .font(.caption)
                        .foregroundStyle(AppTheme.brand)
                    Text(item.title)
                        .font(.headline)
                    Text(item.previewText)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.mutedText)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .navigationTitle("עדכונים")
        }
        .task {
            await load()
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
}
