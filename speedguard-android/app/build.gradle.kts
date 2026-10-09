// «مراقب السرعة» — تطبيق أندرويد لشاشة العربية (OscarDevs). من غير أى مكتبات خارجية
// (لا AndroidX ولا Play Services): شاشات العربيات الصينى كتير منها مافيهاش خدمات جوجل.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.oscardevs.speedguard"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.oscardevs.speedguard"
        minSdk = 24          // Android 7 — أقدم شاشات العربيات اللى لسه شغّالة
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        // السيرفر اللى بيستقبل مخالفات الأسطول
        buildConfigField("String", "SERVER", "\"https://oscardevs.com\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
