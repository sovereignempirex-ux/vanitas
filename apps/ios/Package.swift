// swift-tools-version: 5.9
// VanitasCore — the platform-independent half of the iOS app.
//
// Everything the app decides (wire models, HTTP client, alert rules, session
// storage) lives here so it can be tested with plain `swift test` on any OS:
// no simulator, no gateway, no credentials. The SwiftUI shell in `Vanitas/`
// is a thin layer around it, exactly like `apps/android`'s `core` module.
import PackageDescription

let package = Package(
    name: "VanitasCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "VanitasCore", targets: ["VanitasCore"]),
    ],
    targets: [
        .target(name: "VanitasCore"),
        .testTarget(
            name: "VanitasCoreTests",
            dependencies: ["VanitasCore"]
        ),
    ]
)
