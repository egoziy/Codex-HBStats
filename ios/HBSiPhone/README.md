# HBS iPhone

שלד ראשוני לאפליקציית iPhone נייטיבית ב־`SwiftUI`.

מה כבר מוכן:
- `App shell` עם `TabView`
- `NavigationStack` למסכי בית, לייב, עדכונים והעדפות
- שכבת `APIClient`
- `MobileService` שמתחבר ל־`/api/mobile/*`
- models למסכי בית, לייב, קבוצה, משחק ושחקן
- מסכי scaffold ראשוניים ל־Home / Live / Team / Game / Player / News / Preferences

הערות:
- נוסף גם `project.yml` עבור `XcodeGen`, יחד עם `Info.plist` ו־`Assets.xcassets`.
- על Mac אפשר לייצר פרויקט בפועל מתוך התיקייה הזו עם:
  - `brew install xcodegen`
  - `cd ios/HBSiPhone`
  - `xcodegen generate`
  - לפתוח את `HBSiPhone.xcodeproj`
- על המכונה הנוכחית אין `Xcode` או `xcodegen`, לכן הסקאפולד הוכן כאן אבל לא נבנה בפועל.
