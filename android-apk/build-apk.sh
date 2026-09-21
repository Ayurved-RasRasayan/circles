#!/bin/bash
# Build CircleSync APK manually using Android SDK tools (no Gradle)
# This avoids the memory issues with Gradle daemon in this environment

set -e

# Paths
SDK=/home/z/my-project/android-sdk
AAPT2=$SDK/build-tools/34.0.0/aapt2
AAPT=$SDK/build-tools/34.0.0/aapt
D8=$SDK/build-tools/34.0.0/d8
APKSIGNER=$SDK/build-tools/34.0.0/apksigner
ZIPALIGN=$SDK/build-tools/34.0.0/zipalign
ANDROID_JAR=$SDK/platforms/android-34/android.jar
JAVA_HOME=/home/z/my-project/jdk/jdk-17.0.13+11
KEYTOOL=$JAVA_HOME/bin/keytool
JAVAC=$JAVA_HOME/bin/javac
JARSIGNER=$JAVA_HOME/bin/jarsigner

APP_DIR=/home/z/my-project/android-apk/app
SRC_DIR=$APP_DIR/src/main
BUILD_DIR=$APP_DIR/build-manual
GEN_DIR=$BUILD_DIR/gen
OBJ_DIR=$BUILD_DIR/obj
RES_DIR=$BUILD_DIR/res_compiled
OUT_DIR=$BUILD_DIR/out
APK_DIR=/home/z/my-project/download

# Clean & create dirs
rm -rf $BUILD_DIR
mkdir -p $GEN_DIR $OBJ_DIR $RES_DIR $OUT_DIR $APK_DIR

echo "=== Step 1: Compile resources with aapt2 ==="
# Compile each resource file
RES_FILES=$(find $SRC_DIR/res -type f)
for f in $RES_FILES; do
    rel=${f#$SRC_DIR/res/}
    out_dir=$RES_DIR/$(dirname $rel)
    mkdir -p $out_dir
    $AAPT2 compile -o $out_dir $f
    echo "  compiled $rel"
done
# Collect all compiled .flat files
FLAT_FILES=$(find $RES_DIR -name "*.flat" | tr '\n' ' ')

echo "=== Step 2: Link resources, generate R.java and base APK ==="
$AAPT2 link \
    -I $ANDROID_JAR \
    --manifest $SRC_DIR/AndroidManifest.xml \
    --java $GEN_DIR \
    -o $OUT_DIR/base.apk \
    --min-sdk-version 24 \
    --target-sdk-version 34 \
    --version-code 1 \
    --version-name "1.0" \
    --auto-add-overlay \
    $FLAT_FILES
echo "  R.java generated, base.apk created"

echo "=== Step 3: Compile Java sources ==="
find $SRC_DIR/java -name "*.java" > /tmp/sources.txt
$JAVAC -source 17 -target 17 -classpath $ANDROID_JAR -d $OBJ_DIR @/tmp/sources.txt 2>&1
# Also compile R.java
find $GEN_DIR -name "*.java" >> /tmp/sources.txt
$JAVAC -source 17 -target 17 -classpath $ANDROID_JAR -d $OBJ_DIR @/tmp/sources.txt 2>&1
echo "  compiled $(find $OBJ_DIR -name '*.class' | wc -l) class files"

echo "=== Step 4: Convert .class to .dex with d8 ==="
CLASS_FILES=$(find $OBJ_DIR -name "*.class" | tr '\n' ' ')
$D8 --release --output $OUT_DIR $CLASS_FILES --lib $ANDROID_JAR 2>&1
echo "  classes.dex created"

echo "=== Step 5: Add dex into APK ==="
cd $OUT_DIR
zip -j base.apk classes.dex
cd - > /dev/null
echo "  APK updated with dex"

echo "=== Step 6: Create debug keystore (if not exists) ==="
KEYSTORE=$BUILD_DIR/debug.keystore
if [ ! -f $KEYSTORE ]; then
    $KEYTOOL -genkey -v -keystore $KEYSTORE \
        -storepass android -alias androiddebugkey -keypass android \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=CircleSync, OU=Dev, O=CircleSync, L=Unknown, ST=Unknown, C=US"
    echo "  keystore created"
else
    echo "  keystore already exists"
fi

echo "=== Step 7: Zipalign APK ==="
$ZIPALIGN -f 4 $OUT_DIR/base.apk $OUT_DIR/aligned.apk
echo "  aligned"

echo "=== Step 8: Sign APK ==="
$APKSIGNER sign \
    --ks $KEYSTORE \
    --ks-pass pass:android \
    --ks-key-alias androiddebugkey \
    --key-pass pass:android \
    --out $APK_DIR/CircleSync.apk \
    $OUT_DIR/aligned.apk
echo "  signed"

echo "=== Step 9: Verify APK ==="
$APKSIGNER verify --verbose $APK_DIR/CircleSync.apk 2>&1 | head -5
echo "  size: $(du -h $APK_DIR/CircleSync.apk)"

echo ""
echo "=== BUILD SUCCESS ==="
echo "APK: $APK_DIR/CircleSync.apk"
