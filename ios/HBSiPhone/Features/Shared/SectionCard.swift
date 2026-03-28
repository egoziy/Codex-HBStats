import SwiftUI

struct SectionCard<Content: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .trailing, spacing: 12) {
            VStack(alignment: .trailing, spacing: 4) {
                Text(title)
                    .font(.title3.bold())
                if let subtitle {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedText)
                }
            }

            content()
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding()
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
