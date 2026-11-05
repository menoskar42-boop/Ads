// اختبار منطق Oscar Drive (Kotlin صافى) على الكمبيوتر — من غير Android SDK:
//   cd oscardrive-android/logic-test && gradle test
plugins { kotlin("jvm") version "2.0.21" }
dependencies { testImplementation(kotlin("test")) }
sourceSets {
    main {
        kotlin {
            srcDir("../app/src/main/java")
            include("com/oscardevs/oscardrive/logic/**")
            include("com/oscardevs/oscardrive/SpeedLogic.kt")
        }
    }
}
tasks.test { useJUnitPlatform() }
