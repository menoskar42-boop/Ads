import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Oscar Drive — تطبيق أندرويد واحد لشاشة العربية (OscarDevs): القيادة · ذاكرة الطريق · الركن ·
// السيارة · الاستراحة. كله SQLite على الجهاز من غير حساب ولا سيرفر.
//
// المكتبة الوحيدة: Navigation SDK من جوجل (الملاحة جوه التطبيق) — وبتشتغل بس لو مفتاح
// MAPS_API_KEY اتحط كسرّ فى GitHub والشاشة فيها خدمات جوجل. غير كده: تطبيق الخرائط (Intent).
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// أسرار GitHub (مش فى الكود): مفتاح التوقيع للرفع على جوجل بلاى + مفتاح خرايط جوجل.
val keystorePath: String? = System.getenv("ODRIVE_KEYSTORE_FILE")
val mapsKey: String = System.getenv("MAPS_API_KEY") ?: ""
// كل بناء على GitHub رقمه أكبر من اللى قبله ⇒ جوجل بلاى والتحديث فوق القديم يقبلوه.
val runNumber: Int = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 0

android {
    namespace = "com.oscardevs.oscardrive"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.oscardevs.oscardrive"
        minSdk = 24          // Android 7 — أقدم شاشات العربيات اللى لسه شغّالة (وأقل حاجة لـNavigation SDK 7)
        targetSdk = 36
        versionCode = 100 + runNumber
        versionName = "1.0.$runNumber"
        manifestPlaceholders["mapsApiKey"] = mapsKey
        buildConfigField("boolean", "NAV_SDK_KEY", if (mapsKey.isNotBlank()) "true" else "false")
    }

    signingConfigs {
        if (keystorePath != null && file(keystorePath).exists()) {
            create("upload") {
                storeFile = file(keystorePath)
                storeType = "pkcs12"   // المفتاح بيتعمل بـopenssl (docs/OSCAR_DRIVE_SETUP_PROMPT.md)
                storePassword = System.getenv("ODRIVE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ODRIVE_KEY_ALIAS")
                keyPassword = System.getenv("ODRIVE_KEY_PASSWORD")
            }
        }
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("upload")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true   // مطلوب لـNavigation SDK
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

// صوت أوسكار جوّه الـAPK (المالك ٢٠٢٦-١١-٠٩: «تبقى اوتوماتيك مع تنزيل البرنامج الاصلى»): ملفات
// drive-web/voice (اللى scripts/oscar-voice.js بيعملها) بتتنسخ لـassets/voice وقت البناء، والتطبيق بينقلها
// لفولدر الصوت أول ما يفتح — من غير نت ولا زرار. زرار «نزّل صوت أوسكار» فاضل للتحديثات بس.
val voiceAssets = layout.buildDirectory.dir("generated/oscarVoiceAssets")
val copyOscarVoice by tasks.registering(Copy::class) {
    from(rootProject.file("../drive-web/voice")) { include("*/*.mp3", "*/manifest.json") }
    into(voiceAssets.map { it.dir("voice") })
}
android.sourceSets.getByName("main").assets.srcDir(voiceAssets)
tasks.named("preBuild") { dependsOn(copyOscarVoice) }

dependencies {
    implementation("com.google.android.libraries.navigation:navigation:7.8.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")
}
