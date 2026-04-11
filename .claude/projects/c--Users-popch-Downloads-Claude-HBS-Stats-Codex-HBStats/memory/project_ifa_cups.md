---
name: IFA Cups Data Sources
description: URLs and structure for IFA cup competitions (State Cup, Toto Cup) that can be scraped for additional match data
type: project
---

IFA has additional competition data beyond league matches:

- **State Cup (גביע המדינה):** `https://www.football.org.il/national-cup/?national_cup_id=618&season_id={sid}`
- **Toto Cup Liga Ha'al:** `https://www.football.org.il/totocup/priemerleague/?league_id=625&season_id={sid}`
- **Toto Cup Liga Leumit:** `https://www.football.org.il/totocup/priemerleague/?league_id=630&season_id={sid}`

**Why:** These contain match results, events, lineups, and historical cup winners — fills gaps for cross-competition matches currently tagged as "state_cup" in IFA scraped data.

**How to apply:** Extend scrape-ifa-full.js to support cup page URLs, or create a new scraper. Cup pages may have different HTML structure than league pages.
