// Oscar Drive — تطبيق أندرويد واحد لشاشة العربية (OscarDevs): القيادة · ذاكرة الطريق · الركن ·
// السيارة · الاستراحة. من غير أى مكتبات خارجية (لا AndroidX ولا Play Services) — زى «مراقب السرعة»:
// شاشات العربيات الصينى كتير منها مافيهاش خدمات جوجل. ومن غير إنترنت ولا سيرفر: كله SQLite على الجهاز.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.oscardevs.oscardrive"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.oscardevs.oscardrive"
        minSdk = 24          // Android 7 — أقدم شاشات العربيات اللى لسه شغّالة
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
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
