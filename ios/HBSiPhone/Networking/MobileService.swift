import Foundation

struct MobileService {
    let client: APIClient

    func fetchHome() async throws -> MobileHomeResponse {
        try await client.get("api/mobile/home")
    }

    func fetchLive() async throws -> MobileLiveResponse {
        try await client.get("api/mobile/live")
    }

    func fetchNews(limit: Int = 10) async throws -> MobileNewsResponse {
        try await client.get(
            "api/mobile/news",
            queryItems: [URLQueryItem(name: "limit", value: String(limit))]
        )
    }

    func fetchTeam(id: String) async throws -> MobileTeamResponse {
        try await client.get("api/mobile/teams/\(id)")
    }

    func fetchGame(id: String) async throws -> MobileGameResponse {
        try await client.get("api/mobile/games/\(id)")
    }

    func fetchPlayer(id: String, season: String? = nil, view: String? = nil) async throws -> MobilePlayerResponse {
        let items = [
            season.map { URLQueryItem(name: "season", value: $0) },
            view.map { URLQueryItem(name: "view", value: $0) }
        ].compactMap { $0 }

        return try await client.get("api/mobile/players/\(id)", queryItems: items)
    }

    func fetchPreferences() async throws -> MobilePreferencesResponse {
        try await client.get("api/mobile/preferences")
    }
}
