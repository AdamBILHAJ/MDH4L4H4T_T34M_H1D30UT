from rest_framework import serializers
from .models import Message, GroupMessage, GroupMessageKey, MessageReaction
from django.contrib.auth import get_user_model

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Basic user serializer for nested data"""
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'display_name', 'avatar_url', 'bio']

    def get_avatar_url(self, obj):
        if obj.avatar and hasattr(obj.avatar, 'url'):
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.avatar.url)
            return obj.avatar.url
        return None

# In chat/serializers.py - Update MessageSerializer

class MessageSerializer(serializers.ModelSerializer):
    """
    Serializer for private direct messages.
    Includes both encrypted versions for sender and receiver.
    """
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_display_name = serializers.CharField(source='sender.display_name', read_only=True)
    receiver_username = serializers.CharField(source='receiver.username', read_only=True)
    
    # File fields
    file_url = serializers.SerializerMethodField()
    file_name = serializers.CharField(read_only=True)
    file_type = serializers.CharField(read_only=True)
    
    # Read receipts
    seen_by = UserSerializer(many=True, read_only=True)
    
    # Reactions
    reactions = serializers.SerializerMethodField()
    reply_to = serializers.PrimaryKeyRelatedField(read_only=True)
    # Optionally add nested replied message
    replied_message = serializers.SerializerMethodField()

    def get_replied_message(self, obj):
        if obj.reply_to:
            return {
                'id': obj.reply_to.id,
                'sender_id': obj.reply_to.sender.id,
                'sender_username': obj.reply_to.sender.username,
                'content': obj.reply_to.content,
                'sender_encrypted_content': getattr(obj.reply_to, 'sender_encrypted_content', None),
                'file_url': obj.reply_to.file.url if obj.reply_to.file else None,
                'file_name': obj.reply_to.file_name,
                'file_type': obj.reply_to.file_type,
            }
        return None
    
    class Meta:
        model = Message
        fields = [
            'id', 'sender_id', 'sender_username', 'sender_display_name',
            'receiver_id', 'receiver_username', 'content', 
            'sender_encrypted_content', 'timestamp', 'expires_at',
            'file_url', 'file_name', 'file_type', 'file_size',
            'seen_by', 'reactions',
            'reply_to', 'replied_message'
        ]
    
    def get_file_url(self, obj):
        if obj.file and hasattr(obj.file, 'url'):
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_reactions(self, obj):
        """Format reactions for frontend"""
        reactions = obj.reactions.all()
        reaction_data = {}
        
        request = self.context.get('request')
        current_user = request.user if request else None
        
        for reaction in reactions:
            emoji = reaction.emoji
            if emoji not in reaction_data:
                reaction_data[emoji] = {
                    'count': 0,
                    'users': [],
                    'reacted': False
                }
            
            reaction_data[emoji]['count'] += 1
            reaction_data[emoji]['users'].append({
                'id': reaction.user.id,
                'username': reaction.user.username,
                'display_name': reaction.user.display_name or reaction.user.username,
                'avatar_url': request.build_absolute_uri(reaction.user.avatar.url) if reaction.user.avatar and request else None
            })
            
            if current_user and reaction.user.id == current_user.id:
                reaction_data[emoji]['reacted'] = True
        
        return reaction_data

class GroupMessageSerializer(serializers.ModelSerializer):
    """
    Serializer for group chat messages.
    Includes file fields, seen_by, and reactions.
    """
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_display_name = serializers.CharField(source='sender.display_name', read_only=True)
    
    # File fields
    file_url = serializers.SerializerMethodField()
    file_name = serializers.CharField(read_only=True)
    file_type = serializers.CharField(read_only=True)
    
    # Read receipts
    seen_by = UserSerializer(many=True, read_only=True)
    
    # Reactions
    reactions = serializers.SerializerMethodField()
    reply_to = serializers.PrimaryKeyRelatedField(read_only=True)
    # Optionally add nested replied message
    replied_message = serializers.SerializerMethodField()

    def get_replied_message(self, obj):
        if obj.reply_to:
            return {
                'id': obj.reply_to.id,
                'sender_id': obj.reply_to.sender.id,
                'sender_username': obj.reply_to.sender.username,
                'content': obj.reply_to.content,
                'sender_encrypted_content': None,
                'file_url': obj.reply_to.file.url if obj.reply_to.file else None,
                'file_name': obj.reply_to.file_name,
                'file_type': obj.reply_to.file_type,
            }
        return None
    
    class Meta:
        model = GroupMessage
        fields = [
            'id', 'sender_id', 'sender_username', 'sender_display_name',
            'content', 'timestamp', 'expires_at',
            'file_url', 'file_name', 'file_type', 'file_size',
            'seen_by', 'reactions',
            'reply_to', 'replied_message'
        ]
    
    def get_file_url(self, obj):
        if obj.file and hasattr(obj.file, 'url'):
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_reactions(self, obj):
        """Format reactions for frontend"""
        reactions = obj.reactions.all()
        reaction_data = {}
        
        # Get current user from context
        request = self.context.get('request')
        current_user = request.user if request else None
        
        for reaction in reactions:
            emoji = reaction.emoji
            if emoji not in reaction_data:
                reaction_data[emoji] = {
                    'count': 0,
                    'users': [],
                    'reacted': False
                }
            
            reaction_data[emoji]['count'] += 1
            reaction_data[emoji]['users'].append({
                'id': reaction.user.id,
                'username': reaction.user.username,
                'display_name': reaction.user.display_name or reaction.user.username,
                'avatar_url': request.build_absolute_uri(reaction.user.avatar.url) if reaction.user.avatar and request else None
            })
            
            # Check if current user reacted
            if current_user and reaction.user.id == current_user.id:
                reaction_data[emoji]['reacted'] = True
        
        return reaction_data


class GroupMessageKeySerializer(serializers.ModelSerializer):
    """
    Serializer for group message encryption keys.
    Used when fetching a user's key for a specific message.
    """
    class Meta:
        model = GroupMessageKey
        fields = ['id', 'message_id', 'user_id', 'encrypted_key']
        read_only_fields = ['message_id', 'user_id', 'encrypted_key']


class MessageReactionSerializer(serializers.ModelSerializer):
    """
    Serializer for message reactions.
    """
    username = serializers.CharField(source='user.username', read_only=True)
    display_name = serializers.CharField(source='user.display_name', read_only=True)
    avatar_url = serializers.SerializerMethodField()
    
    class Meta:
        model = MessageReaction
        fields = ['id', 'emoji', 'user_id', 'username', 'display_name', 'avatar_url', 'created_at']
    
    def get_avatar_url(self, obj):
        if obj.user.avatar:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.user.avatar.url)
            return obj.user.avatar.url
        return None


# Optional: Serializer for chat list (showing recent conversations)
class ChatPreviewSerializer(serializers.Serializer):
    """
    For displaying conversation list with last message and unread count.
    """
    user_id = serializers.IntegerField()
    username = serializers.CharField()
    display_name = serializers.CharField()
    avatar_url = serializers.CharField(allow_null=True)
    last_message = serializers.CharField(allow_null=True)
    last_message_time = serializers.DateTimeField(allow_null=True)
    unread_count = serializers.IntegerField()
    is_online = serializers.BooleanField(default=False)


# Optional: Serializer for typing status (if you want to persist it)
class TypingStatusSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    display_name = serializers.CharField(source='user.display_name', read_only=True)
    
    class Meta:
        from .models import TypingStatus
        model = TypingStatus
        fields = ['user_id', 'username', 'display_name', 'chat_with_id', 'is_group', 'updated_at']