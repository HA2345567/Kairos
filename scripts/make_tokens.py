import os

tokens = {
    'nvda': ('#76B900', 'NVDA', 'NVIDIA'),
    'intc': ('#0068B5', 'INTC', 'Intel'),
    'googl': ('#4285F4', 'GOOGL', 'Google'),
    'be': ('#009639', 'BE', 'Bloom'),
    'avgo': ('#CC092F', 'AVGO', 'Broadcom'),
    'amzn': ('#FF9900', 'AMZN', 'Amazon'),
    'vst': ('#002F6C', 'VST', 'Vistra'),
    'crwd': ('#E00000', 'CRWD', 'CrowdStrike'),
    'iau': ('#E5A823', 'IAU', 'iShares Gold'),
    'aapl': ('#A2AAAD', 'AAPL', 'Apple'),
    'uber': ('#111111', 'UBER', 'Uber'),
}

out_dir = r'C:\Users\Harsh\Desktop\kairos\frontend\public\tokens'
for sym, (color, text, name) in tokens.items():
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="{color}" stroke="#161F28" stroke-width="4"/>
  <text x="50" y="58" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="800" fill="#ffffff" text-anchor="middle">{text[:4]}</text>
</svg>'''
    with open(os.path.join(out_dir, f'{sym}.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)
print('Tokens created successfully')
