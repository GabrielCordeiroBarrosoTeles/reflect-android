// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "reflect-sim-helper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "reflect-sim-helper", targets: ["ReflectSimHelper"]),
    ],
    targets: [
        .target(name: "ReflectSimHelperCore"),
        .executableTarget(name: "ReflectSimHelper", dependencies: ["ReflectSimHelperCore"]),
        .testTarget(name: "ReflectSimHelperCoreTests", dependencies: ["ReflectSimHelperCore"]),
    ]
)
