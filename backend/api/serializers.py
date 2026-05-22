from rest_framework import serializers
from .models import User, Channel, Post, Reply

class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'is_admin', 'public_key', 'display_name', 'bio', 'avatar_url')

    def get_avatar_url(self, obj):
        if obj.avatar:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.avatar.url)
            return obj.avatar.url
        return None

class ReplySerializer(serializers.ModelSerializer):
    poster = serializers.ReadOnlyField(source='author.username')
    
    class Meta:
        model = Reply
        fields = ('id', 'content', 'timestamp', 'poster')

class PostSerializer(serializers.ModelSerializer):
    poster = serializers.ReadOnlyField(source='author.username')
    replies = ReplySerializer(many=True, read_only=True)
    media_url = serializers.SerializerMethodField()
    media_type = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ('id', 'content', 'timestamp', 'poster', 'media_url', 'media_type', 'replies')

    def get_media_url(self, obj):
        if obj.media:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.media.url)
            return obj.media.url
        return None

    def get_media_type(self, obj):
        if not obj.media:
            return None
        ext = obj.media.name.split('.')[-1].lower()
        if ext in ['jpg', 'jpeg', 'png', 'gif']:
            return 'image'
        elif ext in ['mp4', 'webm', 'ogg']:
            return 'video'
        return 'file'

class ChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Channel
        fields = ('id', 'name', 'slug')