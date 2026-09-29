plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun quoted(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val supabaseUrl = providers.gradleProperty("BRANDSPIRE_SUPABASE_URL").orElse("").get()
val supabaseAnonKey = providers.gradleProperty("BRANDSPIRE_SUPABASE_ANON_KEY").orElse("").get()
val apiBaseUrl = providers.gradleProperty("BRANDSPIRE_API_BASE_URL").orElse("http://10.0.2.2:3001").get()

android {
    namespace = "com.brandspire.pos"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.brandspire.pos"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.4.0"

        buildConfigField("String", "SUPABASE_URL", quoted(supabaseUrl.trimEnd('/')))
        buildConfigField("String", "SUPABASE_ANON_KEY", quoted(supabaseAnonKey))
        buildConfigField("String", "API_BASE_URL", quoted(apiBaseUrl.trimEnd('/')))
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")

    // Camera barcode/SKU scanning via Google Play services. No camera permission is required by the app.
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
