import SwiftUI

struct MatchCard: View {
    let title: String
    let match: MobileMatchCard
    let action: () -> Void

    var body: some View {
        SectionCard(title: title, subtitle: match.competition) {
            Button(action: action) {
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
            .buttonStyle(.plain)
        }
    }
}
