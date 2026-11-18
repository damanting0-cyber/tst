plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.caralert"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.caralert"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // 고정 서명키: 새 버전을 기존 앱 위에 덮어 설치할 수 있게 함 (개인용 디버그 키)
    signingConfigs {
        getByName("debug") {
            storeFile = file("caralert-debug.keystore")
            storePassword = "android"
            keyAlias = "caralert"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
