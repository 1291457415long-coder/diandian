"""生成「点点」App 图标：深海军蓝圆角方块 + 两个圆点（Point-to-Path 品牌母题）"""
from PIL import Image, ImageDraw

NAVY = (26, 43, 60, 255)        # primary-container #1a2b3c
DOT_A = (183, 200, 222, 255)    # primary-fixed-dim #b7c8de
DOT_B = (255, 255, 255, 255)    # white


def rounded_icon(size, path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=NAVY)

    cx, cy = size / 2, size / 2
    # 主圆点
    r1 = size * 0.17
    # 副圆点（沿对角线偏移）
    r2 = size * 0.085
    d.ellipse([cx - r1, cy - r1, cx + r1, cy + r1], fill=DOT_A)
    d.ellipse([cx + r1 * 0.85 - r2, cy - r1 * 0.85 - r2, cx + r1 * 0.85 + r2, cy - r1 * 0.85 + r2], fill=DOT_B)
    img.save(path)


def maskable_icon(size, path):
    """maskable：内容收缩到安全区（直径 80%）"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, size - 1, size - 1], fill=NAVY)
    cx, cy = size / 2, size / 2
    r1 = size * 0.14
    r2 = size * 0.07
    d.ellipse([cx - r1, cy - r1, cx + r1, cy + r1], fill=DOT_A)
    d.ellipse([cx + r1 * 0.85 - r2, cy - r1 * 0.85 - r2, cx + r1 * 0.85 + r2, cy - r1 * 0.85 + r2], fill=DOT_B)
    img.save(path)


if __name__ == "__main__":
    import os
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)))
    rounded_icon(192, os.path.join(out, "icon-192.png"))
    rounded_icon(512, os.path.join(out, "icon-512.png"))
    maskable_icon(512, os.path.join(out, "icon-maskable-512.png"))
    print("icons generated:", os.listdir(out))
