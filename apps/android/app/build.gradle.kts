plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun quoted(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val firebaseApiKey = providers.environmentVariable("BRANDSPIRE_FIREBASE_API_KEY")
    .orElse(providers.gradleProperty("BRANDSPIRE_FIREBASE_API_KEY")).orElse("").get()
val apiBaseUrl = providers.environmentVariable("BRANDSPIRE_API_BASE_URL")
    .orElse(providers.gradleProperty("BRANDSPIRE_API_BASE_URL")).orElse("http://10.0.2.2:3001").get()
val releaseStoreFile = providers.environmentVariable("BRANDSPIRE_RELEASE_KEYSTORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("BRANDSPIRE_RELEASE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("BRANDSPIRE_RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("BRANDSPIRE_RELEASE_KEY_PASSWORD").orNull

android {
    namespace = "com.brandspire.pos"
    compileSdk = 35

    signingConfigs {
        create("release") {
            if (!releaseStoreFile.isNullOrBlank()) storeFile = file(releaseStoreFile)
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    }

    defaultConfig {
        applicationId = "com.brandspire.pos"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.4.1"
        manifestPlaceholders["usesCleartextTraffic"] = "true"

        buildConfigField("String", "FIREBASE_API_KEY", quoted(firebaseApiKey))
        buildConfigField("String", "API_BASE_URL", quoted(apiBaseUrl.trimEnd('/')))
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            isDebuggable = false
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")

    // Camera barcode/SKU scanning via Google Play services. No camera permission is required by the app.
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}

tasks.configureEach {
    if (name == "preReleaseBuild") {
        doFirst {
            check(firebaseApiKey.isNotBlank()) { "Set BRANDSPIRE_FIREBASE_API_KEY for a release build." }
            check(apiBaseUrl.startsWith("https://", ignoreCase = true)) { "Set BRANDSPIRE_API_BASE_URL to the production HTTPS API." }
            check(!releaseStoreFile.isNullOrBlank() && !releaseStorePassword.isNullOrBlank() &&
                !releaseKeyAlias.isNullOrBlank() && !releaseKeyPassword.isNullOrBlank()) {
                "Set the BRANDSPIRE_RELEASE_* environment variables to sign a release APK."
            }
            check(file(requireNotNull(releaseStoreFile)).isFile) { "The configured Android release keystore was not found." }
        }
    }
}
