# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# =============================================
# CAPACITOR CORE - JS Bridge
# =============================================
# Capacitor uses reflection to invoke @PluginMethod-annotated methods
# from the JavaScript bridge. R8/ProGuard must not rename or remove
# any Plugin classes, methods, or their annotations.
# Reference: https://developer.android.com/build/shrink-code#keep-code

-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}

# Preserve Capacitor annotations used for reflection
-keepattributes *Annotation*
-keepattributes InnerClasses
-keepattributes Signature

# =============================================
# CUSTOM PLUGIN: EscPosPrinterPlugin
# =============================================
# This is the custom Capacitor plugin for Bluetooth thermal printing.
# The JS bridge calls methods via reflection — if R8 renames or removes
# @PluginMethod-annotated methods, the bridge will crash with
# "PluginMethodNotFound" at runtime.

-keep class com.possystem.app.EscPosPrinterPlugin { *; }
-keepclassmembers class com.possystem.app.EscPosPrinterPlugin {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep class com.possystem.app.MainActivity { *; }

# =============================================
# DANTSU ESC/POS THERMAL PRINTER LIBRARY
# =============================================
# The Dantsu library (com.github.DantSu:ESCPOS-ThermalPrinter-Android)
# uses internal reflection for printer connections and text parsing.
# Obfuscating these classes causes ClassNotFoundException and
# NoSuchMethodException at runtime.
# Library source: https://github.com/DantSu/ESCPOS-ThermalPrinter-Android

-keep class com.dantsu.escposprinter.** { *; }
-keepclassmembers class com.dantsu.escposprinter.** { *; }

# =============================================
# ADDITIONAL: Prevent stripping of native methods
# =============================================
-keepclasseswithmembernames class * {
    native <methods>;
}

# =============================================
# ADDITIONAL: Keep enums used by the printer library
# =============================================
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
