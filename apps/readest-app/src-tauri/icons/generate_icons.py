#!/usr/bin/env python3
from PIL import Image
import os

def generate_icons():
    # 读取主图标
    main_icon = Image.open('icon.png')
    
    # 需要生成的尺寸
    sizes = {
        '32x32.png': 32,
        '64x64.png': 64,
        '128x128.png': 128,
        '128x128@2x.png': 256,
        'icon.ico': 32,  # ICO文件
    }
    
    # 生成各种尺寸的图标
    for filename, size in sizes.items():
        if filename.endswith('.ico'):
            # 生成ICO文件
            resized = main_icon.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(filename, format='ICO', sizes=[(size, size)])
        else:
            # 生成PNG文件
            resized = main_icon.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(filename)
        print(f"Generated {filename} ({size}x{size})")
    
    # 生成iOS图标
    ios_sizes = {
        'ios/AppIcon-20x20@1x.png': 20,
        'ios/AppIcon-20x20@2x.png': 40,
        'ios/AppIcon-20x20@3x.png': 60,
        'ios/AppIcon-29x29@1x.png': 29,
        'ios/AppIcon-29x29@2x.png': 58,
        'ios/AppIcon-29x29@3x.png': 87,
        'ios/AppIcon-40x40@1x.png': 40,
        'ios/AppIcon-40x40@2x.png': 80,
        'ios/AppIcon-40x40@3x.png': 120,
        'ios/AppIcon-60x60@2x.png': 120,
        'ios/AppIcon-60x60@3x.png': 180,
        'ios/AppIcon-76x76@1x.png': 76,
        'ios/AppIcon-76x76@2x.png': 152,
        'ios/AppIcon-83.5x83.5@2x.png': 167,
        'ios/AppIcon-512@2x.png': 1024,
    }
    
    for filename, size in ios_sizes.items():
        resized = main_icon.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(filename)
        print(f"Generated {filename} ({size}x{size})")
    
    # 生成Windows Store图标
    store_sizes = {
        'Square30x30Logo.png': 30,
        'Square44x44Logo.png': 44,
        'Square71x71Logo.png': 71,
        'Square89x89Logo.png': 89,
        'Square107x107Logo.png': 107,
        'Square142x142Logo.png': 142,
        'Square150x150Logo.png': 150,
        'Square284x284Logo.png': 284,
        'Square310x310Logo.png': 310,
        'StoreLogo.png': 50,
    }
    
    for filename, size in store_sizes.items():
        resized = main_icon.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(filename)
        print(f"Generated {filename} ({size}x{size})")

if __name__ == "__main__":
    generate_icons()
    print("All icons generated successfully!")
