from django.contrib import admin
from .models import Message, GroupMessage, GroupMessageKey

admin.site.register(Message)
admin.site.register(GroupMessage)
admin.site.register(GroupMessageKey)