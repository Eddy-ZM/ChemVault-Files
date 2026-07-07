// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "ChemVaultFiles",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .executable(name: "ChemVaultFiles", targets: ["ChemVaultFiles"])
    ],
    targets: [
        .executableTarget(
            name: "ChemVaultFiles",
            path: ".",
            sources: ["Sources/ChemVaultFiles"],
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "ChemVaultFilesTests",
            dependencies: ["ChemVaultFiles"],
            path: "Tests/ChemVaultFilesTests"
        )
    ]
)
