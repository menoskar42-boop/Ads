// اختبار قلب التطبيق (SpeedLogic.kt) على الكمبيوتر — من غير Android SDK:
//   cd speedguard-android/logic-test && gradle test
plugins { kotlin("jvm") version "2.0.21" }
dependencies { testImplementation(kotlin("test")) }
sourceSets {
    main {
        kotlin {
            srcDir("../app/src/main/java")
            include("com/oscardevs/speedguard/SpeedLogic.kt")
        }
    }
}
tasks.test { useJUnitPlatform() }
