# ML Kit text recognition bundles only the Latin model. The plugin still
# references the optional-language recognizer classes (Chinese, Devanagari,
# Japanese, Korean), which aren't on the classpath — tell R8 not to fail on
# them. See build/app/outputs/mapping/release/missing_rules.txt.
-dontwarn com.google.mlkit.vision.text.chinese.**
-dontwarn com.google.mlkit.vision.text.devanagari.**
-dontwarn com.google.mlkit.vision.text.japanese.**
-dontwarn com.google.mlkit.vision.text.korean.**
