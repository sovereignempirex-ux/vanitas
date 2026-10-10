// Pure Kotlin/JVM module: every decision the app makes lives here so it can be
// unit-tested on a plain JDK — no emulator, no Android SDK, no network.
// The :app module is only the Android shell around it.
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    api(libs.ktor.client.core)
    api(libs.ktor.client.content.negotiation)
    api(libs.ktor.serialization.kotlinx.json)
    api(libs.kotlinx.serialization.json)
    api(libs.kotlinx.coroutines.core)
    // OkHttp is the transport Ktor recommends on Android; it is a plain JVM
    // artifact, so the module still builds and tests without an Android SDK.
    implementation(libs.ktor.client.okhttp)

    testImplementation(libs.ktor.client.mock)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.junit)
}

tasks.test {
    useJUnit()
    testLogging {
        events("passed", "failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
