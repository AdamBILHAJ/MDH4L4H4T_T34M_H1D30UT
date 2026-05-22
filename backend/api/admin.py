from django.contrib import admin
from .models import User, Channel, Post, Reply

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'is_admin', 'is_staff')

@admin.register(Channel)
class ChannelAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('author', 'channel', 'timestamp')

@admin.register(Reply)
class ReplyAdmin(admin.ModelAdmin):
    list_display = ('author', 'post', 'timestamp')
