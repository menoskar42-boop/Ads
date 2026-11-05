plugins {
    // AGP 8.12 عشان compileSdk/targetSdk 36 (شرط جوجل بلاى للتطبيقات الجديدة من ٣١ أغسطس ٢٠٢٦)،
    // وKotlin 2.2 عشان مكتبة الملاحة من جوجل (Navigation SDK 7) متبنية بيها.
    id("com.android.application") version "8.12.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.20" apply false
}
