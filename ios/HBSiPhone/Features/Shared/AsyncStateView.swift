import SwiftUI

struct AsyncStateView<Content: View, Value>: View {
    let state: LoadState<Value>
    let content: (Value) -> Content

    var body: some View {
        switch state {
        case .idle, .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView("שגיאה", systemImage: "exclamationmark.triangle", description: Text(message))
        case .loaded(let value):
            content(value)
        }
    }
}
