# Kotlin/serialization metadata is kept for the bundled platform models.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keep,includedescriptorclasses class com.vanitas.android.core.**$$serializer { *; }
-keepclassmembers class com.vanitas.android.core.** {
    *** Companion;
}
-keepclasseswithmembers class com.vanitas.android.core.** {
    kotlinx.serialization.KSerializer serializer(...);
}
