import Foundation

struct MobileHomeResponse: Decodable {
    let season: MobileSeason?
    let summary: MobileHomeSummary
    let sections: MobileHomeSections
}

struct MobileHomeSummary: Decodable {
    let hasData: Bool
    let liveCount: Int
    let newsCount: Int
}

struct MobileHomeSections: Decodable {
    let nextMatch: MobileMatchCard?
    let lastMatch: MobileMatchCard?
    let standings: [MobileStandingRow]
    let predictions: [MobilePrediction]
    let headToHead: [MobileHeadToHeadGroup]
    let upcomingMatches: [MobileMatchCard]
    let live: [MobileLiveItem]
    let news: [MobileNewsItem]
}

struct MobileLiveResponse: Decodable {
    let updatedAt: String
    let hasLive: Bool
    let message: String?
    let items: [MobileLiveItem]
    let groups: [MobileLiveGroup]
}

struct MobileLiveGroup: Decodable, Identifiable {
    let key: String
    let countryLabel: String
    let countryFlagUrl: String?
    let leagueLabel: String
    let matches: [MobileLiveItem]

    var id: String { key }
}

struct MobileLiveItem: Decodable, Identifiable {
    let id: String
    let gameId: String
    let homeTeamName: String
    let awayTeamName: String
    let homeScore: Int
    let awayScore: Int
    let minuteLabel: String
    let statusLabel: String
    let countryLabel: String
    let countryFlagUrl: String?
    let leagueLabel: String
    let eventCount: Int
}

struct MobileMatchCard: Decodable, Identifiable {
    let id: String
    let href: String?
    let competition: String
    let round: String?
    let homeTeamName: String
    let awayTeamName: String
    let dateTime: String
    let score: String?
    let predictionLabel: String?
}

struct MobileStandingRow: Decodable, Identifiable {
    let id: String
    let teamId: String
    let teamName: String
    let position: Int
    let points: Int
    let isFavorite: Bool?
    let isCurrentTeam: Bool?
}

struct MobilePrediction: Decodable, Identifiable {
    let id: String
    let gameId: String
    let href: String
    let competition: String
    let homeTeamName: String
    let awayTeamName: String
    let dateTime: String
    let winnerLabel: String?
    let percentHome: String?
    let percentDraw: String?
    let percentAway: String?
}

struct MobileHeadToHeadGroup: Decodable, Identifiable {
    let gameId: String
    let fixtureLabel: String
    let fixtureHref: String
    let roundLabel: String?
    let items: [MobileHeadToHeadItem]

    var id: String { gameId }
}

struct MobileHeadToHeadItem: Decodable, Identifiable {
    let id: String
    let dateTime: String?
    let homeTeamName: String
    let awayTeamName: String
    let scoreLabel: String
}

struct MobileNewsItem: Decodable, Identifiable {
    let id: String
    let source: String
    let teamLabel: String
    let url: String
    let imageUrl: String?
    let publishedAt: String?
    let title: String
    let previewText: String
    let fullText: String
}

struct MobileNewsResponse: Decodable {
    let updatedAt: String
    let sources: [MobileNewsSource]
    let items: [MobileNewsItem]
}

struct MobileNewsSource: Decodable, Identifiable {
    let slug: String
    let label: String
    let teamLabel: String

    var id: String { slug }
}

struct MobileSeason: Decodable, Identifiable {
    let id: String
    let year: Int
    let label: String
}

struct MobileSeasonInfo: Decodable, Identifiable {
    let id: String
    let name: String
    let year: Int
}

struct MobilePreferencesResponse: Decodable {
    let favoriteTeamApiIds: [Int]
    let favoriteCompetitionApiIds: [Int]
    let availableTeams: [MobilePreferenceTeam]
    let availableCompetitions: [MobilePreferenceCompetition]
}

struct MobilePreferenceTeam: Decodable, Identifiable {
    let id: String
    let apiFootballId: Int?
    let name: String
    let logoUrl: String?
}

struct MobilePreferenceCompetition: Decodable, Identifiable {
    let id: String
    let apiFootballId: Int?
    let name: String
    let country: String?
}
