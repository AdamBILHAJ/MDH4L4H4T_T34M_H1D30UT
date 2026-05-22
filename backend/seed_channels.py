import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from api.models import Channel

channels = [
    ('General', 'general'),
    ('Cryptography', 'crypto'),
    ('Web Exploitation', 'web_exp'),
    ('Forensics', 'forensics'),
    ('Reverse Engineering', 'reverse'),
    ('Pwn', 'pwn'),
    ('Mobile', 'mobile'),
    ('Linux', 'linux'),
    ('Networking', 'networking'),
    ('Web Development', 'web_dev'),
    ('Threat Intelligence', 'threat_intel')
]

for name, slug in channels:
    Channel.objects.get_or_create(name=name, slug=slug)
    print(f"Ensured channel: {name}")
