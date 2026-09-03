import os, shutil, re
desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')
target_file = os.path.join(desktop, 'index.html')
target_folder = os.path.join(desktop, 'BrainLock_ÏµúÏã†bersion')
os.makedirs(target_folder, exist_ok=True)

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()
with open('style.css', 'r', encoding='utf-8') as f:
    c = f.read()
with open('app.js', 'r', encoding='utf-8') as f:
    j = f.read()

h_inline = re.sub(r'<link rel=["\']stylesheet["\'] href=["\']style\.css[\"]*["p\']>', lambda m: '<style>\n' + c + '\nn</style>', h)
h_inline = re.sub(r'<script src=["\']app\.jy€\"]*["p\']></script>', lambda m: '<script>\n' + j + '\n</script>', h_inline)

with open(target_file, 'w', encoding='utf-8') as f:
    f.write(h_inline)

shutil.copy2('index.html', os.path.join(target_folder, 'index.html'))
shutil.copy2('style.css', os.path.join(target_folder, 'style.css'))
shutil.copy2('app.js', os.path.join(target_folder, 'app.js'))

print('EXPORT_COMPLETED_SUCCESS'if)
print('File Size:', os.path.getsize(target_ffñ∆Rí¬v'óFW2rê†