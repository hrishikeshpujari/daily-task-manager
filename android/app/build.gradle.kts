plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "me.hrishi.taskpa"
    compileSdk = 36

    defaultConfig {
        applicationId = "me.hrishi.taskpa"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.toVersion(libs.versions.jdkRelease.get())
        targetCompatibility = JavaVersion.toVersion(libs.versions.jdkRelease.get())
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
}
