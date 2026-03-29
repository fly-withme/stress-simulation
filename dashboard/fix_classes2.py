import re

file_path = '/Users/flywithme/Documents/Projekte/8_uni/TSS/stresssimulation/dashboard/src/app/page.tsx'

with open(file_path, 'r') as f:
    content = f.read()

replacements = {
    'min-w-[280px]': 'min-w-70',
    'border-[12px]': 'border-12',
    'bottom-[-4px]': '-bottom-1',
    'min-h-[100px]': 'min-h-25',
    'max-h-[400px]': 'max-h-100',
    'text-[#3b579f]': 'text-slate-600'
}

changed = False
for old, new in replacements.items():
    if old in content:
        content = content.replace(old, new)
        changed = True

if changed:
    with open(file_path, 'w') as f:
        f.write(content)
    print('Updated page.tsx')
else:
    print('No changes needed')
