#!/bin/bash

echo "🔧 修复 Android 图标问题"
echo "=========================="

# 进入项目目录
cd /home/eric/Desktop/VL-Arch/apps/readest-app

echo "1. 重新生成图标..."
pnpm tauri icon src-tauri/icons/icon.png

echo "2. 清理 Android 构建缓存..."
rm -rf src-tauri/gen/android/app/build

echo "3. 检查图标文件..."
echo "源图标文件:"
ls -la src-tauri/icons/icon.png
echo ""
echo "生成的 Android 图标:"
ls -la src-tauri/gen/android/app/src/main/res/mipmap-hdpi/

echo ""
echo "4. 检查 Android SDK 环境..."
if [ -z "$ANDROID_HOME" ]; then
    echo "❌ ANDROID_HOME 环境变量未设置"
    echo ""
    echo "请安装 Android SDK 并设置环境变量："
    echo "1. 安装 Android Studio 或 Android SDK"
    echo "2. 设置 ANDROID_HOME 环境变量"
    echo "3. 将 \$ANDROID_HOME/tools 和 \$ANDROID_HOME/platform-tools 添加到 PATH"
    echo ""
    echo "或者使用以下命令设置（如果已安装）："
    echo "export ANDROID_HOME=\$HOME/Android/Sdk"
    echo "export PATH=\$PATH:\$ANDROID_HOME/tools:\$ANDROID_HOME/platform-tools"
    echo ""
    echo "设置完成后，运行："
    echo "pnpm tauri android build"
else
    echo "✅ ANDROID_HOME 已设置: $ANDROID_HOME"
    echo ""
    echo "5. 重新构建 Android APK..."
    pnpm tauri android build
fi

echo ""
echo "✅ 图标修复完成！"
echo "如果仍有问题，请检查："
echo "1. 确保 src-tauri/icons/icon.png 是您想要的图标"
echo "2. 确保 Android SDK 已正确安装和配置"
echo "3. 清理所有构建缓存后重新构建"
