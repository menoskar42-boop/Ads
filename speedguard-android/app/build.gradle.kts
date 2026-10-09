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
        versionCode = 3
        versionName = "0.3.0"
        // موقع التطبيق — لوحة الأساطيل والـAPI (src/routes/speed_site.js)
        buildConfigField("String", "SERVER", "\"https://speed.oscardevs.com\"")
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
