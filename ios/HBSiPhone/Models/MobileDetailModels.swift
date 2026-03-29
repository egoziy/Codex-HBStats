import Foundation

struct MobileTeamResponse: Decodable {
    let team: MobileTeamHeader
    let summary: MobileTeamSummary
    let sections: MobileTeamSections
}

struct MobileTeamHeader: Decodable {
    let id: String
    let apiFootballId: Int?
    let name: String
    let nameEn: String
    let logoUrl: String?
    let coach: String?
    let season: MobileSeasonInfo
}

struct MobileTeamSummary: Decodable {
    let standingPosition: Int?
    let points: Int
    let record: String
    let goals: MobileGoalsSummary
    let matchesPlayed: Int
    let averagePossession: Double
}

struct MobileGoalsSummary: Decodable {
    let `for`: Int
    let against: Int
}

struct MobileTeamSections: Decodable {
    let nextMatch: MobileMatchCard?
    let lastMatch: MobileMatchCard?
    let standings: [MobileStandingRow]
    let recentForm: [MobileRecentForm]
    let upcomingMatches: [MobileUpcomingMatch]
    let seasonSummary: MobileSeasonSummary
    let minuteBuckets: [MobileMinuteBucket]
    let topScorers: [MobileTopScorer]
    let squad: [MobileSquadPlayer]
}

struct MobileRecentForm: Decodable, Identifiable {
    let id: String
    let href: String
    let result: String
    let date: String
    let score: String
    let opponent: String
}

struct MobileUpcomingMatch: Decodable, Identifiable {
    let id: String
    let href: String
    let competition: String
    let homeTeamName: String
    let awayTeamName: String
    let dateTime: String
    let displayDate: String
}

struct MobileSeasonSummary: Decodable {
    let wins: Int
    let draws: Int
    let losses: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let cleanSheets: Int
    let corners: Int
    let offsides: Int
}

struct MobileMinuteBucket: Decodable, Identifiable {
    let key: String
    let label: String
    let minutesPlayed: Int
    let goals: Int
    let assists: Int
    let yellowCards: Int
    let redCards: Int

    var id: String { key }
}

struct MobileTopScorer: Decodable, Identifiable {
    let id: String
    let name: String
    let goals: Int
    let assists: Int
    let minutes: Int
    let photo: String?
}

struct MobileSquadPlayer: Decodable, Identifiable {
    let id: String
    let name: String
    let jerseyNumber: Int?
    let position: String?
    let photo: String?
}

struct MobileGameResponse: Decodable {
    let game: MobileGameHeader
    let sections: MobileGameSections
    let xg: MobileXGInfo
}

struct MobileGameHeader: Decodable {
    let id: String
    let status: String
    let dateTime: String
    let displayDate: String
    let competition: String
    let round: String
    let score: String
    let homeTeam: MobileNamedTeam
    let awayTeam: MobileNamedTeam
}

struct MobileNamedTeam: Decodable {
    let id: String
    let name: String
    let logoUrl: String?
}

struct MobileGameSections: Decodable {
    let stats: [MobileStatComparison]
    let events: [MobileGameEvent]
    let lineups: MobileLineups
}

struct MobileStatComparison: Decodable, Identifiable {
    let label: String
    let homeValue: Double?
    let awayValue: Double?
    let homeDisplay: String
    let awayDisplay: String

    var id: String { label }
}

struct MobileGameEvent: Decodable, Identifiable {
    let id: String
    let type: String
    let minute: Int
    let extraMinute: Int?
    let displayMinute: String
    let playerName: String
    let relatedPlayerName: String?
    let notes: String?
    let teamId: String?
}

struct MobileLineups: Decodable {
    let home: MobileTeamLineup
    let away: MobileTeamLineup
}

struct MobileTeamLineup: Decodable {
    let formation: String?
    let coachName: String?
    let starters: [MobileLineupPlayer]
    let formationRows: [[MobileLineupPlayer]]
    let substitutes: [MobileLineupPlayer]
}

struct MobileLineupPlayer: Decodable, Identifiable, Hashable {
    let id: String
    let displayName: String
    let positionName: String?
    let positionGrid: String?
    let jerseyNumber: Int?
}

struct MobileXGInfo: Decodable {
    let available: Bool
    let reason: String
}

struct MobilePlayerResponse: Decodable {
    let player: MobilePlayerHeader
    let filters: MobilePlayerFilters
    let summary: MobilePlayerSummary
    let sections: MobilePlayerSections
}

struct MobilePlayerHeader: Decodable {
    let id: String
    let name: String
    let nameEn: String
    let photoUrl: String?
    let teamName: String
    let position: String?
    let jerseyNumber: Int?
    let season: MobileSeasonInfo?
}

struct MobilePlayerFilters: Decodable {
    let availableSeasons: [MobileSeasonInfo]
    let activeView: String
}

struct MobilePlayerSummary: Decodable {
    let goals: Int
    let assists: Int
    let yellowCards: Int
    let redCards: Int
    let starts: Int
    let gamesPlayed: Int
    let minutesPlayed: Int
    let benchAppearances: Int
    let substituteAppearances: Int
    let timesSubbedOff: Int
}

struct MobilePlayerSections: Decodable {
    let profile: MobilePlayerProfile
    let seasonEntries: [MobilePlayerSeasonEntry]
    let aggregatedStats: [MobilePlayerAggregatedStat]
    let games: [MobilePlayerGame]
    let gameFilterCounts: MobilePlayerGameFilterCounts
    let gallery: [MobileGalleryItem]
}

struct MobilePlayerProfile: Decodable {
    let nationality: String?
    let teamsInCareer: Int
    let seasonsInSystem: Int
    let uploadsCount: Int
}

struct MobilePlayerSeasonEntry: Decodable, Identifiable {
    let id: String
    let seasonName: String
    let teamName: String
    let jerseyNumber: Int?
    let position: String?
    let hasPhoto: Bool
}

struct MobilePlayerAggregatedStat: Decodable, Identifiable {
    let key: String
    let seasonName: String
    let competitionName: String
    let goals: Int
    let assists: Int
    let minutesPlayed: Int
    let starts: Int
    let substituteAppearances: Int
    let timesSubbedOff: Int
    let yellowCards: Int
    let redCards: Int
    let gamesPlayed: Int

    var id: String { key }
}

struct MobilePlayerGame: Decodable, Identifiable {
    let playerId: String
    let gameId: String
    let dateTime: String
    let displayDate: String
    let seasonName: String
    let competitionName: String
    let matchLabel: String
    let scoreLabel: String
    let squadRoleLabel: String
    let enteredMinuteLabel: String
    let exitedMinuteLabel: String
    let minutesLabel: String
    let isStarter: Bool
    let onBench: Bool
    let wasSubbedIn: Bool
    let wasSubbedOff: Bool
    let goals: Int
    let assists: Int
    let yellowCards: Int
    let redCards: Int

    var id: String { "\(playerId)-\(gameId)" }
}

struct MobilePlayerGameFilterCounts: Decodable {
    let all: Int
    let starts: Int
    let bench: Int
    let subIn: Int
    let subOff: Int
}

struct MobileGalleryItem: Decodable, Identifiable {
    let id: String
    let filePath: String
    let title: String?
    let isPrimary: Bool
}
