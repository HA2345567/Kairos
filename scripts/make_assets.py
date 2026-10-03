import os
import json

assets_dir = r'C:\Users\Harsh\Desktop\kairos\frontend\src\assets'
os.makedirs(assets_dir, exist_ok=True)

with open(os.path.join(assets_dir, 'pelosi.asset.json'), 'w') as f:
    json.dump({'url': '/baskets/pelosi.png'}, f)

tokens = ['nvda', 'intc', 'googl', 'be', 'avgo', 'amzn', 'vst', 'crwd', 'iau', 'aapl', 'uber']
for t in tokens:
    with open(os.path.join(assets_dir, f'{t}.asset.json'), 'w') as f:
        json.dump({'url': f'/tokens/{t}.svg'}, f)

print('Assets created successfully')
