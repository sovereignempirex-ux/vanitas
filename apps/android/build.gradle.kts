// Root build file: plugin versions live in gradle/libs.versions.toml so the
// Android and JVM modules cannot drift apart.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
